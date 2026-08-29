import './setupNode';
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { useRouteStore } from '../src/store/useRouteStore';
import type { TransportRule } from '../src/types';
import type { HotelGeoResponse, TravelHotel, TripHotelContext } from '../src/types/hotel';
import type { TravelRouteEndpoint, TravelRouteSegment, TravelRoutesResponse } from '../src/types/travel';
import {
  buildHotelCoordinateCacheKey,
  clearHotelCoordinateCache,
  hydrateSelectedHotelGeography,
} from '../src/services/travelData/hotel/HotelGeoService';
import { buildRealDurationMatrix } from '../src/utils/realRouteMatrix';
import { MAX_ROUTE_MATRIX_CONCURRENCY } from '../src/utils/realRouteMatrix';
import {
  buildAmapRouteSegment,
  mapTransportPreferenceToAmapMode,
} from '../src/utils/amapRouteMapping';
import { buildSelectedHotelRouteInput } from '../src/utils/selectedHotelRouteBridge';
import { validateTravelRouteSegments } from '../src/utils/realRouteValidation';
import { usePreferenceStore } from '../src/store/usePreferenceStore';

const context: TripHotelContext = {
  destination: '北京',
  checkInDate: '2026-09-15',
  checkOutDate: '2026-09-17',
};

const transportRule: Pick<TransportRule, 'defaultMode'> = { defaultMode: 'transit' };

function hotel(id: string, overrides: Partial<TravelHotel> = {}): TravelHotel {
  return {
    id: `fliggy:${id}`,
    source: 'fliggy',
    sourceHotelId: id,
    name: `北京测试酒店 ${id}`,
    city: '北京',
    district: '东城区',
    address: `北京市东城区测试路${id}号`,
    latitude: 39.9,
    longitude: 116.4,
    coordinateSource: 'provider',
    coordinateVerified: false,
    geoStatus: 'unresolved',
    geoMatchLevel: null,
    geoConfidence: null,
    amapPoiId: null,
    geocodedAt: null,
    star: 4,
    starLabel: '高档型',
    rating: null,
    reviewCount: null,
    referencePrice: 500,
    priceText: '¥500',
    priceCurrency: 'CNY',
    priceType: 'search_reference',
    priceDisclaimer: '飞猪参考价，成交价以预订页为准。',
    originalPrice: null,
    roomInformation: null,
    roomAvailability: null,
    imageUrl: null,
    tags: [],
    facilities: null,
    distanceMeters: null,
    nearbyText: null,
    bookingUrl: null,
    checkInDate: context.checkInDate,
    checkOutDate: context.checkOutDate,
    ...overrides,
  };
}

function geoResponse(hotelId: string, latitude = 39.908, longitude = 116.397): HotelGeoResponse {
  return {
    hotelId,
    status: 'verified',
    matchLevel: 'strong',
    confidence: 0.88,
    latitude,
    longitude,
    coordinateSource: 'amap',
    coordinateVerified: true,
    amapPoiId: `amap:${hotelId}`,
    matchedName: '北京测试酒店',
    matchedAddress: '北京市东城区测试路',
    matchedDistrict: '东城区',
    provider: 'amap',
    calculatedAt: '2026-08-22T12:00:00Z',
    latencyMs: 25,
    rejectedWrongCityCount: 0,
    cached: false,
  };
}

function endpoint(id: string, latitude: number, longitude: number): TravelRouteEndpoint {
  return { id, name: id, location: { latitude, longitude } };
}

function routes(overrides: Partial<TravelRoutesResponse> = {}): TravelRoutesResponse {
  return {
    source: 'amap',
    city: { name: '北京', adcode: '110000', citycode: '010' },
    origin: '116.397,39.908',
    destination: '116.407,39.918',
    transit: { time: 36, distance: 12.4, price: 5, detail: '地铁1号线', transfers: 0 },
    driving: { time: 21, distance: 10.2, price: 38 },
    walking: { time: 150, distance: 10.5 },
    ...overrides,
  };
}

beforeEach(() => {
  useRouteStore.getState().resetRoute();
  clearHotelCoordinateCache();
  usePreferenceStore.setState({
    selectedCity: '北京',
    travelStartDate: context.checkInDate,
    travelReturnDate: context.checkOutDate,
  });
});

describe('Phase 5 hotel geography', () => {
  test('unverified FlyAI coordinates are hidden from route input', () => {
    useRouteStore.getState().selectHotel(hotel('A'), context);
    const routeInput = buildSelectedHotelRouteInput();
    assert.equal(routeInput?.hotelId, 'fliggy:A');
    assert.equal(routeInput?.latitude, null);
    assert.equal(routeInput?.longitude, null);
    assert.equal(routeInput?.coordinateVerified, false);
  });

  test('selectedHotel -> AMap geocode updates the same Store hotel', async () => {
    const selected = hotel('A');
    useRouteStore.getState().selectHotel(selected, context);
    const result = await hydrateSelectedHotelGeography(selected.id, context, async () => geoResponse(selected.id));

    assert.equal(result.status, 'verified');
    assert.equal(useRouteStore.getState().selectedHotel?.id, selected.id);
    assert.equal(useRouteStore.getState().selectedHotel?.coordinateSource, 'amap');
    assert.equal(useRouteStore.getState().selectedHotel?.latitude, 39.908);
    assert.equal(buildSelectedHotelRouteInput()?.latitude, 39.908);
  });

  test('late hotel A response cannot overwrite newly selected hotel B', async () => {
    const hotelA = hotel('A');
    const hotelB = hotel('B');
    let releaseA!: (response: HotelGeoResponse) => void;
    const delayedA = new Promise<HotelGeoResponse>(resolve => { releaseA = resolve; });

    useRouteStore.getState().selectHotel(hotelA, context);
    const pendingA = hydrateSelectedHotelGeography(hotelA.id, context, () => delayedA);
    useRouteStore.getState().selectHotel(hotelB, context);
    await hydrateSelectedHotelGeography(hotelB.id, context, async () => geoResponse(hotelB.id, 39.95, 116.45));
    releaseA(geoResponse(hotelA.id, 39.8, 116.3));
    const resultA = await pendingA;

    assert.equal(resultA.status, 'stale');
    assert.equal(useRouteStore.getState().selectedHotel?.id, hotelB.id);
    assert.equal(useRouteStore.getState().selectedHotel?.latitude, 39.95);
  });

  test('reference price changes do not invalidate the stable coordinate cache', async () => {
    const first = hotel('A', { referencePrice: 500, priceText: '¥500' });
    useRouteStore.getState().selectHotel(first, context);
    let calls = 0;
    await hydrateSelectedHotelGeography(first.id, context, async () => {
      calls += 1;
      return geoResponse(first.id);
    });
    const repriced = hotel('A', { referencePrice: 650, priceText: '¥650' });
    assert.equal(buildHotelCoordinateCacheKey(first, '北京'), buildHotelCoordinateCacheKey(repriced, '北京'));
    useRouteStore.getState().selectHotel(repriced, context);
    const result = await hydrateSelectedHotelGeography(repriced.id, context, async () => {
      calls += 1;
      return geoResponse(repriced.id);
    });

    assert.equal(result.cached, true);
    assert.equal(calls, 1);
    assert.equal(useRouteStore.getState().selectedHotel?.referencePrice, 650);
    assert.equal(useRouteStore.getState().selectedHotel?.coordinateVerified, true);
  });
});

describe('Phase 5 AMap route semantics', () => {
  test('existing transport preferences map centrally to AMap modes', () => {
    assert.equal(mapTransportPreferenceToAmapMode('driving', transportRule), 'driving');
    assert.equal(mapTransportPreferenceToAmapMode('transit', transportRule), 'transit');
    assert.equal(mapTransportPreferenceToAmapMode('walking', transportRule), 'walking');
    assert.equal(mapTransportPreferenceToAmapMode('any', { defaultMode: 'driving' }), 'driving');
  });

  test('route duration stays in minutes and distance maps km -> meters', () => {
    const segment = buildAmapRouteSegment(endpoint('hotel', 39.908, 116.397), endpoint('palace', 39.918, 116.407), routes(), 'driving');
    assert.equal(segment.durationMinutes, 21);
    assert.equal(segment.distanceMeters, 10_200);
    assert.equal(segment.provider, 'amap');
    assert.equal(segment.estimated, false);
  });

  test('missing route is null/unavailable, never duration 0', () => {
    const segment = buildAmapRouteSegment(endpoint('hotel', 39.908, 116.397), endpoint('palace', 39.918, 116.407), routes({ walking: null }), 'walking');
    assert.equal(segment.status, 'no_route');
    assert.equal(segment.durationMinutes, null);
    assert.equal(segment.distanceMeters, null);
    assert.equal(validateTravelRouteSegments([segment])[0]?.code, 'real_route_unavailable');
  });

  test('hotel -> attraction and attraction -> hotel both enter the real matrix', async () => {
    const nodes = [
      endpoint('hotel', 39.908, 116.397),
      endpoint('palace', 39.918, 116.407),
      endpoint('restaurant', 39.928, 116.417),
    ];
    const fetcher = async (origin: TravelRouteEndpoint, destination: TravelRouteEndpoint): Promise<TravelRouteSegment> => ({
      originId: origin.id,
      destinationId: destination.id,
      originName: origin.name,
      destinationName: destination.name,
      mode: 'transit',
      distanceMeters: 1_000,
      durationMinutes: origin.id === 'hotel' ? 18 : destination.id === 'hotel' ? 27 : 12,
      price: 4,
      detail: '真实高德测试段',
      provider: 'amap',
      calculatedAt: '2026-08-22T12:00:00Z',
      estimated: false,
      status: 'available',
    });
    const matrix = await buildRealDurationMatrix(nodes, 'transit', transportRule, fetcher);

    assert.deepEqual(matrix.node_ids, ['hotel', 'palace', 'restaurant']);
    assert.equal(matrix.durations[0][1], 18);
    assert.equal(matrix.durations[1][0], 27);
    assert.equal(matrix.durations[0][0], 0);
    assert.equal(matrix.segments.length, 6);
    assert.deepEqual(matrix.failedPairs, []);
  });

  test('matrix limits concurrent provider calls and returns partial failures', async () => {
    const nodes = Array.from({ length: 5 }, (_, index) => endpoint(`n${index}`, 39.9 + index / 100, 116.4 + index / 100));
    let active = 0;
    let peak = 0;
    const matrix = await buildRealDurationMatrix(nodes, 'transit', transportRule, async (origin, destination) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 1));
      active -= 1;
      if (origin.id === 'n0' && destination.id === 'n1') {
        return { originId: origin.id, destinationId: destination.id, originName: origin.name, destinationName: destination.name, mode: 'transit', distanceMeters: null, durationMinutes: null, price: null, detail: 'no route', provider: 'amap', calculatedAt: new Date().toISOString(), estimated: false, status: 'no_route' };
      }
      return { originId: origin.id, destinationId: destination.id, originName: origin.name, destinationName: destination.name, mode: 'transit', distanceMeters: 1_000, durationMinutes: 10, price: 4, detail: 'ok', provider: 'amap', calculatedAt: new Date().toISOString(), estimated: false, status: 'available' };
    });
    assert.ok(peak <= MAX_ROUTE_MATRIX_CONCURRENCY);
    assert.equal(matrix.failedPairs?.length, 1);
    assert.equal(matrix.durations[0][1], 0);
  });
});
