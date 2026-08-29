import { requestPlanningIntent } from './aiService';
import {
  buildAmapDurationMatrix,
  isAttractionClosedOnDate,
  optimizeTravelRoute,
  type RouteOptimizationRequest,
  type RouteOptimizationResponse,
} from './routeOptimizationService';
import { resolveTravelHotelGeography, searchTravelPlaces } from './travelDataService';
import { travelHotelService } from './travelData/hotel/TravelHotelService';
import type { HotelGeoResponse, HotelSearchParams, HotelSearchResponse, TravelHotel } from '../types/hotel';
import type {
  PlanIntent,
  PlanningMessage,
  PlanningRequest,
  PlanningSessionStatus,
  TripPlanDraft,
  TripPlanDraftDay,
  TripPlanDraftStop,
  UnassignedPlace,
  PlanningCandidatePlace,
  PlanningPlaceMention,
  PlanningIssue,
} from '../types/planning';
import type {
  TravelPlace,
  TravelPlaceCategory,
  TravelPlaceListResponse,
  TravelRouteEndpoint,
  TravelRouteSegment,
} from '../types/travel';
import { buildLocalPlanIntent } from '../utils/planIntentSchema';
import { categories } from '../data/categories';
import { applyPlanningPatch } from './planningPatch';
import { assessPlaceAccessibility, isMobilityConflict, mobilityExplanation } from './mobilityPolicy';

export interface PlanningProgress {
  status: Extract<PlanningSessionStatus, 'understanding' | 'querying_places' | 'calculating_transport'>;
  message: string;
}

export interface PlanningOutcome {
  intent: PlanIntent;
  request: PlanningRequest;
  draft: TripPlanDraft | null;
}

export interface PlanningOrchestratorDependencies {
  getIntent: (request: PlanningRequest, messages: PlanningMessage[]) => Promise<PlanIntent>;
  searchPlaces: (
    category: TravelPlaceCategory,
    keyword?: string,
    page?: number,
    pageSize?: number,
  ) => Promise<TravelPlaceListResponse>;
  searchHotels: (params: HotelSearchParams) => Promise<HotelSearchResponse>;
  geocodeHotel: typeof resolveTravelHotelGeography;
  buildMatrix: typeof buildAmapDurationMatrix;
  optimize: (payload: RouteOptimizationRequest) => Promise<RouteOptimizationResponse>;
  now: () => Date;
}

const DEFAULT_DEPENDENCIES: PlanningOrchestratorDependencies = {
  getIntent: requestPlanningIntent,
  searchPlaces: searchTravelPlaces,
  searchHotels: params => travelHotelService.search(params),
  geocodeHotel: resolveTravelHotelGeography,
  buildMatrix: buildAmapDurationMatrix,
  optimize: optimizeTravelRoute,
  now: () => new Date(),
};

function addDays(date: string, amount: number): string {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + amount);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function attractionKeyword(request: PlanningRequest): string {
  const names = request.preferenceSnapshot.selectedCategories.map(id => categories.find(item => item.id === id)?.name || id);
  const combined = `${names.join(' ')} ${request.userInput}`;
  if (/历史|文化|建筑|博物/.test(combined)) return '博物馆';
  if (/艺术|展览|美术/.test(combined)) return '美术馆';
  if (/自然|生态|公园|户外/.test(combined)) return '公园';
  if (/亲子|乐园/.test(combined)) return '亲子景点';
  if (/购物|科技/.test(combined)) return '购物中心';
  if (/摄影|打卡/.test(combined)) return '北京景点';
  return '';
}

function restaurantKeyword(request: PlanningRequest): string {
  if (request.preferenceSnapshot.cuisines.length) return request.preferenceSnapshot.cuisines[0];
  if (/咖啡/.test(request.userInput)) return '咖啡馆';
  if (/素食/.test(request.userInput)) return '素食';
  if (/火锅/.test(request.userInput)) return '火锅';
  if (/北京菜|北京美食|烤鸭/.test(request.userInput)) return '北京菜';
  return '';
}

function clockToMinutes(value: string, fallback: number): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return fallback;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return Number.isFinite(minutes) && minutes >= 0 && minutes < 1440 ? minutes : fallback;
}

function minutesToClock(value: number): string {
  const normalized = Math.max(0, Math.min(1439, Math.round(value)));
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function uniquePlaces(places: TravelPlace[]): TravelPlace[] {
  return [...new Map(places.map(place => [place.id, place])).values()];
}

function normalizePlaceName(value: string): string {
  return value.normalize('NFKC').replace(/^北京市/, '').replace(/[\s（）()·•—\-]/g, '').toLowerCase();
}

const VERIFIED_PLACE_ALIASES: Record<string, string> = {
  [normalizePlaceName('故宫')]: normalizePlaceName('故宫博物院'),
};

function distanceMeters(a: TravelPlace, b: TravelPlace): number {
  const lat = (a.location.latitude - b.location.latitude) * 111_000;
  const lng = (a.location.longitude - b.location.longitude) * 85_000;
  return Math.sqrt(lat * lat + lng * lng);
}

function exactMentionMatch(mention: PlanningPlaceMention, places: TravelPlace[]): TravelPlace | null {
  const name = VERIFIED_PLACE_ALIASES[normalizePlaceName(mention.name)] || normalizePlaceName(mention.name);
  const matches = places.filter(place => normalizePlaceName(place.name) === name);
  if (matches.length === 1) return matches[0];
  // A same-name result is safe only when there is a single provider entity in
  // this response. Never bind a fuzzy/substring match to a route.
  return null;
}

function candidateFromPlace(place: TravelPlace): PlanningCandidatePlace {
  return { source: place.source, sourceId: place.id, name: place.name, category: place.category, latitude: place.location.latitude, longitude: place.location.longitude, originalPlace: place };
}

function validCoordinate(place: TravelPlace): boolean {
  return Number.isFinite(place.location.latitude)
    && Number.isFinite(place.location.longitude)
    && place.location.latitude >= 39
    && place.location.latitude <= 41
    && place.location.longitude >= 115
    && place.location.longitude <= 118;
}

function verifiedOpeningWindows(place: TravelPlace): [number, number][] | null {
  const text = place.openHours.trim();
  if (!text) return null;
  if (/全天|24小时/.test(text)) return [[0, 1440]];
  const windows: [number, number][] = [];
  for (const match of text.matchAll(/(\d{1,2}):(\d{2})\s*[-–—至]\s*(\d{1,2}):(\d{2})/g)) {
    const start = Number(match[1]) * 60 + Number(match[2]);
    const end = Number(match[3]) * 60 + Number(match[4]);
    if (start >= 0 && start < 1440 && end > start && end <= 1440) windows.push([start, end]);
  }
  return windows.length > 0 ? windows : null;
}

function intersectWindows(windows: [number, number][], bounds: [number, number][]): [number, number][] {
  const result: [number, number][] = [];
  windows.forEach(([start, end]) => bounds.forEach(([boundStart, boundEnd]) => {
    const overlap: [number, number] = [Math.max(start, boundStart), Math.min(end, boundEnd)];
    if (overlap[1] - overlap[0] >= 30) result.push(overlap);
  }));
  return result;
}

function durationFor(place: TravelPlace, request: PlanningRequest): number {
  if (place.category === 'restaurant') return 75;
  if (request.pace === 'packed') return 90;
  if (request.pace === 'relaxed' || request.preferenceSnapshot.elderlyMode) return 150;
  return 120;
}

function includesAny(text: string, terms: string[]): string | null {
  const normalized = text.toLowerCase();
  return terms.find(term => term.trim() && normalized.includes(term.trim().toLowerCase())) || null;
}

function hotelGeoRequest(hotel: TravelHotel, destination: string) {
  return {
    hotelId: hotel.id,
    source: hotel.source,
    sourceHotelId: hotel.sourceHotelId,
    name: hotel.name,
    destination,
    city: hotel.city,
    district: hotel.district,
    address: hotel.address,
  };
}

function hotelStarsForPreference(level: string): number[] | undefined {
  if (level === 'budget') return [2, 3];
  if (level === 'mid') return [3, 4];
  if (level === 'luxury') return [5];
  return undefined;
}

function issueFromError(error: unknown, provider: PlanningIssue['provider'], fallback: string, blocking = false): PlanningIssue {
  const candidate = error as { code?: unknown; retryable?: unknown } | null;
  const code = typeof candidate?.code === 'string' ? candidate.code : 'PROVIDER_REQUEST_FAILED';
  return { code, provider, message: fallback, retryable: candidate?.retryable !== false, blocking };
}

function withVerifiedHotelGeo(hotel: TravelHotel, geo: HotelGeoResponse): TravelHotel | null {
  if (!geo.coordinateVerified || geo.coordinateSource !== 'amap' || geo.latitude === null || geo.longitude === null) return null;
  return {
    ...hotel,
    latitude: geo.latitude,
    longitude: geo.longitude,
    coordinateSource: 'amap',
    coordinateVerified: true,
    geoStatus: 'verified',
    geoMatchLevel: geo.matchLevel,
    geoConfidence: geo.confidence,
    amapPoiId: geo.amapPoiId,
    geocodedAt: geo.calculatedAt,
  };
}

async function selectVerifiedHotel(
  response: HotelSearchResponse,
  destination: string,
  geocode: PlanningOrchestratorDependencies['geocodeHotel'],
  preferences?: PlanningRequest['preferenceSnapshot'],
  excludedIds: Set<string> = new Set(),
): Promise<{ hotel: TravelHotel | null; rejected: UnassignedPlace[] }> {
  const rejected: UnassignedPlace[] = [];
  const verifiedHotels: TravelHotel[] = [];
  // A single planning request must not geocode every raw supplier result.
  // Three candidates are enough for a resilient choice and keep AMap traffic
  // bounded when FlyAI returns a long list.
  for (const hotel of response.hotels.slice(0, 3)) {
    if (excludedIds.has(hotel.id) || excludedIds.has(hotel.sourceHotelId)) continue;
    try {
      const verified = withVerifiedHotelGeo(hotel, await geocode(hotelGeoRequest(hotel, destination)));
      if (verified) { verifiedHotels.push(verified); continue; }
      rejected.push({
        sourceId: hotel.sourceHotelId,
        name: hotel.name,
        category: 'hotel',
        reasonCode: 'hotel_location_unverified',
        reason: 'FlyAI 酒店未能通过高德坐标核验，不能作为正式路线锚点。',
      });
    } catch (error) {
      rejected.push({
        sourceId: hotel.sourceHotelId,
        name: hotel.name,
        category: 'hotel',
        reasonCode: 'hotel_location_unverified',
        reason: '酒店位置核验暂时失败，已跳过该候选。',
      });
      const code = (error as { code?: unknown } | null)?.code;
      // A provider outage is not fixed by trying every hotel. Stop after the
      // first bounded failure and let the draft surface a retryable issue.
      if (typeof code === 'string' && /^(?:TIMEOUT|NETWORK_ERROR|AMAP_|PROVIDER_)/.test(code)) break;
    }
  }
  if (verifiedHotels.length === 0) return { hotel: null, rejected };
  // Rank the bounded verified candidates. Missing fields are neutral and are
  // surfaced as uncertainty later.
  const ranked = [...verifiedHotels].sort((a, b) => {
    const score = (hotel: TravelHotel) => {
      const text = [hotel.name, hotel.district, hotel.address, ...(hotel.facilities || []), ...(hotel.tags || [])].filter(Boolean).join(' ');
      const zone = preferences?.hotelZone && preferences.hotelZone !== 'any' ? (text.includes(preferences.hotelZone) ? 18 : 0) : 0;
      const facilities = preferences?.hotelAmenities?.filter(item => text.includes(item)).length || 0;
      const price = hotel.referencePrice === null ? 0 : Math.max(0, 1000 - hotel.referencePrice) / 100;
      return (hotel.rating || 0) * 12 + price + (hotel.coordinateVerified ? 25 : 0) + zone + facilities * 5;
    };
    return score(b) - score(a);
  });
  return { hotel: ranked[0], rejected };
}

function findSegment(
  segments: TravelRouteSegment[],
  originId: string,
  destinationId: string | null,
): TravelRouteSegment | null {
  if (!destinationId) return null;
  return segments.find(segment => segment.originId === originId && segment.destinationId === destinationId) || null;
}

function validateWalkingLimits(
  days: TripPlanDraftDay[],
  request: PlanningRequest,
): string[] {
  const issues: string[] = [];
  days.forEach(day => {
    const segments = day.stops.map(stop => stop.transportToNext).filter(Boolean) as TravelRouteSegment[];
    const walkingSegments = segments.filter(segment => segment.mode === 'walking');
    const dailyMinutes = walkingSegments.reduce((sum, segment) => sum + (segment.durationMinutes || 0), 0);
    const dayLimit = request.dayConstraints?.find(item => item.day === day.day)?.maxWalkingMinutes ?? request.hardConstraints.maxWalkingMinutesPerDay;
    if (dailyMinutes > dayLimit) {
      issues.push(`第${day.day}天步行 ${dailyMinutes} 分钟，超过每日上限 ${dayLimit} 分钟。`);
    }
    walkingSegments.forEach(segment => {
      const segmentLimit = request.hardConstraints.maxWalkingMinutesPerSegment;
      if ((segment.durationMinutes || 0) > segmentLimit) {
        issues.push(`${segment.originName} → ${segment.destinationName} 步行超过单段上限。`);
      }
    });
  });
  return issues;
}

function planDays(input: {
  request: PlanningRequest;
  optimization: RouteOptimizationResponse;
  places: Map<string, TravelPlace>;
  segments: TravelRouteSegment[];
  hotel: TravelHotel | null;
}): TripPlanDraftDay[] {
  return input.optimization.days.map(day => {
    const stops: TripPlanDraftStop[] = day.stops.flatMap((stop, index) => {
      const place = input.places.get(stop.attraction_id);
      if (!place) return [];
      const nextId = day.stops[index + 1]?.attraction_id || input.hotel?.id || null;
      return [{
        id: `draft-stop-${day.day}-${place.id}`,
        day: day.day,
        arrivalTime: minutesToClock(stop.arrival_minute),
        endTime: minutesToClock(stop.end_minute),
        durationMinutes: Math.max(1, stop.end_minute - stop.arrival_minute),
        place,
        transportToNext: findSegment(input.segments, place.id, nextId),
      }];
    });
    return {
      day: day.day,
      date: addDays(input.request.preferenceSnapshot.travelStartDate, day.day - 1),
      stops,
      travelMinutes: day.travel_minutes,
    };
  });
}

export function createPlanningOrchestrator(
  dependencies: Partial<PlanningOrchestratorDependencies> = {},
) {
  const deps = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  return {
    async plan(input: {
      sessionId: string;
      request: PlanningRequest;
      messages: PlanningMessage[];
      onProgress?: (progress: PlanningProgress) => void;
    }): Promise<PlanningOutcome> {
      const progress = (status: PlanningProgress['status'], message: string) => input.onProgress?.({ status, message });
      progress('understanding', '正在理解你的时间、预算与硬性限制');

      let intent: PlanIntent;
      try {
        intent = await deps.getIntent(input.request, input.messages);
      } catch (error) {
        intent = buildLocalPlanIntent(input.request, error instanceof Error ? error.message : '远端响应失败');
      }
      let request: PlanningRequest = { ...input.request, ...intent.requestPatch };
      if (intent.planningPatch) {
        request = applyPlanningPatch(request, intent.planningPatch, request.userInput);
      }
      if (intent.needsClarification) return { intent, request, draft: null };

      progress('querying_places', '正在查询高德真实地点与 FlyAI 酒店');
      const selected = uniquePlaces([
        ...request.candidates.map(candidate => candidate.originalPlace),
        ...(request.mustVisitCandidates || []).map(candidate => candidate.originalPlace),
        ...(request.preferredCandidates || []).map(candidate => candidate.originalPlace),
      ]);
      const targetAttractions = Math.min(6, Math.max(3, request.days + 1));
      const mealSlotsPerDay = request.preferenceSnapshot.needLunch && request.preferenceSnapshot.needDinner ? 2 : 1;
      const targetRestaurants = Math.min(10, Math.max(1, request.days * mealSlotsPerDay));
      const shouldDiscover = request.mode !== 'self';
      const mentionKeywords = (request.unresolvedPlaceMentions || []).filter(item => item.intent !== 'avoid' && item.intent !== 'remove').map(item => item.name);
      const attractionKeywords = Array.from(new Set([attractionKeyword(request), ...mentionKeywords].filter(Boolean))).slice(0, 6);
      const attractionPromise = shouldDiscover
        ? Promise.all(attractionKeywords.length ? attractionKeywords.map(keyword => deps.searchPlaces('attraction', keyword, 1, targetAttractions)) : [deps.searchPlaces('attraction', '', 1, targetAttractions)])
        : Promise.resolve([]);
      const shouldArrangeMeals = request.preferenceSnapshot.needLunch || request.preferenceSnapshot.needDinner;
      const restaurantKeywords = Array.from(new Set([restaurantKeyword(request), ...request.preferenceSnapshot.cuisines].filter(Boolean))).slice(0, 4);
      const restaurantPromise = shouldArrangeMeals
        ? Promise.all(restaurantKeywords.length ? restaurantKeywords.map(keyword => deps.searchPlaces('restaurant', keyword, 1, targetRestaurants)) : [deps.searchPlaces('restaurant', '', 1, targetRestaurants)])
        : Promise.resolve([]);
      const hotelBudget = request.totalBudget
        ? Math.max(1, Math.floor(request.totalBudget * 0.45 / Math.max(1, request.days - 1)))
        : request.preferenceSnapshot.hotelPriceRange.max;
      const hotelPromise = request.preferenceSnapshot.needHotel
        ? deps.searchHotels({
            destination: '北京',
            checkInDate: request.preferenceSnapshot.travelStartDate,
            checkOutDate: addDays(request.preferenceSnapshot.travelStartDate, Math.max(1, request.days - 1)),
            maxReferencePrice: Math.min(hotelBudget, request.preferenceSnapshot.hotelPriceRange.max),
            stars: hotelStarsForPreference(request.preferenceSnapshot.hotelLevel),
            sortBy: 'none',
          })
        : Promise.resolve(null);
      const [attractionsResult, restaurantsResult, hotelsResult] = await Promise.allSettled([
        attractionPromise,
        restaurantPromise,
        hotelPromise,
      ]);

      const warnings: string[] = [];
      const uncertainties: string[] = [];
      const blockingIssues: string[] = [];
      const issues: PlanningIssue[] = [];
      const unassignedPlaces: UnassignedPlace[] = [];
      if (intent.provider === 'local_fallback') warnings.push(intent.explanation);
      warnings.push(...mobilityExplanation(request));
      if (attractionsResult.status === 'rejected') {
        warnings.push('高德景点查询失败，仅保留用户已选的真实候选地点。');
        issues.push(issueFromError(attractionsResult.reason, 'amap', '高德景点暂时不可用。'));
      }
      if (restaurantsResult.status === 'rejected') {
        warnings.push('高德餐厅查询失败，本次草稿无法自动安排餐厅。');
        issues.push(issueFromError(restaurantsResult.reason, 'amap', '高德餐厅暂时不可用。'));
      }
      if (hotelsResult.status === 'rejected') {
        warnings.push('FlyAI 酒店查询失败，未使用静态酒店补位。');
        issues.push(issueFromError(hotelsResult.reason, 'flyai', 'FlyAI 酒店暂时不可用。', Boolean(request.preferenceSnapshot.needHotel)));
      }

      const discoveredAttractions = attractionsResult.status === 'fulfilled'
        ? attractionsResult.value.flatMap(response => response.items)
        : [];
      const discoveredRestaurants = restaurantsResult.status === 'fulfilled'
        ? restaurantsResult.value.flatMap(response => response.items)
        : [];
      const providerPlaces = uniquePlaces([...selected, ...discoveredAttractions, ...discoveredRestaurants]);
      const excludedIds = new Set([...(request.excludedPlaceIds || []), ...(request.excludedDraftPlaceIds || [])]);
      const resolvedMustIds = new Set<string>();
      const resolvedPreferredIds = new Set<string>();
      const unresolvedRequired: string[] = [];
      for (const mention of request.unresolvedPlaceMentions || []) {
        const match = exactMentionMatch(mention, providerPlaces);
        if (match) {
          if (mention.intent === 'must_visit') resolvedMustIds.add(match.id);
          if (mention.intent === 'prefer') resolvedPreferredIds.add(match.id);
          if (mention.intent === 'avoid' || mention.intent === 'remove' || mention.intent === 'replace') excludedIds.add(match.id);
        } else if (mention.intent === 'must_visit') {
          unresolvedRequired.push(mention.name);
        }
      }
      if (unresolvedRequired.length) blockingIssues.push(`以下必去地点未能从高德精确解析：${unresolvedRequired.join('、')}。`);
      request = {
        ...request,
        mustVisitCandidates: providerPlaces.filter(place => resolvedMustIds.has(place.id)).map(candidateFromPlace),
        preferredCandidates: providerPlaces.filter(place => resolvedPreferredIds.has(place.id)).map(candidateFromPlace),
        excludedPlaceIds: [...excludedIds],
      };
      let hotel: TravelHotel | null = null;
      if (hotelsResult.status === 'fulfilled' && hotelsResult.value) {
        const hotelSelection = await selectVerifiedHotel(hotelsResult.value, '北京', deps.geocodeHotel, request.preferenceSnapshot, new Set(request.excludedDraftPlaceIds || []));
        hotel = hotelSelection.hotel;
        unassignedPlaces.push(...hotelSelection.rejected);
      }
      if (request.preferenceSnapshot.needHotel && !hotel) {
        unassignedPlaces.push({
          sourceId: 'flyai-hotel',
          name: '本次住宿',
          category: 'hotel',
          reasonCode: 'hotel_unavailable',
          reason: '没有获取到同时满足 FlyAI 实时结果与高德坐标核验的酒店。',
        });
        if (hotelsResult.status === 'rejected') {
          blockingIssues.push('需要住宿，但 FlyAI 酒店查询失败；请重试或暂时关闭住宿安排。');
        } else if (hotelsResult.status === 'fulfilled' && hotelsResult.value && hotelsResult.value.hotels.length === 0) {
          blockingIssues.push('需要住宿，但 FlyAI 没有返回符合日期、预算或星级条件的酒店。');
          issues.push({ code: 'HOTEL_NO_RESULTS', provider: 'flyai', message: 'FlyAI 没有符合条件的酒店。', retryable: false, blocking: true });
        } else {
          blockingIssues.push('需要住宿，但尚无通过高德坐标核验的 FlyAI 酒店。');
        }
        if (!issues.some(issue => issue.code === 'HOTEL_NO_RESULTS')) {
          issues.push({ code: 'HOTEL_UNAVAILABLE', provider: 'flyai', message: '没有可用于路线锚点的已核验酒店。', retryable: true, blocking: true });
        }
      }

      const allPlaces = providerPlaces.filter(place => !excludedIds.has(place.id));
      const selectedIds = new Set([
        ...selected.map(place => place.id),
        ...resolvedMustIds,
      ]);
      const preferredIds = new Set([
        ...(request.preferredCandidates || []).map(place => place.sourceId),
        ...resolvedPreferredIds,
      ]);
      const maxPlaceCount = Math.min(10, Math.max(request.days * 2, selected.length));
      const ranked = [...allPlaces].sort((a, b) => {
        const selectedDelta = Number(selectedIds.has(b.id)) - Number(selectedIds.has(a.id));
        if (selectedDelta) return selectedDelta;
        return (b.rating || 0) - (a.rating || 0);
      });
      const usable: Array<{ place: TravelPlace; windows: [number, number][]; priority: number; required: boolean; lockedDay: number | null }> = [];
      let knownCostTotal = hotel?.referencePrice
        ? hotel.referencePrice * Math.max(1, request.days - 1)
        : 0;
      let unknownCosts = hotel?.referencePrice === null && Boolean(hotel);

      const mobilityActive = request.hardConstraints.mobilityLimitations.length > 0
        || request.preferenceSnapshot.elderlyMode
        || (request.derivedConstraints || []).some(item => item.type === 'limited_mobility' || item.type === 'low_walking');
      for (const place of ranked) {
        if (!validCoordinate(place)) {
          unassignedPlaces.push({ sourceId: place.id, name: place.name, category: place.category, reasonCode: 'route_unavailable', reason: '高德地点坐标无效，未进入路线计算。' });
          continue;
        }
        const searchableText = [place.name, place.typeName, place.tags.join(' ')].join(' ');
        const forbidden = includesAny(searchableText, request.hardConstraints.forbidden);
        if (forbidden) {
          unassignedPlaces.push({ sourceId: place.id, name: place.name, category: place.category, reasonCode: 'forbidden', reason: `命中硬性禁用项“${forbidden}”。` });
          continue;
        }
        if (place.category === 'restaurant') {
          const allergen = includesAny(searchableText, request.hardConstraints.dietaryAllergies);
          if (allergen) {
            unassignedPlaces.push({ sourceId: place.id, name: place.name, category: place.category, reasonCode: 'allergy_risk', reason: `公开信息命中过敏项“${allergen}”。` });
            continue;
          }
        }
        const accessibility = assessPlaceAccessibility(place);
        if (mobilityActive && isMobilityConflict(place, request)) {
          const requiredByUser = resolvedMustIds.has(place.id) || selectedIds.has(place.id);
          const reason = '公开地点信息提示可能存在长距离步行、坡道或台阶，不符合当前行动便利限制。';
          unassignedPlaces.push({ sourceId: place.id, name: place.name, category: place.category, reasonCode: 'mobility_conflict', reason });
          if (requiredByUser) blockingIssues.push(`必去地点“${place.name}”与行动便利限制冲突，请确认是否采用短线、接驳或替代方案。`);
          continue;
        }
        if (mobilityActive && accessibility.status === 'unknown') uncertainties.push(`“${place.name}”的景区内部步行和无障碍信息不足，不能保证行动便利。`);
        let windows = verifiedOpeningWindows(place);
        if (!windows) {
          unassignedPlaces.push({ sourceId: place.id, name: place.name, category: place.category, reasonCode: 'hours_unverified', reason: '高德未返回可解析的营业时间，不能放入正式时间轴。' });
          continue;
        }
        if (place.category === 'restaurant') {
          const mealBounds: [number, number][] = [];
          if (request.preferenceSnapshot.needLunch) mealBounds.push([690, clockToMinutes(request.preferenceSnapshot.lunchLatestEndTime, 840)]);
          if (request.preferenceSnapshot.needDinner) mealBounds.push([1020, clockToMinutes(request.preferenceSnapshot.dinnerLatestEndTime, 1200)]);
          windows = mealBounds.length > 0 ? intersectWindows(windows, mealBounds) : windows;
          if (windows.length === 0) {
            unassignedPlaces.push({ sourceId: place.id, name: place.name, category: place.category, reasonCode: 'hours_unverified', reason: '餐厅营业时间与用餐限制没有可用交集。' });
            continue;
          }
        }
        const placeCost = place.cost === null ? null : Math.max(0, place.cost * request.people);
        if (placeCost === null) unknownCosts = true;
        if (request.totalBudget !== null && placeCost !== null && knownCostTotal + placeCost > request.totalBudget) {
          unassignedPlaces.push({ sourceId: place.id, name: place.name, category: place.category, reasonCode: 'budget_exceeded', reason: '加入后已知费用会超过总预算。' });
          continue;
        }
        const isRequired = selectedIds.has(place.id) && request.mode === 'self'
          || resolvedMustIds.has(place.id)
          || (request.mode === 'complete' && selectedIds.has(place.id))
          || (place.category === 'restaurant' && (request.preferenceSnapshot.needLunch || request.preferenceSnapshot.needDinner));
        if (usable.length >= maxPlaceCount && !isRequired) {
          unassignedPlaces.push({ sourceId: place.id, name: place.name, category: place.category, reasonCode: 'optimizer_unassigned', reason: '当前天数无法容纳更多地点，保留为候补。' });
          continue;
        }
        knownCostTotal += placeCost || 0;
        const mention = (request.unresolvedPlaceMentions || []).find(item => normalizePlaceName(item.name) === normalizePlaceName(place.name));
        const accessibilityPenalty = mobilityActive && accessibility.status === 'unknown' ? 12 : 0;
        const accessibilityBonus = mobilityActive && accessibility.status === 'verified' ? 8 : 0;
        usable.push({ place, windows, priority: Math.max(1, (isRequired ? 100 : preferredIds.has(place.id) ? 85 : Math.round((place.rating || 3) * 15)) - accessibilityPenalty + accessibilityBonus), required: isRequired, lockedDay: mention?.lockedDay ?? null });
      }

      if (request.hardConstraints.dietaryAllergies.length > 0) {
        uncertainties.push('餐厅公开字段无法证明完全不含过敏原，确认前仍需向商家复核。');
      }
      if (unknownCosts) uncertainties.push('部分门票、餐饮或酒店价格未由供应商返回，已知费用不代表最终总价。');
      if (usable.length === 0) blockingIssues.push('没有同时满足真实坐标、营业时间与硬性限制的地点。');

      progress('calculating_transport', '正在计算高德真实交通并调用路线优化器');
      let optimization: RouteOptimizationResponse | null = null;
      let segments: TravelRouteSegment[] = [];
      let routableUsable = usable;
      if (usable.length > 0) {
        const endpointsFor = (items: typeof usable): TravelRouteEndpoint[] => {
          const endpoints: TravelRouteEndpoint[] = [];
          if (hotel) endpoints.push({ id: hotel.id, name: hotel.name, location: { latitude: hotel.latitude!, longitude: hotel.longitude! } });
          endpoints.push(...items.map(item => ({ id: item.place.id, name: item.place.name, location: item.place.location })));
          return endpoints;
        };
        try {
          let matrix = await deps.buildMatrix(
            endpointsFor(routableUsable),
            request.transportPlan?.primary || request.preferenceSnapshot.transportPreference,
            { ...request.preferenceSnapshot.transportRule },
          );
          const failedPairs = matrix.failedPairs || [];
          if (failedPairs.length) {
            const requiredIds = new Set([
              ...(hotel ? [hotel.id] : []),
              ...routableUsable.filter(item => item.required).map(item => item.place.id),
            ]);
            const failedIds = new Set(failedPairs.flatMap(pair => [pair.originId, pair.destinationId]));
            // A failed hotel → optional-place leg only disqualifies that
            // optional place. A route is blocked when both ends are required
            // anchors/mandatory places and therefore cannot be removed.
            const requiredFailure = failedPairs.some(pair => requiredIds.has(pair.originId) && requiredIds.has(pair.destinationId));
            if (!requiredFailure) {
              const removable = new Set([...failedIds].filter(id => !requiredIds.has(id)));
              routableUsable = routableUsable.filter(item => !removable.has(item.place.id));
              failedIds.forEach(id => {
                const removed = usable.find(item => item.place.id === id);
                if (removed) unassignedPlaces.push({ sourceId: id, name: removed.place.name, category: removed.place.category, reasonCode: 'route_unavailable', reason: '高德路线暂时不可用，已降级为候补地点。' });
              });
              matrix = await deps.buildMatrix(
                endpointsFor(routableUsable),
                request.transportPlan?.primary || request.preferenceSnapshot.transportPreference,
                { ...request.preferenceSnapshot.transportRule },
              );
            }
          }
          if ((matrix.failedPairs || []).length) {
            issues.push({ code: 'AMAP_PARTIAL_ROUTE', provider: 'amap', message: '部分高德路段不可用，无法生成完整真实路线。', retryable: true, blocking: true });
            throw new Error('高德部分路段暂时不可用，无法生成完整真实路线。');
          }
          segments = matrix.segments;
          const startMinute = clockToMinutes(request.preferenceSnapshot.dailyStartTime, 540);
          const requestedEnd = clockToMinutes(request.preferenceSnapshot.dailyEndTime, 1140);
          const endMinute = request.hardConstraints.noNightActivity ? Math.min(requestedEnd, 1140) : requestedEnd;
          const dates = Array.from({ length: request.days }, (_, index) => addDays(request.preferenceSnapshot.travelStartDate, index));
          optimization = await deps.optimize({
            attractions: routableUsable.map(item => ({
              id: item.place.id,
              duration_minutes: durationFor(item.place, request),
              opening_windows: item.windows,
              opening_windows_by_day: Object.fromEntries(dates.map((date, index) => [
                index + 1,
                isAttractionClosedOnDate(item.place.openHours, date) ? [] : item.windows,
              ])),
              priority: item.priority,
              required: item.required,
              locked_day: item.lockedDay,
              preferred: !item.required,
            })),
            days: Array.from({ length: request.days }, (_, index) => {
              const constraint = request.dayConstraints?.find(item => item.day === index + 1);
              const dayStart = constraint?.startTime ? clockToMinutes(constraint.startTime, startMinute) : startMinute;
              const dayRequestedEnd = constraint?.endTime ? clockToMinutes(constraint.endTime, endMinute) : endMinute;
              return {
              day: index + 1,
              start_minute: dayStart,
              end_minute: request.hardConstraints.noNightActivity ? Math.min(dayRequestedEnd, 1140) : dayRequestedEnd,
              start_anchor_id: hotel?.id || null,
              end_anchor_id: hotel?.id || null,
              // Mobility-aware plans keep a larger daily buffer for seated
              // rest, meals, hotel return and the unreported walking inside a
              // venue. Provider route matrices only describe POI-to-POI legs.
              reserved_minutes: mobilityActive ? 90 : request.pace === 'relaxed' ? 60 : request.pace === 'standard' ? 30 : 15,
              max_walking_minutes: constraint?.maxWalkingMinutes ?? request.hardConstraints.maxWalkingMinutesPerDay,
              no_night_activity: request.hardConstraints.noNightActivity,
              };
            }),
            matrix: { node_ids: matrix.node_ids, durations: matrix.durations },
          });
        } catch (error) {
          blockingIssues.push(error instanceof Error ? error.message : '真实交通或路线优化失败。');
          if (!(issues.some(issue => issue.code === 'AMAP_PARTIAL_ROUTE'))) issues.push(issueFromError(error, 'amap', '真实交通或路线优化暂时不可用。', true));
          usable.forEach(item => unassignedPlaces.push({
            sourceId: item.place.id,
            name: item.place.name,
            category: item.place.category,
            reasonCode: 'route_unavailable',
            reason: '没有取得完整的高德真实交通矩阵。',
          }));
        }
      }

      const placeMap = new Map(routableUsable.map(item => [item.place.id, item.place]));
      const days = optimization ? planDays({ request, optimization, places: placeMap, segments, hotel }) : [];
      if (optimization) {
        optimization.unassigned_attraction_ids.forEach(id => {
          const place = placeMap.get(id);
          if (place) unassignedPlaces.push({ sourceId: id, name: place.name, category: place.category, reasonCode: 'optimizer_unassigned', reason: '路线优化器在营业时间、每日时段与交通约束下无法安排。' });
        });
      }
      blockingIssues.push(...validateWalkingLimits(days, request));

      const draft: TripPlanDraft = {
        id: `draft-${deps.now().getTime()}-${Math.random().toString(36).slice(2, 8)}`,
        sessionId: input.sessionId,
        title: `${request.days}天北京真实路线`,
        city: '北京',
        request,
        intent,
        hotel,
        days,
        unassignedPlaces,
        warnings,
        uncertainties,
        blockingIssues,
        issues,
        knownCostTotal: Math.round(knownCostTotal * 100) / 100,
        costCoverage: unknownCosts ? 'partial' : 'complete',
        providers: ['amap', ...(hotel ? ['flyai' as const] : []), ...(optimization ? ['google-or-tools' as const] : [])],
        createdAt: deps.now().toISOString(),
      };
      return { intent, request, draft };
    },
  };
}

export const planningOrchestrator = createPlanningOrchestrator();
