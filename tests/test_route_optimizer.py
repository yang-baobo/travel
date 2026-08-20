import unittest

from api.index import OptimizeRequest, solve_route


class RouteOptimizerTest(unittest.TestCase):
    def test_assigns_open_attractions_across_days(self) -> None:
        node_ids = ["a", "b", "c", "d", "hotel"]
        durations = [
            [0, 10, 45, 50, 10],
            [10, 0, 40, 45, 10],
            [45, 40, 0, 10, 40],
            [50, 45, 10, 0, 45],
            [10, 10, 40, 45, 0],
        ]
        request = OptimizeRequest.model_validate({
            "attractions": [
                {"id": "a", "duration_minutes": 120, "opening_windows": [[540, 1080]], "priority": 90},
                {"id": "b", "duration_minutes": 120, "opening_windows": [[540, 1080]], "priority": 80},
                {
                    "id": "c",
                    "duration_minutes": 120,
                    "opening_windows": [[540, 1080]],
                    "opening_windows_by_day": {1: [], 2: [[540, 1080]]},
                    "priority": 70,
                },
                {"id": "d", "duration_minutes": 120, "opening_windows": [[540, 1080]], "priority": 60},
            ],
            "days": [
                {
                    "day": 1,
                    "start_minute": 540,
                    "end_minute": 1080,
                    "start_anchor_id": "hotel",
                    "end_anchor_id": "hotel",
                    "reserved_minutes": 90,
                },
                {
                    "day": 2,
                    "start_minute": 540,
                    "end_minute": 1080,
                    "start_anchor_id": "hotel",
                    "end_anchor_id": "hotel",
                    "reserved_minutes": 90,
                },
            ],
            "matrix": {"node_ids": node_ids, "durations": durations},
            "max_solve_seconds": 1,
        })

        result = solve_route(request)

        self.assertEqual(result.status, "optimized")
        assigned = [item for day in result.days for item in day.attraction_ids]
        self.assertCountEqual(assigned, ["a", "b", "c", "d"])
        self.assertNotIn("c", result.days[0].attraction_ids)
        self.assertEqual(result.unassigned_attraction_ids, [])

    def test_returns_unassigned_stops_when_time_is_too_short(self) -> None:
        request = OptimizeRequest.model_validate({
            "attractions": [
                {"id": "must-see", "duration_minutes": 180, "priority": 100},
                {"id": "optional", "duration_minutes": 180, "priority": 10},
            ],
            "days": [{
                "day": 1,
                "start_minute": 540,
                "end_minute": 900,
                "start_anchor_id": None,
                "end_anchor_id": None,
                "reserved_minutes": 60,
            }],
            "matrix": {
                "node_ids": ["must-see", "optional"],
                "durations": [[0, 20], [20, 0]],
            },
            "max_solve_seconds": 1,
        })

        result = solve_route(request)

        self.assertEqual(result.status, "partial")
        self.assertEqual(result.days[0].attraction_ids, ["must-see"])
        self.assertEqual(result.unassigned_attraction_ids, ["optional"])


if __name__ == "__main__":
    unittest.main()
