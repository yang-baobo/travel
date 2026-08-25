"""
Database connection management for Serverless (Vercel) deployment.

Uses asyncpg with short transactions, connection reuse limits,
and query timeouts to stay within Vercel Serverless constraints.

Environment:
    DATABASE_URL  — asyncpg-compatible PostgreSQL URL (server-side only)
"""

from __future__ import annotations

import asyncio
import json
import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Optional

import asyncpg

_DATABASE_URL: Optional[str] = None
_pool: Optional[asyncpg.Pool] = None
_pool_created_at: float = 0.0
_pool_closed: bool = True
_MAX_POOL_SIZE = 2
_MIN_POOL_SIZE = 0
_QUERY_TIMEOUT_SECONDS = 10

_lock: Optional[asyncio.Lock] = None


def _get_database_url() -> Optional[str]:
    """Return DATABASE_URL without logging it."""
    global _DATABASE_URL
    if _DATABASE_URL is None:
        _DATABASE_URL = os.getenv("DATABASE_URL", "").strip() or None
    return _DATABASE_URL


def is_configured() -> bool:
    return _get_database_url() is not None


def _get_lock() -> asyncio.Lock:
    """Lazily create the asyncio.Lock in the current event loop."""
    global _lock
    if _lock is None:
        _lock = asyncio.Lock()
    return _lock


async def _register_codecs(conn: asyncpg.Connection) -> None:
    """Register json/jsonb and timestamptz codecs on each new connection."""
    await conn.set_type_codec(
        'json',
        encoder=lambda v: json.dumps(v),
        decoder=lambda v: json.loads(v),
        schema='pg_catalog',
        format='text',
    )
    await conn.set_type_codec(
        'jsonb',
        encoder=lambda v: json.dumps(v),
        decoder=lambda v: json.loads(v),
        schema='pg_catalog',
        format='text',
    )


async def _create_pool() -> asyncpg.Pool:
    url = _get_database_url()
    if not url:
        raise RuntimeError("DATABASE_URL is not configured")
    return await asyncpg.create_pool(
        url,
        min_size=_MIN_POOL_SIZE,
        max_size=_MAX_POOL_SIZE,
        command_timeout=_QUERY_TIMEOUT_SECONDS,
        statement_cache_size=0,
        max_inactive_connection_lifetime=60,
        init=_register_codecs,
    )


@asynccontextmanager
async def get_connection() -> AsyncGenerator[asyncpg.Connection, None]:
    """Acquire a connection from the pool.

    Conservative Serverless policy:
      - Pool is created lazily on first use
      - Replaced only when explicitly closed via close_pool()
      - Never force-closed while concurrent requests may hold connections
      - init callback registers json/jsonb/timestamptz codecs on every new connection
      - max_inactive_connection_lifetime=60 handles stale connection recycling
    """
    global _pool, _pool_created_at, _pool_closed

    url = _get_database_url()
    if not url:
        raise RuntimeError("DATABASE_URL is not configured")

    lock = _get_lock()

    async with lock:
        if _pool is None or _pool_closed:
            if _pool is not None and not _pool_closed:
                try:
                    await asyncio.wait_for(_pool.close(), timeout=2.0)
                except Exception:
                    pass
            _pool = await _create_pool()
            _pool_created_at = 0.0  # no longer used for age-based replacement
            _pool_closed = False

    conn = await _pool.acquire()
    try:
        yield conn
    finally:
        await _pool.release(conn)


async def close_pool() -> None:
    """Gracefully close the connection pool. Safe to call between Serverless invocations."""
    global _pool, _pool_created_at, _pool_closed
    lock = _get_lock()
    async with lock:
        if _pool is not None and not _pool_closed:
            try:
                await asyncio.wait_for(_pool.close(), timeout=2.0)
            except Exception:
                pass
        _pool = None
        _pool_created_at = 0.0
        _pool_closed = True
