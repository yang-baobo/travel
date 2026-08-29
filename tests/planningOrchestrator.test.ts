import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createPlanningOrchestrator } from '../src/services/planningOrchestrator';
import type { TravelRouteSegment } from '../src/types/travel';
import { intent, place, planningRequest } from './planningFixtures';

describe('Planning Orchestrator', () => {
  test('uses provider places, real route matrix and optimizer without static fallback', async () => {
    const request = planningRequest();
    const restaurant = place('amap:restaurant', 'restaurant');
    let matrixNodeIds: string[] = [];
    let optimizedIds: string[] = [];
    const placeKeywords: Record<string, string | undefined> = {};
    const orchestrator = createPlanningOrchestrator({
      getIntent: async () => intent(request),
      searchPlaces: async (category, keyword) => {
        placeKeywords[category] = keyword;
        return ({
        city: { name: '北京', adcode: '110000', citycode: '010' },
        category,
        source: 'amap',
        page: 1,
        pageSize: 10,
        total: category === 'restaurant' ? 1 : 0,
        hasMore: false,
        items: category === 'restaurant' ? [restaurant] : [],
        });
      },
      searchHotels: async () => { throw new Error('hotel should not be queried'); },
      buildMatrix: async nodes => {
        matrixNodeIds = nodes.map(node => node.id);
        const segments: TravelRouteSegment[] = nodes.flatMap(origin => nodes.filter(destination => destination.id !== origin.id).map(destination => ({
          originId: origin.id,
          destinationId: destination.id,
          originName: origin.name,
          destinationName: destination.name,
          mode: 'transit' as const,
          distanceMeters: 1000,
          durationMinutes: 20,
          price: 4,
          detail: '真实高德测试段',
          provider: 'amap' as const,
          calculatedAt: '2026-08-26T00:00:00.000Z',
          estimated: false as const,
          status: 'available' as const,
        })));
        return { node_ids: matrixNodeIds, durations: [[0, 20], [20, 0]], segments };
      },
      optimize: async payload => {
        optimizedIds = payload.attractions.map(item => item.id);
        return {
          solver: 'google-or-tools',
          status: 'optimized',
          days: [{
            day: 1,
            attraction_ids: optimizedIds,
            stops: optimizedIds.map((id, index) => ({ attraction_id: id, arrival_minute: 540 + index * 180, end_minute: 690 + index * 180 })),
            travel_minutes: 20,
          }, { day: 2, attraction_ids: [], stops: [], travel_minutes: 0 }],
          unassigned_attraction_ids: [],
          total_travel_minutes: 20,
          solve_time_ms: 3,
        };
      },
      now: () => new Date('2026-08-26T00:00:00.000Z'),
    });

    const result = await orchestrator.plan({ sessionId: 'planning-test', request, messages: [] });
    assert.deepEqual(matrixNodeIds.sort(), ['amap:restaurant', 'amap:selected'].sort());
    assert.deepEqual(optimizedIds.sort(), ['amap:restaurant', 'amap:selected'].sort());
    assert.equal(placeKeywords.attraction, '博物馆');
    assert.equal(result.draft?.providers.includes('amap'), true);
    assert.equal(result.draft?.providers.includes('google-or-tools'), true);
    assert.equal(result.draft?.days[0].stops[0].place.source, 'amap');
  });

  test('returns an explicit reason instead of scheduling unverified hours', async () => {
    const invalid = place('amap:no-hours');
    invalid.openHours = '';
    const request = planningRequest({
      mode: 'self',
      candidates: [{ source: 'amap', sourceId: invalid.id, name: invalid.name, category: invalid.category, latitude: invalid.location.latitude, longitude: invalid.location.longitude, originalPlace: invalid }],
    });
    const orchestrator = createPlanningOrchestrator({
      getIntent: async () => intent(request),
      searchPlaces: async category => ({ city: { name: '北京', adcode: '110000', citycode: '010' }, category, source: 'amap', page: 1, pageSize: 1, total: 0, hasMore: false, items: [] }),
      buildMatrix: async () => { throw new Error('matrix must not run'); },
      optimize: async () => { throw new Error('optimizer must not run'); },
    });
    const result = await orchestrator.plan({ sessionId: 'planning-test', request, messages: [] });
    assert.equal(result.draft?.unassignedPlaces[0].reasonCode, 'hours_unverified');
    assert.match(result.draft?.blockingIssues.join(' ') || '', /没有同时满足/);
  });

  test('uses FlyAI provider ranking and forwards the structured hotel level', async () => {
    const base = planningRequest();
    const request = planningRequest({
      preferenceSnapshot: { ...base.preferenceSnapshot, needHotel: true, hotelLevel: 'luxury' },
    });
    let hotelSort: string | undefined;
    let hotelStars: number[] | undefined;
    const orchestrator = createPlanningOrchestrator({
      getIntent: async () => intent(request),
      searchPlaces: async category => ({ city: { name: '北京', adcode: '110000', citycode: '010' }, category, source: 'amap', page: 1, pageSize: 1, total: 0, hasMore: false, items: [] }),
      searchHotels: async params => {
        hotelSort = params.sortBy;
        hotelStars = params.stars;
        return {
          hotels: [],
          meta: {
            source: 'fliggy',
            count: 0,
            queryStatus: 'no_results',
            priceMeaning: 'search_reference',
            priceDisclaimer: 'FlyAI 查询参考价',
            nearbyPrecision: 'not_requested',
            ratingAvailable: false,
          },
        };
      },
      buildMatrix: async () => { throw new Error('hotel sort contract test stops before route use'); },
      optimize: async () => { throw new Error('optimizer must not run'); },
    });

    await orchestrator.plan({ sessionId: 'planning-hotel-contract', request, messages: [] });
    assert.equal(hotelSort, 'none');
    assert.notEqual(hotelSort, 'rating');
    assert.deepEqual(hotelStars, [5]);
  });

  test('screens high-effort places and promotes door-to-door transport for mobility limits', async () => {
    const wall = { ...place('amap:badaling'), name: '八达岭长城', typeName: '风景名胜' };
    const accessible = { ...place('amap:accessible'), name: '东城区文化馆', typeName: '文化场馆' };
    const base = planningRequest();
    const request = planningRequest({
      mode: 'self',
      candidates: [
        { source: 'amap', sourceId: wall.id, name: wall.name, category: wall.category, latitude: wall.location.latitude, longitude: wall.location.longitude, originalPlace: wall },
        { source: 'amap', sourceId: accessible.id, name: accessible.name, category: accessible.category, latitude: accessible.location.latitude, longitude: accessible.location.longitude, originalPlace: accessible },
      ],
      preferenceSnapshot: { ...base.preferenceSnapshot, needLunch: false, needDinner: false, elderlyMode: true },
      hardConstraints: { ...base.hardConstraints, mobilityLimitations: ['两位同行父母腿脚不便'], maxWalkingMinutesPerDay: 60, maxWalkingMinutesPerSegment: 10 },
      transportPlan: { primary: 'driving', fallback: 'transit', maxWalkingMinutesPerSegment: 10, reason: '行动便利' },
      derivedConstraints: [{ id: 'mobility-limited', type: 'limited_mobility', sourceText: '父母腿脚不太好', source: 'text', confidence: 0.92, severity: 'hard', explanation: '减少步行', assumptions: [], requiresConfirmation: true }],
    });
    let selectedModes: string[] = [];
    let reservedMinutes = 0;
    const orchestrator = createPlanningOrchestrator({
      getIntent: async () => intent(request),
      searchPlaces: async category => ({ city: { name: '北京', adcode: '110000', citycode: '010' }, category, source: 'amap', page: 1, pageSize: 1, total: 0, hasMore: false, items: [] }),
      buildMatrix: async (nodes, mode) => {
        selectedModes.push(mode);
        const ids = nodes.map(node => node.id);
        return { node_ids: ids, durations: ids.map(() => ids.map(() => 20)), segments: [] };
      },
      optimize: async payload => {
        reservedMinutes = payload.days[0].reserved_minutes;
        return ({
        solver: 'google-or-tools', status: 'optimized',
        days: payload.days.map(day => ({ day: day.day, attraction_ids: day.day === 1 ? ['amap:accessible'] : [], stops: day.day === 1 ? [{ attraction_id: 'amap:accessible', arrival_minute: 540, end_minute: 660 }] : [], travel_minutes: 0 })),
        unassigned_attraction_ids: [], total_travel_minutes: 0, solve_time_ms: 1,
        });
      },
    });
    const result = await orchestrator.plan({ sessionId: 'planning-mobility', request, messages: [] });
    assert.deepEqual(selectedModes, ['driving']);
    assert.equal(reservedMinutes, 90);
    assert.equal(result.draft?.unassignedPlaces.find(item => item.sourceId === wall.id)?.reasonCode, 'mobility_conflict');
    assert.equal(result.draft?.days[0].stops[0].place.name, accessible.name);
  });
});
