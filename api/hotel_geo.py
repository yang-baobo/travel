from __future__ import annotations

import re
import time
from threading import RLock
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

try:
    from .travel_providers import BEIJING, _amap_request, _location
except ImportError:  # Vercel can load api modules without a package context.
    from travel_providers import BEIJING, _amap_request, _location  # type: ignore[no-redef]


GeoMatchLevel = Literal["exact", "strong", "ambiguous", "not_found"]
GeoStatus = Literal["verified", "ambiguous", "not_found"]

_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60
_COORDINATE_CACHE: dict[str, tuple[float, "HotelGeoResponse"]] = {}
_COORDINATE_CACHE_LOCK = RLock()
_NON_NAME = re.compile(r"[^0-9A-Za-z\u4e00-\u9fff]+")
_GENERIC_HOTEL_WORDS = re.compile(r"(?:北京市?|酒店|宾馆|旅馆|饭店|公寓|店)$")


class CamelModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True, extra="ignore")


class HotelGeoRequest(CamelModel):
    hotel_id: str = Field(alias="hotelId", min_length=1, max_length=180)
    source: Literal["fliggy", "static"]
    source_hotel_id: str = Field(alias="sourceHotelId", min_length=1, max_length=160)
    name: str = Field(min_length=1, max_length=120)
    destination: str = Field(min_length=1, max_length=40)
    city: str | None = Field(default=None, max_length=40)
    district: str | None = Field(default=None, max_length=80)
    address: str | None = Field(default=None, max_length=240)

    @field_validator("name", "destination", "hotel_id", "source_hotel_id")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("value cannot be blank")
        return normalized

    @field_validator("city", "district", "address")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        normalized = value.strip() if value else ""
        return normalized or None


class HotelGeoResponse(CamelModel):
    hotel_id: str = Field(alias="hotelId")
    status: GeoStatus
    match_level: GeoMatchLevel = Field(alias="matchLevel")
    confidence: float = Field(ge=0, le=1)
    latitude: float | None = None
    longitude: float | None = None
    coordinate_source: Literal["amap"] | None = Field(default=None, alias="coordinateSource")
    coordinate_verified: bool = Field(alias="coordinateVerified")
    amap_poi_id: str | None = Field(default=None, alias="amapPoiId")
    matched_name: str | None = Field(default=None, alias="matchedName")
    matched_address: str | None = Field(default=None, alias="matchedAddress")
    matched_district: str | None = Field(default=None, alias="matchedDistrict")
    provider: Literal["amap"] = "amap"
    calculated_at: str = Field(alias="calculatedAt")
    latency_ms: int = Field(alias="latencyMs", ge=0)
    rejected_wrong_city_count: int = Field(default=0, alias="rejectedWrongCityCount", ge=0)
    cached: bool = False


def _text(value: Any) -> str:
    if isinstance(value, list):
        return "".join(_text(item) for item in value)
    if value is None or isinstance(value, dict):
        return ""
    return str(value).strip()


def _normalize(value: Any) -> str:
    return _NON_NAME.sub("", _text(value)).lower()


def _canonical_hotel_name(value: Any) -> str:
    normalized = _normalize(value)
    previous = ""
    while normalized and normalized != previous:
        previous = normalized
        normalized = _GENERIC_HOTEL_WORDS.sub("", normalized)
    return normalized


def _bigrams(value: str) -> set[str]:
    if len(value) < 2:
        return {value} if value else set()
    return {value[index:index + 2] for index in range(len(value) - 1)}


def _similarity(left: Any, right: Any) -> float:
    left_value = _normalize(left)
    right_value = _normalize(right)
    if not left_value or not right_value:
        return 0.0
    if left_value == right_value:
        return 1.0
    if min(len(left_value), len(right_value)) >= 4 and (
        left_value in right_value or right_value in left_value
    ):
        return min(len(left_value), len(right_value)) / max(len(left_value), len(right_value))
    left_pairs = _bigrams(left_value)
    right_pairs = _bigrams(right_value)
    union = left_pairs | right_pairs
    return len(left_pairs & right_pairs) / len(union) if union else 0.0


def _is_beijing_candidate(candidate: dict[str, Any]) -> bool:
    adcode = _text(candidate.get("adcode"))
    if adcode.startswith("11"):
        return True
    administrative_text = "|".join(
        _text(candidate.get(field))
        for field in ("pname", "cityname", "province", "city")
    )
    return "北京" in administrative_text


def _score_candidate(request: HotelGeoRequest, candidate: dict[str, Any]) -> dict[str, Any] | None:
    if not _is_beijing_candidate(candidate):
        return None
    location = _location(candidate.get("location"))
    if location is None:
        return None

    requested_name = _canonical_hotel_name(request.name)
    candidate_name = _canonical_hotel_name(candidate.get("name"))
    name_similarity = _similarity(requested_name, candidate_name)
    raw_name_exact = _normalize(request.name) == _normalize(candidate.get("name"))
    canonical_name_exact = bool(requested_name and requested_name == candidate_name)
    if raw_name_exact:
        name_score = 0.64
    elif canonical_name_exact:
        name_score = 0.59
    elif name_similarity >= 0.72:
        name_score = 0.48 * name_similarity
    else:
        name_score = 0.32 * name_similarity

    candidate_district = _text(candidate.get("adname")) or _text(candidate.get("district"))
    district_similarity = _similarity(request.district, candidate_district)
    district_score = 0.14 * district_similarity

    candidate_address = _text(candidate.get("address"))
    address_similarity = _similarity(request.address, candidate_address)
    address_score = 0.18 * address_similarity
    city_score = 0.08
    score = min(1.0, name_score + district_score + address_score + city_score)

    supporting_location = address_similarity >= 0.24 or district_similarity >= 0.75
    if raw_name_exact and supporting_location and score >= 0.78:
        level: GeoMatchLevel = "exact"
    elif (canonical_name_exact or name_similarity >= 0.72) and supporting_location and score >= 0.66:
        level = "strong"
    elif name_similarity >= 0.45 or raw_name_exact or canonical_name_exact:
        level = "ambiguous"
    else:
        level = "not_found"

    return {
        "candidate": candidate,
        "location": location,
        "score": score,
        "level": level,
        "rawNameExact": raw_name_exact,
        "canonicalNameExact": canonical_name_exact,
        "nameSimilarity": name_similarity,
        "addressSimilarity": address_similarity,
        "districtSimilarity": district_similarity,
    }


def match_hotel_candidate(
    request: HotelGeoRequest,
    candidates: list[dict[str, Any]],
) -> tuple[dict[str, Any] | None, GeoMatchLevel, float, int]:
    """Match one Beijing hotel conservatively; ambiguous candidates never yield coordinates."""
    scored: list[dict[str, Any]] = []
    rejected_wrong_city = 0
    for candidate in candidates:
        if not isinstance(candidate, dict):
            continue
        if not _is_beijing_candidate(candidate):
            rejected_wrong_city += 1
            continue
        item = _score_candidate(request, candidate)
        if item is not None and item["level"] != "not_found":
            scored.append(item)
    if not scored:
        return None, "not_found", 0.0, rejected_wrong_city

    scored.sort(key=lambda item: item["score"], reverse=True)
    best = scored[0]
    second = scored[1] if len(scored) > 1 else None
    exact_name_candidates = [item for item in scored if item["canonicalNameExact"]]
    distinctive_exact_name = (
        best["canonicalNameExact"]
        and len(_canonical_hotel_name(request.name)) >= 6
        and len(exact_name_candidates) == 1
    )
    if (
        not distinctive_exact_name
        and second is not None
        and second["score"] >= best["score"] - 0.035
    ):
        best_address = _normalize(best["candidate"].get("address"))
        second_address = _normalize(second["candidate"].get("address"))
        if best_address != second_address:
            return None, "ambiguous", round(best["score"], 3), rejected_wrong_city

    level: GeoMatchLevel = best["level"]
    # AMap and FlyAI sometimes format the same branch address very differently.
    # A single exact, distinctive Beijing branch name is still safe to use; short
    # generic names and duplicate branches remain ambiguous.
    if level == "ambiguous" and distinctive_exact_name:
        level = "strong"
    if level not in ("exact", "strong"):
        return None, "ambiguous", round(best["score"], 3), rejected_wrong_city
    return best, level, round(best["score"], 3), rejected_wrong_city


def hotel_coordinate_cache_key(request: HotelGeoRequest) -> str:
    """Stable identity fields only: prices and stay dates intentionally do not participate."""
    return "|".join(
        (
            request.source,
            request.source_hotel_id,
            _normalize(request.name),
            _normalize(request.address),
            _normalize(request.district),
            _normalize(request.destination),
        )
    )


def clear_hotel_coordinate_cache() -> None:
    with _COORDINATE_CACHE_LOCK:
        _COORDINATE_CACHE.clear()


def resolve_hotel_geography(request: HotelGeoRequest) -> HotelGeoResponse:
    started_at = time.perf_counter()
    calculated_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    if _normalize(request.destination) not in {"北京", "北京市"}:
        return HotelGeoResponse(
            hotelId=request.hotel_id,
            status="not_found",
            matchLevel="not_found",
            confidence=0,
            coordinateVerified=False,
            calculatedAt=calculated_at,
            latencyMs=0,
        )

    cache_key = hotel_coordinate_cache_key(request)
    with _COORDINATE_CACHE_LOCK:
        cached = _COORDINATE_CACHE.get(cache_key)
        if cached and cached[0] > time.monotonic():
            return cached[1].model_copy(update={"cached": True, "latency_ms": 0})

    queries = [request.name]
    if request.address:
        queries.append(request.address)
    candidates_by_id: dict[str, dict[str, Any]] = {}
    for keyword in queries:
        payload = _amap_request(
            "/v5/place/text",
            {
                "region": BEIJING["adcode"],
                "city_limit": "true",
                "types": "100000",
                "keywords": keyword,
                "page_num": 1,
                "page_size": 20,
                "show_fields": "business",
            },
        )
        raw_pois = payload.get("pois")
        for candidate in raw_pois if isinstance(raw_pois, list) else []:
            if not isinstance(candidate, dict):
                continue
            candidate_id = _text(candidate.get("id"))
            if candidate_id:
                candidates_by_id[candidate_id] = candidate

    matched, match_level, confidence, rejected_wrong_city = match_hotel_candidate(
        request,
        list(candidates_by_id.values()),
    )
    latency_ms = round((time.perf_counter() - started_at) * 1000)
    if matched is None:
        status: GeoStatus = "ambiguous" if match_level == "ambiguous" else "not_found"
        return HotelGeoResponse(
            hotelId=request.hotel_id,
            status=status,
            matchLevel=match_level,
            confidence=confidence,
            coordinateVerified=False,
            calculatedAt=calculated_at,
            latencyMs=latency_ms,
            rejectedWrongCityCount=rejected_wrong_city,
        )

    candidate = matched["candidate"]
    location = matched["location"]
    response = HotelGeoResponse(
        hotelId=request.hotel_id,
        status="verified",
        matchLevel=match_level,
        confidence=confidence,
        latitude=location["latitude"],
        longitude=location["longitude"],
        coordinateSource="amap",
        coordinateVerified=True,
        amapPoiId=_text(candidate.get("id")) or None,
        matchedName=_text(candidate.get("name")) or None,
        matchedAddress=_text(candidate.get("address")) or None,
        matchedDistrict=_text(candidate.get("adname")) or _text(candidate.get("district")) or None,
        calculatedAt=calculated_at,
        latencyMs=latency_ms,
        rejectedWrongCityCount=rejected_wrong_city,
    )
    with _COORDINATE_CACHE_LOCK:
        _COORDINATE_CACHE[cache_key] = (
            time.monotonic() + _CACHE_TTL_SECONDS,
            response,
        )
    return response
