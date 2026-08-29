"""
Place persistence layer: Amap POI entities + query snapshots in PostgreSQL.

Reuses the Phase 1 cache infrastructure (api/cache/repository.py, api/db/) — no
second caching framework is introduced here.

Tiers (per DATA_CACHE_EXECUTION_FRAMEWORK.md):
  - attraction: fresh 7d / stale 30d
  - restaurant: fresh 24h / stale 7d
On Miss the provider (Amap) is queried, normalized, persisted, then returned.
On Stale the snapshot is returned immediately and a deduplicated refresh job is
enqueued; the caller never waits for Amap.
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, Optional

try:
    from .cache.models import CacheTier
    from .cache.repository import (
        CacheMiss,
        CacheMissReason,
        ensure_refresh_job,
        read_cache,
        upsert_cache,
    )
    from .travel_providers import PlaceCategory, get_place_detail as get_amap_place_detail, search_places
except ImportError:  # pragma: no cover - Vercel module-style loading
    from cache.models import CacheTier  # type: ignore[no-redef]
    from cache.repository import (  # type: ignore[no-redef]
        CacheMiss,
        CacheMissReason,
        ensure_refresh_job,
        read_cache,
        upsert_cache,
    )
    from travel_providers import (  # type: ignore[no-redef]
        PlaceCategory,
        get_place_detail as get_amap_place_detail,
        search_places,
    )

try:
    from .db.connection import get_connection, is_configured as _db_configured
    _HAS_DB = True
except ImportError:  # pragma: no cover - Vercel without asyncpg
    _HAS_DB = False
    _db_configured = lambda: False


# ── TTL policy (city-agnostic; keyed by category only) ─────────────────────────

TTL_POLICY: dict[str, dict[str, timedelta]] = {
    "attraction": {"fresh": timedelta(days=7), "stale": timedelta(days=30)},
    "restaurant": {"fresh": timedelta(hours=24), "stale": timedelta(days=7)},
    # 'hotel' category is served by the FlyAI pipeline, never persisted here.
}

# Negative cache for empty provider responses: short, never long-lived.
EMPTY_RESULTS_TTL = timedelta(minutes=10)

# Minimum number of rows required before a keyword-less listing is served from
# the entity store alone (protects against a partially warm database).
MIN_ENTITY_ROWS = 4


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat()


# ── Entity persistence ─────────────────────────────────────────────────────────

_PLACE_COLUMNS = (
    "source, source_id, city, adcode, category, name, district, address, "
    "latitude, longitude, rating, cost, open_hours, phone, type_name, type_code, "
    "business_area, booking_url, tags_json, photo_urls_json, normalized_json, "
    "fetched_at, expires_at, stale_until"
)


def _entity_record(item: dict[str, Any], category: str) -> dict[str, Any]:
    """Map a normalized provider place onto travel_places columns."""
    booking = item.get("booking") if isinstance(item.get("booking"), dict) else {}
    return {
        "source": item.get("source") or "amap",
        "source_id": item.get("id") or "",
        "city": item.get("city") or "",
        "adcode": item.get("adcode") or "110000",
        "category": category,
        "name": item.get("name") or "",
        "district": item.get("district") or "",
        "address": item.get("address") or "",
        "latitude": (item.get("location") or {}).get("latitude"),
        "longitude": (item.get("location") or {}).get("longitude"),
        "rating": item.get("rating"),
        "cost": item.get("cost"),
        "open_hours": item.get("openHours") or "",
        "phone": item.get("phone") or "",
        "type_name": item.get("typeName") or "",
        "type_code": item.get("typeCode") or "",
        "business_area": item.get("businessArea") or "",
        "booking_url": booking.get("url") or "",
        "tags": item.get("tags") or [],
        "photo_urls": item.get("photoUrls") or [],
        "normalized": item,
    }


async def upsert_place_entities(items: list[dict[str, Any]], category: str) -> int:
    """Upsert normalized places by (source, source_id). Returns rows written."""
    if not _db_configured() or not items:
        return 0
    now = _now()
    policy = TTL_POLICY[category]
    written = 0
    try:
        async with asyncio.timeout(5.0):
            async with get_connection() as conn:
                for item in items:
                    rec = _entity_record(item, category)
                    if not rec["source_id"] or not rec["name"]:
                        continue
                    await conn.execute(
                        """
                        INSERT INTO travel_places (
                            source, source_id, city, adcode, category, name, district, address,
                            latitude, longitude, rating, cost, open_hours, phone, type_name,
                            type_code, business_area, booking_url, tags_json, photo_urls_json,
                            normalized_json, fetched_at, refreshed_at, expires_at, stale_until
                        ) VALUES (
                            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
                            $19::jsonb,$20::jsonb,$21::jsonb,$22,$23,$24,$25
                        )
                        ON CONFLICT (source, source_id) DO UPDATE SET
                            city           = EXCLUDED.city,
                            adcode         = EXCLUDED.adcode,
                            category       = EXCLUDED.category,
                            name           = EXCLUDED.name,
                            district       = EXCLUDED.district,
                            address        = EXCLUDED.address,
                            latitude       = EXCLUDED.latitude,
                            longitude      = EXCLUDED.longitude,
                            rating         = EXCLUDED.rating,
                            cost           = EXCLUDED.cost,
                            open_hours     = EXCLUDED.open_hours,
                            phone          = EXCLUDED.phone,
                            type_name      = EXCLUDED.type_name,
                            type_code      = EXCLUDED.type_code,
                            business_area  = EXCLUDED.business_area,
                            booking_url    = EXCLUDED.booking_url,
                            tags_json      = EXCLUDED.tags_json,
                            photo_urls_json= EXCLUDED.photo_urls_json,
                            normalized_json= EXCLUDED.normalized_json,
                            fetched_at     = EXCLUDED.fetched_at,
                            refreshed_at   = NOW(),
                            expires_at     = EXCLUDED.expires_at,
                            stale_until    = EXCLUDED.stale_until
                        """,
                        rec["source"], rec["source_id"], rec["city"], rec["adcode"],
                        rec["category"], rec["name"], rec["district"], rec["address"],
                        rec["latitude"], rec["longitude"], rec["rating"], rec["cost"],
                        rec["open_hours"], rec["phone"], rec["type_name"], rec["type_code"],
                        rec["business_area"], rec["booking_url"],
                        json.dumps(rec["tags"], ensure_ascii=False),
                        json.dumps(rec["photo_urls"], ensure_ascii=False),
                        json.dumps(rec["normalized"], ensure_ascii=False),
                        now, now,
                        now + policy["fresh"], now + policy["stale"],
                    )
                    written += 1
                    # Per-entity image provenance rows (primary image first, gallery after).
                    if rec["photo_urls"]:
                        await conn.execute(
                            """
                            INSERT INTO place_images (source, source_entity_id, entity_type, image_type, url, attribution)
                            VALUES ($1, $2, 'place', 'primary', $3, $4)
                            ON CONFLICT (source, source_entity_id, image_type, url) DO NOTHING
                            """,
                            rec["source"], rec["source_id"], rec["photo_urls"][0], "高德",
                        )
                        for url in rec["photo_urls"][1:]:
                            await conn.execute(
                                """
                                INSERT INTO place_images (source, source_entity_id, entity_type, image_type, url, attribution)
                                VALUES ($1, $2, 'place', 'gallery', $3, $4)
                                ON CONFLICT (source, source_entity_id, image_type, url) DO NOTHING
                                """,
                                rec["source"], rec["source_id"], url, "高德",
                            )
    except Exception:
        return written
    return written


def _row_to_item(row: dict[str, Any]) -> dict[str, Any]:
    """Rebuild the normalized place payload from a travel_places row."""
    normalized = row.get("normalized_json")
    if isinstance(normalized, dict):
        item = dict(normalized)
        item["id"] = row["source_id"]
        item["source"] = row["source"]
        return item
    # Fallback rebuild from columns when normalized_json is missing.
    item = {
        "id": row["source_id"],
        "source": row["source"],
        "category": row["category"],
        "city": row["city"],
        "name": row["name"],
        "address": row["address"] or "",
        "district": row["district"] or "",
        "location": {
            "latitude": row["latitude"],
            "longitude": row["longitude"],
        } if row["latitude"] is not None and row["longitude"] is not None else None,
        "typeName": row.get("type_name") or "",
        "typeCode": row.get("type_code") or "",
        "rating": row["rating"],
        "cost": row["cost"],
        "phone": row.get("phone") or "",
        "openHours": row["open_hours"] or "",
        "businessArea": row.get("business_area") or "",
        "tags": row.get("tags_json") or [],
        "photoUrls": row.get("photo_urls_json") or [],
        "booking": {"enabled": False, "provider": "ctrip", "label": "", "url": None},
    }
    if row.get("booking_url"):
        item["booking"] = {"enabled": True, "provider": "ctrip", "label": "查看详情", "url": row["booking_url"]}
    return item


async def query_place_entities(
    category: str,
    city: str = "北京",
    keyword: str = "",
    page: int = 1,
    page_size: int = 20,
) -> list[dict[str, Any]]:
    """Read place entities directly from PostgreSQL (no third-party call)."""
    if not _db_configured():
        return []
    offset = (page - 1) * page_size
    keyword = keyword.strip()
    try:
        async with asyncio.timeout(5.0):
            async with get_connection() as conn:
                if keyword:
                    rows = await conn.fetch(
                        """
                        SELECT * FROM travel_places
                        WHERE category = $1 AND city = $2 AND name ILIKE $3
                          AND expires_at > NOW()
                        ORDER BY (rating IS NULL), rating DESC, name
                        LIMIT $4 OFFSET $5
                        """,
                        category, city, f"%{keyword}%", page_size, offset,
                    )
                else:
                    rows = await conn.fetch(
                        """
                        SELECT * FROM travel_places
                        WHERE category = $1 AND city = $2 AND expires_at > NOW()
                        ORDER BY (rating IS NULL), rating DESC, name
                        LIMIT $4 OFFSET $5
                        """,
                        category, city, page_size, offset,
                    )
                return [_row_to_item(dict(r)) for r in rows]
    except Exception:
        return []


async def count_place_entities(category: str, city: str = "北京") -> int:
    if not _db_configured():
        return 0
    try:
        async with asyncio.timeout(3.0):
            async with get_connection() as conn:
                row = await conn.fetchrow(
                    "SELECT COUNT(*) AS n FROM travel_places WHERE category = $1 AND city = $2 AND expires_at > NOW()",
                    category, city,
                )
                return int(row["n"]) if row else 0
    except Exception:
        return 0


# ── Image provenance queries ───────────────────────────────────────────────────

async def get_place_images(source: str, source_id: str) -> list[dict[str, Any]]:
    """Return verified images for one entity; provenance is part of every row."""
    if not _db_configured():
        return []
    try:
        async with asyncio.timeout(3.0):
            async with get_connection() as conn:
                rows = await conn.fetch(
                    """
                    SELECT source, source_entity_id, image_type, url, attribution, fetched_at
                    FROM place_images
                    WHERE source = $1 AND source_entity_id = $2
                    ORDER BY (image_type = 'primary') DESC, fetched_at DESC
                    """,
                    source, source_id,
                )
                return [dict(r) for r in rows]
    except Exception:
        return []


# ── Cache meta helpers ─────────────────────────────────────────────────────────

def _meta(tier: str, fetched_at: str, expires_at: str, stale_until: Optional[str]) -> dict[str, Any]:
    return {
        "cacheStatus": tier,
        "fetchedAt": fetched_at,
        "expiresAt": expires_at,
        "staleUntil": stale_until,
    }


# ── Public service ─────────────────────────────────────────────────────────────

async def explore_places(
    category: PlaceCategory,
    city: str,
    keyword: str,
    page: int,
    page_size: int,
    adcode: str = "",
) -> dict[str, Any]:
    """
    Unified explore listing. City is a parameter — never hardcoded Beijing.
    """
    if category not in TTL_POLICY:
        # 'hotel' listings come from the FlyAI pipeline; here we only serve
        # attraction / restaurant entities from Amap.
        raise ValueError(f"unsupported category: {category}")

    params = {"city": city, "keyword": keyword.strip(), "page": page, "pageSize": page_size}
    result = await read_cache("amap", f"place:{category}", params)

    fetched_at = _iso(_now())
    expires_at = _iso(_now() + TTL_POLICY[category]["fresh"])
    stale_until = _iso(_now() + TTL_POLICY[category]["stale"])

    if not isinstance(result, CacheMiss):
        tier = result.tier
        payload = result.payload or {}
        if tier in (CacheTier.FRESH, CacheTier.STALE):
            meta = _meta(
                tier.value if isinstance(tier, CacheTier) else str(tier),
                result.fetched_at.isoformat() if hasattr(result.fetched_at, "isoformat") else str(result.fetched_at),
                result.expires_at.isoformat() if hasattr(result.expires_at, "isoformat") else str(result.expires_at),
                result.stale_until.isoformat() if result.stale_until and hasattr(result.stale_until, "isoformat") else (str(result.stale_until) if result.stale_until else None),
            )
            if tier == CacheTier.STALE:
                # Serve stale immediately, enqueue deduplicated refresh.
                asyncio.ensure_future(ensure_refresh_job(
                    "place", "amap", f"place:{category}", params,
                    payload={"category": category, "params": params},
                ))
            response = dict(payload)
            response["cache"] = meta
            return response
        # EXPIRED: fall through to provider refresh below.

    # Miss (or expired): call Amap, persist, return.
    try:
        provider_response = await asyncio.to_thread(
            search_places, category, keyword, page, page_size
        )
    except Exception:
        # Provider failed. If DB unavailable we cannot fall back to entities either;
        # if DB is reachable we serve whatever entities exist for resilience.
        entities = await query_place_entities(category, city, keyword, page, page_size)
        if entities:
            return {
                **_listing_shell(category, city, page, page_size, entities),
                "cache": _meta("stale", fetched_at, expires_at, stale_until),
            }
        raise

    items = provider_response.get("items") or []
    await upsert_place_entities(items, category)

    response = dict(provider_response)
    response["cache"] = _meta("miss" if not isinstance(result, CacheMiss) or result.reason == CacheMissReason.NOT_FOUND else "miss", fetched_at, expires_at, stale_until)
    # Persist the query snapshot for subsequent Fresh hits.
    await upsert_cache(
        "amap", f"place:{category}", params, response,
        expires_at=expires_at, stale_until=stale_until,
    )
    return response


async def get_place_detail(
    source: str,
    source_id: str,
    category: str = "attraction",
) -> dict[str, Any] | None:
    """
    Place detail by (source, source_id). Returns DB snapshot first; when the
    snapshot is stale a deduplicated refresh job is enqueued but the snapshot is
    still returned immediately.
    """
    if source != "amap" or not source_id.strip() or category not in TTL_POLICY:
        return None
    record: dict[str, Any] | None = None
    db_available = _db_configured()
    try:
        if db_available:
            async with asyncio.timeout(3.0):
                async with get_connection() as conn:
                    row = await conn.fetchrow(
                        "SELECT * FROM travel_places WHERE source = $1 AND source_id = $2",
                        source, source_id,
                    )
                    record = dict(row) if row is not None else None
    except Exception:
        db_available = False

    # A detail request is allowed to recover a cold/expired cache entry from
    # Amap. The provider id is the only identity key used for this operation.
    if record is None:
        try:
            remote = await asyncio.wait_for(
                asyncio.to_thread(get_amap_place_detail, source_id, category),
                timeout=8.0,
            )
        except Exception:
            return None
        if remote is None:
            return None
        if db_available:
            await upsert_place_entities([remote], remote.get("category") or "attraction")
        return {
            **remote,
            "cache": {
                "cacheStatus": "miss",
                "fetchedAt": _iso(_now()),
                "expiresAt": _iso(_now() + TTL_POLICY["attraction"]["fresh"]),
                "staleUntil": _iso(_now() + TTL_POLICY["attraction"]["stale"]),
                "databaseAvailable": db_available,
            },
        }

    item = _row_to_item(record)
    category = record["category"]
    policy = TTL_POLICY.get(category, TTL_POLICY["attraction"])
    now = _now()
    fetched_at = record.get("fetched_at") or record.get("refreshed_at") or now
    if hasattr(fetched_at, "isoformat"):
        fetched_at_str = fetched_at.isoformat()
    else:
        fetched_at_str = str(fetched_at)
    expires_at = record.get("expires_at") or (now + policy["fresh"])
    stale_until = record.get("stale_until") or (now + policy["stale"])

    tier = "fresh"
    if now >= stale_until:
        tier = "expired"
    elif now >= expires_at:
        tier = "stale"

    # Serve stale/expired snapshots immediately. A separate worker performs
    # the provider refresh so a slow Amap request never blocks the detail page.
    if tier in {"stale", "expired"} and db_available:
        asyncio.ensure_future(ensure_refresh_job(
            "place", "amap", "place_detail",
            {"sourceId": source_id, "category": category},
            payload={"sourceId": source_id, "category": category},
        ))

    images = await get_place_images(source, source_id)
    response = {
        **item,
        "images": images,
        "cache": {
            "cacheStatus": tier,
            "fetchedAt": fetched_at_str,
            "expiresAt": expires_at.isoformat() if hasattr(expires_at, "isoformat") else str(expires_at),
            "staleUntil": stale_until.isoformat() if hasattr(stale_until, "isoformat") else str(stale_until),
            "databaseAvailable": db_available,
        },
    }
    if refresh_error:
        response["cache"]["refreshError"] = refresh_error
    return response


def _listing_shell(category: str, city: str, page: int, page_size: int, items: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "city": {"name": city},
        "category": category,
        "source": "amap",
        "page": page,
        "pageSize": page_size,
        "total": len(items),
        "hasMore": False,
        "items": items,
    }
