import test from 'node:test';
import assert from 'node:assert/strict';
import type { FliggyAttractionEditorial, TravelPlace } from '../src/types/travel';
import { matchFlyAiImage, PLACE_IMAGE_SOURCE_LABEL, resolvePlaceImage } from '../src/services/placeImageMatcher';

function amapPlace(overrides: Partial<TravelPlace> = {}): TravelPlace {
  return {
    id: 'amap-1',
    source: 'amap',
    category: 'attraction',
    city: '北京',
    name: '颐和园',
    address: '北京市海淀区新建宫门路19号',
    district: '海淀区',
    location: { latitude: 39.999912, longitude: 116.275083 },
    typeName: '风景名胜',
    typeCode: '110000',
    rating: null,
    cost: null,
    phone: '',
    openHours: '',
    businessArea: '',
    tags: [],
    photoUrls: [],
    booking: { enabled: false, provider: 'ctrip', label: '', url: null },
    ...overrides,
  };
}

function flyai(overrides: Partial<FliggyAttractionEditorial> = {}): FliggyAttractionEditorial {
  return {
    id: 'fliggy:yiheyuan',
    source: 'fliggy',
    sourcePoiId: 'yiheyuan',
    city: '北京',
    name: '颐和园',
    address: '北京市海淀区新建宫门路19号',
    latitude: 39.9998,
    longitude: 116.2752,
    category: '景点',
    poiLevel: '5A',
    description: null,
    imageUrl: 'https://img.alicdn.com/yiheyuan.jpg',
    jumpUrl: null,
    ticket: null,
    ...overrides,
  };
}

test('高德有图时优先使用高德图', () => {
  const result = resolvePlaceImage(amapPlace({ photoUrls: ['https://amap.example/yiheyuan.jpg'] }), [flyai()]);
  assert.deepEqual(result, { imageUrl: 'https://amap.example/yiheyuan.jpg', imageSource: 'amap', flyaiSourcePoiId: null, matchEvidence: null });
  assert.equal(PLACE_IMAGE_SOURCE_LABEL[result.imageSource], '高德图');
});

test('高德无图且名称与坐标一致时使用 FlyAI 图', () => {
  const result = resolvePlaceImage(amapPlace(), [flyai()]);
  assert.equal(result.imageSource, 'fliggy');
  assert.equal(result.imageUrl, 'https://img.alicdn.com/yiheyuan.jpg');
  assert.equal(result.flyaiSourcePoiId, 'yiheyuan');
  assert.match(result.matchEvidence || '', /名称完全一致；坐标距离/);
  assert.equal(PLACE_IMAGE_SOURCE_LABEL[result.imageSource], 'FLYAI 图');
});

test('名称相同但坐标过远时拒绝匹配', () => {
  const result = matchFlyAiImage(amapPlace(), [flyai({ latitude: 40.9, longitude: 116.4 })]);
  assert.equal(result, null);
});

test('名称相似但不完全一致时拒绝匹配', () => {
  const result = matchFlyAiImage(amapPlace({ name: '颐和园东门' }), [flyai()]);
  assert.equal(result, null);
});

test('没有坐标且地址也没有强证据时拒绝匹配', () => {
  const result = matchFlyAiImage(
    amapPlace({ location: { latitude: Number.NaN, longitude: Number.NaN }, address: '', district: '' }),
    [flyai({ latitude: null, longitude: null, address: '' })],
  );
  assert.equal(result, null);
});

test('没有坐标但行政区地址一致时可以匹配', () => {
  const result = matchFlyAiImage(
    amapPlace({ location: { latitude: Number.NaN, longitude: Number.NaN } }),
    [flyai({ latitude: null, longitude: null, address: '北京市海淀区新建宫门路19号' })],
  );
  assert.equal(result?.matchMethod, 'exact_name_and_address');
});

test('同一 FlyAI 条目不会分配给第二个高德 POI', () => {
  const used = new Set<string>();
  const first = resolvePlaceImage(amapPlace(), [flyai()], used);
  if (first.flyaiSourcePoiId) used.add(first.flyaiSourcePoiId);
  const second = resolvePlaceImage(amapPlace({ id: 'amap-2' }), [flyai()], used);
  assert.equal(second.imageSource, 'none');
  assert.equal(second.imageUrl, null);
});

test('匹配失败时返回真实占位状态', () => {
  const result = resolvePlaceImage(amapPlace({ name: '景山公园', district: '西城区', address: '北京市西城区景山西街44号' }), [flyai()]);
  assert.deepEqual(result, { imageUrl: null, imageSource: 'none', flyaiSourcePoiId: null, matchEvidence: null });
  assert.equal(PLACE_IMAGE_SOURCE_LABEL[result.imageSource], '暂无图片');
});
