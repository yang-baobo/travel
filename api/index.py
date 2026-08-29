from __future__ import annotations

import time
import re
import asyncio
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Query, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from ortools.constraint_solver import pywrapcp, routing_enums_pb2
from pydantic import BaseModel, Field
from dotenv import load_dotenv


# Server-only provider credentials live in the ignored project .env. React
# Native never reads these names and public EXPO_PUBLIC_ prefixes are forbidden.
load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)

try:
    from .ai import (
        AIChatRequest,
        AIConfigurationError,
        AIUpstreamError,
        ASRRequest,
        PlanningIntentRequest,
        ai_provider_status,
        chat_with_glm,
        planning_intent_with_glm,
        proxy_stepfun_realtime,
        transcribe_with_stepfun,
    )
    from .blind_box import BlindBoxGenerateRequest, generate_blind_box
    from .hotels.errors import (
        HotelAuthenticationError,
        HotelCapabilityUnavailableError,
        HotelConfigurationError,
        HotelInvalidRequestError,
        HotelMalformedResponseError,
        HotelProviderTimeoutError,
        HotelProviderUnavailableError,
    )
    from .hotels.models import HotelSearchParams, HotelSearchResponse
    from .hotels.service import TravelHotelService
    from .hotel_geo import HotelGeoRequest, HotelGeoResponse, resolve_hotel_geography
    from .fliggy_attractions import FliggyAttractionError, get_fliggy_editorial_attractions
    from .travel_providers import (
        ProviderNotConfigured,
        ProviderRequestError,
        get_routes,
        provider_status,
        search_places,
    )
    from .place_cache import explore_places, get_place_detail
    from .cache.models import CacheTier, now_iso
    from .cache.repository import CacheMiss, ensure_refresh_job, read_cache, upsert_cache
except ImportError:  # Vercel can load this module without a package context.
    from ai import (  # type: ignore[no-redef]
        AIChatRequest,
        AIConfigurationError,
        AIUpstreamError,
        ASRRequest,
        PlanningIntentRequest,
        ai_provider_status,
        chat_with_glm,
        planning_intent_with_glm,
        proxy_stepfun_realtime,
        transcribe_with_stepfun,
    )
    from blind_box import BlindBoxGenerateRequest, generate_blind_box  # type: ignore[no-redef]
    from hotels.errors import (  # type: ignore[no-redef]
        HotelAuthenticationError,
        HotelCapabilityUnavailableError,
        HotelConfigurationError,
        HotelInvalidRequestError,
        HotelMalformedResponseError,
        HotelProviderTimeoutError,
        HotelProviderUnavailableError,
    )
    from hotels.models import HotelSearchParams, HotelSearchResponse  # type: ignore[no-redef]
    from hotels.service import TravelHotelService  # type: ignore[no-redef]
    from hotel_geo import HotelGeoRequest, HotelGeoResponse, resolve_hotel_geography  # type: ignore[no-redef]
    from fliggy_attractions import (  # type: ignore[no-redef]
        FliggyAttractionError,
        get_fliggy_editorial_attractions,
    )
    from travel_providers import (  # type: ignore[no-redef]
        ProviderNotConfigured,
        ProviderRequestError,
        get_routes,
        provider_status,
        search_places,
    )
    from place_cache import explore_places, get_place_detail  # type: ignore[no-redef]
    from cache.models import CacheTier, now_iso  # type: ignore[no-redef]
    from cache.repository import CacheMiss, ensure_refresh_job, read_cache, upsert_cache  # type: ignore[no-redef]


class AttractionInput(BaseModel):
    id: str
    duration_minutes: int = Field(ge=1, le=1440)
    opening_windows: list[tuple[int, int]] = Field(default_factory=lambda: [(0, 1440)])
    opening_windows_by_day: dict[int, list[tuple[int, int]]] | None = None
    priority: int = Field(default=50, ge=0, le=100)
    required: bool = False
    locked_day: int | None = Field(default=None, ge=1, le=15)
    preferred: bool = False


class DayInput(BaseModel):
    day: int = Field(ge=1)
    start_minute: int = Field(ge=0, le=2879)
    end_minute: int = Field(ge=0, le=2879)
    start_anchor_id: str | None = None
    end_anchor_id: str | None = None
    reserved_minutes: int = Field(default=0, ge=0, le=720)
    max_walking_minutes: int | None = Field(default=None, ge=1, le=1440)
    no_night_activity: bool = False
    meal_slots: list[dict[str, int]] = Field(default_factory=list, max_length=6)


class MatrixInput(BaseModel):
    node_ids: list[str]
    durations: list[list[int]]
    walking_minutes: list[list[int]] | None = None


class OptimizeRequest(BaseModel):
    attractions: list[AttractionInput]
    days: list[DayInput]
    matrix: MatrixInput
    max_solve_seconds: int = Field(default=3, ge=1, le=15)


class StopOutput(BaseModel):
    attraction_id: str
    arrival_minute: int
    end_minute: int


class DayOutput(BaseModel):
    day: int
    attraction_ids: list[str]
    stops: list[StopOutput]
    travel_minutes: int


class OptimizeResponse(BaseModel):
    solver: Literal["google-or-tools"] = "google-or-tools"
    status: Literal["optimized", "partial", "infeasible"]
    days: list[DayOutput]
    unassigned_attraction_ids: list[str]
    total_travel_minutes: int
    solve_time_ms: int


app = FastAPI(title="Beijing Travel API", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

_hotel_service = TravelHotelService()


def get_hotel_service() -> TravelHotelService:
    return _hotel_service


def _validate_matrix(matrix: MatrixInput) -> dict[str, int]:
    size = len(matrix.node_ids)
    if len(set(matrix.node_ids)) != size:
        raise HTTPException(status_code=422, detail="matrix.node_ids must be unique")
    if len(matrix.durations) != size or any(len(row) != size for row in matrix.durations):
        raise HTTPException(status_code=422, detail="matrix.durations must be a square matrix")
    if any(value < 0 for row in matrix.durations for value in row):
        raise HTTPException(status_code=422, detail="matrix durations cannot be negative")
    return {node_id: index for index, node_id in enumerate(matrix.node_ids)}


def _merge_intervals(intervals: list[tuple[int, int]]) -> list[tuple[int, int]]:
    if not intervals:
        return []
    merged: list[list[int]] = []
    for start, end in sorted(intervals):
        if not merged or start > merged[-1][1] + 1:
            merged.append([start, end])
        else:
            merged[-1][1] = max(merged[-1][1], end)
    return [(start, end) for start, end in merged]


def solve_route(payload: OptimizeRequest) -> OptimizeResponse:
    started_at = time.perf_counter()
    matrix_index = _validate_matrix(payload.matrix)
    attractions = payload.attractions
    days = sorted(payload.days, key=lambda day: day.day)

    if not days:
        raise HTTPException(status_code=422, detail="at least one day is required")
    if len({item.id for item in attractions}) != len(attractions):
        raise HTTPException(status_code=422, detail="attraction ids must be unique")

    # Each vehicle receives private start/end nodes. Their source ids still point
    # to the same hotel or airport in the caller-provided duration matrix.
    node_source_ids: list[str | None] = [item.id for item in attractions]
    service_minutes: list[int] = [item.duration_minutes for item in attractions]
    starts: list[int] = []
    ends: list[int] = []
    for day in days:
        starts.append(len(node_source_ids))
        node_source_ids.append(day.start_anchor_id)
        service_minutes.append(0)
        ends.append(len(node_source_ids))
        node_source_ids.append(day.end_anchor_id)
        service_minutes.append(0)

    manager = pywrapcp.RoutingIndexManager(len(node_source_ids), len(days), starts, ends)
    routing = pywrapcp.RoutingModel(manager)

    def travel_minutes(from_node: int, to_node: int) -> int:
        from_source = node_source_ids[from_node]
        to_source = node_source_ids[to_node]
        if not from_source or not to_source or from_source == to_source:
            return 0
        from_matrix = matrix_index.get(from_source)
        to_matrix = matrix_index.get(to_source)
        if from_matrix is None or to_matrix is None:
            # Missing legs are not estimated. Keep them effectively
            # infeasible so a caller cannot mistake a placeholder duration
            # for real traffic data.
            return 1_000_000
        return int(payload.matrix.durations[from_matrix][to_matrix])

    def transit_callback(from_index: int, to_index: int) -> int:
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        return service_minutes[from_node] + travel_minutes(from_node, to_node)

    transit_index = routing.RegisterTransitCallback(transit_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_index)

    horizon = max((day.day - 1) * 1440 + day.end_minute for day in days) + 1440
    routing.AddDimension(transit_index, 1440, horizon, False, "Time")
    time_dimension = routing.GetDimensionOrDie("Time")
    time_dimension.SetSpanCostCoefficientForAllVehicles(2)

    # When the caller supplies a walking matrix, enforce each day's walking
    # budget inside the solver instead of reporting it only after generation.
    if payload.matrix.walking_minutes is not None:
        walking_matrix = payload.matrix.walking_minutes

        def walking_minutes(from_node: int, to_node: int) -> int:
            from_source = node_source_ids[from_node]
            to_source = node_source_ids[to_node]
            if not from_source or not to_source or from_source == to_source:
                return 0
            fi = matrix_index.get(from_source)
            ti = matrix_index.get(to_source)
            if fi is None or ti is None or fi >= len(walking_matrix) or ti >= len(walking_matrix[fi]):
                return 0
            return max(0, int(walking_matrix[fi][ti]))

        def walking_callback(from_index: int, to_index: int) -> int:
            return walking_minutes(manager.IndexToNode(from_index), manager.IndexToNode(to_index))

        walking_index = routing.RegisterTransitCallback(walking_callback)
        capacities = [day.max_walking_minutes if day.max_walking_minutes is not None else 1_440 for day in days]
        routing.AddDimensionWithVehicleCapacity(walking_index, 0, capacities, True, "Walking")

    for vehicle, day in enumerate(days):
        day_offset = (day.day - 1) * 1440
        start_at = day_offset + day.start_minute
        finish_by = day_offset + day.end_minute - day.reserved_minutes
        if finish_by < start_at:
            finish_by = start_at
        time_dimension.CumulVar(routing.Start(vehicle)).SetValue(start_at)
        time_dimension.CumulVar(routing.End(vehicle)).SetRange(start_at, finish_by)

    for attraction_index, attraction in enumerate(attractions):
        routing_index = manager.NodeToIndex(attraction_index)
        allowed: list[tuple[int, int]] = []
        default_windows = attraction.opening_windows or [(0, 1440)]
        for day in days:
            if attraction.locked_day is not None and attraction.locked_day != day.day:
                continue
            raw_windows = (
                attraction.opening_windows_by_day[day.day]
                if attraction.opening_windows_by_day is not None and day.day in attraction.opening_windows_by_day
                else default_windows
            )
            day_offset = (day.day - 1) * 1440
            day_start = day_offset + day.start_minute
            day_end = day_offset + day.end_minute - day.reserved_minutes
            for open_minute, close_minute in raw_windows:
                open_minute = max(0, min(1440, int(open_minute)))
                close_minute = max(0, min(1440, int(close_minute)))
                latest_start = day_offset + close_minute - attraction.duration_minutes
                interval_start = max(day_start, day_offset + open_minute)
                interval_end = min(day_end - attraction.duration_minutes, latest_start)
                if interval_start <= interval_end:
                    allowed.append((interval_start, interval_end))

        allowed = _merge_intervals(allowed)
        time_var = time_dimension.CumulVar(routing_index)
        if allowed:
            time_var.SetRange(allowed[0][0], allowed[-1][1])
            for previous, following in zip(allowed, allowed[1:]):
                gap_start = previous[1] + 1
                gap_end = following[0] - 1
                if gap_start <= gap_end:
                    time_var.RemoveInterval(gap_start, gap_end)
        else:
            # An optional node with an impossible time range will be dropped.
            time_var.SetRange(0, 0)

        # Required/must-visit nodes have no disjunction and therefore cannot be
        # silently dropped. Optional recommendations keep a large, explainable
        # penalty so the solver prefers them when time allows.
        if not attraction.required:
            penalty = 1_000_000 + attraction.priority * 10_000
            routing.AddDisjunction([routing_index], penalty)

    search = pywrapcp.DefaultRoutingSearchParameters()
    search.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    search.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    search.time_limit.seconds = payload.max_solve_seconds

    solution = routing.SolveWithParameters(search)
    solve_time_ms = round((time.perf_counter() - started_at) * 1000)
    if solution is None:
        return OptimizeResponse(
            status="infeasible",
            days=[DayOutput(day=day.day, attraction_ids=[], stops=[], travel_minutes=0) for day in days],
            unassigned_attraction_ids=[item.id for item in attractions],
            total_travel_minutes=0,
            solve_time_ms=solve_time_ms,
        )

    assigned_ids: set[str] = set()
    day_outputs: list[DayOutput] = []
    total_travel = 0
    attraction_count = len(attractions)
    for vehicle, day in enumerate(days):
        index = routing.Start(vehicle)
        attraction_ids: list[str] = []
        stops: list[StopOutput] = []
        vehicle_travel = 0
        while not routing.IsEnd(index):
            next_index = solution.Value(routing.NextVar(index))
            from_node = manager.IndexToNode(index)
            to_node = manager.IndexToNode(next_index)
            vehicle_travel += travel_minutes(from_node, to_node)
            if to_node < attraction_count:
                attraction = attractions[to_node]
                absolute_arrival = solution.Value(time_dimension.CumulVar(next_index))
                arrival = absolute_arrival - (day.day - 1) * 1440
                attraction_ids.append(attraction.id)
                assigned_ids.add(attraction.id)
                stops.append(
                    StopOutput(
                        attraction_id=attraction.id,
                        arrival_minute=arrival,
                        end_minute=arrival + attraction.duration_minutes,
                    )
                )
            index = next_index
        total_travel += vehicle_travel
        day_outputs.append(
            DayOutput(
                day=day.day,
                attraction_ids=attraction_ids,
                stops=stops,
                travel_minutes=vehicle_travel,
            )
        )

    unassigned = [item.id for item in attractions if item.id not in assigned_ids]
    return OptimizeResponse(
        status="partial" if unassigned else "optimized",
        days=day_outputs,
        unassigned_attraction_ids=unassigned,
        total_travel_minutes=total_travel,
        solve_time_ms=solve_time_ms,
    )


@app.get("/")
@app.get("/api/index")
@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "solver": "google-or-tools", "city": "北京"}


@app.get("/api/travel/config")
def travel_config() -> dict:
    """Expose capabilities only; provider credentials always stay server-side."""
    return provider_status()


@app.get("/api/ai/config")
def ai_config() -> dict:
    """Return model names and configuration state without exposing credentials."""
    return ai_provider_status()


@app.post("/api/ai/chat")
def ai_chat(payload: AIChatRequest) -> dict:
    try:
        return chat_with_glm(payload)
    except AIConfigurationError as exc:
        raise HTTPException(status_code=503, detail={"code": "AI_NOT_CONFIGURED", "message": str(exc)}) from exc
    except AIUpstreamError as exc:
        raise HTTPException(status_code=502, detail={"code": "AI_UPSTREAM_FAILED", "message": str(exc)}) from exc


@app.post("/api/ai/plan-intent")
def ai_plan_intent(payload: PlanningIntentRequest) -> dict:
    try:
        return planning_intent_with_glm(payload)
    except AIConfigurationError as exc:
        raise HTTPException(status_code=503, detail={"code": "AI_NOT_CONFIGURED", "message": str(exc)}) from exc
    except AIUpstreamError as exc:
        raise HTTPException(status_code=502, detail={"code": "PLAN_INTENT_INVALID", "message": str(exc)}) from exc


@app.post("/api/ai/asr")
def ai_asr(payload: ASRRequest) -> dict:
    try:
        return transcribe_with_stepfun(payload)
    except AIConfigurationError as exc:
        raise HTTPException(status_code=503, detail={"code": "ASR_NOT_CONFIGURED", "message": str(exc)}) from exc
    except AIUpstreamError as exc:
        raise HTTPException(status_code=502, detail={"code": "ASR_UPSTREAM_FAILED", "message": str(exc)}) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"code": "INVALID_AUDIO", "message": str(exc)}) from exc


@app.websocket("/api/ai/realtime")
async def ai_realtime(websocket: WebSocket) -> None:
    await proxy_stepfun_realtime(websocket)


@app.get("/api/travel/places")
async def travel_places(
    category: Literal["attraction", "hotel", "restaurant"],
    keyword: str = Query(default="", max_length=60),
    page: int = Query(default=1, ge=1, le=100),
    page_size: int = Query(default=20, alias="pageSize", ge=1, le=25),
) -> dict:
    """
    Unified place listing backed by the PostgreSQL cache layer.

    Delegates to /api/travel/explore for attraction/restaurant (cached).
    For hotel queries, delegates to the FlyAI search pipeline.
    """
    if category == "hotel":
        # Hotel listings require the FlyAI search pipeline with trip context.
        raise HTTPException(
            status_code=400,
            detail={"code": "USE_HOTEL_SEARCH", "message": "hotel listings use /api/travel/hotels/search"},
        )
    try:
        return await explore_places(category, "北京", keyword, page, page_size)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"code": "INVALID_CATEGORY", "message": str(exc)}) from exc
    except ProviderNotConfigured as exc:
        raise HTTPException(
            status_code=503,
            detail={"code": "PROVIDER_NOT_CONFIGURED", "message": str(exc)},
        ) from exc
    except ProviderRequestError as exc:
        raise HTTPException(
            status_code=502,
            detail={"code": exc.code, "message": str(exc)},
        ) from exc


@app.get("/api/travel/attractions/editorial")
async def travel_attraction_editorial() -> dict:
    """Return FlyAI editorial items through the persistent cache when available."""
    params = {"city": "北京", "poiLevel": "5"}
    cached = await read_cache("fliggy", "attraction_editorial", params)
    if not isinstance(cached, CacheMiss) and cached.tier in (CacheTier.FRESH, CacheTier.STALE):
        if isinstance(cached.payload, dict):
            response = dict(cached.payload)
            response.setdefault("cache", {"cacheStatus": cached.tier.value})
            return response
    try:
        response = await asyncio.to_thread(get_fliggy_editorial_attractions)
        now = datetime.now(timezone.utc)
        await upsert_cache(
            "fliggy",
            "attraction_editorial",
            params,
            response,
            fetched_at=now_iso(),
            expires_at=(now + timedelta(hours=6)).isoformat(),
            stale_until=(now + timedelta(days=2)).isoformat(),
        )
        response = dict(response)
        response["cache"] = {"cacheStatus": "miss", "fetchedAt": now.isoformat()}
        return response
    except FliggyAttractionError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"code": exc.code, "message": str(exc)},
        ) from exc


@app.get("/api/travel/explore")
async def travel_explore(
    category: Literal["attraction", "restaurant", "hotel"],
    city: str = Query(default="北京", max_length=32),
    keyword: str = Query(default="", max_length=60),
    page: int = Query(default=1, ge=1, le=100),
    page_size: int = Query(default=20, alias="pageSize", ge=1, le=25),
) -> dict:
    """
    Unified explore listing backed by the PostgreSQL cache layer.

    - attraction / restaurant: Amap entities (Fresh 7d/24h, Stale 30d/7d, Miss->Amap)
    - hotel: delegated to the FlyAI pipeline (never cached as Amap places)
    - city is a parameter; the first city is Beijing but nothing is hardcoded.
    """
    if category == "hotel":
        raise HTTPException(
            status_code=400,
            detail={"code": "USE_HOTEL_SEARCH", "message": "hotel listings use /api/travel/hotels/search"},
        )
    try:
        return await explore_places(category, city, keyword, page, page_size)
    except ProviderNotConfigured as exc:
        raise HTTPException(
            status_code=503,
            detail={"code": "PROVIDER_NOT_CONFIGURED", "message": str(exc)},
        ) from exc
    except ProviderRequestError as exc:
        raise HTTPException(
            status_code=502,
            detail={"code": exc.code, "message": str(exc)},
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"code": "INVALID_CATEGORY", "message": str(exc)}) from exc


@app.get("/api/travel/places/detail")
async def travel_place_detail(
    source: str = Query(default="amap", max_length=16),
    source_id: str = Query(alias="sourceId", max_length=64),
    category: Literal["attraction", "restaurant"] = Query(default="attraction"),
) -> dict:
    """
    Place detail by (source, sourceId).

    Returns the DB snapshot immediately (fresh, stale, or expired). Stale and
    expired snapshots enqueue a deduplicated refresh job so the response never
    blocks on Amap; a cold miss performs one bounded provider lookup.
    404 when neither DB nor provider knows the place.
    """
    detail = await get_place_detail(source, source_id, category)
    if detail is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "PLACE_NOT_FOUND", "message": "no cached place with this source + sourceId"},
        )
    return detail


COORDINATE_PATTERN = re.compile(r"^-?(?:180(?:\.0+)?|1[0-7]\d(?:\.\d+)?|\d?\d(?:\.\d+)?),-?(?:90(?:\.0+)?|[0-8]?\d(?:\.\d+)?)$")


def _validate_coordinate(value: str) -> str:
    normalized = value.strip()
    if not COORDINATE_PATTERN.fullmatch(normalized):
        raise HTTPException(status_code=422, detail="coordinates must use longitude,latitude")
    longitude, latitude = (float(part) for part in normalized.split(",", 1))
    if not (73 <= longitude <= 136 and 3 <= latitude <= 54):
        raise HTTPException(status_code=422, detail="coordinates must be within China")
    return f"{longitude:.6f},{latitude:.6f}"


@app.get("/api/travel/routes")
async def travel_routes(
    origin: str = Query(max_length=48),
    destination: str = Query(max_length=48),
    mode: Literal["transit", "driving", "walking"] | None = Query(default=None),
) -> dict:
    origin_value = _validate_coordinate(origin)
    destination_value = _validate_coordinate(destination)
    cache_params = {"origin": origin_value, "destination": destination_value, "mode": mode or "all"}
    # Route snapshots are safe to reuse briefly and remove the cold-start
    # amplification where every itinerary pair fans out into three providers.
    cached = await read_cache("amap", "route", cache_params)
    if not isinstance(cached, CacheMiss) and cached.tier in (CacheTier.FRESH, CacheTier.STALE) and isinstance(cached.payload, dict):
        response = dict(cached.payload)
        response["cache"] = {"cacheStatus": cached.tier.value}
        if cached.tier is CacheTier.STALE:
            await ensure_refresh_job("route", "amap", "route", cache_params, payload=cache_params)
        return response
    try:
        result = await asyncio.to_thread(get_routes, origin_value, destination_value, mode)
        now = datetime.now(timezone.utc)
        await upsert_cache(
            "amap",
            "route",
            cache_params,
            result,
            fetched_at=now_iso(),
            expires_at=(now + timedelta(minutes=10)).isoformat(),
            stale_until=(now + timedelta(hours=2)).isoformat(),
        )
        return {**result, "cache": {"cacheStatus": "miss", "fetchedAt": now.isoformat()}}
    except ProviderNotConfigured as exc:
        raise HTTPException(
            status_code=503,
            detail={"code": "PROVIDER_NOT_CONFIGURED", "message": str(exc)},
        ) from exc
    except ProviderRequestError as exc:
        raise HTTPException(
            status_code=502,
            detail={"code": exc.code, "message": str(exc)},
        ) from exc


@app.post("/api/travel/hotels/search", response_model=HotelSearchResponse)
def travel_hotel_search(payload: HotelSearchParams) -> HotelSearchResponse:
    """Search real FlyAI hotels while keeping credentials and raw data server-side."""
    try:
        return get_hotel_service().search(payload)
    except HotelCapabilityUnavailableError as exc:
        raise HTTPException(status_code=422, detail={"code": exc.code, "message": str(exc)}) from exc
    except HotelInvalidRequestError as exc:
        raise HTTPException(status_code=422, detail={"code": exc.code, "message": str(exc)}) from exc
    except HotelConfigurationError as exc:
        raise HTTPException(status_code=503, detail={"code": exc.code, "message": str(exc)}) from exc
    except HotelProviderTimeoutError as exc:
        raise HTTPException(status_code=504, detail={"code": exc.code, "message": str(exc)}) from exc
    except HotelAuthenticationError as exc:
        raise HTTPException(status_code=502, detail={"code": exc.code, "message": str(exc)}) from exc
    except HotelMalformedResponseError as exc:
        raise HTTPException(status_code=502, detail={"code": exc.code, "message": str(exc)}) from exc
    except HotelProviderUnavailableError as exc:
        raise HTTPException(status_code=502, detail={"code": exc.code, "message": str(exc)}) from exc


@app.post("/api/travel/hotels/geocode", response_model=HotelGeoResponse)
def travel_hotel_geocode(payload: HotelGeoRequest) -> HotelGeoResponse:
    """Resolve one selected hotel through AMap; unverified provider coordinates are never promoted here."""
    try:
        return resolve_hotel_geography(payload)
    except ProviderNotConfigured as exc:
        raise HTTPException(
            status_code=503,
            detail={"code": "PROVIDER_NOT_CONFIGURED", "message": str(exc)},
        ) from exc
    except ProviderRequestError as exc:
        raise HTTPException(
            status_code=502,
            detail={"code": exc.code, "message": str(exc)},
        ) from exc


@app.post("/api/travel/blind-box")
def travel_blind_box(payload: BlindBoxGenerateRequest) -> dict:
    """Generate one constraint-aware blind-box item from provider-backed data."""
    return generate_blind_box(payload)


@app.post("/", response_model=OptimizeResponse)
@app.post("/api/index", response_model=OptimizeResponse)
@app.post("/api/optimize-route", response_model=OptimizeResponse)
@app.post("/api/travel/optimize-route", response_model=OptimizeResponse)
def optimize_route(payload: OptimizeRequest) -> OptimizeResponse:
    return solve_route(payload)
