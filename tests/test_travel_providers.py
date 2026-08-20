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


if __name__ == "__main__":
    unittest.main()
