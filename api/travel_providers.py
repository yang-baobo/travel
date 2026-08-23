from __future__ import annotations

import json
import os
import ssl
import time
from concurrent.futures import ThreadPoolExecutor
from threading import RLock
from typing import Any, Literal
from urllib.error import HTTPError, URLError
from urllib.parse import quote_plus, urlencode, urlparse
from urllib.request import Request, urlopen

import certifi


PlaceCategory = Literal["attraction", "hotel", "restaurant"]
BlindBoxContentCategory = Literal["attraction", "food", "shopping", "experience", "rest"]

BEIJING = {
    "name": "北京",
    "adcode": "110000",
    "citycode": "010",
}

AMAP_BASE_URL = "https://restapi.amap.com"
AMAP_SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
AMAP_PLACE_TYPES: dict[PlaceCategory, str] = {
    # 风景名胜 + 主要公共文化场馆，排除学校和培训机构等非游览地点。
    "attraction": "110000|140100|140200|140400|140500|140600",
    "hotel": "100000",
    "restaurant": "050000",
}

# Blind-box categories are broader than the public explore tabs. They are kept
# in this provider adapter so the selection engine never calls Amap directly.
AMAP_BLIND_BOX_TYPES: dict[BlindBoxContentCategory, str] = {
    "attraction": "110000|140100|140200|140400|140500|140600",
    "food": "050000",
    "shopping": "060000",
    "experience": "080000|140100|140400|140500|140600",
    "rest": "050500|110100",
}

_REQUEST_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_REQUEST_CACHE_LOCK = RLock()
_REQUEST_CACHE_TTL_SECONDS = 5 * 60

PARTNER_TEMPLATE_ENV: dict[PlaceCategory, str] = {
    "attraction": "CTRIP_TICKET_LINK_TEMPLATE",
    "hotel": "CTRIP_HOTEL_LINK_TEMPLATE",
    "restaurant": "MEITUAN_RESTAURANT_LINK_TEMPLATE",
}

PARTNER_LABEL: dict[PlaceCategory, str] = {
    "attraction": "去携程查看门票",
    "hotel": "去携程查看房型",
    "restaurant": "去美团查看",
}

PARTNER_ALLOWED_DOMAINS: dict[PlaceCategory, tuple[str, ...]] = {
    "attraction": ("ctrip.com", "trip.com"),
    "hotel": ("ctrip.com", "trip.com"),
    "restaurant": ("meituan.com", "dianping.com"),
}


class ProviderNotConfigured(RuntimeError):
    pass


class ProviderRequestError(RuntimeError):
    pass


def provider_status() -> dict[str, Any]:
    return {
        "city": BEIJING,
        "amap": {
            "configured": bool(os.getenv("AMAP_WEB_SERVICE_KEY", "").strip()),
            "capabilities": ["places", "hotel_geocode", "transit", "walking", "driving"],
        },
        "ctrip": {
            "configured": bool(
                os.getenv("CTRIP_HOTEL_LINK_TEMPLATE", "").strip()
                or os.getenv("CTRIP_TICKET_LINK_TEMPLATE", "").strip()
            ),
            "capabilities": ["hotel_redirect", "ticket_redirect"],
        },
        "meituan": {
            "configured": bool(os.getenv("MEITUAN_RESTAURANT_LINK_TEMPLATE", "").strip()),
            "capabilities": ["restaurant_redirect"],
        },
    }


def _amap_key() -> str:
    key = os.getenv("AMAP_WEB_SERVICE_KEY", "").strip()
    if not key:
        raise ProviderNotConfigured("AMAP_WEB_SERVICE_KEY is not configured")
    return key


def _amap_request(path: str, params: dict[str, Any]) -> dict[str, Any]:
    cache_key = f"{path}?{urlencode(sorted(params.items()))}"
    with _REQUEST_CACHE_LOCK:
        cached = _REQUEST_CACHE.get(cache_key)
        if cached and cached[0] > time.monotonic():
            return cached[1]

    query = {**params, "key": _amap_key(), "output": "json"}
    url = f"{AMAP_BASE_URL}{path}?{urlencode(query)}"
    request = Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "BeijingTravelApp/1.0",
        },
    )
    try:
        with urlopen(request, timeout=8, context=AMAP_SSL_CONTEXT) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
        # Do not include the upstream URL in errors because it contains the Key.
        raise ProviderRequestError("Amap request failed") from exc

    if str(payload.get("status")) != "1":
        info = payload.get("info") or "unknown error"
        infocode = payload.get("infocode") or ""
        raise ProviderRequestError(f"Amap rejected request: {info} ({infocode})")
    with _REQUEST_CACHE_LOCK:
        if len(_REQUEST_CACHE) >= 500:
            expired = [key for key, value in _REQUEST_CACHE.items() if value[0] <= time.monotonic()]
            for key in expired or list(_REQUEST_CACHE)[:100]:
                _REQUEST_CACHE.pop(key, None)
        _REQUEST_CACHE[cache_key] = (time.monotonic() + _REQUEST_CACHE_TTL_SECONDS, payload)
    return payload


def _string(value: Any) -> str:
    if value is None or isinstance(value, (dict, list)):
        return ""
    return str(value).strip()


def _float(value: Any) -> float | None:
    try:
        parsed = float(value)
        return parsed if parsed >= 0 else None
    except (TypeError, ValueError):
        return None


def _location(value: Any) -> dict[str, float] | None:
    raw = _string(value)
    if not raw or "," not in raw:
        return None
    try:
        longitude, latitude = (float(part) for part in raw.split(",", 1))
    except ValueError:
        return None
    return {"latitude": latitude, "longitude": longitude}


def _photo_urls(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    urls: list[str] = []
    for item in value:
        if isinstance(item, dict):
            url = _string(item.get("url"))
            if url.startswith("https://"):
                urls.append(url)
    return urls[:8]


def _partner_link(category: PlaceCategory, name: str, poi_id: str) -> dict[str, Any]:
    template = os.getenv(PARTNER_TEMPLATE_ENV[category], "").strip()
    if not template:
        return {
            "enabled": False,
            "provider": "ctrip" if category != "restaurant" else "meituan",
            "label": PARTNER_LABEL[category],
            "url": None,
        }

    try:
        url = template.format(
            name=quote_plus(name),
            city=quote_plus(BEIJING["name"]),
            adcode=BEIJING["adcode"],
            poi_id=quote_plus(poi_id),
        )
    except (KeyError, ValueError) as exc:
        raise ProviderRequestError(
            f"Invalid partner link template in {PARTNER_TEMPLATE_ENV[category]}"
        ) from exc

    hostname = (urlparse(url).hostname or "").lower()
    allowed = PARTNER_ALLOWED_DOMAINS[category]
    if not hostname or not any(hostname == domain or hostname.endswith(f".{domain}") for domain in allowed):
        raise ProviderRequestError("Partner link host is not allowed")

    return {
        "enabled": True,
        "provider": "ctrip" if category != "restaurant" else "meituan",
        "label": PARTNER_LABEL[category],
        "url": url,
    }


def _normalize_place(poi: dict[str, Any], category: PlaceCategory) -> dict[str, Any] | None:
    place_location = _location(poi.get("location"))
    if place_location is None:
        return None

    business = poi.get("business") if isinstance(poi.get("business"), dict) else {}
    rating = _float(business.get("rating"))
    cost = _float(business.get("cost"))
    name = _string(poi.get("name"))
    poi_id = _string(poi.get("id"))
    if not name or not poi_id:
        return None

    tag_text = _string(business.get("tag"))
    tags = [part.strip() for part in tag_text.replace(";", "|").split("|") if part.strip()]
    address = _string(poi.get("address"))
    district = _string(poi.get("district")) or _string(poi.get("adname"))
    open_hours = (
        _string(business.get("opentime_today"))
        or _string(business.get("opentime_week"))
        or _string(business.get("open_time"))
    )

    return {
        "id": poi_id,
        "source": "amap",
        "category": category,
        "city": BEIJING["name"],
        "name": name,
        "address": address,
        "district": district,
        "location": place_location,
        "typeName": _string(poi.get("type")),
        "typeCode": _string(poi.get("typecode")),
        "rating": rating,
        "cost": cost,
        "phone": _string(business.get("tel")),
        "openHours": open_hours,
        "businessArea": _string(business.get("business_area")),
        "tags": tags[:6],
        "photoUrls": _photo_urls(poi.get("photos")),
        "booking": _partner_link(category, name, poi_id),
    }


def search_places(
    category: PlaceCategory,
    keyword: str = "",
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    normalized_keyword = keyword.strip().casefold()
    provider_page_size = max(page_size, 10) if normalized_keyword and page == 1 else page_size
    payload = _amap_request(
        "/v5/place/text",
        {
            "region": BEIJING["adcode"],
            "city_limit": "true",
            "types": AMAP_PLACE_TYPES[category],
            "keywords": keyword.strip(),
            "page_num": page,
            "page_size": provider_page_size,
            "show_fields": "business,photos",
        },
    )
    raw_pois = payload.get("pois")
    pois = raw_pois if isinstance(raw_pois, list) else []
    items = [item for poi in pois if (item := _normalize_place(poi, category)) is not None]
    if normalized_keyword:
        # POI v5 relevance order can place a popular but unrelated POI before an
        # exact text hit. Preserve provider order otherwise, but promote an exact
        # requested name so callers never treat the first unrelated result as it.
        items.sort(key=lambda item: 0 if item["name"].strip().casefold() == normalized_keyword else 1)
    items = items[:page_size]
    # POI 2.0 的 count 是本页实际返回数，不是全量总数。
    count = int(payload.get("count") or len(items))
    has_more = count >= provider_page_size and page < 100
    return {
        "city": BEIJING,
        "category": category,
        "source": "amap",
        "page": page,
        "pageSize": page_size,
        "total": (page - 1) * page_size + count + (1 if has_more else 0),
        "hasMore": has_more,
        "items": items,
    }


def search_blind_box_places(
    category: BlindBoxContentCategory,
    keyword: str = "",
    page_size: int = 20,
) -> list[dict[str, Any]]:
    """Return only provider facts needed by the blind-box rule engine."""
    payload = _amap_request(
        "/v5/place/text",
        {
            "region": BEIJING["adcode"],
            "city_limit": "true",
            "types": AMAP_BLIND_BOX_TYPES[category],
            "keywords": keyword.strip(),
            "page_num": 1,
            "page_size": max(1, min(25, page_size)),
            "show_fields": "business,photos",
        },
    )
    raw_pois = payload.get("pois")
    pois = raw_pois if isinstance(raw_pois, list) else []
    candidates: list[dict[str, Any]] = []
    for poi in pois:
        if not isinstance(poi, dict):
            continue
        place_location = _location(poi.get("location"))
        place_id = _string(poi.get("id"))
        name = _string(poi.get("name"))
        if place_location is None or not place_id or not name:
            continue
        business = poi.get("business") if isinstance(poi.get("business"), dict) else {}
        type_name = _string(poi.get("type"))
        candidates.append(
            {
                "id": place_id,
                "name": name,
                "category": category,
                "subcategory": type_name.split(";")[-1] if type_name else "",
                "address": _string(poi.get("address")),
                "district": _string(poi.get("district")) or _string(poi.get("adname")),
                "lat": place_location["latitude"],
                "lng": place_location["longitude"],
                "price": _float(business.get("cost")),
                "currency": "CNY",
                "opening_hours_text": (
                    _string(business.get("opentime_today"))
                    or _string(business.get("opentime_week"))
                    or _string(business.get("open_time"))
                ),
                "rating": _float(business.get("rating")),
                "type_name": type_name,
                "photo_urls": _photo_urls(poi.get("photos")),
                "source": "amap",
            }
        )
    return candidates


def _first_list(value: Any) -> dict[str, Any] | None:
    if isinstance(value, list) and value and isinstance(value[0], dict):
        return value[0]
    return None


def _duration_minutes(value: Any) -> int | None:
    seconds = _float(value)
    if seconds is None:
        return None
    if seconds == 0:
        return 0
    return max(1, round(seconds / 60))


def _distance_km(value: Any) -> float | None:
    meters = _float(value)
    return round(meters / 1000, 3) if meters is not None else None


def _route_cost(container: dict[str, Any], key: str) -> float | None:
    cost = container.get("cost")
    if isinstance(cost, dict):
        return _float(cost.get(key))
    return None


def _parse_transit(payload: dict[str, Any]) -> dict[str, Any] | None:
    route = payload.get("route") if isinstance(payload.get("route"), dict) else {}
    plan = _first_list(route.get("transits"))
    if plan is None:
        return None
    segments = plan.get("segments") if isinstance(plan.get("segments"), list) else []
    line_names: list[str] = []
    walk_distance = 0.0
    for segment in segments:
        if not isinstance(segment, dict):
            continue
        walking = segment.get("walking") if isinstance(segment.get("walking"), dict) else {}
        walk_distance += _float(walking.get("distance")) or 0
        bus = segment.get("bus") if isinstance(segment.get("bus"), dict) else {}
        buslines = bus.get("buslines") if isinstance(bus.get("buslines"), list) else []
        if buslines and isinstance(buslines[0], dict):
            raw_name = _string(buslines[0].get("name"))
            if raw_name:
                line_names.append(raw_name.split("(", 1)[0])

    duration = _duration_minutes(plan.get("duration"))
    if duration is None:
        duration = _duration_minutes((plan.get("cost") or {}).get("duration") if isinstance(plan.get("cost"), dict) else None)
    distance = _distance_km(plan.get("distance") or route.get("distance"))
    if duration is None or distance is None:
        return None
    segment_fee = sum(
        _route_cost(segment, "transit_fee") or 0
        for segment in segments
        if isinstance(segment, dict)
    )
    price = _route_cost(plan, "transit_fee") or segment_fee
    transfers = max(0, len(line_names) - 1)
    walk_km = round(walk_distance / 1000, 1)
    return {
        "time": duration,
        "distance": distance,
        "price": round(price, 1),
        "detail": " → ".join(line_names) or "公交/地铁",
        "transfers": transfers,
        "walkToStationKm": walk_km,
        "walkToStationMin": round(walk_km / 5 * 60),
        "transferWalkKm": 0,
        "transferWalkMin": 0,
    }


def _parse_driving(payload: dict[str, Any]) -> dict[str, Any] | None:
    route = payload.get("route") if isinstance(payload.get("route"), dict) else {}
    path = _first_list(route.get("paths"))
    if path is None:
        return None
    duration = _duration_minutes(path.get("duration"))
    if duration is None:
        duration = _duration_minutes((path.get("cost") or {}).get("duration") if isinstance(path.get("cost"), dict) else None)
    distance = _distance_km(path.get("distance"))
    if duration is None or distance is None:
        return None
    taxi_cost = _route_cost(route, "taxi_fee") or _float(route.get("taxi_cost"))
    return {
        "time": duration,
        "distance": distance,
        "price": round(taxi_cost, 1) if taxi_cost is not None else 0,
    }


def _parse_walking(payload: dict[str, Any]) -> dict[str, Any] | None:
    route = payload.get("route") if isinstance(payload.get("route"), dict) else {}
    path = _first_list(route.get("paths"))
    if path is None:
        return None
    duration = _duration_minutes(path.get("duration"))
    if duration is None:
        duration = _duration_minutes((path.get("cost") or {}).get("duration") if isinstance(path.get("cost"), dict) else None)
    distance = _distance_km(path.get("distance"))
    if duration is None or distance is None:
        return None
    return {"time": duration, "distance": distance}


def get_routes(origin: str, destination: str) -> dict[str, Any]:
    common = {"origin": origin, "destination": destination, "show_fields": "cost"}
    requests = {
        "transit": (
            "/v5/direction/transit/integrated",
            {**common, "city1": BEIJING["citycode"], "city2": BEIJING["citycode"], "strategy": 0},
        ),
        "driving": ("/v5/direction/driving", {**common, "strategy": 32}),
        "walking": ("/v5/direction/walking", common),
    }
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {
            name: executor.submit(_amap_request, path, params)
            for name, (path, params) in requests.items()
        }
        payloads: dict[str, dict[str, Any] | None] = {}
        for name, future in futures.items():
            try:
                payloads[name] = future.result()
            except ProviderRequestError:
                payloads[name] = None

    transit = _parse_transit(payloads["transit"] or {})
    driving = _parse_driving(payloads["driving"] or {})
    walking = _parse_walking(payloads["walking"] or {})
    if transit is None and driving is None and walking is None:
        raise ProviderRequestError("Amap returned no route options")
    return {
        "source": "amap",
        "city": BEIJING,
        "origin": origin,
        "destination": destination,
        "transit": transit,
        "driving": driving,
        "walking": walking,
    }
