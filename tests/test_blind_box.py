import unittest
from unittest.mock import patch

from api.blind_box import BlindBoxGenerateRequest, generate_blind_box


def base_document():
    return {
        "trip_profile": {
            "destination": "北京",
            "preferences": ["设计", "拍照"],
            "not_preferred": [],
            "content_priorities": {
                "attraction": "priority",
                "food": "normal",
                "shopping": "normal",
                "experience": "priority",
                "rest": "low",
            },
            "hard_constraints": {
                "forbidden": ["蹦极"],
                "dietary_allergies": [],
                "no_night_activity": False,
                "max_walking_minutes_per_day": 120,
                "max_walking_minutes_per_segment": 30,
                "mobility_limitations": [],
            },
            "total_trip_budget": 300,
            "other_requirements": "",
        },
        "blind_box_request": {
            "time_slot": {"start": "14:00", "end": "18:00"},
            "type": "preference",
            "budget_total": 80,
            "max_detour_minutes": 60,
            "reveal_now": False,
            "request_id": "stable-test",
            "exclude_candidate_ids": [],
        },
        "day_itinerary": [],
        "budget_context": {
            "remaining_trip_budget": 100,
            "blind_box_user_limit": 80,
            "effective_blind_box_limit": 80,
            "currency": "CNY",
        },
        "group_constraints": {
            "forbidden": [],
            "dietary_allergies": [],
            "max_walking_minutes_per_segment": 30,
            "accessibility_requirements": [],
        },
        "candidate_places": [],
    }


def candidate(candidate_id="one", category="experience", price=40, duration=60, name="设计空间"):
    return {
        "id": candidate_id,
        "name": name,
        "category": category,
        "subcategory": "展览",
        "address": "北京市测试路1号",
        "district": "东城区",
        "lat": 39.9,
        "lng": 116.4,
        "price": price,
        "currency": "CNY",
        "opening_hours_text": "10:00-20:00",
        "recommended_duration_minutes": duration,
        "rating": 4.8,
        "source_url": "https://uri.amap.com/marker?test=1",
        "checked_at": "2026-08-21",
        "verification_status": "estimated",
        "source": "amap",
    }


class BlindBoxTest(unittest.TestCase):
    def test_rejects_budget_overrun(self):
        document = base_document()
        document["candidate_places"] = [candidate(price=120)]
        result = generate_blind_box(BlindBoxGenerateRequest.model_validate(document))
        self.assertEqual(result["status"], "no_feasible_option")
        self.assertEqual(result["rejection_counts"]["budget"], 1)

    def test_rejects_food_when_allergen_evidence_is_missing(self):
        document = base_document()
        document["trip_profile"]["hard_constraints"]["dietary_allergies"] = ["花生"]
        document["candidate_places"] = [candidate(category="food", name="特色餐厅")]
        result = generate_blind_box(BlindBoxGenerateRequest.model_validate(document))
        self.assertEqual(result["status"], "no_feasible_option")
        self.assertEqual(result["rejection_counts"]["safety_allergy_group"], 1)

    def test_never_selects_content_priority_none(self):
        document = base_document()
        document["trip_profile"]["content_priorities"]["shopping"] = "none"
        document["candidate_places"] = [candidate(category="shopping", name="购物中心")]
        result = generate_blind_box(BlindBoxGenerateRequest.model_validate(document))
        self.assertEqual(result["status"], "no_feasible_option")
        self.assertEqual(result["rejection_counts"]["content_priority_none"], 1)

    def test_rejects_impossible_time_window(self):
        document = base_document()
        document["blind_box_request"]["time_slot"] = {"start": "15:00", "end": "16:00"}
        document["candidate_places"] = [candidate(duration=90)]
        result = generate_blind_box(BlindBoxGenerateRequest.model_validate(document))
        self.assertEqual(result["status"], "no_feasible_option")
        self.assertEqual(result["rejection_counts"]["time"], 1)

    def test_rejects_excessive_walking_after_route_check(self):
        document = base_document()
        document["blind_box_request"]["type"] = "detour"
        document["trip_profile"]["hard_constraints"]["max_walking_minutes_per_segment"] = 10
        document["group_constraints"]["max_walking_minutes_per_segment"] = 10
        document["day_itinerary"] = [
            {"item_id": "a", "type": "attraction", "name": "A", "lat": 39.9, "lng": 116.39},
            {"item_id": "b", "type": "attraction", "name": "B", "lat": 39.9, "lng": 116.41},
        ]
        document["candidate_places"] = [candidate()]
        with patch("api.blind_box._get_route", side_effect=[(15, 2, 25), (15, 2, 25), (20, 2, 5)]):
            result = generate_blind_box(BlindBoxGenerateRequest.model_validate(document))
        self.assertEqual(result["status"], "no_feasible_option")
        self.assertEqual(result["rejection_counts"]["safety_allergy_group"], 1)

    def test_replace_excludes_previous_candidate(self):
        document = base_document()
        document["blind_box_request"]["exclude_candidate_ids"] = ["one"]
        document["candidate_places"] = [candidate("one"), candidate("two", name="第二个设计空间")]
        result = generate_blind_box(BlindBoxGenerateRequest.model_validate(document))
        self.assertEqual(result["status"], "success")
        self.assertEqual(result["system_payload"]["selected_candidate_id"], "two")
        self.assertNotIn("name", result["public_card"])

    def test_missing_price_is_estimated_not_rejected(self):
        document = base_document()
        document["blind_box_request"]["budget_total"] = 150
        document["budget_context"] = {
            "remaining_trip_budget": 150,
            "blind_box_user_limit": 150,
            "effective_blind_box_limit": 150,
            "currency": "CNY",
        }
        document["candidate_places"] = [candidate(price=None)]
        result = generate_blind_box(BlindBoxGenerateRequest.model_validate(document))
        self.assertEqual(result["status"], "success")
        self.assertEqual(result["system_payload"]["selected_candidate_id"], "one")
        self.assertTrue(
            any("保守估算" in warning for warning in result["public_card"]["data_warnings"])
        )

    def test_estimated_price_still_respects_budget_boundary(self):
        document = base_document()
        # 体验类估算价 100 元，超过 80 元有效预算时应按预算拒绝，而不是当作免费。
        document["candidate_places"] = [candidate(price=None)]
        document["budget_context"] = {
            "remaining_trip_budget": 80,
            "blind_box_user_limit": 80,
            "effective_blind_box_limit": 80,
            "currency": "CNY",
        }
        result = generate_blind_box(BlindBoxGenerateRequest.model_validate(document))
        self.assertEqual(result["status"], "no_feasible_option")
        self.assertEqual(result["rejection_counts"]["budget"], 1)


if __name__ == "__main__":
    unittest.main()
