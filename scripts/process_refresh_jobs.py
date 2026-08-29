#!/usr/bin/env python3
"""Process one bounded batch of persistent cache refresh jobs.

This worker is intentionally separate from request handlers. It can be run by
cron/Vercel Cron/a small always-on worker and does not rely on a serverless
instance surviving after an HTTP response is returned.

Usage:
    python3 scripts/process_refresh_jobs.py --limit 10
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from api.cache.repository import mark_refresh_job_done, upsert_cache  # noqa: E402
from api.db.connection import get_connection, is_configured  # noqa: E402
from api.place_cache import upsert_place_entities  # noqa: E402
from api.travel_providers import get_place_detail, get_routes, search_places  # noqa: E402


def _safe_category(value: Any) -> str | None:
    return value if value in {"attraction", "restaurant"} else None


async def _claim_jobs(limit: int) -> list[dict[str, Any]]:
    async with get_connection() as conn:
        async with conn.transaction():
            rows = await conn.fetch(
                """
                SELECT id, job_type, dedupe_key, payload_json
                FROM refresh_jobs
                WHERE status = 'pending' AND available_at <= NOW()
                ORDER BY created_at
                FOR UPDATE SKIP LOCKED
                LIMIT $1
                """,
                limit,
            )
            jobs = [dict(row) for row in rows]
            for job in jobs:
                await conn.execute(
                    "UPDATE refresh_jobs SET status = 'running', attempts = attempts + 1, updated_at = NOW() WHERE id = $1",
                    job["id"],
                )
            return jobs


async def _refresh_place(job: dict[str, Any]) -> None:
    payload = job.get("payload_json") or {}
    if isinstance(payload, str):
        payload = json.loads(payload)
    category = _safe_category(payload.get("category"))
    if category is None:
        raise ValueError("unsupported_place_category")
    params = payload.get("params") or {}
    keyword = str(params.get("keyword") or "")
    page = int(params.get("page") or 1)
    page_size = int(params.get("pageSize") or 20)
    response = await asyncio.to_thread(search_places, category, keyword, page, page_size)
    await upsert_place_entities(response.get("items") or [], category)


async def _refresh_detail(job: dict[str, Any]) -> None:
    payload = job.get("payload_json") or {}
    if isinstance(payload, str):
        payload = json.loads(payload)
    source_id = str(payload.get("sourceId") or "").strip()
    category = _safe_category(payload.get("category")) or "attraction"
    if not source_id:
        raise ValueError("missing_source_id")
    item = await asyncio.to_thread(get_place_detail, source_id, category)
    if item is None:
        raise LookupError("place_not_found")
    await upsert_place_entities([item], category)


async def _refresh_route(job: dict[str, Any]) -> None:
    payload = job.get("payload_json") or {}
    if isinstance(payload, str):
        payload = json.loads(payload)
    origin = str(payload.get("origin") or "")
    destination = str(payload.get("destination") or "")
    mode = payload.get("mode") if payload.get("mode") in {"transit", "driving", "walking"} else None
    if not origin or not destination:
        raise ValueError("missing_route_coordinates")
    response = await asyncio.to_thread(get_routes, origin, destination, mode)
    now = datetime.now(timezone.utc)
    await upsert_cache(
        "amap",
        "route",
        {"origin": origin, "destination": destination, "mode": mode or "all"},
        response,
        fetched_at=now,
        expires_at=now + timedelta(minutes=10),
        stale_until=now + timedelta(hours=2),
    )


async def main(limit: int) -> int:
    if not is_configured():
        print("DATABASE_URL configured: false")
        return 2
    jobs = await _claim_jobs(max(1, min(limit, 50)))
    print(f"claimed={len(jobs)}")
    for job in jobs:
        try:
            if job["job_type"] == "route":
                await _refresh_route(job)
            elif job["job_type"] == "place":
                if str(job.get("dedupe_key") or "").startswith("place:amap:place_detail:"):
                    await _refresh_detail(job)
                else:
                    await _refresh_place(job)
            else:
                raise ValueError("unsupported_job_type")
        except LookupError:
            await mark_refresh_job_done(str(job["id"]), ok=False, error_code="NOT_FOUND")
        except TimeoutError:
            await mark_refresh_job_done(str(job["id"]), ok=False, error_code="TIMEOUT")
        except Exception:
            # Do not persist raw provider/DB exception text.
            await mark_refresh_job_done(str(job["id"]), ok=False, error_code="REFRESH_FAILED")
        else:
            await mark_refresh_job_done(str(job["id"]), ok=True)
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process persistent cache refresh jobs")
    parser.add_argument("--limit", type=int, default=10)
    args = parser.parse_args()
    raise SystemExit(asyncio.run(main(args.limit)))
