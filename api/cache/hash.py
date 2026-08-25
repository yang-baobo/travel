"""
Stable query-hash generation for cache keying.

Same input parameters → identical SHA-256 hash (deterministic across processes).
Different parameters (even reordered) → different hash.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any


def stable_dumps(obj: dict[str, Any]) -> str:
    """
    Deterministic JSON serialization: sort keys, strip None, consistent spacing.
    Nested dicts are serialized recursively to JSON strings (so query_hash input
    is always a flat string). Guarantees identical input dicts produce identical strings.
    """
    cleaned: dict[str, Any] = {}
    for key, value in obj.items():
        if value is None:
            continue
        if isinstance(value, dict):
            cleaned[key] = stable_dumps(value)   # nested dict → JSON string
        else:
            cleaned[key] = value                 # scalar or list kept as-is
    return json.dumps(cleaned, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def query_hash(
    source: str,
    category: str,
    params: dict[str, Any],
) -> str:
    """
    Compute SHA-256 query hash for a cache key.

    Parameters
    ----------
    source:   data source identifier, e.g. 'amap', 'fliggy'
    category: entity category, e.g. 'attraction', 'hotel_search'
    params:   query parameters — keys sorted, None values stripped

    Returns 64-char lowercase hex string.
    """
    material = f"{source}|{category}|{stable_dumps(params)}"
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


# ── Convenience wrappers ──────────────────────────────────────────────────────

def place_query_hash(
    category: str,
    keyword: str = "",
    page: int = 1,
    page_size: int = 20,
) -> str:
    return query_hash(
        source="amap",
        category=f"place:{category}",
        params={"keyword": keyword.strip(), "page": page, "pageSize": page_size},
    )


def route_query_hash(
    origin: str,
    destination: str,
    mode: str,
) -> str:
    return query_hash(
        source="amap",
        category=f"route:{mode}",
        params={"origin": origin, "destination": destination, "mode": mode},
    )


def hotel_search_query_hash(params: dict[str, Any]) -> str:
    """Hash for FlyAI hotel search cache key."""
    return query_hash(
        source="fliggy",
        category="hotel_search",
        params=params,
    )


def refresh_job_dedupe_key(
    job_type: str,
    source: str,
    category: str,
    params: dict[str, Any],
) -> str:
    """Deterministic dedupe key for background refresh tasks."""
    return f"{job_type}:{source}:{category}:{query_hash(source, category, params)}"
