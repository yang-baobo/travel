import type { PlanIntent, PlanningRequest, TripPlanDraft } from '../src/types/planning';
import type { TravelPlace } from '../src/types/travel';

export function place(id: string, category: TravelPlace['category'] = 'attraction'): TravelPlace {
  return {
    id,
    source: 'amap',
    category,
    city: '北京',
    name: category === 'restaurant' ? `北京餐厅 ${id}` : `北京景点 ${id}`,
    address: '北京市东城区测试路',
    district: '东城区',
    location: { latitude: 39.91 + id.length * 0.001, longitude: 116.39 + id.length * 0.001 },
    typeName: category === 'restaurant' ? '中餐厅' : '风景名胜',
    typeCode: category === 'restaurant' ? '050100' : '110000',
    rating: 4.5,
    cost: category === 'restaurant' ? 80 : 40,
    phone: '',
    openHours: category === 'restaurant' ? '11:00-21:00' : '09:00-18:00',
    businessArea: '东城区',
    tags: category === 'restaurant' ? ['北京菜'] : ['文化'],
    photoUrls: [],
    booking: { enabled: false, provider: category === 'restaurant' ? 'meituan' : 'ctrip', label: '查看', url: null },
  };
}

export function planningRequest(overrides: Partial<PlanningRequest> = {}): PlanningRequest {
  const selected = place('amap:selected');
  return {
    userInput: '带父母轻松游北京',
    inputMethod: 'text',
    mode: 'complete',
    city: '北京',
    days: 2,
    people: 2,
    totalBudget: 5000,
    pace: 'relaxed',
    candidates: [{
      source: 'amap',
      sourceId: selected.id,
      name: selected.name,
      category: selected.category,
      latitude: selected.location.latitude,
      longitude: selected.location.longitude,
      originalPlace: selected,
    }],
    preferenceSnapshot: {
      selectedCategories: ['文化'],
      cuisines: [],
      needHotel: false,
      hotelLevel: 'any',
      hotelZone: 'any',
      hotelPriceRange: { min: 0, max: 1500 },
      hotelAmenities: [],
      needLunch: true,
      needDinner: true,
      lunchLatestEndTime: '14:00',
      dinnerLatestEndTime: '20:00',
      transportPreference: 'transit',
      transportRule: { walkMaxKm: 1, defaultMode: 'transit', maxTransitMinutes: 60, maxWalkToStationKm: 1 },
      travelStartDate: '2026-09-15',
      travelReturnDate: '2026-09-16',
      dailyStartTime: '09:00',
      dailyEndTime: '19:00',
      elderlyMode: true,
    },
    hardConstraints: {
      forbidden: [],
      dietaryAllergies: [],
      noNightActivity: true,
      maxWalkingMinutesPerDay: 90,
      maxWalkingMinutesPerSegment: 20,
      mobilityLimitations: ['膝盖不适'],
    },
    ...overrides,
  };
}

export function intent(request = planningRequest()): PlanIntent {
  return {
    needsClarification: false,
    clarificationQuestions: [],
    normalizedRequest: {
      userInput: request.userInput,
      city: '北京',
      days: request.days,
      people: request.people,
      totalBudget: request.totalBudget,
      pace: request.pace,
      mode: request.mode,
    },
    requestPatch: {},
    explanation: 'GLM 已根据结构化字段确认请求。',
    provider: 'remote_glm',
    model: 'glm-test',
  };
}

export function draft(overrides: Partial<TripPlanDraft> = {}): TripPlanDraft {
  const request = planningRequest();
  const selected = request.candidates[0].originalPlace;
  return {
    id: 'draft-test',
    sessionId: 'planning-test',
    title: '2天北京真实路线',
    city: '北京',
    request,
    intent: intent(request),
    hotel: null,
    days: [{
      day: 1,
      date: '2026-09-15',
      travelMinutes: 0,
      stops: [{ id: 'stop-test', day: 1, arrivalTime: '09:00', endTime: '11:30', durationMinutes: 150, place: selected, transportToNext: null }],
    }, { day: 2, date: '2026-09-16', travelMinutes: 0, stops: [] }],
    unassignedPlaces: [],
    warnings: [],
    uncertainties: [],
    blockingIssues: [],
    knownCostTotal: 80,
    costCoverage: 'complete',
    providers: ['amap', 'google-or-tools'],
    createdAt: '2026-08-26T00:00:00.000Z',
    ...overrides,
  };
}
