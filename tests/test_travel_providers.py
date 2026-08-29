import os
import unittest
from unittest.mock import patch

from api import travel_providers as providers


class TravelProviderTest(unittest.TestCase):
    def setUp(self) -> None:
        providers._REQUEST_CACHE.clear()

    def test_normalizes_amap_place_without_exposing_credentials(self) -> None:
        poi = {
            "id": "B0001",
            "name": "测试博物馆",
            "location": "116.397,39.908",
            "address": "北京市东城区测试路1号",
            "adname": "东城区",
            "type": "科教文化服务;博物馆",
            "typecode": "140100",
            "business": {
                "rating": "4.8",
                "cost": "60",
                "tel": "010-12345678",
                "opentime_today": "09:00-17:00",
            },
            "photos": [{"url": "https://example.com/photo.jpg"}],
        }
        with patch.dict(os.environ, {}, clear=True):
            result = providers._normalize_place(poi, "attraction")

        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result["city"], "北京")
        self.assertEqual(result["district"], "东城区")
        self.assertEqual(result["rating"], 4.8)
        self.assertFalse(result["booking"]["enabled"])
        self.assertNotIn("key", result)

    def test_rejects_unapproved_partner_host(self) -> None:
        with patch.dict(os.environ, {"CTRIP_HOTEL_LINK_TEMPLATE": "https://example.com/{name}"}, clear=True):
            with self.assertRaises(providers.ProviderRequestError):
                providers._partner_link("hotel", "测试酒店", "B0002")

    def test_parses_real_route_shapes(self) -> None:
        transit = providers._parse_transit({
            "route": {
                "transits": [{
                    "distance": "12000",
                    "cost": {"duration": "2700"},
                    "segments": [{
                        "walking": {"distance": "800"},
                        "bus": {"buslines": [{"name": "地铁1号线(苹果园-环球度假区)"}]},
                        "cost": {"transit_fee": "5"},
                    }],
                }],
            },
        })
        self.assertIsNotNone(transit)
        assert transit is not None
        self.assertEqual(transit["time"], 45)
        self.assertEqual(transit["price"], 5)
        self.assertEqual(transit["detail"], "地铁1号线")

    def test_positive_route_duration_never_rounds_down_to_failure_zero(self) -> None:
        self.assertEqual(providers._duration_minutes("1"), 1)
        self.assertEqual(providers._duration_minutes("29"), 1)
        self.assertEqual(providers._duration_minutes("0"), 0)

    def test_route_mode_limits_upstream_fanout(self) -> None:
        calls: list[str] = []

        def fake_request(path: str, params: dict) -> dict:
            calls.append(path)
            return {"route": {"paths": [{"duration": "600", "distance": "5000"}]}}

        with patch.object(providers, "_amap_request", side_effect=fake_request):
            result = providers.get_routes("116.397000,39.908000", "116.407000,39.918000", mode="driving")

        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0], "/v5/direction/driving")
        self.assertIsNotNone(result["driving"])
        self.assertIsNone(result["transit"])

    def test_exact_place_name_is_promoted_ahead_of_unrelated_provider_ranking(self) -> None:
        def poi(place_id: str, name: str) -> dict:
            return {
                "id": place_id,
                "name": name,
                "location": "116.397,39.908",
                "address": "北京市东城区",
                "adname": "东城区",
                "type": "风景名胜",
                "typecode": "110000",
            }

        with patch.object(providers, "_amap_request", return_value={
            "count": "2",
            "pois": [poi("B1", "颐和园"), poi("B2", "天坛公园")],
        }):
            result = providers.search_places("attraction", "天坛公园", 1, 1)

        self.assertEqual(len(result["items"]), 1)
        self.assertEqual(result["items"][0]["id"], "B2")
        self.assertEqual(result["items"][0]["name"], "天坛公园")


if __name__ == "__main__":
    unittest.main()
