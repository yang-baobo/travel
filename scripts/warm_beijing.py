#!/usr/bin/env python3
"""
Beijing cache warm-up script (standalone; not coupled to app pages).

- Warms Amap attraction / restaurant place entities + query snapshots via the
  same cache layer used by /api/travel/explore.
- Warms FlyAI hotel base properties via the Vercel hotel search function.
- Idempotent: upserts keyed by (source, source_id); re-running never inserts
  duplicate places.
- Never prints API keys; DATABASE_URL / provider keys come from .env only.

Usage:
    python3 scripts/warm_beijing.py [--city 北京] [--max-pages 3] [--skip-hotels]
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))

# Load .env from project root (ignored by git).
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)
except ImportError:
    pass


BEIJING_DISTRICT_RESTAURANT_KEYWORDS = [
    # Major urban districts for restaurant warm-up, per official Amap coverage.
    "东城", "西城", "朝阳", "海淀", "丰台", "石景山",
]


async def warm_amap(city: str, max_pages: int) -> dict:
    from place_cache import explore_places

    stats = {}
    for category in ("attraction", "restaurant"):
        written = 0
        failed = 0
        for page in range(1, max_pages + 1):
            try:
                result = await explore_places(
                    category, city, keyword="", page=page, page_size=25
                )
                written += len(result.get("items") or [])
            except Exception as exc:
                failed += 1
                print(f"[warn] {category} page {page} failed: {type(exc).__name__}")
        stats[category] = {"fetched": written, "pages_failed": failed}
    return stats


async def warm_restaurants_by_district(city: str, max_pages: int) -> dict:
    from place_cache import explore_places

    written = 0
    failed = 0
    for district in BEIJING_DISTRICT_RESTAURANT_KEYWORDS:
        for page in range(1, max_pages + 1):
            try:
                result = await explore_places(
                    "restaurant", city, keyword=district, page=page, page_size=25
                )
                written += len(result.get("items") or [])
            except Exception:
                failed += 1
    return {"fetched": written, "pages_failed": failed}


async def warm_hotels(city: str) -> dict:
    """Warm FlyAI hotel base data through the Vercel function module."""
    # Node module cannot be imported from Python; shell out instead.
    import subprocess

    # Keep warm-up queries in the future so providers return real availability.
    check_in = (date.today() + timedelta(days=30)).isoformat()
    check_out = (date.today() + timedelta(days=31)).isoformat()
    env = {**os.environ}
    proc = subprocess.run(
        [
            "node", "--input-type=module", "-e",
            (
                "const h = (await import('./api/flyai_hotels.mjs')).default;"
                f"await h({{method:'POST', body: JSON.stringify({{destination:'{city}',checkInDate:'{check_in}',checkOutDate:'{check_out}',sortBy:'none'}}), headers:{{}}}}, "
                "{status(c){return this}, json(b){console.log(JSON.stringify(b?.meta ?? {})); return this}});"
            ),
        ],
        capture_output=True, text=True, cwd=Path(__file__).resolve().parents[1],
        env=env, timeout=120,
    )
    ok = proc.returncode == 0
    if not ok:
        print(f"[warn] hotel warm-up failed (exit {proc.returncode})")
    return {"ok": ok}


async def main() -> int:
    parser = argparse.ArgumentParser(description="Beijing cache warm-up")
    parser.add_argument("--city", default="北京")
    parser.add_argument("--max-pages", type=int, default=3)
    parser.add_argument("--skip-hotels", action="store_true")
    args = parser.parse_args()

    print(f"warming city={args.city} max_pages={args.max_pages}")
    db_url = os.getenv("DATABASE_URL", "")
    print(f"DATABASE_URL configured: {bool(db_url.strip())}")

    amap_stats = await warm_amap(args.city, args.max_pages)
    print(f"amap: {amap_stats}")

    district_stats = await warm_restaurants_by_district(args.city, args.max_pages)
    print(f"restaurants by district: {district_stats}")

    if not args.skip_hotels:
        hotel_stats = await warm_hotels(args.city)
        print(f"hotels: {hotel_stats}")

    print("warm-up done")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
