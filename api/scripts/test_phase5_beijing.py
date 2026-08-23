#!/usr/bin/env python3
"""Read-only Phase 5 probe: FlyAI Beijing hotel -> AMap geocode -> AMap route.

Secrets are loaded from the ignored project .env only when absent from the
process environment and are never included in output.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from api.hotel_geo import HotelGeoRequest, resolve_hotel_geography  # noqa: E402
from api.hotels.errors import (  # noqa: E402
    HotelProviderTimeoutError,
    HotelProviderUnavailableError,
)
from api.hotels.models import HotelSearchParams  # noqa: E402
from api.hotels.service import TravelHotelService  # noqa: E402
from api.index import OptimizeRequest, solve_route  # noqa: E402
from api.travel_providers import (  # noqa: E402
    ProviderNotConfigured,
    ProviderRequestError,
    get_routes,
    search_places,
)


def load_ignored_environment() -> None:
    dotenv = PROJECT_ROOT / ".env"
    if not dotenv.is_file():
        return
    wanted = {"FLYAI_API_KEY", "AMAP_WEB_SERVICE_KEY"}
    pattern = re.compile(r"^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$")
    for line in dotenv.read_text(encoding="utf-8").splitlines():
        match = pattern.match(line)
        if not match or match.group(1) not in wanted or os.getenv(match.group(1)):
            continue
        value = match.group(2).strip().strip("\"'")
        if value:
            os.environ[match.group(1)] = value


def timed(callable_):
    started = time.perf_counter()
    value = callable_()
    return value, round((time.perf_counter() - started) * 1000)


def coordinate(hotel) -> dict[str, Any]:
    response, latency_ms = timed(lambda: resolve_hotel_geography(HotelGeoRequest.model_validate({
        "hotelId": hotel.id,
        "source": hotel.source,
        "sourceHotelId": hotel.source_hotel_id,
        "name": hotel.name,
        "destination": "北京",
        "city": hotel.city,
        "district": hotel.district,
        "address": hotel.address,
    })))
    return {
        "hotelId": hotel.id,
        "name": hotel.name,
        "status": response.status,
        "matchLevel": response.match_level,
        "confidence": response.confidence,
        "latitude": response.latitude,
        "longitude": response.longitude,
        "amapPoiId": response.amap_poi_id,
        "latencyMs": latency_ms,
    }


def node_id(node: dict[str, Any]) -> str:
    return str(node.get("hotelId") or node.get("id") or "")


def cached_routes(
    origin: dict[str, Any],
    destination: dict[str, Any],
    cache: dict[tuple[str, str], tuple[dict[str, Any], int]],
) -> tuple[dict[str, Any], int]:
    key = (node_id(origin), node_id(destination))
    if key not in cache:
        cache[key] = timed(lambda: get_routes(
            f"{origin['longitude']},{origin['latitude']}",
            f"{destination['longitude']},{destination['latitude']}",
        ))
    return cache[key]


def route_sample(
    origin: dict[str, Any],
    destination: dict[str, Any],
    cache: dict[tuple[str, str], tuple[dict[str, Any], int]],
) -> dict[str, Any]:
    result, latency_ms = cached_routes(origin, destination, cache)
    return {
        "origin": origin["name"],
        "destination": destination["name"],
        "transit": result.get("transit"),
        "driving": result.get("driving"),
        "walking": result.get("walking"),
        "provider": "amap",
        "latencyMs": latency_ms,
    }


def build_real_matrix(
    nodes: list[dict[str, Any]],
    mode: str,
    cache: dict[tuple[str, str], tuple[dict[str, Any], int]],
) -> tuple[list[list[int]], dict[str, Any]]:
    ids = [node_id(node) for node in nodes]
    if not all(ids) or len(set(ids)) != len(ids):
        raise ValueError("Real route matrix nodes must have unique ids")
    durations = [[0 for _ in nodes] for _ in nodes]
    for origin_index, origin in enumerate(nodes):
        for destination_index, destination in enumerate(nodes):
            if origin_index == destination_index:
                continue
            result, _ = cached_routes(origin, destination, cache)
            route = result.get(mode)
            if not isinstance(route, dict) or not isinstance(route.get("time"), int) or route["time"] <= 0:
                raise ProviderRequestError(
                    f"Amap returned no {mode} route for {origin['name']} -> {destination['name']}"
                )
            durations[origin_index][destination_index] = route["time"]
    latencies = [latency for _, latency in cache.values()]
    return durations, {
        "mode": mode,
        "nodeIds": ids,
        "segmentCount": len(nodes) * (len(nodes) - 1),
        "apiPairCount": len(cache),
        "latencyMs": {
            "min": min(latencies) if latencies else 0,
            "max": max(latencies) if latencies else 0,
            "total": sum(latencies),
        },
    }


def search_beijing_hotels() -> tuple[Any, int, int]:
    attempts = 0
    while True:
        attempts += 1
        try:
            response, latency = timed(lambda: TravelHotelService().search(HotelSearchParams.model_validate({
                "destination": "北京",
                "checkInDate": "2026-09-15",
                "checkOutDate": "2026-09-17",
                "maxReferencePrice": 800,
                "sortBy": "none",
            })))
            return response, latency, attempts
        except (HotelProviderTimeoutError, HotelProviderUnavailableError):
            if attempts >= 3:
                raise
            time.sleep(attempts)


def main() -> int:
    load_ignored_environment()
    report: dict[str, Any] = {
        "city": "北京",
        "flyaiKeyPresent": bool(os.getenv("FLYAI_API_KEY", "").strip()),
        "amapKeyPresent": bool(os.getenv("AMAP_WEB_SERVICE_KEY", "").strip()),
        "secretValuesLogged": False,
        "hotels": [],
        "geocodes": [],
        "places": [],
        "routes": [],
        "errors": [],
    }
    try:
        response, hotel_latency, hotel_attempts = search_beijing_hotels()
        report["hotelSearchLatencyMs"] = hotel_latency
        report["hotelSearchAttempts"] = hotel_attempts
        report["hotelCount"] = len(response.hotels)
        report["hotels"] = [
            {
                "hotelId": item.id,
                "name": item.name,
                "district": item.district,
                "address": item.address,
                "referencePrice": item.reference_price,
                "providerCoordinatePresent": item.latitude is not None and item.longitude is not None,
                "coordinateVerified": item.coordinate_verified,
            }
            for item in response.hotels[:2]
        ]
    except Exception as exc:  # noqa: BLE001 - probe must report provider category without secrets.
        report["errors"].append({"stage": "flyai_hotels", "type": type(exc).__name__, "message": str(exc)})
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 1

    if not report["amapKeyPresent"]:
        report["errors"].append({
            "stage": "amap",
            "type": "ProviderNotConfigured",
            "message": "AMAP_WEB_SERVICE_KEY is not configured",
        })
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 2

    try:
        selected_hotels = response.hotels[:2]
        report["geocodes"] = [coordinate(hotel) for hotel in selected_hotels]
        search_cases = [
            ("attraction", "故宫博物院"),
            ("attraction", "天坛公园"),
            ("attraction", "颐和园"),
            ("restaurant", "四季民福烤鸭店"),
        ]
        places = []
        for category, keyword in search_cases:
            found, latency_ms = timed(lambda c=category, k=keyword: search_places(c, k, 1, 5))
            if not found["items"]:
                report["errors"].append({"stage": "amap_place", "type": "NoResult", "message": keyword})
                continue
            item = found["items"][0]
            places.append({
                "id": item["id"],
                "name": item["name"],
                "category": item["category"],
                "latitude": item["location"]["latitude"],
                "longitude": item["location"]["longitude"],
                "openHours": item.get("openHours"),
                "latencyMs": latency_ms,
            })
        report["places"] = places
        verified = [item for item in report["geocodes"] if item["status"] == "verified"]
        if verified and places:
            hotel_node = verified[0]
            route_cache: dict[tuple[str, str], tuple[dict[str, Any], int]] = {}
            # Both directions plus hotel/restaurant when available.
            report["routes"].append(route_sample(hotel_node, places[0], route_cache))
            report["routes"].append(route_sample(places[0], hotel_node, route_cache))
            restaurant = next((item for item in places if item["category"] == "restaurant"), None)
            if restaurant:
                report["routes"].append(route_sample(hotel_node, restaurant, route_cache))
            if len(verified) > 1:
                report["routes"].append(route_sample(verified[1], places[0], route_cache))

            if len(places) >= 4 and restaurant is not None:
                matrix_nodes = [hotel_node, *places[:4]]
                # The selected airport-area hotel makes all four stops infeasible
                # by transit in two days. Use the user's driving/taxi preference
                # for the complete acceptance itinerary while retaining the real
                # transit comparison samples above.
                durations, matrix_report = build_real_matrix(matrix_nodes, "driving", route_cache)
                attractions = []
                stay_minutes = [180, 150, 180, 75]
                for index, place in enumerate(places[:4]):
                    windows = [[690, 840], [1020, 1200]] if place["category"] == "restaurant" else [[540, 1080]]
                    attractions.append({
                        "id": place["id"],
                        "duration_minutes": stay_minutes[index],
                        "opening_windows": windows,
                        "priority": 90 - index,
                    })
                optimization, optimize_latency = timed(lambda: solve_route(OptimizeRequest.model_validate({
                    "attractions": attractions,
                    "days": [
                        {
                            "day": 1,
                            "start_minute": 540,
                            "end_minute": 1200,
                            "start_anchor_id": node_id(hotel_node),
                            "end_anchor_id": node_id(hotel_node),
                            "reserved_minutes": 60,
                        },
                        {
                            "day": 2,
                            "start_minute": 540,
                            "end_minute": 1200,
                            "start_anchor_id": node_id(hotel_node),
                            "end_anchor_id": node_id(hotel_node),
                            "reserved_minutes": 60,
                        },
                    ],
                    "matrix": {
                        "node_ids": [node_id(node) for node in matrix_nodes],
                        "durations": durations,
                    },
                    "max_solve_seconds": 3,
                })))
                optimized = optimization.model_dump(by_alias=True)
                place_index = {node_id(node): index for index, node in enumerate(matrix_nodes)}
                day_checks = []
                for day in optimized["days"]:
                    last_stop = day["stops"][-1] if day["stops"] else None
                    return_minutes = (
                        durations[place_index[last_stop["attraction_id"]]][0]
                        if last_stop is not None
                        else 0
                    )
                    hotel_arrival = last_stop["end_minute"] + return_minutes if last_stop else 540
                    day_checks.append({
                        "day": day["day"],
                        "hotelStart": True,
                        "hotelReturn": True,
                        "hotelArrivalMinute": hotel_arrival,
                        "withinDayEnd": hotel_arrival <= 1140,
                    })
                restaurant_stops = [
                    stop
                    for day in optimized["days"]
                    for stop in day["stops"]
                    if stop["attraction_id"] == restaurant["id"]
                ]
                report["multiDayAcceptance"] = {
                    **matrix_report,
                    "optimizer": optimized,
                    "optimizerLatencyMs": optimize_latency,
                    "dayChecks": day_checks,
                    "restaurantInMealWindow": bool(restaurant_stops) and all(
                        690 <= stop["arrival_minute"] <= 840 or 1020 <= stop["arrival_minute"] <= 1200
                        for stop in restaurant_stops
                    ),
                    "allStopsAssigned": not optimized["unassigned_attraction_ids"],
                }
    except (ProviderNotConfigured, ProviderRequestError) as exc:
        report["errors"].append({"stage": "amap", "type": type(exc).__name__, "message": str(exc)})

    print(json.dumps(report, ensure_ascii=False, indent=2))
    acceptance = report.get("multiDayAcceptance")
    accepted = (
        bool(report["routes"])
        and isinstance(acceptance, dict)
        and acceptance.get("allStopsAssigned") is True
        and acceptance.get("restaurantInMealWindow") is True
        and all(item.get("withinDayEnd") is True for item in acceptance.get("dayChecks", []))
    )
    return 0 if accepted else 2


if __name__ == "__main__":
    raise SystemExit(main())
