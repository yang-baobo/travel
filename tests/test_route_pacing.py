from unittest import TestCase
from unittest.mock import patch

from api import travel_providers as provider


class DirectionPacingTests(TestCase):
    def test_same_endpoint_starts_are_spaced_and_places_are_not_throttled(self):
        clock = [100.0]
        sleeps = []

        def advance(seconds):
            sleeps.append(seconds)
            clock[0] += seconds

        with patch.dict(provider._LAST_REQUEST_AT, {}, clear=True), \
             patch.object(provider.time, "monotonic", side_effect=lambda: clock[0]), \
             patch.object(provider.time, "sleep", side_effect=advance):
            provider._pace_direction_request("/v5/direction/driving")
            self.assertEqual(sleeps, [])
            provider._pace_direction_request("/v5/direction/driving")
            provider._pace_direction_request("/v5/direction/driving")
            self.assertEqual(len(sleeps), 2)
            self.assertTrue(all(abs(s - 1.05) < 0.001 for s in sleeps))
            provider._pace_direction_request("/v5/place/text")
            self.assertEqual(len(sleeps), 2)

    def test_cached_provider_response_does_not_wait_or_make_network_request(self):
        path = "/v5/direction/driving"
        cached = {"status": "1", "route": {"paths": []}}
        with patch.dict(provider._REQUEST_CACHE, {f"{path}?origin=example": (float("inf"), cached)}, clear=True), \
             patch.object(provider, "_pace_direction_request") as pace, \
             patch.object(provider, "urlopen") as network:
            self.assertEqual(provider._amap_request(path, {"origin": "example"}), cached)
            pace.assert_not_called()
            network.assert_not_called()
