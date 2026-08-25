/**
 * Node.js SHA-256 query hash — must match Python api/cache/hash.py exactly.
 *
 * The Python stable_dumps() recursively serializes nested dicts as inner JSON strings
 * and strips None values. This module mirrors that behavior exactly so that
 * Python and Node.js produce identical query_hash values for identical inputs.
 */

import crypto from 'node:crypto';

// ── Stable JSON serialization (mirrors Python stable_dumps) ────────────────────

function stableDumps(obj) {
  if (!obj || typeof obj !== 'object') return '{}';
  if (Array.isArray(obj)) {
    return JSON.stringify(obj);
  }

  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'object' && !Array.isArray(value)) {
      cleaned[key] = stableDumps(value);  // nested dict → recursive JSON string
    } else {
      cleaned[key] = value;
    }
  }

  // Sort keys, compact separators (matches json.dumps(sort_keys=True, separators=(",", ":")))
  const sortedKeys = Object.keys(cleaned).sort();
  const pairs = sortedKeys.map(key => {
    const val = cleaned[key];
    // Always JSON.stringify the value to ensure proper quoting
    const encoded = JSON.stringify(val);
    return `"${key}":${encoded}`;
  });
  return `{${pairs.join(',')}}`;
}

// ── SHA-256 query hash ─────────────────────────────────────────────────────────

function queryHash(source, category, params = {}) {
  const material = `${source}|${category}|${stableDumps(params)}`;
  return crypto.createHash('sha256').update(material, 'utf8').digest('hex');
}

// ── Convenience wrappers ────────────────────────────────────────────────────────

function placeQueryHash(category, keyword = '', page = 1, pageSize = 20) {
  return queryHash('amap', `place:${category}`, {
    keyword: keyword.trim(),
    page,
    pageSize,
  });
}

function routeQueryHash(origin, destination, mode) {
  return queryHash('amap', `route:${mode}`, { origin, destination, mode });
}

function hotelSearchQueryHash(params) {
  return queryHash('fliggy', 'hotel_search', params);
}

function refreshJobDedupeKey(jobType, source, category, params) {
  return `${jobType}:${source}:${category}:${queryHash(source, category, params)}`;
}

export {
  hotelSearchQueryHash,
  placeQueryHash,
  queryHash,
  refreshJobDedupeKey,
  routeQueryHash,
  stableDumps,
};
