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
): Promise<{ hotel: TravelHotel | null; rejected: UnassignedPlace[] }> {
  const rejected: UnassignedPlace[] = [];
  for (const hotel of response.hotels.slice(0, 3)) {
    try {
      const verified = withVerifiedHotelGeo(hotel, await geocode(hotelGeoRequest(hotel, destination)));
      if (verified) return { hotel: verified, rejected };
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
        reason: error instanceof Error ? error.message : '酒店位置核验失败。',
      });
    }
  }
  return { hotel: null, rejected };
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
  if (request.preferenceSnapshot.transportPreference !== 'walking') return [];
  const issues: string[] = [];
  days.forEach(day => {
    const segments = day.stops.map(stop => stop.transportToNext).filter(Boolean) as TravelRouteSegment[];
    const dailyMinutes = segments.reduce((sum, segment) => sum + (segment.durationMinutes || 0), 0);
    if (dailyMinutes > request.hardConstraints.maxWalkingMinutesPerDay) {
      issues.push(`第${day.day}天步行 ${dailyMinutes} 分钟，超过每日上限 ${request.hardConstraints.maxWalkingMinutesPerDay} 分钟。`);
    }
    segments.forEach(segment => {
      if ((segment.durationMinutes || 0) > request.hardConstraints.maxWalkingMinutesPerSegment) {
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
      const request: PlanningRequest = { ...input.request, ...intent.requestPatch };
      if (intent.needsClarification) return { intent, request, draft: null };

      progress('querying_places', '正在查询高德真实地点与 FlyAI 酒店');
      const selected = uniquePlaces(request.candidates.map(candidate => candidate.originalPlace));
      const targetAttractions = Math.min(6, Math.max(3, request.days + 1));
      const targetRestaurants = Math.min(3, Math.max(1, request.days));
      const shouldDiscover = request.mode !== 'self';
      const attractionPromise = shouldDiscover
        ? deps.searchPlaces('attraction', attractionKeyword(request), 1, targetAttractions)
        : Promise.resolve(null);
      const shouldArrangeMeals = request.preferenceSnapshot.needLunch || request.preferenceSnapshot.needDinner;
      const restaurantPromise = shouldArrangeMeals
        ? deps.searchPlaces('restaurant', restaurantKeyword(request), 1, targetRestaurants)
        : Promise.resolve(null);
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
      const unassignedPlaces: UnassignedPlace[] = [];
      if (intent.provider === 'local_fallback') warnings.push(intent.explanation);
      if (attractionsResult.status === 'rejected') warnings.push('高德景点查询失败，仅保留用户已选的真实候选地点。');
      if (restaurantsResult.status === 'rejected') warnings.push('高德餐厅查询失败，本次草稿无法自动安排餐厅。');
      if (hotelsResult.status === 'rejected') warnings.push('FlyAI 酒店查询失败，未使用静态酒店补位。');

      const discoveredAttractions = attractionsResult.status === 'fulfilled' && attractionsResult.value
        ? attractionsResult.value.items
        : [];
      const discoveredRestaurants = restaurantsResult.status === 'fulfilled' && restaurantsResult.value
        ? restaurantsResult.value.items
        : [];
      let hotel: TravelHotel | null = null;
      if (hotelsResult.status === 'fulfilled' && hotelsResult.value) {
        const hotelSelection = await selectVerifiedHotel(hotelsResult.value, '北京', deps.geocodeHotel);
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
        blockingIssues.push('需要住宿，但尚无通过高德坐标核验的 FlyAI 酒店。');
      }

      const allPlaces = uniquePlaces([...selected, ...discoveredAttractions, ...discoveredRestaurants]);
      const selectedIds = new Set(selected.map(place => place.id));
      const maxPlaceCount = Math.min(10, Math.max(request.days * 2, selected.length));
      const ranked = [...allPlaces].sort((a, b) => {
        const selectedDelta = Number(selectedIds.has(b.id)) - Number(selectedIds.has(a.id));
        if (selectedDelta) return selectedDelta;
        return (b.rating || 0) - (a.rating || 0);
      });
      const usable: Array<{ place: TravelPlace; windows: [number, number][]; priority: number }> = [];
      let knownCostTotal = hotel?.referencePrice
        ? hotel.referencePrice * Math.max(1, request.days - 1)
        : 0;
      let unknownCosts = hotel?.referencePrice === null && Boolean(hotel);

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
        if (usable.length >= maxPlaceCount && !selectedIds.has(place.id)) {
          unassignedPlaces.push({ sourceId: place.id, name: place.name, category: place.category, reasonCode: 'optimizer_unassigned', reason: '当前天数无法容纳更多地点，保留为候补。' });
          continue;
        }
        knownCostTotal += placeCost || 0;
        usable.push({ place, windows, priority: selectedIds.has(place.id) ? 100 : Math.round((place.rating || 3) * 15) });
      }

      if (request.hardConstraints.dietaryAllergies.length > 0) {
        uncertainties.push('餐厅公开字段无法证明完全不含过敏原，确认前仍需向商家复核。');
      }
      if (unknownCosts) uncertainties.push('部分门票、餐饮或酒店价格未由供应商返回，已知费用不代表最终总价。');
      if (usable.length === 0) blockingIssues.push('没有同时满足真实坐标、营业时间与硬性限制的地点。');

      progress('calculating_transport', '正在计算高德真实交通并调用路线优化器');
      let optimization: RouteOptimizationResponse | null = null;
      let segments: TravelRouteSegment[] = [];
      if (usable.length > 0) {
        const endpoints: TravelRouteEndpoint[] = [];
        if (hotel) endpoints.push({ id: hotel.id, name: hotel.name, location: { latitude: hotel.latitude!, longitude: hotel.longitude! } });
        endpoints.push(...usable.map(item => ({ id: item.place.id, name: item.place.name, location: item.place.location })));
        try {
          const matrix = await deps.buildMatrix(
            endpoints,
            request.preferenceSnapshot.transportPreference,
            { defaultMode: request.preferenceSnapshot.transportRule.defaultMode },
          );
          segments = matrix.segments;
          const startMinute = clockToMinutes(request.preferenceSnapshot.dailyStartTime, 540);
          const requestedEnd = clockToMinutes(request.preferenceSnapshot.dailyEndTime, 1140);
          const endMinute = request.hardConstraints.noNightActivity ? Math.min(requestedEnd, 1140) : requestedEnd;
          const dates = Array.from({ length: request.days }, (_, index) => addDays(request.preferenceSnapshot.travelStartDate, index));
          optimization = await deps.optimize({
            attractions: usable.map(item => ({
              id: item.place.id,
              duration_minutes: durationFor(item.place, request),
              opening_windows: item.windows,
              opening_windows_by_day: Object.fromEntries(dates.map((date, index) => [
                index + 1,
                isAttractionClosedOnDate(item.place.openHours, date) ? [] : item.windows,
              ])),
              priority: item.priority,
            })),
            days: Array.from({ length: request.days }, (_, index) => ({
              day: index + 1,
              start_minute: startMinute,
              end_minute: endMinute,
              start_anchor_id: hotel?.id || null,
              end_anchor_id: hotel?.id || null,
              reserved_minutes: request.pace === 'relaxed' ? 60 : request.pace === 'standard' ? 30 : 15,
            })),
            matrix: { node_ids: matrix.node_ids, durations: matrix.durations },
          });
        } catch (error) {
          blockingIssues.push(error instanceof Error ? error.message : '真实交通或路线优化失败。');
          usable.forEach(item => unassignedPlaces.push({
            sourceId: item.place.id,
            name: item.place.name,
            category: item.place.category,
            reasonCode: 'route_unavailable',
            reason: '没有取得完整的高德真实交通矩阵。',
          }));
        }
      }

      const placeMap = new Map(usable.map(item => [item.place.id, item.place]));
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
