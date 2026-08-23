import './setupNode';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, test } from 'node:test';

import {
  buildHotelCardViewModel,
  buildHotelSearchParams,
  formatHotelReferencePrice,
  getHotelContentState,
  getHotelSearchErrorMessage,
} from '../src/services/travelData/hotel/hotelUiModel';
import { usePreferenceStore } from '../src/store/usePreferenceStore';
import { useRouteStore } from '../src/store/useRouteStore';
import { TravelHotel, TripHotelContext } from '../src/types/hotel';
import {
  buildSelectedHotelItinerarySummary,
  buildSelectedHotelRouteInput,
} from '../src/utils/selectedHotelRouteBridge';

const context: TripHotelContext = {
  destination: '深圳',
  checkInDate: '2026-09-15',
  checkOutDate: '2026-09-17',
};

function hotel(overrides: Partial<TravelHotel> = {}): TravelHotel {
  return {
    id: 'fliggy:100001',
    source: 'fliggy',
    sourceHotelId: '100001',
    name: '深圳测试酒店',
    city: '深圳',
    district: '南山区',
    address: '深圳市南山区测试路1号',
    latitude: 22.54,
    longitude: 113.97,
    coordinateSource: 'provider',
    coordinateVerified: false,
    geoStatus: 'unresolved',
    geoMatchLevel: null,
    geoConfidence: null,
    amapPoiId: null,
    geocodedAt: null,
    star: null,
    starLabel: '高档型',
    rating: null,
    reviewCount: null,
    referencePrice: 500,
    priceText: '¥500',
    priceCurrency: 'CNY',
    priceType: 'search_reference',
    priceDisclaimer: '飞猪搜索参考价，最终价格以飞猪预订页为准。',
    originalPrice: null,
    roomInformation: null,
    roomAvailability: null,
    imageUrl: 'https://example.test/hotel.jpg',
    tags: ['测试品牌'],
    facilities: null,
    distanceMeters: null,
    nearbyText: null,
    bookingUrl: 'https://hotel.fliggy.com/hotel_detail2.htm?shid=100001',
    checkInDate: context.checkInDate,
    checkOutDate: context.checkOutDate,
    ...overrides,
  };
}

beforeEach(() => {
  useRouteStore.getState().resetRoute();
  usePreferenceStore.setState({
    selectedCity: context.destination,
    travelStartDate: context.checkInDate,
    travelReturnDate: context.checkOutDate,
    hotelPriceRange: { min: 0, max: 500 },
  });
});

describe('Phase 4 hotel card truthfulness', () => {
  test('UI-H02/H03 maps real fields and labels price as a FlyAI reference price', () => {
    const card = buildHotelCardViewModel(hotel(), null);
    assert.equal(card.name, '深圳测试酒店');
    assert.equal(card.address, '深圳市南山区测试路1号');
    assert.equal(card.imageUrl, 'https://example.test/hotel.jpg');
    assert.equal(card.starText, '高档型');
    assert.equal(card.priceText, '¥500 起');
    assert.equal(card.priceCaption, '飞猪参考价');
  });

  test('UI-H04 missing or masked price never becomes ¥0', () => {
    const missing = buildHotelCardViewModel(hotel({ referencePrice: null, priceText: null }), null);
    const masked = buildHotelCardViewModel(hotel({ referencePrice: null, priceText: '¥4xx' }), null);
    assert.equal(missing.priceText, '查看实时价格');
    assert.equal(masked.priceText, '查看实时价格');
  });

  test('reference price formatter does not duplicate an observed 起 suffix', () => {
    assert.equal(formatHotelReferencePrice(hotel({ priceText: '¥500起' })), '¥500 起');
  });

  test('UI-H14/H15/H16/H17 preserve missing booking, rating, distance and image', () => {
    const card = buildHotelCardViewModel(hotel({
      bookingUrl: null,
      rating: null,
      distanceMeters: null,
      imageUrl: null,
    }), null);
    assert.equal(card.canOpenBooking, false);
    assert.equal(card.ratingText, null);
    assert.equal(card.distanceText, null);
    assert.equal(card.imageUrl, null);
  });

  test('rating and distance render only when provider values really exist', () => {
    const card = buildHotelCardViewModel(hotel({ rating: 4.75, distanceMeters: 1350 }), null);
    assert.equal(card.ratingText, '4.8');
    assert.equal(card.distanceText, '1.4km');
  });
});

describe('Phase 4 hotel query and page states', () => {
  test('FILTER-01/FILTER-02 forwards Trip, max price and explicit star filters', () => {
    assert.deepEqual(buildHotelSearchParams({
      ...context,
      maxReferencePrice: 500,
      starFilter: '4-5',
      keyword: ' 世界之窗 ',
      sortBy: 'price_asc',
    }), {
      destination: '深圳',
      checkInDate: context.checkInDate,
      checkOutDate: context.checkOutDate,
      maxReferencePrice: 500,
      stars: [4, 5],
      keyword: '世界之窗',
      sortBy: 'price_asc',
    });
  });

  test('FILTER-03 exposes no rating sort option', () => {
    const source = readFileSync('src/screens/explore/HotelListScreen.tsx', 'utf8');
    assert.doesNotMatch(source, /value:\s*['"]rating['"]/);
    assert.match(source, /评分和精确距离暂无可靠实时字段/);
  });

  test('UI-H05/UI-H06/UI-H18 classify loading, empty, error and network failure', () => {
    assert.equal(getHotelContentState({ loading: true, errorMessage: null, hotelCount: 0 }), 'loading');
    assert.equal(getHotelContentState({ loading: false, errorMessage: null, hotelCount: 0 }), 'empty');
    assert.equal(getHotelContentState({ loading: false, errorMessage: '失败', hotelCount: 0 }), 'error');
    assert.match(getHotelSearchErrorMessage({ code: 'NETWORK_ERROR' }), /网络不可用/);
    assert.match(getHotelSearchErrorMessage({ code: 'HOTEL_INVALID_REQUEST' }), /行程日期或酒店筛选无效/);
  });

  test('UI-H01/UI-H05/UI-H06 page uses backend service and has no static fallback', () => {
    const source = readFileSync('src/screens/explore/HotelListScreen.tsx', 'utf8');
    assert.match(source, /travelHotelService\.search\(params\)/);
    assert.doesNotMatch(source, /from ['"]\.\.\/\.\.\/data\/hotels['"]/);
    assert.match(source, /hotel-loading-state/);
    assert.match(source, /hotel-empty-state/);
    assert.match(source, /hotel-error-state/);
  });

  test('newer query guards the state from a late older response', () => {
    const source = readFileSync('src/screens/explore/HotelListScreen.tsx', 'utf8');
    assert.match(source, /requestId !== latestRequestRef\.current/);
    assert.match(source, /cancelled/);
  });
});

describe('Phase 4 selectedHotel loop', () => {
  test('UI-H07/H08/H09 store, route and summary use one stable hotel ID', () => {
    const selected = hotel();
    useRouteStore.getState().selectHotel(selected, context);
    assert.equal(useRouteStore.getState().selectedHotel?.id, selected.id);
    assert.equal(buildSelectedHotelRouteInput()?.hotelId, selected.id);
    assert.equal(buildSelectedHotelItinerarySummary()?.hotelId, selected.id);
    assert.equal(buildSelectedHotelItinerarySummary()?.name, selected.name);
  });

  test('UI-H10 selected card is restored by stable ID', () => {
    const selected = hotel();
    useRouteStore.getState().selectHotel(selected, context);
    const reloadedResult = hotel({ priceText: '¥520', referencePrice: 520 });
    assert.equal(buildHotelCardViewModel(reloadedResult, useRouteStore.getState().selectedHotel?.id || null).isSelected, true);
  });

  test('UI-H11 selecting B replaces A', () => {
    useRouteStore.getState().selectHotel(hotel(), context);
    const hotelB = hotel({ id: 'fliggy:100002', sourceHotelId: '100002', name: '酒店 B' });
    useRouteStore.getState().selectHotel(hotelB, context);
    assert.equal(useRouteStore.getState().selectedHotel?.id, hotelB.id);
  });

  test('UI-H12 candidate filter changes do not clear the Trip selection', () => {
    const selected = hotel();
    useRouteStore.getState().selectHotel(selected, context);
    const currentCandidates = [hotel({ id: 'fliggy:other', sourceHotelId: 'other', name: '其他酒店' })];
    assert.equal(currentCandidates.some(candidate => candidate.id === selected.id), false);
    assert.equal(useRouteStore.getState().selectedHotel?.id, selected.id);
  });

  test('UI-H13 booking uses safe Linking and does not create a booked state', () => {
    const source = readFileSync('src/screens/explore/HotelListScreen.tsx', 'utf8');
    assert.match(source, /Linking\.canOpenURL\(hotel\.bookingUrl\)/);
    assert.match(source, /Linking\.openURL\(hotel\.bookingUrl\)/);
    assert.doesNotMatch(source, /bookedHotel|booked\s*=|预订成功/);
  });

  test('real route flow gates all legacy static room/search modals behind fixture mode', () => {
    const source = readFileSync('src/screens/custom/RoutePlanScreen.tsx', 'utf8');
    assert.match(source, /visible=\{ENABLE_STATIC_HOTEL_FIXTURES && showHotelDetail\}/);
    assert.match(source, /visible=\{ENABLE_STATIC_HOTEL_FIXTURES && showHotelSearch\}/);
    assert.match(source, /activeSelectedHotel\?\.id/);
  });
});
