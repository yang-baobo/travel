from __future__ import annotations

import hashlib
import math
from datetime import date
from typing import Any, Literal
from urllib.parse import urlencode

from pydantic import BaseModel, Field

try:
    from .travel_providers import (
        ProviderNotConfigured,
        ProviderRequestError,
        get_routes,
        search_blind_box_places,
    )
except ImportError:  # pragma: no cover - Vercel package fallback
    from travel_providers import (  # type: ignore[no-redef]
        ProviderNotConfigured,
        ProviderRequestError,
        get_routes,
        search_blind_box_places,
    )


Priority = Literal["none", "low", "normal", "priority"]
BlindBoxType = Literal["preference", "detour"]
ContentCategory = Literal["attraction", "food", "shopping", "experience", "rest"]


class ContentPriorities(BaseModel):
    attraction: Priority = "priority"
    food: Priority = "priority"
    shopping: Priority = "normal"
    experience: Priority = "normal"
    rest: Priority = "low"


class HardConstraints(BaseModel):
    forbidden: list[str] = Field(default_factory=list)
    dietary_allergies: list[str] = Field(default_factory=list)
    no_night_activity: bool = False
    max_walking_minutes_per_day: int = Field(default=120, ge=0, le=1440)
    max_walking_minutes_per_segment: int = Field(default=30, ge=0, le=360)
    mobility_limitations: list[str] = Field(default_factory=list)


class TripProfile(BaseModel):
    destination: str = "北京"
    preferences: list[str] = Field(default_factory=list)
    not_preferred: list[str] = Field(default_factory=list)
    content_priorities: ContentPriorities
    hard_constraints: HardConstraints
    total_trip_budget: float = Field(ge=0)
    other_requirements: str = ""


class TimeSlot(BaseModel):
    start: str
    end: str


class BlindBoxRequest(BaseModel):
    time_slot: TimeSlot
    type: BlindBoxType
    budget_total: float = Field(ge=0)
    max_detour_minutes: int = Field(default=20, ge=0, le=240)
    max_distance_km: float | None = Field(default=None, ge=0)
    reveal_now: bool = False
    request_id: str | None = None
    exclude_candidate_ids: list[str] = Field(default_factory=list)


class DayItineraryItem(BaseModel):
    item_id: str
    type: str
    name: str
    lat: float
    lng: float
    start_time: str | None = None
    end_time: str | None = None


class BudgetContext(BaseModel):
    remaining_trip_budget: float = Field(ge=0)
    blind_box_user_limit: float = Field(ge=0)
    effective_blind_box_limit: float = Field(ge=0)
    currency: Literal["CNY"] = "CNY"


class GroupConstraints(BaseModel):
    source: str = "main_platform"
    forbidden: list[str] = Field(default_factory=list)
    dietary_allergies: list[str] = Field(default_factory=list)
    max_walking_minutes_per_segment: int | None = Field(default=None, ge=0, le=360)
    accessibility_requirements: list[str] = Field(default_factory=list)


class CandidatePlace(BaseModel):
    id: str
    name: str
    category: ContentCategory
    subcategory: str = ""
    address: str = ""
    district: str = ""
    lat: float
    lng: float
    price: float | None = Field(default=None, ge=0)
    currency: Literal["CNY"] = "CNY"
    opening_hours_text: str = ""
    recommended_duration_minutes: int = Field(default=60, ge=10, le=480)
    booking_required: bool = False
    booking_available: bool = False
    risk_tags: list[str] = Field(default_factory=list)
    food_tags: list[str] = Field(default_factory=list)
    allergen_tags: list[str] = Field(default_factory=list)
    accessibility_tags: list[str] = Field(default_factory=list)
    type_name: str = ""
    rating: float | None = None
    photo_urls: list[str] = Field(default_factory=list)
    source_url: str = ""
    checked_at: str = ""
    verification_status: Literal["verified", "estimated", "unverified"] = "estimated"
    source: str = "amap"


class BlindBoxGenerateRequest(BaseModel):
    trip_profile: TripProfile | None = None
    blind_box_request: BlindBoxRequest | None = None
    day_itinerary: list[DayItineraryItem] = Field(default_factory=list)
    budget_context: BudgetContext | None = None
    group_constraints: GroupConstraints | None = None
    candidate_places: list[CandidatePlace] = Field(default_factory=list)


PRIORITY_SCORE: dict[str, float] = {
    "none": -10_000,
    "low": 4,
    "normal": 12,
    "priority": 24,
}
HIGH_EFFORT_WORDS = ("登山", "攀岩", "徒步", "长城", "蹦极", "跳伞", "滑雪", "漂流")
NIGHT_START_MINUTE = 19 * 60

# 高德 POI 通常不返回 cost；直接把"未知价格"当作不可选会让盲盒几乎永远
# 失败。这里改为按品类做保守估算，仍然用预算硬边界校验，并把估算暴露到
# data_warnings 里，而不是把未知当作免费。
ESTIMATED_PRICE_BY_CATEGORY: dict[str, float] = {
    "attraction": 60.0,
    "food": 80.0,
    "shopping": 100.0,
    "experience": 100.0,
    "rest": 50.0,
}


def _estimated_price(candidate: CandidatePlace) -> tuple[CandidatePlace, bool]:
    """Return (candidate, price_was_estimated)."""
    if candidate.price is not None:
        return candidate, False
    estimate = ESTIMATED_PRICE_BY_CATEGORY.get(candidate.category, 80.0)
    return (
        candidate.model_copy(update={"price": estimate, "verification_status": "estimated"}),
        True,
    )


def _minutes(value: str) -> int | None:
    try:
        hour_text, minute_text = value.split(":", 1)
        hour, minute = int(hour_text), int(minute_text)
        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            return None
        return hour * 60 + minute
    except (AttributeError, TypeError, ValueError):
        return None


def _distance_km(a: DayItineraryItem | CandidatePlace, b: DayItineraryItem | CandidatePlace) -> float:
    lat1, lat2 = math.radians(a.lat), math.radians(b.lat)
    delta_lat = lat2 - lat1
    delta_lng = math.radians(b.lng - a.lng)
    value = math.sin(delta_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lng / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(value))


def _stable_noise(seed: str, candidate_id: str) -> float:
    digest = hashlib.sha256(f"{seed}:{candidate_id}".encode("utf-8")).digest()
    return int.from_bytes(digest[:4], "big") / 2**32


def _provider_candidates(profile: TripProfile) -> list[CandidatePlace]:
    categories: list[ContentCategory] = [
        category
        for category, priority in profile.content_priorities.model_dump().items()
        if priority != "none"
    ]
    items: list[CandidatePlace] = []
    seen: set[str] = set()
    for category in categories:
        try:
            raw_items = search_blind_box_places(category, page_size=16)
        except (ProviderNotConfigured, ProviderRequestError):
            continue
        for raw in raw_items:
            if raw["id"] in seen:
                continue
            seen.add(raw["id"])
            source_url = "https://uri.amap.com/marker?" + urlencode(
                {"position": f"{raw['lng']},{raw['lat']}", "name": raw["name"]}
            )
            items.append(
                CandidatePlace(
                    **raw,
                    # Amap does not provide visit duration. Keep this explicitly
                    # estimated all the way to the public warning.
                    recommended_duration_minutes=60 if category in ("food", "rest") else 90,
                    source_url=source_url,
                    checked_at=date.today().isoformat(),
                    verification_status="estimated",
                )
            )
    return items


def _merged_constraints(profile: TripProfile, group: GroupConstraints | None) -> dict[str, Any]:
    hard = profile.hard_constraints
    forbidden = {item.strip().lower() for item in hard.forbidden if item.strip()}
    allergies = {item.strip().lower() for item in hard.dietary_allergies if item.strip()}
    accessibility = {item.strip().lower() for item in hard.mobility_limitations if item.strip()}
    max_segment = hard.max_walking_minutes_per_segment
    if group:
        forbidden.update(item.strip().lower() for item in group.forbidden if item.strip())
        allergies.update(item.strip().lower() for item in group.dietary_allergies if item.strip())
        accessibility.update(item.strip().lower() for item in group.accessibility_requirements if item.strip())
        if group.max_walking_minutes_per_segment is not None:
            max_segment = min(max_segment, group.max_walking_minutes_per_segment)
    return {
        "forbidden": forbidden,
        "allergies": allergies,
        "accessibility": accessibility,
        "max_segment": min(max_segment, hard.max_walking_minutes_per_day),
    }


def _route_mode(route: dict[str, Any] | None) -> tuple[int, float, int] | None:
    if not route:
        return None
    transit = route.get("transit")
    if isinstance(transit, dict):
        return int(transit.get("time") or 0), float(transit.get("price") or 0), int(transit.get("walkToStationMin") or 0)
    driving = route.get("driving")
    if isinstance(driving, dict):
        return int(driving.get("time") or 0), float(driving.get("price") or 0), 0
    walking = route.get("walking")
    if isinstance(walking, dict):
        minutes = int(walking.get("time") or 0)
        return minutes, 0, minutes
    return None


def _get_route(a: DayItineraryItem | CandidatePlace, b: DayItineraryItem | CandidatePlace) -> tuple[int, float, int] | None:
    try:
        return _route_mode(get_routes(f"{a.lng},{a.lat}", f"{b.lng},{b.lat}"))
    except (ProviderNotConfigured, ProviderRequestError):
        return None


def _best_insertion(candidate: CandidatePlace, itinerary: list[DayItineraryItem]) -> tuple[int, float, int, int] | None:
    """Return segment index, approximate detour km/minutes and walking.

    Straight-line math is only a shortlist. The winner is checked with the
    existing Amap route adapter before the response is finalized.
    """
    if len(itinerary) < 2:
        return None
    best: tuple[int, float, int, int] | None = None
    for index, (previous, following) in enumerate(zip(itinerary, itinerary[1:])):
        added_km = max(
            0.0,
            _distance_km(previous, candidate)
            + _distance_km(candidate, following)
            - _distance_km(previous, following),
        )
        approximate_minutes = round(added_km / 22 * 60)
        walking_estimate = round(min(_distance_km(previous, candidate), _distance_km(candidate, following)) / 4.5 * 60)
        value = (index, added_km, approximate_minutes, walking_estimate)
        if best is None or value[2] < best[2]:
            best = value
    return best


def _score(
    candidate: CandidatePlace,
    profile: TripProfile,
    request: BlindBoxRequest,
    itinerary: list[DayItineraryItem],
    insertion: tuple[int, float, int, int] | None,
) -> float:
    priorities = profile.content_priorities.model_dump()
    text = " ".join([candidate.name, candidate.subcategory, candidate.type_name]).lower()
    preference_fit = sum(10 for item in profile.preferences if item.lower() in text)
    not_preferred = sum(8 for item in profile.not_preferred if item.lower() in text)
    existing_categories = [item.type for item in itinerary]
    variety = 8 - existing_categories.count(candidate.category) * 3
    route_score = 0 if insertion is None else max(-20, 12 - insertion[2] / 2)
    rating = (candidate.rating or 0) * 1.5
    novelty = _stable_noise(request.request_id or "blind-box", candidate.id) * 7
    if request.type == "detour":
        return route_score * 2 + variety + PRIORITY_SCORE[priorities[candidate.category]] + rating + novelty - not_preferred
    return PRIORITY_SCORE[priorities[candidate.category]] + preference_fit * 2 + variety + route_score + rating + novelty - not_preferred


def _failure(counts: dict[str, int], reasons: list[str], adjustments: list[str]) -> dict[str, Any]:
    return {
        "status": "no_feasible_option",
        "rejection_counts": counts,
        "failure_reasons": reasons,
        "minimal_adjustments": adjustments,
    }


def generate_blind_box(payload: BlindBoxGenerateRequest) -> dict[str, Any]:
    missing: list[str] = []
    if payload.trip_profile is None:
        missing.append("trip_profile")
    if payload.blind_box_request is None:
        missing.append("blind_box_request")
    if payload.budget_context is None:
        missing.append("budget_context.effective_blind_box_limit")
    if missing:
        return {
            "status": "missing_upstream_context",
            "missing_fields": missing,
            "message": "主平台上下文不完整，未生成盲盒",
        }

    profile = payload.trip_profile
    request = payload.blind_box_request
    budget = payload.budget_context
    assert profile is not None and request is not None and budget is not None

    start = _minutes(request.time_slot.start)
    end = _minutes(request.time_slot.end)
    empty_counts = {"budget": 0, "time": 0, "route": 0, "content_priority_none": 0, "safety_allergy_group": 0}
    if start is None or end is None or end <= start:
        return _failure(
            {**empty_counts, "time": 1},
            ["盲盒时间段无效或不足"],
            ["选择一个结束时间晚于开始时间的时段"],
        )
    if profile.hard_constraints.no_night_activity and end > NIGHT_START_MINUTE:
        return _failure(
            {**empty_counts, "time": 1, "safety_allergy_group": 1},
            ["该时间段超过了整趟旅行的夜间活动限制"],
            ["把本次盲盒调整到 19:00 前结束"],
        )
    if request.type == "detour" and len(payload.day_itinerary) < 2:
        return _failure(
            {**empty_counts, "route": 1},
            ["偏航盲盒需要当前路线中至少有两个地点"],
            ["先在实时路线中加入两个地点", "改用偏好盲盒"],
        )

    effective_limit = min(
        budget.remaining_trip_budget,
        budget.blind_box_user_limit,
        request.budget_total,
    )
    constraints = _merged_constraints(profile, payload.group_constraints)
    candidates = payload.candidate_places or _provider_candidates(profile)
    excluded = set(request.exclude_candidate_ids)
    counts = {**empty_counts, "data_uncertainty": 0}
    ranked: list[tuple[float, CandidatePlace, tuple[int, float, int, int] | None]] = []
    priorities = profile.content_priorities.model_dump()
    slot_minutes = end - start

    for candidate in candidates:
        if candidate.id in excluded:
            continue
        if priorities[candidate.category] == "none":
            counts["content_priority_none"] += 1
            continue
        searchable = " ".join(
            [candidate.name, candidate.subcategory, candidate.type_name, *candidate.risk_tags, *candidate.food_tags, *candidate.allergen_tags]
        ).lower()
        if any(token and token in searchable for token in constraints["forbidden"]):
            counts["safety_allergy_group"] += 1
            continue
        if constraints["allergies"] and candidate.category == "food":
            # Amap does not provide ingredient-level allergen evidence.
            counts["safety_allergy_group"] += 1
            continue
        if any(token in searchable for token in constraints["allergies"]):
            counts["safety_allergy_group"] += 1
            continue
        if constraints["accessibility"] and any(word in searchable for word in HIGH_EFFORT_WORDS):
            counts["safety_allergy_group"] += 1
            continue
        candidate, price_estimated = _estimated_price(candidate)
        if candidate.price > effective_limit:
            counts["budget"] += 1
            continue
        insertion = _best_insertion(candidate, payload.day_itinerary)
        travel_allowance = insertion[2] if insertion else 0
        if candidate.recommended_duration_minutes + travel_allowance + 10 > slot_minutes:
            counts["time"] += 1
            continue
        if insertion and request.max_distance_km is not None and insertion[1] > request.max_distance_km:
            counts["route"] += 1
            continue
        if insertion and insertion[2] > request.max_detour_minutes:
            counts["route"] += 1
            continue
        ranked.append(
            (
                _score(candidate, profile, request, payload.day_itinerary, insertion),
                candidate,
                insertion,
                price_estimated,
            )
        )

    ranked.sort(key=lambda item: (-item[0], item[1].id))
    selected: CandidatePlace | None = None
    selected_insertion: tuple[int, float, int, int] | None = None
    selected_price_estimated = False
    detour_minutes = 0
    added_transport_cost = 0.0
    walking_minutes = 0
    route_verified = False

    for _, candidate, insertion, price_estimated in ranked[:6]:
        candidate_detour = insertion[2] if insertion else 0
        candidate_transport_cost = 0.0
        candidate_walk = insertion[3] if insertion else 0
        verified = False
        if insertion:
            previous = payload.day_itinerary[insertion[0]]
            following = payload.day_itinerary[insertion[0] + 1]
            leg_one = _get_route(previous, candidate)
            leg_two = _get_route(candidate, following)
            direct = _get_route(previous, following)
            if leg_one and leg_two and direct:
                candidate_detour = max(0, leg_one[0] + leg_two[0] - direct[0])
                candidate_transport_cost = max(0.0, leg_one[1] + leg_two[1] - direct[1])
                candidate_walk = max(leg_one[2], leg_two[2])
                verified = True
        total_cost = candidate.price + candidate_transport_cost
        if candidate_detour > request.max_detour_minutes:
            counts["route"] += 1
            continue
        if candidate_walk > constraints["max_segment"]:
            counts["safety_allergy_group"] += 1
            continue
        if total_cost > effective_limit:
            counts["budget"] += 1
            continue
        selected = candidate
        selected_insertion = insertion
        selected_price_estimated = price_estimated
        detour_minutes = candidate_detour
        added_transport_cost = candidate_transport_cost
        walking_minutes = candidate_walk
        route_verified = verified
        break

    if selected is None:
        reasons: list[str] = []
        if counts["budget"]:
            reasons.append("可核验费用的候选项目超出本次有效预算")
        if counts["time"]:
            reasons.append("候选项目无法在时间段内完成并保留交通缓冲")
        if counts["route"]:
            reasons.append("候选项目超出最大绕路范围")
        if counts["safety_allergy_group"]:
            reasons.append("候选项目无法证明满足安全、过敏或行动限制")
        return _failure(
            counts,
            reasons or ["当前没有符合全部条件的真实候选项目"],
            ["增加可用时间", "缩小到当前路线附近", "适当提高本次预算"],
        )

    total_cost = round(selected.price + added_transport_cost, 2)
    needs_verification = selected.verification_status != "verified" or not route_verified
    safety_notes: list[str] = []
    data_warnings = ["活动时长为估算值，请以地点现场或预订页为准"]
    if selected_price_estimated:
        data_warnings.append(
            "高德未提供该地点费用，已按品类保守估算为 "
            f"¥{selected.price:g} 并纳入预算校验，请以现场或预订页为准"
        )
    if constraints["accessibility"]:
        safety_notes.append("无障碍信息未完全公开，出发前需再次确认")
    if not route_verified and selected_insertion:
        data_warnings.append("高德路线暂未完成实时校验，绕路时间为距离估算")
    if selected.opening_hours_text:
        data_warnings.append(f"营业信息：{selected.opening_hours_text}，出发前请复核")
    else:
        data_warnings.append("营业时间数据缺失，出发前必须确认")

    priority_applied = f"{selected.category}:{priorities[selected.category]}"
    existing_count = sum(1 for item in payload.day_itinerary if item.type == selected.category)
    variety_reason = (
        f"当天已有 {existing_count} 个同类项目，本次选择兼顾路线与内容优先级"
        if existing_count
        else "当前路线尚无同类项目，本次加入用于增加内容多样性"
    )
    title = selected.name if request.reveal_now else (
        f"一段不超过 {request.max_detour_minutes} 分钟的偏航盲盒"
        if request.type == "detour"
        else "一份贴近你偏好的北京盲盒"
    )
    public_card: dict[str, Any] = {
        "reveal_now": request.reveal_now,
        "title": title,
        "time": f"{request.time_slot.start}-{request.time_slot.end}",
        "area_hint": selected.district or "当前路线附近",
        "budget": f"预计 ¥{total_cost:g}",
        "effort": "低强度" if walking_minutes <= 15 else "中等强度",
        "walking": f"预计单段步行不超过 {walking_minutes} 分钟" if walking_minutes else "步行量待路线复核",
        "detour": f"预计增加 {detour_minutes} 分钟" if selected_insertion else "暂无完整路线，绕路待核实",
        "reason": f"匹配你设置的 {priority_applied} 优先级与偏好，同时保留受约束的惊喜",
        "safety_notes": safety_notes,
        "data_warnings": data_warnings,
        "reservation_required": selected.booking_required,
    }
    if request.reveal_now:
        public_card.update(
            {
                "name": selected.name,
                "address": selected.address,
                "lat": selected.lat,
                "lng": selected.lng,
                "photo_urls": selected.photo_urls,
            }
        )

    return {
        "status": "success",
        "public_card": public_card,
        "system_payload": {
            "selected_candidate_id": selected.id,
            "selected_candidate": selected.model_dump(),
            "content_priority_applied": priority_applied,
            "budget_used": total_cost,
            "budget_after_box": round(effective_limit - total_cost, 2),
            "group_constraints_applied": True,
            "day_variety_reason": variety_reason,
            "added_detour_minutes": detour_minutes,
            "insertion_after_item_id": (
                payload.day_itinerary[selected_insertion[0]].item_id if selected_insertion else None
            ),
            "needs_verification": needs_verification,
            "verification": {
                "source_url": selected.source_url,
                "checked_at": selected.checked_at,
                "route_verified": route_verified,
            },
            "constraint_audit": {
                "hard_constraints": "passed",
                "content_priority": "passed",
                "budget": "passed",
                "time": "passed",
                "route": "passed" if route_verified or not selected_insertion else "estimated",
                "group": "passed",
            },
        },
    }
