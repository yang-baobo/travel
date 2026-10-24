"""Regression: a database cache hit must not reference an undefined refresh_error."""
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, patch

from api import place_cache


class PlaceDetailTests(IsolatedAsyncioTestCase):
    async def test_fresh_database_detail_returns_without_provider_refresh(self):
        now = datetime.now(timezone.utc)
        row = {
            "source_id": "example-poi", "source": "amap", "category": "attraction",
            "normalized_json": {"name": "测试景点"}, "fetched_at": now,
            "expires_at": now + timedelta(hours=1), "stale_until": now + timedelta(days=1),
        }
        connection = AsyncMock()
        connection.fetchrow.return_value = row

        @asynccontextmanager
        async def connection_context():
            yield connection

        with patch.object(place_cache, "_db_configured", return_value=True), \
             patch.object(place_cache, "get_connection", connection_context), \
             patch.object(place_cache, "get_place_images", AsyncMock(return_value=[])):
            result = await place_cache.get_place_detail("amap", "example-poi")
        self.assertEqual(result["name"], "测试景点")
        self.assertEqual(result["cache"]["cacheStatus"], "fresh")
        self.assertNotIn("refreshError", result["cache"])
