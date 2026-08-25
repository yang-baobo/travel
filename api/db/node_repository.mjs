/**
 * Node.js PostgreSQL cache Repository (Vercel Serverless Function friendly).
 *
 * Shared SHA-256 hash implementation with Python:
 *   api/cache/hash.py  ↔  api/db/node_hash.mjs  produce identical query_hash values
 *   for identical input parameters.
 *
 * Environment:
 *   DATABASE_URL      — PostgreSQL connection string (server-side only)
 *   CACHE_REFRESH_SECRET — internal refresh endpoint secret
 */

import {
  hotelSearchQueryHash,
  placeQueryHash,
  queryHash,
  refreshJobDedupeKey,
  routeQueryHash,
  stableDumps,
} from './node_hash.mjs';

// ── PostgreSQL client (lazy, Serverless-safe) ───────────────────────────────────

let _pool = null;
let _poolCreatedAt = 0;
let _poolEnding = false;
const POOL_MAX_AGE_MS = 5 * 60 * 1000;
const QUERY_TIMEOUT_MS = 10_000;

function getDatabaseUrl() {
  return (process.env.DATABASE_URL || '').trim() || null;
}

function isConfigured() {
  return !!getDatabaseUrl();
}

function toIsoString(date) {
  // Convert Date or string to timezone-aware ISO-8601
  if (date instanceof Date) return date.toISOString();
  return String(date);
}

// Preload pg module once for codec registration
let _pgModule = null;
async function getPg() {
  if (!_pgModule) _pgModule = await import('pg');
  return _pgModule;
}

async function getPool() {
  const url = getDatabaseUrl();
  if (!url) throw new Error('DATABASE_URL is not configured');

  // Return existing pool if it's still open (use pg's idleTimeoutMillis for stale conn recycling)
  if (_pool && !_poolEnding) {
    try {
      await _pool.query('SELECT 1');
      return _pool;
    } catch (_) { /* pool unhealthy, recreate below */ }
  }

  // Gracefully close old pool (only if not already shutting down)
  if (_pool && !_poolEnding) {
    _poolEnding = true;
    try { await _pool.end(); } catch (_) {}
    _poolEnding = false;
  }

  const pg = await getPg();
  const { builtins } = pg.types;

  // Build json/jsonb/timestamptz codec map
  const typeOverrides = {};
  if (builtins) {
    // json (oid 114) and jsonb (oid 3802): parse to JS object
    typeOverrides[114] = { parse: (v) => { try { return JSON.parse(v); } catch { return v; } }, serialize: JSON.stringify };
    typeOverrides[3802] = { parse: (v) => { try { return JSON.parse(v); } catch { return v; } }, serialize: JSON.stringify };
  }

  _pool = new pg.Pool({
    connectionString: url,
    max: 2,
    min: 0,
    idleTimeoutMillis: 60_000,
    statementTimeoutMillis: QUERY_TIMEOUT_MS,
    types: Object.keys(typeOverrides).length > 0 ? typeOverrides : undefined,
  });
  _poolCreatedAt = Date.now();
  return _pool;
}

async function query(text, params = []) {
  if (!isConfigured()) return null;
  try {
    const pool = await getPool();
    const result = await pool.query(text, params);
    return result;
  } catch (err) {
    return null;
  }
}

// ── CacheMiss sentinel ─────────────────────────────────────────────────────────

const CacheMissReason = Object.freeze({
  NOT_FOUND: 'not_found',
  DATABASE_UNAVAILABLE: 'database_unavailable',
});

class CacheMiss {
  constructor(reason = CacheMissReason.DATABASE_UNAVAILABLE) {
    this.tier = 'miss';
    this.reason = reason;
  }
}

// ── classifyTier (mirrors Python classify_tier) ─────────────────────────────────

function classifyTier(fetchedAt, expiresAt, staleUntil) {
  const now = new Date();
  const exp = new Date(expiresAt);
  if (now < exp) return 'fresh';

  if (staleUntil) {
    const stale = new Date(staleUntil);
    if (now < stale) return 'stale';
    return 'expired';
  }
  return 'expired';
}

// ── Public API ─────────────────────────────────────────────────────────────────

async function readCache(source, category, params) {
  if (!isConfigured()) {
    return new CacheMiss(CacheMissReason.DATABASE_UNAVAILABLE);
  }
  const qh = queryHash(source, category, params);
  const result = await query(
    'SELECT query_hash, payload_json, fetched_at, expires_at, stale_until FROM cache_entries WHERE query_hash = $1',
    [qh],
  );
  // Only return NOT_FOUND when DB query succeeded but returned no rows
  if (!result) {
    return new CacheMiss(CacheMissReason.DATABASE_UNAVAILABLE);
  }
  if (result.rowCount === 0) {
    return new CacheMiss(CacheMissReason.NOT_FOUND);
  }
  const row = result.rows[0];
  const tier = classifyTier(row.fetched_at, row.expires_at, row.stale_until);
  return {
    query_hash: row.query_hash,
    tier,
    fetched_at: toIsoString(row.fetched_at),
    expires_at: toIsoString(row.expires_at),
    stale_until: row.stale_until ? toIsoString(row.stale_until) : null,
    payload: row.payload_json,
  };
}

async function upsertCache(source, category, params, payload, opts = {}) {
  if (!isConfigured()) return false;
  const qh = queryHash(source, category, params);
  const ts = opts.fetchedAt || new Date().toISOString();
  if (!opts.expiresAt) return false;

  const result = await query(
    `INSERT INTO cache_entries (query_hash, source, category, params_json, payload_json, fetched_at, expires_at, stale_until)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (query_hash) DO UPDATE SET
       payload_json = EXCLUDED.payload_json,
       fetched_at   = EXCLUDED.fetched_at,
       expires_at   = EXCLUDED.expires_at,
       stale_until  = EXCLUDED.stale_until`,
    [
      qh, source, category,
      JSON.stringify(params),
      payload,
      ts,
      opts.expiresAt,
      opts.staleUntil || null,
    ],
  );
  // Return false if query failed (null result from query())
  if (!result) return false;
  return true;
}

async function ensureRefreshJob(jobType, source, category, params, secret, payload) {
  if (!isConfigured()) return ['', CacheMissReason.DATABASE_UNAVAILABLE];
  const dedupe = refreshJobDedupeKey(jobType, source, category, params);
  const jobId = crypto.randomUUID();
  // INSERT ... ON CONFLICT (dedupe_key) DO NOTHING RETURNING id
  const result = await query(
    `INSERT INTO refresh_jobs (id, job_type, dedupe_key, payload_json, status)
     VALUES ($1, $2, $3, $4, 'pending')
     ON CONFLICT (dedupe_key) DO NOTHING
     RETURNING id`,
    [jobId, jobType, dedupe, payload ? JSON.stringify(payload) : null],
  );
  if (!result) return ['', CacheMissReason.DATABASE_UNAVAILABLE];
  if (result.rowCount > 0) {
    return [result.rows[0].id, 'created'];
  }
  // Conflict → fetch existing pending OR running job
  const existing = await query(
    'SELECT id FROM refresh_jobs WHERE dedupe_key = $1 AND status IN ($2, $3)',
    [dedupe, 'pending', 'running'],
  );
  if (existing && existing.rowCount > 0) {
    return [existing.rows[0].id, 'already_pending'];
  }
  return ['', CacheMissReason.DATABASE_UNAVAILABLE];
}

// ── Graceful shutdown ──────────────────────────────────────────────────────────

async function closePool() {
  if (_pool) {
    try { await _pool.end(); } catch (_) {}
    _pool = null;
    _poolCreatedAt = 0;
  }
}

// ── Export for Vercel Serverless Function ──────────────────────────────────────

export {
  CacheMiss,
  CacheMissReason,
  closePool,
  classifyTier,
  ensureRefreshJob,
  getPool,
  hotelSearchQueryHash,
  isConfigured,
  placeQueryHash,
  query,
  queryHash,
  readCache,
  refreshJobDedupeKey,
  routeQueryHash,
  stableDumps,
  toIsoString,
  upsertCache,
};
