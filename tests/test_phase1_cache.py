"""
Phase 1 unit tests: cache hash determinism, tier classification,
repository graceful degradation, and refresh-job deduplication.

Run with:
    python3 -m pytest tests/test_phase1_cache.py -v

Does NOT require a running database; uses FakeRepository by default.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

# ── Path setup ────────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))  # project root so 'api.cache.xxx' resolves

from api.cache.hash import (
    place_query_hash,
    query_hash,
    refresh_job_dedupe_key,
    route_query_hash,
    stable_dumps,
)
from api.cache.models import CacheEntry, CacheTier, classify_tier, now_iso, parse_iso
from api.cache.repository import CacheMiss


# ═══════════════════════════════════════════════════════════════════════════════
# 1. stable_dumps determinism
# ═══════════════════════════════════════════════════════════════════════════════

class TestStableDumps:
    def test_same_dict_same_string(self):
        d = {"keyword": "故宫", "page": 1, "pageSize": 8}
        assert stable_dumps(d) == stable_dumps(d)

    def test_key_order_independent(self):
        a = {"keyword": "故宫", "page": 1}
        b = {"page": 1, "keyword": "故宫"}
        assert stable_dumps(a) == stable_dumps(b)

    def test_none_values_stripped(self):
        a = {"keyword": "故宫", "maxPrice": None}
        b = {"keyword": "故宫"}
        assert stable_dumps(a) == stable_dumps(b)

    def test_nested_dict(self):
        d = {"filter": {"stars": [3, 5], "keyword": "hotel"}}
        s = stable_dumps(d)
        # nested dicts are serialized as inner JSON strings
        assert '"filter":"{' in s
        assert '\\"stars\\":[3,5]' in s   # JSON-escaped inner key

    def test_list_values_preserved(self):
        a = {"stars": [1, 2, 3]}
        b = {"stars": [3, 1, 2]}
        # Lists inside dicts are NOT sorted by key (they are values)
        assert stable_dumps(a) != stable_dumps(b)


# ═══════════════════════════════════════════════════════════════════════════════
# 2. query_hash determinism
# ═══════════════════════════════════════════════════════════════════════════════

class TestQueryHash:
    def test_same_params_same_hash(self):
        h1 = query_hash("amap", "place:attraction", {"keyword": "故宫", "page": 1})
        h2 = query_hash("amap", "place:attraction", {"keyword": "故宫", "page": 1})
        assert h1 == h2

    def test_different_params_different_hash(self):
        h1 = query_hash("amap", "place:attraction", {"keyword": "故宫"})
        h2 = query_hash("amap", "place:attraction", {"keyword": "颐和园"})
        assert h1 != h2

    def test_different_category_different_hash(self):
        h1 = query_hash("amap", "place:attraction", {"keyword": "故宫"})
        h2 = query_hash("amap", "place:restaurant", {"keyword": "故宫"})
        assert h1 != h2

    def test_different_source_different_hash(self):
        h1 = query_hash("amap", "hotel_search", {"dest": "北京"})
        h2 = query_hash("fliggy", "hotel_search", {"dest": "北京"})
        assert h1 != h2

    def test_hash_is_sha256_hex(self):
        h = query_hash("amap", "test", {"a": 1})
        assert len(h) == 64
        int(h, 16)  # raises if not valid hex

    def test_place_query_hash(self):
        h = place_query_hash("attraction", "", page=1, page_size=8)
        assert len(h) == 64

    def test_route_query_hash_direction_matters(self):
        """A→B and B→A must produce different hashes."""
        h_ab = route_query_hash("116.397,39.908", "116.391,39.907", "transit")
        h_ba = route_query_hash("116.391,39.907", "116.397,39.908", "transit")
        assert h_ab != h_ba

    def test_hotel_search_hash_consistent(self):
        params = {
            "destination": "北京",
            "checkInDate": "2026-08-01",
            "checkOutDate": "2026-08-03",
            "maxReferencePrice": 500,
            "stars": [4, 5],
            "keyword": "王府井",
            "poiName": "",
            "sortBy": "price_asc",
        }
        h1 = query_hash("fliggy", "hotel_search", params)
        h2 = query_hash("fliggy", "hotel_search", params)
        assert h1 == h2

    def test_refresh_job_dedupe_key(self):
        params = {"keyword": "故宫", "page": 1}
        k1 = refresh_job_dedupe_key("place", "amap", "attraction", params)
        k2 = refresh_job_dedupe_key("place", "amap", "attraction", params)
        assert k1 == k2


# ═══════════════════════════════════════════════════════════════════════════════
# 3. classify_tier
# ═══════════════════════════════════════════════════════════════════════════════

NOW = datetime.now(timezone.utc)


def _ts(seconds_ago: float) -> str:
    return (NOW - timedelta(seconds=seconds_ago)).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


class TestClassifyTier:
    def test_fresh_when_not_expired(self):
        tier = classify_tier(
            fetched_at=_ts(60),
            expires_at=_ts(-300),    # 5 min ahead
            stale_until=_ts(-600),   # 10 min ahead
        )
        assert tier == CacheTier.FRESH

    def test_stale_after_fresh_but_before_stale_until(self):
        tier = classify_tier(
            fetched_at=_ts(600),       # 10 min ago
            expires_at=_ts(300),       # 5 min ago (expired)
            stale_until=_ts(-300),     # 5 min from now
        )
        assert tier == CacheTier.STALE

    def test_expired_past_stale_until(self):
        tier = classify_tier(
            fetched_at=_ts(900),
            expires_at=_ts(600),
            stale_until=_ts(300),   # 5 min ago
        )
        assert tier == CacheTier.EXPIRED

    def test_expired_when_no_stale_until(self):
        tier = classify_tier(
            fetched_at=_ts(900),
            expires_at=_ts(600),
            stale_until=None,
        )
        assert tier == CacheTier.EXPIRED

    def test_miss_on_bad_iso(self):
        tier = classify_tier(fetched_at="not-a-date", expires_at="also-bad", stale_until=None)
        assert tier == CacheTier.MISS

    def test_miss_on_empty_expires_at(self):
        tier = classify_tier(fetched_at=_ts(0), expires_at="", stale_until=None)
        assert tier == CacheTier.MISS


# ═══════════════════════════════════════════════════════════════════════════════
# 4. FakeRepository (no DB required)
# ═══════════════════════════════════════════════════════════════════════════════

class FakeRepository:
    """
    In-memory stand-in for the real Repository.

    Used for unit testing when no DATABASE_URL is configured, or for
    fast CI without a database.
    """

    def __init__(self):
        self._entries: dict[str, CacheEntry] = {}
        self._refresh_jobs: dict[str, dict] = {}
        self._dedupe_keys: dict[str, str] = {}  # dedupe_key → job_id

    async def read_cache(self, source, category, params):
        qh = query_hash(source, category, params)
        if qh not in self._entries:
            return CacheMiss(reason="not_found")
        entry = self._entries[qh]
        # Reclassify tier based on current time, mirroring real Repository
        tier = classify_tier(
            fetched_at=entry.fetched_at,
            expires_at=entry.expires_at,
            stale_until=entry.stale_until,
        )
        return CacheEntry(
            query_hash=entry.query_hash,
            tier=tier,
            fetched_at=entry.fetched_at,
            expires_at=entry.expires_at,
            stale_until=entry.stale_until,
            payload=entry.payload,
        )

    async def upsert_cache(self, source, category, params, payload,
                           fetched_at=None, expires_at=None, stale_until=None, **kwargs):
        qh = query_hash(source, category, params)
        ts = fetched_at or now_iso()
        if expires_at is None:
            return False
        self._entries[qh] = CacheEntry(
            query_hash=qh,
            tier=CacheTier.FRESH,
            fetched_at=ts,
            expires_at=expires_at,
            stale_until=stale_until,
            payload=payload,
        )
        return True

    async def invalidate_cache(self, source, category, params):
        qh = query_hash(source, category, params)
        if qh in self._entries:
            now = now_iso()
            self._entries[qh] = CacheEntry(
                query_hash=qh,
                tier=CacheTier.EXPIRED,
                fetched_at=self._entries[qh].fetched_at,
                expires_at=now,
                stale_until=now,
            )
            return True
        return False

    async def ensure_refresh_job(self, job_type, source, category, params, secret=None, payload=None):
        dedupe = refresh_job_dedupe_key(job_type, source, category, params)
        if dedupe in self._dedupe_keys:
            return (self._dedupe_keys[dedupe], "already_pending")
        job_id = str(uuid.uuid4())
        self._dedupe_keys[dedupe] = job_id
        self._refresh_jobs[job_id] = {
            "job_type": job_type,
            "dedupe_key": dedupe,
            "status": "pending",
        }
        return (job_id, "created")

    async def mark_refresh_job_done(self, job_id, ok=True, error_code=None, error_message=None):
        if job_id in self._refresh_jobs:
            self._refresh_jobs[job_id]["status"] = "done" if ok else "failed"
            return True
        return False


# ═══════════════════════════════════════════════════════════════════════════════
# 5. Repository unit tests
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.fixture
def repo():
    return FakeRepository()


class TestFakeRepository:
    @pytest.mark.asyncio
    async def test_miss_on_empty_repo(self, repo):
        result = await repo.read_cache("amap", "attraction", {"keyword": "故宫"})
        assert isinstance(result, CacheMiss)
        assert result.tier == CacheTier.MISS
        assert result.reason == "not_found", f"Expected not_found, got {result.reason}"

    @pytest.mark.asyncio
    async def test_fresh_after_upsert(self, repo):
        now = now_iso()
        future = (datetime.now(timezone.utc) + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
        ok = await repo.upsert_cache(
            "amap", "attraction", {"keyword": "故宫"},
            {"items": []}, fetched_at=now, expires_at=future,
        )
        assert ok is True
        result = await repo.read_cache("amap", "attraction", {"keyword": "故宫"})
        assert isinstance(result, CacheEntry)
        assert result.tier == CacheTier.FRESH

    @pytest.mark.asyncio
    async def test_stale_after_expiry(self, repo):
        past = (datetime.now(timezone.utc) - timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
        mid = (datetime.now(timezone.utc) - timedelta(minutes=30)).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
        future = (datetime.now(timezone.utc) + timedelta(minutes=30)).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
        repo._entries[query_hash("amap", "attraction", {"keyword": "故宫"})] = CacheEntry(
            query_hash=query_hash("amap", "attraction", {"keyword": "故宫"}),
            tier=CacheTier.FRESH,
            fetched_at=past,
            expires_at=mid,
            stale_until=future,
        )
        result = await repo.read_cache("amap", "attraction", {"keyword": "故宫"})
        assert isinstance(result, CacheEntry)
        assert result.tier == CacheTier.STALE

    @pytest.mark.asyncio
    async def test_expired_past_stale_until(self, repo):
        past = (datetime.now(timezone.utc) - timedelta(hours=3)).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
        older = (datetime.now(timezone.utc) - timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
        repo._entries[query_hash("amap", "attraction", {"keyword": "故宫"})] = CacheEntry(
            query_hash=query_hash("amap", "attraction", {"keyword": "故宫"}),
            tier=CacheTier.FRESH,
            fetched_at=past,
            expires_at=older,
            stale_until=older,
        )
        result = await repo.read_cache("amap", "attraction", {"keyword": "故宫"})
        assert isinstance(result, CacheEntry)
        assert result.tier == CacheTier.EXPIRED

    @pytest.mark.asyncio
    async def test_invalidate_sets_expired(self, repo):
        qh = query_hash("amap", "attraction", {"keyword": "故宫"})
        now_str = now_iso()
        repo._entries[qh] = CacheEntry(
            query_hash=qh, tier=CacheTier.FRESH,
            fetched_at=now_str, expires_at=now_str, stale_until=now_str,
        )
        ok = await repo.invalidate_cache("amap", "attraction", {"keyword": "故宫"})
        assert ok is True
        result = await repo.read_cache("amap", "attraction", {"keyword": "故宫"})
        assert isinstance(result, CacheEntry)
        assert result.tier == CacheTier.EXPIRED

    @pytest.mark.asyncio
    async def test_refresh_job_dedup_creates_once(self, repo):
        params = {"keyword": "故宫"}
        id1, status1 = await repo.ensure_refresh_job("place", "amap", "attraction", params)
        id2, status2 = await repo.ensure_refresh_job("place", "amap", "attraction", params)
        assert status1 == "created"
        assert status2 == "already_pending"
        assert id1 == id2

    @pytest.mark.asyncio
    async def test_refresh_job_different_params_different_jobs(self, repo):
        id1, _ = await repo.ensure_refresh_job("place", "amap", "attraction", {"keyword": "故宫"})
        id2, _ = await repo.ensure_refresh_job("place", "amap", "attraction", {"keyword": "颐和园"})
        assert id1 != id2

    @pytest.mark.asyncio
    async def test_mark_refresh_job_done(self, repo):
        job_id, _ = await repo.ensure_refresh_job("place", "amap", "attraction", {"keyword": "故宫"})
        ok = await repo.mark_refresh_job_done(job_id, ok=True)
        assert ok is True
        assert repo._refresh_jobs[job_id]["status"] == "done"

    @pytest.mark.asyncio
    async def test_mark_refresh_job_failed(self, repo):
        job_id, _ = await repo.ensure_refresh_job("place", "amap", "attraction", {"keyword": "故宫"})
        ok = await repo.mark_refresh_job_done(job_id, ok=False, error_code="TIMEOUT")
        assert ok is True
        assert repo._refresh_jobs[job_id]["status"] == "failed"

    @pytest.mark.asyncio
    async def test_upsert_updates_existing_entry(self, repo):
        qh = query_hash("amap", "attraction", {"keyword": "故宫"})
        now1 = now_iso()
        future1 = (datetime.now(timezone.utc) + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
        await repo.upsert_cache("amap", "attraction", {"keyword": "故宫"},
                                {"v": 1}, fetched_at=now1, expires_at=future1)
        # Simulate time passing, update with fresh data
        now2 = now_iso()
        future2 = (datetime.now(timezone.utc) + timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
        await repo.upsert_cache("amap", "attraction", {"keyword": "故宫"},
                                {"v": 2}, fetched_at=now2, expires_at=future2)
        result = await repo.read_cache("amap", "attraction", {"keyword": "故宫"})
        assert isinstance(result, CacheEntry)
        assert result.payload.get("v") == 2


# ═══════════════════════════════════════════════════════════════════════════════
# 5b. Mock SQL branch tests (no real DB required)
# ═══════════════════════════════════════════════════════════════════════════════

class TestRepositoryMockSql:
    """Test SQL branch logic by patching internal helpers.

    These tests verify that the Repository makes the right SQL calls
    and handles DB failures gracefully, without requiring a real database.
    """

    @pytest.mark.asyncio
    async def test_read_cache_db_down_returns_unavailable(self):
        """When DB is unreachable, read_cache returns DATABASE_UNAVAILABLE."""
        from api.cache.repository import read_cache, CacheMiss, CacheMissReason
        from unittest.mock import patch

        with patch('api.cache.repository._is_db_ready', return_value=True), \
             patch('api.cache.repository._db_reachable', return_value=False):
            result = await read_cache("amap", "attraction", {"keyword": "故宫"})
            assert isinstance(result, CacheMiss)
            assert result.reason == CacheMissReason.DATABASE_UNAVAILABLE

    @pytest.mark.asyncio
    async def test_read_cache_not_configured_returns_unavailable(self):
        """When DATABASE_URL not set, read_cache returns DATABASE_UNAVAILABLE."""
        from api.cache.repository import read_cache, CacheMiss, CacheMissReason
        with patch('api.cache.repository._is_db_ready', return_value=False):
            result = await read_cache("amap", "attraction", {"keyword": "故宫"})
            assert isinstance(result, CacheMiss)
            assert result.reason == CacheMissReason.DATABASE_UNAVAILABLE

    @pytest.mark.asyncio
    async def test_read_cache_not_found_distinct_from_unavailable(self):
        """NOT_FOUND is only returned when DB is reachable but no rows match."""
        from api.cache.repository import read_cache, CacheMiss, CacheMissReason, _fetchrow
        from unittest.mock import patch, AsyncMock

        # DB reachable but no rows
        mock_row = None
        with patch('api.cache.repository._is_db_ready', return_value=True), \
             patch('api.cache.repository._db_reachable', return_value=True), \
             patch('api.cache.repository._fetchrow', return_value=mock_row):
            result = await read_cache("amap", "attraction", {"keyword": "故宫"})
            assert isinstance(result, CacheMiss)
            assert result.reason == CacheMissReason.NOT_FOUND

    @pytest.mark.asyncio
    async def test_read_cache_success_returns_entry(self):
        """When DB returns a row, read_cache returns CacheEntry with payload."""
        from api.cache.repository import read_cache, CacheEntry, CacheTier
        from unittest.mock import patch
        from datetime import datetime, timezone

        past = (datetime.now(timezone.utc) - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
        future = (datetime.now(timezone.utc) + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
        mock_row = {
            "query_hash": "test_hash",
            "payload_json": {"items": [{"name": "故宫"}]},
            "fetched_at": past,
            "expires_at": future,
            "stale_until": future,
        }
        with patch('api.cache.repository._is_db_ready', return_value=True), \
             patch('api.cache.repository._db_reachable', return_value=True), \
             patch('api.cache.repository._fetchrow', return_value=mock_row):
            result = await read_cache("amap", "attraction", {"keyword": "故宫"})
            assert isinstance(result, CacheEntry)
            assert result.tier == CacheTier.FRESH
            assert result.payload == {"items": [{"name": "故宫"}]}

    @pytest.mark.asyncio
    async def test_upsert_cache_returns_false_on_execute_failure(self):
        """upsert_cache returns False when conn.execute raises."""
        from api.cache.repository import upsert_cache
        from unittest.mock import patch, AsyncMock

        mock_conn = AsyncMock()
        mock_conn.execute.side_effect = Exception("DB write failed")
        mock_ctx = AsyncMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_ctx.__aexit__ = AsyncMock(return_value=None)

        with patch('api.cache.repository._is_db_ready', return_value=True), \
             patch('api.cache.repository.get_connection', return_value=mock_ctx):
            result = await upsert_cache(
                "amap", "attraction", {"keyword": "故宫"},
                {"items": []},
                fetched_at=now_iso(),
                expires_at=(datetime.now(timezone.utc) + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
            )
            assert result is False

    @pytest.mark.asyncio
    async def test_upsert_cache_returns_false_when_no_expires_at(self):
        """upsert_cache returns False when expires_at is not supplied."""
        from api.cache.repository import upsert_cache
        result = await upsert_cache("amap", "attraction", {"keyword": "故宫"}, {"items": []})
        assert result is False

    @pytest.mark.asyncio
    async def test_ensure_refresh_job_returns_unavailable_on_exception(self):
        """ensure_refresh_job returns database_unavailable on any exception."""
        from api.cache.repository import ensure_refresh_job, CacheMissReason
        from unittest.mock import patch

        with patch('api.cache.repository._is_db_ready', return_value=True), \
             patch('api.cache.repository.get_connection', side_effect=Exception("DB error")):
            job_id, status = await ensure_refresh_job("place", "amap", "attraction", {"keyword": "故宫"})
            assert job_id == ""
            assert status == CacheMissReason.DATABASE_UNAVAILABLE

    @pytest.mark.asyncio
    async def test_upsert_cache_hotel_search_calls_hotel_cache_table(self):
        """When source=fliggy/category=hotel_search, also upserts to hotel_search_cache."""
        from api.cache.repository import upsert_cache
        from unittest.mock import patch, AsyncMock

        call_log = []
        mock_conn = AsyncMock()
        async def execute_side_effect(query, *args):
            call_log.append(query.strip()[:60])
            return "OK"
        mock_conn.execute = AsyncMock(side_effect=execute_side_effect)
        mock_ctx = AsyncMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_ctx.__aexit__ = AsyncMock(return_value=None)

        future = (datetime.now(timezone.utc) + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
        with patch('api.cache.repository._is_db_ready', return_value=True), \
             patch('api.cache.repository.get_connection', return_value=mock_ctx):
            result = await upsert_cache(
                "fliggy", "hotel_search",
                {"destination": "北京", "checkInDate": "2026-08-01"},
                {"hotels": []},
                fetched_at=now_iso(), expires_at=future,
                response_json={"hotels": []},
                request_json={"destination": "北京"},
            )
            assert result is True
            # Verify both cache_entries and hotel_search_cache were touched
            assert any("cache_entries" in q for q in call_log), \
                f"Expected cache_entries INSERT, got: {call_log}"
            assert any("hotel_search_cache" in q for q in call_log), \
                f"Expected hotel_search_cache INSERT, got: {call_log}"

    @pytest.mark.asyncio
    async def test_mark_refresh_job_done_never_stores_error_message(self):
        """mark_refresh_job_done never persists error_message (safety check)."""
        from api.cache.repository import mark_refresh_job_done
        from unittest.mock import patch, AsyncMock

        mock_conn = AsyncMock()
        captured_sql = []
        async def capture_execute(query, *args):
            captured_sql.append((query, args))
            return "OK"
        mock_conn.execute = AsyncMock(side_effect=capture_execute)
        mock_ctx = AsyncMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_ctx.__aexit__ = AsyncMock(return_value=None)

        with patch('api.cache.repository._is_db_ready', return_value=True), \
             patch('api.cache.repository.get_connection', return_value=mock_ctx):
            await mark_refresh_job_done(
                "test-job-id", ok=False, error_code="TIMEOUT",
                error_message="Connection to localhost:5432 failed: password authentication failed",
            )
            # Verify error_message is NOT in the SQL args
            for query, args in captured_sql:
                for arg in args:
                    assert "localhost" not in str(arg), \
                        f"Raw error message leaked into SQL args: {arg}"
                    assert "password" not in str(arg).lower(), \
                        f"Sensitive data leaked into SQL args: {arg}"


# ═══════════════════════════════════════════════════════════════════════════════
# 6. Real DB integration (skipped unless DATABASE_URL is set)
# ═══════════════════════════════════════════════════════════════════════════════

_REQUIRES_DB = pytest.mark.skipif(
    not os.getenv("DATABASE_URL", "").strip(),
    reason="DATABASE_URL not set; run with DATABASE_URL=... to test real DB",
)


@pytest.fixture(scope="module")
def db_url():
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        pytest.skip("DATABASE_URL not set")
    return url


@pytest.mark.asyncio
@_REQUIRES_DB
async def test_real_db_connection(db_url):
    """Smoke test: can we connect to the configured PostgreSQL?"""
    import asyncpg
    conn = await asyncpg.connect(db_url, command_timeout=5)
    version = await conn.fetchval("SELECT version()")
    assert "PostgreSQL" in version
    await conn.close()


@pytest.mark.asyncio
@_REQUIRES_DB
async def test_real_db_schema_exists(db_url):
    """Smoke test: all 6 tables and partial unique index exist."""
    import asyncpg
    conn = await asyncpg.connect(db_url, command_timeout=5)
    try:
        tables = {row["tablename"] for row in await conn.fetch(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
        )}
        required = {
            "travel_places", "hotel_properties", "hotel_search_cache",
            "route_cache", "refresh_jobs", "cache_entries", "_schema_version",
        }
        missing = required - tables
        assert not missing, f"Missing tables: {missing}"

        # Verify partial unique index on refresh_jobs
        indexes = await conn.fetch(
            "SELECT indexname, indexdef FROM pg_indexes "
            "WHERE schemaname = 'public' AND tablename = 'refresh_jobs'"
        )
        index_names = {row["indexname"] for row in indexes}
        assert "idx_refresh_jobs_dedupe_pending" in index_names, \
            "Partial unique index idx_refresh_jobs_dedupe_pending must exist"
        print("  Tables:", sorted(required))
        print("  Indexes:", sorted(index_names))
    finally:
        await conn.close()


@pytest.mark.asyncio
@_REQUIRES_DB
async def test_real_db_jsonb_roundtrip(db_url):
    """Verify asyncpg JSONB round-trip: Python dict → PostgreSQL → Python dict."""
    import asyncpg
    conn = await asyncpg.connect(db_url, command_timeout=5)
    try:
        test_payload = {"items": [{"id": "A1", "name": "故宫"}], "total": 1}
        ts = now_iso()
        future = (datetime.now(timezone.utc) + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
        qh = query_hash("amap", "attraction", {"keyword": "故宫"})
        await conn.execute(
            "INSERT INTO cache_entries (query_hash, source, category, params_json, payload_json, fetched_at, expires_at, stale_until) "
            "VALUES ($1, $2, $3, $4, $5, $6, $7, $8) "
            "ON CONFLICT (query_hash) DO UPDATE SET payload_json = EXCLUDED.payload_json",
            qh, "amap", "attraction", json.dumps({"keyword": "故宫"}), test_payload, ts, future, future,
        )
        row = await conn.fetchrow(
            "SELECT payload_json FROM cache_entries WHERE query_hash = $1", qh
        )
        assert row is not None
        retrieved = dict(row["payload_json"]) if row["payload_json"] else {}
        assert retrieved["total"] == 1
        assert retrieved["items"][0]["name"] == "故宫"
        print("  JSONB round-trip OK")
    finally:
        await conn.close()


@pytest.mark.asyncio
@_REQUIRES_DB
async def test_real_db_timestamptz_handling(db_url):
    """Verify TIMESTAMPTZ round-trip with UTC timestamps."""
    import asyncpg
    conn = await asyncpg.connect(db_url, command_timeout=5)
    try:
        ts = now_iso()
        future = (datetime.now(timezone.utc) + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
        qh = query_hash("amap", "attraction", {"keyword": "天坛"})
        await conn.execute(
            "INSERT INTO cache_entries (query_hash, source, category, params_json, payload_json, fetched_at, expires_at, stale_until) "
            "VALUES ($1, $2, $3, $4, $5, $6, $7, $8) "
            "ON CONFLICT (query_hash) DO UPDATE SET fetched_at = EXCLUDED.fetched_at",
            qh, "amap", "attraction", json.dumps({"keyword": "天坛"}), {"v": 1}, ts, future, future,
        )
        row = await conn.fetchrow(
            "SELECT fetched_at, expires_at FROM cache_entries WHERE query_hash = $1", qh
        )
        assert row is not None
        assert row["fetched_at"].tzinfo is not None, "fetched_at must be timezone-aware"
        assert row["expires_at"].tzinfo is not None, "expires_at must be timezone-aware"
        print(f"  TIMESTAMPTZ OK: fetched_at={row['fetched_at']}, tz={row['fetched_at'].tzinfo}")
    finally:
        await conn.close()


@pytest.mark.asyncio
@_REQUIRES_DB
async def test_real_db_cache_miss_distinction(db_url):
    """Verify CacheMissReason.NOT_FOUND vs DATABASE_UNAVAILABLE are distinct."""
    # NOT_FOUND: query a non-existent hash
    from api.cache.repository import read_cache, CacheMiss, CacheMissReason
    result = await read_cache("amap", "attraction", {"keyword": "肯定不存在xyz"})
    assert isinstance(result, CacheMiss), "non-existent entry must be CacheMiss"
    assert result.reason == CacheMissReason.NOT_FOUND, \
        f"Expected NOT_FOUND, got {result.reason}"
    print(f"  NOT_FOUND: {result.reason}")


@pytest.mark.asyncio
@_REQUIRES_DB
async def test_real_db_refresh_job_deduplication(db_url):
    """Verify partial unique index + RETURNING id deduplication works."""
    import asyncpg
    from api.cache.repository import ensure_refresh_job, CacheMissReason
    conn = await asyncpg.connect(db_url, command_timeout=5)
    try:
        params = {"keyword": "test_dedup_" + uuid.uuid4().hex[:8]}
        # First call should create
        id1, status1 = await ensure_refresh_job("place", "amap", "attraction", params)
        assert status1 == "created", f"First call must create, got {status1}"
        assert id1, "job_id must not be empty"
        print(f"  Created: {id1[:8]}...")

        # Second call with same params must return existing
        id2, status2 = await ensure_refresh_job("place", "amap", "attraction", params)
        assert status2 == "already_pending", f"Second call must be already_pending, got {status2}"
        assert id1 == id2, "Same dedupe_key must return same job_id"
        print(f"  Deduped: {id2[:8]}... (same)")

        # Third call with different params must create a new job
        id3, status3 = await ensure_refresh_job("place", "amap", "attraction", {"keyword": "different"})
        assert status3 == "created", f"Different params must create, got {status3}"
        assert id3 != id1, "Different dedupe_key must produce different job_id"
        print(f"  New job: {id3[:8]}... (different)")

        # Verify the partial unique index allows multiple done rows
        await conn.execute(
            "UPDATE refresh_jobs SET status = 'done' WHERE id = $1", id1
        )
        id4, status4 = await ensure_refresh_job("place", "amap", "attraction", params)
        assert status4 == "created", "After marking done, same dedupe_key can create new pending job"
        assert id4 != id1, "New pending job must have different id from done job"
        print(f"  After done, new pending: {id4[:8]}... (allowed)")
    finally:
        await conn.close()
