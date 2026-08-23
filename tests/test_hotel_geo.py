import unittest
from unittest.mock import patch

from api.hotel_geo import (
    HotelGeoRequest,
    HotelGeoResponse,
    clear_hotel_coordinate_cache,
    hotel_coordinate_cache_key,
    match_hotel_candidate,
    resolve_hotel_geography,
)
from api.index import app


def request(**overrides) -> HotelGeoRequest:
    values = {
        "hotelId": "fliggy:1001",
        "source": "fliggy",
        "sourceHotelId": "1001",
        "name": "北京测试酒店",
        "destination": "北京",
        "city": "北京",
        "district": "东城区",
        "address": "北京市东城区测试路1号",
    }
    values.update(overrides)
    return HotelGeoRequest.model_validate(values)


def candidate(**overrides):
    values = {
        "id": "B0001",
        "name": "北京测试酒店",
        "location": "116.397000,39.908000",
        "address": "北京市东城区测试路1号",
        "pname": "北京市",
        "cityname": "北京市",
        "adname": "东城区",
        "adcode": "110101",
    }
    values.update(overrides)
    return values


class HotelGeoMatcherTests(unittest.TestCase):
    def setUp(self) -> None:
        clear_hotel_coordinate_cache()

    def test_exact_match_maps_amap_lng_lat_to_domain_lat_lng(self) -> None:
        with patch("api.hotel_geo._amap_request", return_value={"pois": [candidate()]}):
            result = resolve_hotel_geography(request())

        self.assertEqual(result.status, "verified")
        self.assertEqual(result.match_level, "exact")
        self.assertEqual(result.coordinate_source, "amap")
        self.assertTrue(result.coordinate_verified)
        self.assertEqual(result.latitude, 39.908)
        self.assertEqual(result.longitude, 116.397)

    def test_two_equally_plausible_branches_are_ambiguous(self) -> None:
        candidates = [
            candidate(id="B0001", address="北京市东城区测试路1号", location="116.397,39.908"),
            candidate(id="B0002", address="北京市东城区另一条路2号", location="116.407,39.918"),
        ]
        matched, level, _, _ = match_hotel_candidate(
            request(address=None, district="东城区"),
            candidates,
        )

        self.assertIsNone(matched)
        self.assertEqual(level, "ambiguous")

    def test_unique_distinctive_exact_branch_name_can_survive_address_format_drift(self) -> None:
        matched, level, confidence, _ = match_hotel_candidate(
            request(
                name="丽怡酒店（北京中关村苏州街地铁站店）",
                address="北京市海淀区万柳万泉新新家园14号楼A区1层101",
                district=None,
            ),
            [candidate(
                name="丽怡酒店(北京中关村苏州街地铁站店)",
                address="万柳东路8号",
                adname="海淀区",
                adcode="110108",
            )],
        )

        self.assertIsNotNone(matched)
        self.assertEqual(level, "strong")
        self.assertGreaterEqual(confidence, 0.6)

    def test_duplicate_exact_branch_names_without_address_support_stay_ambiguous(self) -> None:
        requested = request(name="北京中关村美居酒店", address=None, district=None)
        matched, level, _, _ = match_hotel_candidate(
            requested,
            [
                candidate(id="B0001", name=requested.name, address="中关村南大街31号"),
                candidate(id="B0002", name=requested.name, address="知春路88号"),
            ],
        )

        self.assertIsNone(matched)
        self.assertEqual(level, "ambiguous")

    def test_wrong_city_same_name_is_rejected(self) -> None:
        matched, level, confidence, rejected = match_hotel_candidate(
            request(),
            [candidate(adcode="310101", pname="上海市", cityname="上海市", adname="黄浦区")],
        )

        self.assertIsNone(matched)
        self.assertEqual(level, "not_found")
        self.assertEqual(confidence, 0)
        self.assertEqual(rejected, 1)

    def test_not_found_never_invents_default_coordinates(self) -> None:
        with patch("api.hotel_geo._amap_request", return_value={"pois": []}):
            result = resolve_hotel_geography(request())

        self.assertEqual(result.status, "not_found")
        self.assertFalse(result.coordinate_verified)
        self.assertIsNone(result.latitude)
        self.assertIsNone(result.longitude)

    def test_stable_coordinate_cache_key_has_no_price_or_stay_date(self) -> None:
        first = hotel_coordinate_cache_key(request())
        second = hotel_coordinate_cache_key(request())
        self.assertEqual(first, second)
        self.assertNotIn("500", first)
        self.assertNotIn("2026", first)

    def test_verified_result_is_cached_without_second_amap_call(self) -> None:
        with patch("api.hotel_geo._amap_request", return_value={"pois": [candidate()]}) as mocked:
            first = resolve_hotel_geography(request())
            second = resolve_hotel_geography(request())

        self.assertTrue(first.coordinate_verified)
        self.assertTrue(second.cached)
        # name + address are queried only on the first resolution.
        self.assertEqual(mocked.call_count, 2)

    def test_fastapi_geocode_endpoint_and_camel_case_contract_exist(self) -> None:
        paths = {route.path for route in app.routes}
        self.assertIn("/api/travel/hotels/geocode", paths)
        payload = HotelGeoResponse.model_validate({
            "hotelId": "fliggy:1001",
            "status": "verified",
            "matchLevel": "strong",
            "confidence": 0.88,
            "latitude": 39.908,
            "longitude": 116.397,
            "coordinateSource": "amap",
            "coordinateVerified": True,
            "calculatedAt": "2026-08-22T12:00:00Z",
            "latencyMs": 20,
        }).model_dump(by_alias=True)
        self.assertTrue(payload["coordinateVerified"])
        self.assertEqual(payload["coordinateSource"], "amap")
        self.assertNotIn("apiKey", payload)


if __name__ == "__main__":
    unittest.main()
