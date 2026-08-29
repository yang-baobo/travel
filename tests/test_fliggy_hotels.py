from __future__ import annotations

import json
import os
import subprocess
import unittest
from datetime import date
from unittest.mock import patch

from fastapi import HTTPException

from api.hotels.errors import (
    HotelAuthenticationError,
    HotelCapabilityUnavailableError,
    HotelConfigurationError,
    HotelInvalidRequestError,
    HotelMalformedResponseError,
    HotelProviderTimeoutError,
    HotelProviderUnavailableError,
)
from api.hotels.fliggy_adapter import PRICE_DISCLAIMER, adapt_fliggy_hotel
from api.hotels.models import HotelSearchParams
from api.hotels.provider import DEFAULT_CLI_PATH, FliggyCliProvider
from api.hotels.service import TravelHotelService
from api.index import app, travel_hotel_search


def params(**overrides: object) -> HotelSearchParams:
    payload: dict[str, object] = {
        "destination": "深圳",
        "checkInDate": "2026-09-15",
        "checkOutDate": "2026-09-17",
    }
    payload.update(overrides)
    return HotelSearchParams.model_validate(payload)


def full_raw(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "shId": "100001",
        "name": "深圳测试酒店",
        "address": "深圳市南山区测试路1号",
        "latitude": "22.5401",
        "longitude": "113.9702",
        "star": "高档型",
        "rate": 4.8,
        "price": "¥499",
        "mainPic": "https://example.test/hotel.jpg",
        "detailUrl": "https://hotel.fliggy.com/hotel_detail2.htm?shid=100001",
        "brandName": "测试品牌",
        "interestsPoi": "近世界之窗",
    }
    payload.update(overrides)
    return payload


class AdapterTests(unittest.TestCase):
    def test_adapter_01_complete_hotel(self) -> None:
        hotel = adapt_fliggy_hotel(full_raw(), params())
        self.assertIsNotNone(hotel)
        assert hotel is not None
        self.assertEqual(hotel.id, "fliggy:100001")
        self.assertEqual(hotel.source, "fliggy")
        self.assertEqual(hotel.reference_price, 499)
        self.assertEqual(hotel.price_type, "search_reference")
        self.assertEqual(hotel.price_disclaimer, PRICE_DISCLAIMER)
        self.assertNotIn("raw", hotel.model_dump())

    def test_adapter_02_null_rating_stays_null(self) -> None:
        hotel = adapt_fliggy_hotel(full_raw(rate=None), params())
        assert hotel is not None
        self.assertIsNone(hotel.rating)

    def test_adapter_03_missing_address_is_allowed(self) -> None:
        hotel = adapt_fliggy_hotel(full_raw(address=None), params())
        assert hotel is not None
        self.assertIsNone(hotel.address)

    def test_adapter_04_missing_or_masked_price_is_not_fabricated(self) -> None:
        missing = adapt_fliggy_hotel(full_raw(price=None), params())
        masked = adapt_fliggy_hotel(full_raw(price="¥4xx"), params())
        assert missing is not None and masked is not None
        self.assertIsNone(missing.reference_price)
        self.assertIsNone(masked.reference_price)

    def test_adapter_05_stable_id_uses_source_id(self) -> None:
        first = adapt_fliggy_hotel(full_raw(shId="abc-123"), params())
        second = adapt_fliggy_hotel(full_raw(shId="abc-123", price="¥600"), params())
        assert first is not None and second is not None
        self.assertEqual(first.id, "fliggy:abc-123")
        self.assertEqual(first.id, second.id)
        self.assertEqual(first.source_hotel_id, "abc-123")

    def test_adapter_06_broken_item_is_skipped_safely(self) -> None:
        self.assertIsNone(adapt_fliggy_hotel({"price": "¥300"}, params()))
        hotel = adapt_fliggy_hotel(full_raw(latitude="not-a-number", detailUrl="javascript:alert(1)"), params())
        assert hotel is not None
        self.assertIsNone(hotel.latitude)
        self.assertIsNone(hotel.booking_url)

    def test_hotel_search_rejects_past_check_in(self) -> None:
        with self.assertRaises(ValueError):
            params(checkInDate="2020-01-01", checkOutDate="2020-01-02")


class FakeProvider:
    def __init__(self, items: list[dict[str, object]] | None = None, error: Exception | None = None) -> None:
        self.items = items or []
        self.error = error
        self.last_params: HotelSearchParams | None = None

    def search_hotels(self, search_params: HotelSearchParams) -> list[dict[str, object]]:
        self.last_params = search_params
        if self.error:
            raise self.error
        return self.items


class ServiceTests(unittest.TestCase):
    def test_service_01_returns_normalized_hotels(self) -> None:
        service = TravelHotelService(FakeProvider([full_raw()]))
        response = service.search(params())
        self.assertEqual(len(response.hotels), 1)
        self.assertEqual(response.hotels[0].id, "fliggy:100001")
        self.assertEqual(response.meta.query_status, "ok")

    def test_service_02_forwards_max_reference_price(self) -> None:
        provider = FakeProvider([full_raw(price="¥480")])
        response = TravelHotelService(provider).search(params(maxReferencePrice=500))
        self.assertEqual(provider.last_params.max_reference_price if provider.last_params else None, 500)
        self.assertEqual(response.hotels[0].reference_price, 480)

    def test_service_02b_enforces_max_reference_price_after_provider(self) -> None:
        provider = FakeProvider(
            [
                full_raw(shId="100001", price="¥480"),
                full_raw(shId="100002", price="¥680"),
                full_raw(shId="100003", price=None),
            ]
        )
        response = TravelHotelService(provider).search(params(maxReferencePrice=500))
        prices = [hotel.source_hotel_id for hotel in response.hotels]
        self.assertIn("100001", prices)
        self.assertIn("100003", prices)
        self.assertNotIn("100002", prices)

    def test_service_03_preserves_provider_timeout_error(self) -> None:
        service = TravelHotelService(FakeProvider(error=HotelProviderTimeoutError("timeout")))
        with self.assertRaises(HotelProviderTimeoutError):
            service.search(params())

    def test_service_04_empty_result_stays_empty(self) -> None:
        response = TravelHotelService(FakeProvider([])).search(params())
        self.assertEqual(response.hotels, [])
        self.assertEqual(response.meta.query_status, "no_results")

    def test_unsupported_rating_sort_is_rejected(self) -> None:
        with self.assertRaises(HotelCapabilityUnavailableError):
            TravelHotelService(FakeProvider()).search(params(sortBy="rating"))


class ProviderErrorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.provider = FliggyCliProvider(cli_path=DEFAULT_CLI_PATH, timeout_seconds=0.1)

    @patch.dict(os.environ, {"FLYAI_API_KEY": "test-secret"}, clear=False)
    @patch("api.hotels.provider.subprocess.run")
    def test_timeout_is_classified(self, run: object) -> None:
        run.side_effect = subprocess.TimeoutExpired(cmd="flyai", timeout=0.1)  # type: ignore[attr-defined]
        with self.assertRaises(HotelProviderTimeoutError):
            self.provider.search_hotels(params())

    @patch.dict(os.environ, {"FLYAI_API_KEY": "test-secret"}, clear=False)
    @patch("api.hotels.provider.subprocess.run")
    def test_invalid_key_is_classified_without_exposing_key(self, run: object) -> None:
        run.return_value = subprocess.CompletedProcess([], 1, "", "HTTP 401 Invalid API key")  # type: ignore[attr-defined]
        with self.assertRaisesRegex(HotelAuthenticationError, "凭证"):
            self.provider.search_hotels(params())

    @patch.dict(os.environ, {"FLYAI_API_KEY": "test-secret"}, clear=False)
    @patch("api.hotels.provider.subprocess.run")
    def test_non_json_is_malformed(self, run: object) -> None:
        run.return_value = subprocess.CompletedProcess([], 0, "not-json", "")  # type: ignore[attr-defined]
        with self.assertRaises(HotelMalformedResponseError):
            self.provider.search_hotels(params())

    @patch.dict(os.environ, {"FLYAI_API_KEY": "test-secret"}, clear=False)
    @patch("api.hotels.provider.subprocess.run")
    def test_empty_item_list_is_valid(self, run: object) -> None:
        run.return_value = subprocess.CompletedProcess(  # type: ignore[attr-defined]
            [], 0, json.dumps({"status": 0, "data": {"itemList": []}}), ""
        )
        self.assertEqual(self.provider.search_hotels(params()), [])


class ApiDataFlowTests(unittest.TestCase):
    def test_fastapi_returns_camel_case_domain_without_raw_payload(self) -> None:
        service = TravelHotelService(FakeProvider([full_raw()]))
        with patch("api.index.get_hotel_service", return_value=service):
            response = travel_hotel_search(params())
        body = response.model_dump(by_alias=True, mode="json")
        self.assertEqual(body["hotels"][0]["id"], "fliggy:100001")
        self.assertEqual(body["hotels"][0]["referencePrice"], 499)
        self.assertEqual(body["meta"]["priceMeaning"], "search_reference")
        self.assertNotIn("shId", body["hotels"][0])
        self.assertNotIn("raw", body["hotels"][0])

    def test_fastapi_route_is_registered(self) -> None:
        paths = {route.path for route in app.routes}
        self.assertIn("/api/travel/hotels/search", paths)

    def test_endpoint_keeps_error_categories_distinct(self) -> None:
        cases = (
            (HotelCapabilityUnavailableError("unsupported"), 422, "HOTEL_CAPABILITY_UNAVAILABLE"),
            (HotelInvalidRequestError("invalid"), 422, "HOTEL_INVALID_REQUEST"),
            (HotelConfigurationError("missing"), 503, "HOTEL_PROVIDER_NOT_CONFIGURED"),
            (HotelProviderTimeoutError("timeout"), 504, "HOTEL_PROVIDER_TIMEOUT"),
            (HotelAuthenticationError("auth"), 502, "HOTEL_PROVIDER_AUTH_FAILED"),
            (HotelMalformedResponseError("malformed"), 502, "HOTEL_PROVIDER_MALFORMED_RESPONSE"),
            (HotelProviderUnavailableError("unavailable"), 502, "HOTEL_PROVIDER_UNAVAILABLE"),
        )
        for error, expected_status, expected_code in cases:
            with self.subTest(expected_code):
                service = TravelHotelService(FakeProvider(error=error))
                with patch("api.index.get_hotel_service", return_value=service):
                    with self.assertRaises(HTTPException) as caught:
                        travel_hotel_search(params())
                self.assertEqual(caught.exception.status_code, expected_status)
                self.assertEqual(caught.exception.detail["code"], expected_code)


if __name__ == "__main__":
    unittest.main()
