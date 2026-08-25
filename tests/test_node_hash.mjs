/**
 * Cross-language hash consistency test (Node.js).
 *
 * Verifies that api/db/node_hash.mjs produces identical SHA-256 query_hash values
 * as Python api/cache/hash.py for the same inputs.
 *
 * Run with:
 *   node tests/test_node_hash.mjs
 *
 * Does NOT require a running database or 'pg' module.
 */

import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

// ── Import Node implementation ─────────────────────────────────────────────────

const hashModule = await import(
  resolve(join(import.meta.dirname, '..', 'api', 'db', 'node_hash.mjs'))
);

const {
  stableDumps,
  queryHash,
  placeQueryHash,
  routeQueryHash,
  hotelSearchQueryHash,
  refreshJobDedupeKey,
} = hashModule;

// ── Python ground truth via subprocess ─────────────────────────────────────────

function pythonEval(expr) {
  const script = `import sys; sys.path.insert(0, 'api'); from cache.hash import *; print(${expr})`;
  const tmpFile = resolve(tmpdir(), `hash_check_${Date.now()}.py`);
  writeFileSync(tmpFile, script);
  try {
    return execFileSync('python3', [tmpFile], {
      encoding: 'utf-8',
      cwd: resolve(import.meta.dirname, '..'),
      timeout: 5000,
    }).trim();
  } finally {
    unlinkSync(tmpFile);
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

function testStableDumps() {
  console.log('── stableDumps ──────────────────────────────────');
  const d = { keyword: '故宫', page: 1, pageSize: 8 };
  const s1 = stableDumps(d);
  const s2 = stableDumps(d);
  assert.strictEqual(s1, s2, 'stableDumps must be deterministic');
  console.log('  deterministic:          OK');

  const a = stableDumps({ keyword: '故宫', page: 1 });
  const b = stableDumps({ page: 1, keyword: '故宫' });
  assert.strictEqual(a, b, 'key order must not affect output');
  console.log('  key-order invariant:    OK');

  const withNone = stableDumps({ keyword: '故宫', maxPrice: null });
  const withoutNone = stableDumps({ keyword: '故宫' });
  assert.strictEqual(withNone, withoutNone, 'null values must be stripped');
  console.log('  null stripping:         OK');
}

function testQueryHashMatchesPython() {
  console.log('── queryHash matches Python ──────────────────────');

  const cases = [
    {
      label: 'place:attraction (keyword=故宫)',
      pyExpr: 'query_hash("amap", "place:attraction", {"keyword": "故宫", "page": 1, "pageSize": 8})',
      nodeCall: () => queryHash('amap', 'place:attraction', { keyword: '故宫', page: 1, pageSize: 8 }),
    },
    {
      label: 'place:restaurant (keyword=烤鸭)',
      pyExpr: 'query_hash("amap", "place:restaurant", {"keyword": "烤鸭", "page": 1, "pageSize": 20})',
      nodeCall: () => queryHash('amap', 'place:restaurant', { keyword: '烤鸭', page: 1, pageSize: 20 }),
    },
    {
      label: 'route:transit (A→B)',
      pyExpr: 'route_query_hash("116.397,39.908", "116.391,39.907", "transit")',
      nodeCall: () => routeQueryHash('116.397,39.908', '116.391,39.907', 'transit'),
    },
    {
      label: 'hotel_search (王府井)',
      pyExpr: 'hotel_search_query_hash({"destination":"北京","checkInDate":"2026-08-01","checkOutDate":"2026-08-03","maxReferencePrice":500,"stars":[4,5],"keyword":"王府井","poiName":"","sortBy":"price_asc"})',
      nodeCall: () =>
        hotelSearchQueryHash({
          destination: '北京',
          checkInDate: '2026-08-01',
          checkOutDate: '2026-08-03',
          maxReferencePrice: 500,
          stars: [4, 5],
          keyword: '王府井',
          poiName: '',
          sortBy: 'price_asc',
        }),
    },
  ];

  for (const c of cases) {
    const pyHash = pythonEval(c.pyExpr);
    const nodeHash = c.nodeCall();
    assert.strictEqual(
      nodeHash, pyHash,
      `${c.label}: Node hash ${nodeHash.slice(0, 16)}... ≠ Python hash ${pyHash.slice(0, 16)}...`,
    );
    console.log(`  ${c.label}: ${nodeHash.slice(0, 16)}... ✓`);
  }
}

function testDedupeKeyMatchesPython() {
  console.log('── refreshJobDedupeKey matches Python ────────────');
  const pyDedupe = pythonEval(
    'refresh_job_dedupe_key("place", "amap", "attraction", {"keyword": "故宫"})',
  );
  const nodeDedupe = refreshJobDedupeKey('place', 'amap', 'attraction', { keyword: '故宫' });
  assert.strictEqual(
    nodeDedupe, pyDedupe,
    `dedupe key: Node ${nodeDedupe.slice(0, 30)}... ≠ Python ${pyDedupe.slice(0, 30)}...`,
  );
  console.log(`  dedupe key: ${nodeDedupe.slice(0, 30)}... ✓`);
}

function testPlaceQueryHash() {
  console.log('── placeQueryHash ───────────────────────────────');
  const h1 = placeQueryHash('attraction', '', 1, 8);
  const h2 = placeQueryHash('attraction', '', 1, 8);
  assert.strictEqual(h1, h2);
  assert.strictEqual(h1.length, 64);
  console.log('  OK');
}

function testNodePythonFullConsistency() {
  console.log('── Full Python/Node cross-language check ─────────');
  testQueryHashMatchesPython();
  testDedupeKeyMatchesPython();
  console.log('  All hashes match Python exactly');
}

// ── Run ────────────────────────────────────────────────────────────────────────

try {
  testStableDumps();
  testPlaceQueryHash();
  testNodePythonFullConsistency();
  console.log('\n✅ All Node.js hash tests passed');
  process.exit(0);
} catch (err) {
  console.error('\n❌', err.message);
  process.exit(1);
}
