import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  adaptFlyAiAttraction,
  buildFlyAiPoiArgs,
} from '../api/flyai_attractions.mjs';

test('uses one official FlyAI Beijing 5A POI query', () => {
  const args = buildFlyAiPoiArgs();
  assert.deepEqual(args.slice(-5), [
    'search-poi',
    '--city-name',
    '北京',
    '--poi-level',
    '5',
  ]);
});

test('keeps the FlyAI image bound to the same POI name and source id', () => {
  const attraction = adaptFlyAiAttraction({
    id: '64',
    name: '故宫博物院',
    address: '北京市东城区景山前街4号',
    latitude: '39.916345',
    longitude: '116.397155',
    mainPic: 'https://img.alicdn.com/tfscom/palace-photo',
    jumpUrl: 'https://a.feizhu.com/example',
  });
  assert.equal(attraction?.id, 'fliggy:64');
  assert.equal(attraction?.name, '故宫博物院');
  assert.equal(attraction?.imageUrl, 'https://img.alicdn.com/tfscom/palace-photo');
  assert.equal(attraction?.jumpUrl, 'https://a.feizhu.com/example');
});

test('rejects untrusted images instead of fabricating a fallback', () => {
  assert.equal(adaptFlyAiAttraction({
    id: '64',
    name: '故宫博物院',
    mainPic: 'https://example.com/not-official.jpg',
  }), null);
});

test('Vercel routes the editorial endpoint to the server-only FlyAI handler', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.ok(config.rewrites.some(item =>
    item.source === '/api/travel/attractions/editorial'
      && item.destination === '/api/flyai_attractions'));
  assert.equal(config.functions['api/flyai_attractions.mjs'].maxDuration, 60);
});
