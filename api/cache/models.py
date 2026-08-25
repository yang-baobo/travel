"""
Cache tier and entry models.

Tiers:
    FRESH     — within TTL, no background refresh needed
    STALE     — past TTL but within stale window; can still display, refresh queued
    EXPIRED   — past stale window; must NOT display stale data, treat as miss
    MISS      — no cache entry at all
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional


ISO = "%Y-%m-%dT%H:%M:%S.%fZ"


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime(ISO)


def parse_iso(value: str) -> datetime:
    """Parse ISO-8601 timestamp, tolerant of missing fractional seconds."""
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return datetime.strptime(value, ISO.replace("Z", "")).replace(
            tzinfo=timezone.utc
        )


def to_iso(value) -> str:
    """Accept asyncpg timezone-aware datetime / ISO string / None -> ISO string."""
    if value is None:
        return ""
    if isinstance(value, datetime):
        # asyncpg returns timezone-aware UTC datetime
        return value.astimezone(timezone.utc).strftime(ISO)
    if isinstance(value, str):
        return value
    return str(value)


def from_iso(value: Optional[str]) -> Optional[datetime]:
    """Parse ISO string -> timezone-aware datetime, or None."""
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        return None


class CacheTier(str, Enum):
    FRESH = "fresh"
    STALE = "stale"
    EXPIRED = "expired"
    MISS = "miss"


@dataclass
class CacheEntry:
    """Generic cache record with expiry tracking."""

    query_hash: str
    tier: CacheTier
    fetched_at: Any    # datetime | str
    expires_at: Any    # datetime | str
    stale_until: Any = None  # datetime | str | None
    payload: Optional[dict[str, Any]] = None

    @property
    def is_available(self) -> bool:
        return self.tier in (CacheTier.FRESH, CacheTier.STALE)

    @property
    def age_seconds(self) -> float:
        exp_dt = from_iso(self.expires_at) if isinstance(self.expires_at, str) else self.expires_at
        fet_dt = from_iso(self.fetched_at) if isinstance(self.fetched_at, str) else self.fetched_at
        if exp_dt is None or fet_dt is None:
            return 0.0
        return (datetime.now(timezone.utc) - fet_dt).total_seconds()

    @property
    def ttl_seconds(self) -> Optional[float]:
        exp_dt = from_iso(self.expires_at) if isinstance(self.expires_at, str) else self.expires_at
        fet_dt = from_iso(self.fetched_at) if isinstance(self.fetched_at, str) else self.fetched_at
        if exp_dt is None or fet_dt is None:
            return None
        return (exp_dt - fet_dt).total_seconds()


@dataclass
class RefreshJob:
    """Background refresh task record."""

    id: str
    job_type: str
    dedupe_key: str
    payload_json: Optional[dict[str, Any]] = None
    status: str = "pending"
    attempts: int = 0
    available_at: str = field(default_factory=now_iso)
    last_error_code: Optional[str] = None
    last_error_message: Optional[str] = None
    created_at: str = field(default_factory=now_iso)
    updated_at: str = field(default_factory=now_iso)


def classify_tier(
    fetched_at: Any,
    expires_at: Any,
    stale_until: Any,
    now_fn=datetime.now,
) -> CacheTier:
    """
    Classify a cache record into FRESH / STALE / EXPIRED / MISS.

    Accepts ISO strings or timezone-aware datetime objects (from asyncpg).
    """
    try:
        now = now_fn(timezone.utc)
        exp = from_iso(expires_at) if isinstance(expires_at, str) else expires_at
        if exp is None:
            return CacheTier.MISS
    except (ValueError, TypeError):
        return CacheTier.MISS

    if now < exp:
        return CacheTier.FRESH

    if stale_until is not None:
        try:
            stale_dt = from_iso(stale_until) if isinstance(stale_until, str) else stale_until
            if stale_dt is None:
                return CacheTier.EXPIRED
            if now < stale_dt:
                return CacheTier.STALE
        except (ValueError, TypeError):
            pass
        return CacheTier.EXPIRED

    return CacheTier.EXPIRED
