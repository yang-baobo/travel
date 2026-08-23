import assert from 'node:assert/strict';
import test from 'node:test';

import {
  adaptFlyAiHotel,
  buildFlyAiArgs,
  normalizeSearchRequest,
} from '../api/flyai_hotels.mjs';

const request = {
  destination: '北京',
  checkInDate: '2026-09-15',
  checkOutDate: '2026-09-17',
  maxReferencePrice: 800,
  stars: [5, 4, 4],
  sortBy: 'price_asc',
};

test('normalizes the existing hotel request contract and official CLI args', () => {
  const normalized = normalizeSearchRequest(request);
  const args = buildFlyAiArgs(normalized);
  assert.deepEqual(normalized.stars, [4, 5]);
  assert.ok(args.includes('search-hotel'));
  assert.ok(args.includes('--max-price'));
  assert.ok(args.includes('--hotel-stars'));
  assert.ok(args.includes('price_asc'));
});

test('adapts observed FlyAI hotel fields without trusting provider coordinates', () => {
  const normalized = normalizeSearchRequest(request);
  const hotel = adaptFlyAiHotel({
    shId: '1001',
    name: '北京测试酒店',
    address: '北京市东城区测试路1号',
    latitude: '39.9',
    longitude: '116.4',
    price: '¥499起',
    rate: null,
    detailUrl: 'https://hotel.fliggy.com/example',
  }, normalized);
  assert.equal(hotel.id, 'fliggy:1001');
  assert.equal(hotel.referencePrice, 499);
  assert.equal(hotel.coordinateSource, 'provider');
  assert.equal(hotel.coordinateVerified, false);
  assert.equal(hotel.rating, null);
});

test('rejects unsupported rating sort and unsafe booking hosts', () => {
  assert.throws(() => normalizeSearchRequest({ ...request, sortBy: 'rating' }), /评分字段不稳定/);
  const normalized = normalizeSearchRequest(request);
  const hotel = adaptFlyAiHotel({
    shId: '1002',
    name: '北京安全测试酒店',
    detailUrl: 'https://example.com/not-fliggy',
  }, normalized);
  assert.equal(hotel.bookingUrl, null);
});
