"""
Generic cache Repository: Fresh / Stale / Expired / Miss with upsert,
invalidation, and refresh-job deduplication.

Serverless-safe:
  - Short transactions (< 1s)
  - Query timeout enforced at db.py level (10s)
  - Graceful degradation: all methods return a CacheMiss sentinel on DB failure
  - Never raises to caller; caller handles Miss gracefully
  - Never returns raw exception text — only safe error codes
"""

from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass
from typing import Any, Optional

from .hash import query_hash
from .models import CacheEntry, CacheTier, RefreshJob, classify_tier, now_iso, parse_iso

try:
    from ..db.connection import get_connection, is_configured as _db_configured
    _HAS_DB = True
except ImportError:  # Vercel / missing asyncpg at import time
    _HAS_DB = False
    _db_configured = lambda: False


# ── Sentinel for graceful degradation ─────────────────────────────────────────

class CacheMissReason(str):
    """Distinct miss reasons so callers can distinguish 'no data' from 'DB down'."""

    NOT_FOUND = "not_found"
    DATABASE_UNAVAILABLE = "database_unavailable"


@dataclass
class CacheMiss:
    """Returned when the database is unavailable — tells caller to fall back to third-party."""

    tier: CacheTier = CacheTier.MISS
    reason: str = CacheMissReason.DATABASE_UNAVAILABLE


CacheResult = CacheEntry | CacheMiss


# ── Internal helpers ───────────────────────────────────────────────────────────

def _is_db_ready() -> bool:
    """Return True only if DATABASE_URL is set AND asyncpg is importable."""
    return _HAS_DB and _db_configured()


async def _db_reachable() -> bool:
    """Quick health check: can we reach the database?"""
    if not _is_db_ready():
        return False
    try:
        async with asyncio.timeout(3.0):
            async with get_connection() as conn:
                await conn.execute("SELECT 1")
                return True
    except Exception:
        return False


async def _execute(
    query: str,
    *args: Any,
    timeout: float = 5.0,
) -> Any:
    """Execute a single statement with timeout, returning None on any failure."""
    if not _is_db_ready():
        return None
    try:
        async with asyncio.timeout(timeout):
            async with get_connection() as conn:
                return await conn.execute(query, *args)
    except Exception:
        return None


async def _fetchrow(
    query: str,
    *args: Any,
    timeout: float = 5.0,
) -> Optional[dict[str, Any]]:
    """Fetch a single row, returning None on any failure."""
    if not _is_db_ready():
        return None
    try:
        async with asyncio.timeout(timeout):
            async with get_connection() as conn:
                record = await conn.fetchrow(query, *args)
                return dict(record) if record else None
    except Exception:
        return None


async def _fetch(
    query: str,
    *args: Any,
    timeout: float = 5.0,
) -> list[dict[str, Any]]:
    """Fetch multiple rows, returning [] on any failure."""
    if not _is_db_ready():
        return []
    try:
        async with asyncio.timeout(timeout):
            async with get_connection() as conn:
                records = await conn.fetch(query, *args)
                return [dict(r) for r in records]
    except Exception:
        return []


# ── JSONB helpers ──────────────────────────────────────────────────────────────

def _jsonb(obj: Any) -> Any:
    """Convert Python dict/list to a JSONB-safe value for asyncpg."""
    if obj is None:
        return None
    if isinstance(obj, (dict, list, str, int, float, bool)):
        return obj
    return str(obj)


# ── Public API ─────────────────────────────────────────────────────────────────

async def read_cache(
    source: str,
    category: str,
    params: dict[str, Any],
) -> CacheResult:
    """
    Read a cache entry and classify its tier.

    Returns:
        CacheEntry  — tier is FRESH / STALE / EXPIRED, includes payload_json
        CacheMiss   — DB unavailable (DATABASE_UNAVAILABLE) or no record (NOT_FOUND)
    """
    if not _is_db_ready():
        return CacheMiss(reason=CacheMissReason.DATABASE_UNAVAILABLE)

    # Separate DB reachability check from query execution
    # so we can distinguish "DB down" from "query returned no rows"
    if not await _db_reachable():
        return CacheMiss(reason=CacheMissReason.DATABASE_UNAVAILABLE)

    qh = query_hash(source, category, params)
    row = await _fetchrow(
        "SELECT query_hash, payload_json, fetched_at, expires_at, stale_until "
        "FROM cache_entries WHERE query_hash = $1",
        qh,
    )
    if row is None:
        # DB is reachable but no matching record
        return CacheMiss(reason=CacheMissReason.NOT_FOUND)

    tier = classify_tier(
        fetched_at=row["fetched_at"],
        expires_at=row["expires_at"],
        stale_until=row["stale_until"],
    )
    return CacheEntry(
        query_hash=row["query_hash"],
        tier=tier,
        fetched_at=row["fetched_at"],
        expires_at=row["expires_at"],
        stale_until=row["stale_until"],
        payload=row.get("payload_json"),
    )


async def upsert_cache(
    source: str,
    category: str,
    params: dict[str, Any],
    payload: dict[str, Any],
    fetched_at: Optional[str] = None,
    expires_at: Optional[str] = None,
    stale_until: Optional[str] = None,
    response_json: Optional[dict[str, Any]] = None,
    request_json: Optional[dict[str, Any]] = None,
) -> bool:
    """
    Upsert a cache entry. Returns True on success, False on DB failure.

    On failure, caller continues with third-party fetch — no exception raised.
    """
    qh = query_hash(source, category, params)
    ts = fetched_at or now_iso()

    if expires_at is None:
        return False  # caller must supply expires_at

    if _is_db_ready():
        try:
            async with asyncio.timeout(5.0):
                async with get_connection() as conn:
                    await conn.execute(
                        """
                        INSERT INTO cache_entries
                            (query_hash, source, category, params_json, payload_json,
                             fetched_at, expires_at, stale_until)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                        ON CONFLICT (query_hash) DO UPDATE SET
                            payload_json  = EXCLUDED.payload_json,
                            fetched_at    = EXCLUDED.fetched_at,
                            expires_at    = EXCLUDED.expires_at,
                            stale_until   = EXCLUDED.stale_until,
                            source        = EXCLUDED.source,
                            category      = EXCLUDED.category,
                            params_json   = EXCLUDED.params_json
                        """,
                        qh,
                        source,
                        category,
                        _jsonb(params),
                        _jsonb(payload),
                        ts,
                        expires_at,
                        stale_until,
                    )
                    # Also upsert into table-specific cache if provided
                    if response_json is not None and source == "fliggy" and category == "hotel_search":
                        await conn.execute(
                            """
                            INSERT INTO hotel_search_cache
                                (query_hash, request_json, response_json, fetched_at, expires_at, stale_until)
                            VALUES ($1, $2, $3, $4, $5, $6)
                            ON CONFLICT (query_hash) DO UPDATE SET
                                response_json = EXCLUDED.response_json,
                                fetched_at    = EXCLUDED.fetched_at,
                                expires_at    = EXCLUDED.expires_at,
                                stale_until   = EXCLUDED.stale_until
                            """,
                            qh,
                            _jsonb(request_json or params),
                            _jsonb(response_json),
                            ts,
                            expires_at,
                            stale_until,
                        )
            return True
        except Exception:
            return False
    return False


async def invalidate_cache(
    source: str,
    category: str,
    params: dict[str, Any],
) -> bool:
    """Mark a cache entry as EXPIRED by setting expires_at = now. Returns True on success."""
    qh = query_hash(source, category, params)
    now = now_iso()
    result = await _execute(
        "UPDATE cache_entries SET expires_at = $1, stale_until = $1 WHERE query_hash = $2",
        now, qh,
    )
    return result is not None


async def invalidate_hotel_query(query_hash: str) -> bool:
    """Invalidate a specific hotel_search_cache entry by hash."""
    now = now_iso()
    result = await _execute(
        "UPDATE hotel_search_cache SET expires_at = $1, stale_until = $1 WHERE query_hash = $2",
        now, query_hash,
    )
    return result is not None


async def ensure_refresh_job(
    job_type: str,
    source: str,
    category: str,
    params: dict[str, Any],
    secret: Optional[str] = None,
    payload: Optional[dict[str, Any]] = None,
) -> tuple[str, str]:
    """
    Idempotent refresh-job creation with deduplication using RETURNING id.

    Uses a partial unique index on refresh_jobs (dedupe_key) WHERE status IN ('pending','running')
    so history rows with status 'done'/'failed' are never blocked.

    Returns:
        (job_id, status) where status is "created" or "already_pending"
        On DB error: ("", "database_unavailable")
    """
    if not _is_db_ready():
        return ("", CacheMissReason.DATABASE_UNAVAILABLE)

    dedupe = _dedupe_key(job_type, source, category, params)

    try:
        async with asyncio.timeout(5.0):
            async with get_connection() as conn:
                # INSERT ... ON CONFLICT DO NOTHING RETURNING id
                # The partial unique index prevents two pending jobs for same dedupe_key
                row = await conn.fetchrow(
                    """
                    INSERT INTO refresh_jobs
                        (id, job_type, dedupe_key, payload_json, status)
                    VALUES ($1, $2, $3, $4, 'pending')
                    ON CONFLICT (dedupe_key) DO NOTHING
                    RETURNING id
                    """,
                    str(uuid.uuid4()), job_type, dedupe, _jsonb(payload),
                )
                if row:
                    return (str(row["id"]), "created")

                # INSERT was a no-op → a pending or running job already exists
                existing = await conn.fetchrow(
                    "SELECT id FROM refresh_jobs WHERE dedupe_key = $1 AND status IN ('pending', 'running')",
                    dedupe,
                )
                if existing:
                    return (str(existing["id"]), "already_pending")

                # Should not reach here; treat as unavailable
                return ("", CacheMissReason.DATABASE_UNAVAILABLE)
    except Exception:
        return ("", CacheMissReason.DATABASE_UNAVAILABLE)


async def mark_refresh_job_done(
    job_id: str,
    *,
    ok: bool = True,
    error_code: Optional[str] = None,
    error_message: Optional[str] = None,
) -> bool:
    """Mark a refresh job as completed or failed. Returns True on success."""
    status = "done" if ok else "failed"
    now = now_iso()
    # Never store raw exception messages — only safe error codes
    safe_code = error_code if error_code and not _contains_sensitive(error_code) else None
    safe_msg = None  # error_message is never stored
    result = await _execute(
        "UPDATE refresh_jobs SET status = $1, updated_at = $2, "
        "last_error_code = $3, last_error_message = $4 WHERE id = $5",
        status, now, safe_code, safe_msg, job_id,
    )
    return result is not None


# ── Private helpers ────────────────────────────────────────────────────────────

def _dedupe_key(job_type: str, source: str, category: str, params: dict[str, Any]) -> str:
    return f"{job_type}:{source}:{category}:{query_hash(source, category, params)}"


_SENSITIVE_PATTERNS = ("password", "secret", "key", "token", "credentials", "://")


def _contains_sensitive(text: str) -> bool:
    """Return True if the text looks like it contains sensitive data."""
    lower = text.lower()
    return any(pat in lower for pat in _SENSITIVE_PATTERNS)
