import './setupNode';
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { usePreferenceStore } from '../src/store/usePreferenceStore';
import { useRouteStore } from '../src/store/useRouteStore';
import { TravelHotel, TripHotelContext } from '../src/types/hotel';
import {
  buildSelectedHotelItinerarySummary,
  buildSelectedHotelRouteInput,
  getSelectedHotelForCurrentTrip,
} from '../src/utils/selectedHotelRouteBridge';

const context: TripHotelContext = {
  destination: '深圳',
  checkInDate: '2026-09-15',
  checkOutDate: '2026-09-17',
};

function hotel(sourceHotelId: string, name: string): TravelHotel {
  return {
    id: `fliggy:${sourceHotelId}`,
    source: 'fliggy',
    sourceHotelId,
    name,
    city: null,
    district: null,
    address: null,
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
    referencePrice: 499,
    priceText: '¥499',
    priceCurrency: 'CNY',
    priceType: 'search_reference',
    priceDisclaimer: '搜索参考价，最终价格以飞猪预订页为准。',
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
  };
}

const hotelA = hotel('A', '酒店 A');
const hotelB = hotel('B', '酒店 B');

beforeEach(() => {
  useRouteStore.getState().resetRoute();
  usePreferenceStore.setState({
    selectedCity: context.destination,
    travelStartDate: context.checkInDate,
    travelReturnDate: context.checkOutDate,
    hotelPriceRange: { min: 0, max: 2000 },
  });
});

describe('Trip selectedHotel single source', () => {
  test('Store 01: choosing A stores A on the current Trip', () => {
    useRouteStore.getState().selectHotel(hotelA, context);
    assert.equal(useRouteStore.getState().selectedHotel?.id, hotelA.id);
    assert.equal(useRouteStore.getState().getSelectedHotelForTrip(context)?.id, hotelA.id);
  });

  test('Store 02: choosing B replaces A and keeps only one selection', () => {
    useRouteStore.getState().selectHotel(hotelA, context);
    useRouteStore.getState().selectHotel(hotelB, context);
    assert.equal(useRouteStore.getState().selectedHotel?.id, hotelB.id);
    assert.notEqual(useRouteStore.getState().selectedHotel?.id, hotelA.id);
  });

  test('Store 03: clear removes the current Trip hotel', () => {
    useRouteStore.getState().selectHotel(hotelA, context);
    useRouteStore.getState().clearSelectedHotel();
    assert.equal(useRouteStore.getState().selectedHotel, null);
    assert.equal(useRouteStore.getState().selectedHotelContext, null);
  });

  test('Store 04: unrelated preference changes do not alter selectedHotel', () => {
    useRouteStore.getState().selectHotel(hotelA, context);
    usePreferenceStore.getState().setHotelPriceRange({ min: 300, max: 900 });
    assert.equal(useRouteStore.getState().selectedHotel?.id, hotelA.id);
  });

  test('Store 05: destination switch cannot leak the old Trip hotel', () => {
    useRouteStore.getState().selectHotel(hotelA, context);
    usePreferenceStore.getState().setSelectedCity('北京');
    assert.equal(getSelectedHotelForCurrentTrip(), null);
    assert.equal(useRouteStore.getState().selectedHotel, null);
  });

  test('store, route input builder and itinerary summary expose the same hotel ID', () => {
    useRouteStore.getState().selectHotel(hotelA, context);
    const storeId = useRouteStore.getState().selectedHotel?.id;
    const routeId = buildSelectedHotelRouteInput()?.hotelId;
    const summaryId = buildSelectedHotelItinerarySummary()?.hotelId;
    assert.equal(storeId, hotelA.id);
    assert.equal(routeId, hotelA.id);
    assert.equal(summaryId, hotelA.id);
  });
});
