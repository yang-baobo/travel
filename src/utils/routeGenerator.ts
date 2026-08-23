/**
 * 路线生成器 — 根据偏好自动生成路线 + 行程摘要文本
 */

import { attractions, getAttractionById } from '../data/attractions';
import { restaurants } from '../data/restaurants';
import { hotels } from '../data/hotels';
import { usePreferenceStore } from '../store/usePreferenceStore';
import { useRouteStore } from '../store/useRouteStore';
import { RouteStop } from '../types';
import { scoreAttractions, scoreHotels, scoreRestaurants } from './recommendationEngine';
import { getUniversalRoute, getLocationInfo } from './universalRoute';
import { getHotelBreakfastOptions, HOTEL_BREAKFAST_ID } from './mealScheduler';
import { buildSelectedHotelRouteInput } from './selectedHotelRouteBridge';

/**
 * 根据完整交通偏好选择最佳交通方式
 */
function resolveTransportForRoute(
  route: ReturnType<typeof getUniversalRoute>,
  prefs: ReturnType<typeof usePreferenceStore.getState>,
): { mode: 'driving' | 'transit' | 'walking'; duration: number; distance: number; price: number; detail: string } {
  if (!route) return { mode: 'transit', duration: 30, distance: 5, price: 5, detail: '默认路线' };

  const { transportPref, transportRule } = prefs;
  const { walking, transit, driving } = route;

  // 步行优先模式
  if (transportPref === 'walking') {
    if (walking) return { mode: 'walking', duration: walking.time, distance: walking.distance, price: 0, detail: `步行 ${walking.distance}km` };
    // 步行不可用时回退到公交
    return { mode: 'transit', duration: transit.time, distance: transit.distance, price: transit.price, detail: transit.detail };
  }

  // 驾车优先模式
  if (transportPref === 'driving') {
    return { mode: 'driving', duration: driving.time, distance: driving.distance, price: driving.price, detail: transportRule.drivingSubMode === 'self' ? '自驾路线' : '打车路线' };
  }

  // 公交地铁模式
  if (transportPref === 'transit') {
    // 短距离可步行
    if (walking && transit.distance <= transportRule.walkMaxKm) {
      return { mode: 'walking', duration: walking.time, distance: walking.distance, price: 0, detail: `步行 ${walking.distance}km` };
    }
    // 公交超时 → 改打车
    if (transit.time > transportRule.maxTransitMinutes) {
      return { mode: 'driving', duration: driving.time, distance: driving.distance, price: driving.price, detail: `公交超${transportRule.maxTransitMinutes}分钟，改打车` };
    }
    // 到站距离超标 → 改打车
    if ((transit.walkToStationKm ?? 0) > transportRule.maxWalkToStationKm) {
      return { mode: 'driving', duration: driving.time, distance: driving.distance, price: driving.price, detail: `到站距离超${transportRule.maxWalkToStationKm}km，改打车` };
    }
    // 换乘偏好: 少换乘时若换乘>=2次考虑打车
    if (transportRule.transferComplexity === 'few' && transit.transfers >= 2 && driving.time < transit.time) {
      return { mode: 'driving', duration: driving.time, distance: driving.distance, price: driving.price, detail: `换乘${transit.transfers}次偏多，改打车` };
    }
    return { mode: 'transit', duration: transit.time, distance: transit.distance, price: transit.price, detail: transit.detail };
  }

  // 混合模式 (any)
  // 短距离优先步行
  if (walking && transit.distance <= transportRule.walkMaxKm) {
    return { mode: 'walking', duration: walking.time, distance: walking.distance, price: 0, detail: `步行 ${walking.distance}km` };
  }

  // 省时偏好 → 选较快的方式
  if (transportRule.timeCostPreference === 'save_time') {
    if (driving.time < transit.time) {
      return { mode: 'driving', duration: driving.time, distance: driving.distance, price: driving.price, detail: '省时优先，打车' };
    }
  }

  // 省钱偏好 → 优先公交
  if (transportRule.timeCostPreference === 'save_money') {
    if (transit.time <= transportRule.maxTransitMinutes) {
      return { mode: 'transit', duration: transit.time, distance: transit.distance, price: transit.price, detail: transit.detail };
    }
  }

  // 默认模式回退
  const usesDriving = transportRule.defaultMode === 'driving';
  if (usesDriving) {
    return { mode: 'driving', duration: driving.time, distance: driving.distance, price: driving.price, detail: transportRule.drivingSubMode === 'self' ? '自驾路线' : '打车路线' };
  }

  // 公交超时或到站超标 → 改打车
  if (transit.time > transportRule.maxTransitMinutes || (transit.walkToStationKm ?? 0) > transportRule.maxWalkToStationKm) {
    return { mode: 'driving', duration: driving.time, distance: driving.distance, price: driving.price, detail: '公交条件超标，改打车' };
  }
  return { mode: 'transit', duration: transit.time, distance: transit.distance, price: transit.price, detail: transit.detail };
}

export interface RouteSummary {
  days: DaySummary[];
  hotel: { id: string; name: string; pricePerNight: number } | null;
  totalEstimatedCost: number;
  summaryText: string;
}

interface DaySummary {
  day: number;
  attractions: { id: string; name: string; time: string; duration: number }[];
  breakfast: { id: string; name: string; source: 'hotel' | 'external' } | null;
  lunch: { id: string; name: string; cuisineType: string } | null;
  dinner: { id: string; name: string; cuisineType: string } | null;
}

interface PlannedDay {
  day: number;
  anchorStartId: string | null;
  anchorEndId: string | null;
  attractions: typeof attractions;
}

export function getAirportHandlingTime(code?: string | null): number {
  const largeAirports = ['SZX', 'PEK', 'PVG', 'CAN'];
  if (code && largeAirports.includes(code)) return 40;
  return 30;
}

/**
 * 根据当前偏好自动生成路线
 */
export function generateRoute(selectedAttractionIds?: string[]): RouteSummary {
  const prefs = usePreferenceStore.getState();
  const routeStore = useRouteStore.getState();

  const travelDays = prefs.travelDays || 3;
  const groupSize = prefs.groupSize || 2;
  const categories = prefs.selectedCategories;
  const cuisinePrefs = prefs.cuisinePrefs;
  const hotelLevel = prefs.hotelLevelPref !== 'any' ? prefs.hotelLevelPref : 'mid';

  // 1. 先选候选景点（硬过滤 + 评分）
  let selectedAttractions;
  if (selectedAttractionIds && selectedAttractionIds.length > 0) {
    selectedAttractions = selectedAttractionIds
      .map(id => getAttractionById(id))
      .filter((a): a is NonNullable<typeof a> => !!a);
  } else {
    selectedAttractions = selectAttractionsByPreference(categories, travelDays);
  }

  // 2. 当前 Trip 已有真实酒店时，不再悄悄选择另一个静态酒店。
  // FlyAI 坐标进入高德矩阵前只通过边界暴露，不在此处伪造路线耗时。
  const selectedHotelRouteInput = buildSelectedHotelRouteInput();
  const hotel = selectedHotelRouteInput ? null : selectHotel(hotelLevel, selectedAttractions);

  // 3. 按主线顺路分配到各天，并维护每天连续访问顺序
  const dailyPlan = buildContinuousDailyPlan(selectedAttractions, travelDays, hotel?.id ?? null);

  // 4. 选餐厅（含早餐）
  const days: DaySummary[] = dailyPlan.map((plannedDay, index) => {
    const day = index + 1;
    const dayAttractions = plannedDay.attractions;
    const dayZones = [...new Set(dayAttractions.map(a => a.zone))];
    const nearbyAttractionIds = dayAttractions.map(a => a.id);

    // 早餐逻辑：Day N 早餐来自 Day N-1 酒店
    let breakfast: DaySummary['breakfast'] = null;
    if (prefs.needBreakfast && day > 1 && hotel) {
      const bkOpts = getHotelBreakfastOptions(hotels.find(h => h.id === hotel.id));
      if (bkOpts && (bkOpts.included || bkOpts.optional)) {
        breakfast = { id: HOTEL_BREAKFAST_ID, name: hotel.name, source: 'hotel' };
      } else {
        const bkRest = selectRestaurant(dayZones, cuisinePrefs, 'breakfast', nearbyAttractionIds);
        if (bkRest) {
          breakfast = { id: bkRest.id, name: bkRest.name, source: 'external' };
        }
      }
    }

    return {
      day,
      attractions: dayAttractions.map((a, i) => ({
        id: a.id,
        name: a.name,
        time: getTimeSlot(i, dayAttractions.length),
        duration: a.estimatedDuration,
      })),
      breakfast,
      lunch: prefs.needLunch ? selectRestaurant(dayZones, cuisinePrefs, 'lunch', nearbyAttractionIds) : null,
      dinner: prefs.needDinner ? selectRestaurant(dayZones, cuisinePrefs, 'dinner', nearbyAttractionIds) : null,
    };
  });

  // 5. 计算费用
  const ticketCost = selectedAttractions.reduce((sum, a) => sum + a.ticketPrice * groupSize, 0);
  const hotelCost = hotel ? hotel.pricePerNight * (travelDays - 1) : 0;
  const mealCost = days.reduce((sum, d) => {
    let cost = 0;
    if (d.breakfast) {
      if (d.breakfast.source === 'hotel') {
        const h = hotels.find(x => x.id === d.breakfast!.id);
        const bkOpts = getHotelBreakfastOptions(h);
        if (bkOpts && !bkOpts.included && bkOpts.price > 0) {
          cost += bkOpts.price * groupSize;
        }
      } else {
        const r = restaurants.find(x => x.id === d.breakfast!.id);
        cost += (r?.pricePerPerson || 40) * groupSize;
      }
    }
    if (d.lunch) {
      const r = restaurants.find(x => x.id === d.lunch!.id);
      cost += (r?.pricePerPerson || 60) * groupSize;
    }
    if (d.dinner) {
      const r = restaurants.find(x => x.id === d.dinner!.id);
      cost += (r?.pricePerPerson || 80) * groupSize;
    }
    return sum + cost;
  }, 0);
  const totalEstimatedCost = ticketCost + hotelCost + mealCost;

  // 6. 生成摘要文本（供 TTS 朗读）
  const summaryText = buildSummaryText(days, hotel, totalEstimatedCost, groupSize);

  // 7. 写入 routeStore
  const routeStops: RouteStop[] = [];
  let order = 0;
  dailyPlan.forEach((plannedDay, dayIndex) => {
    plannedDay.attractions.forEach((a, i) => {
      const next = plannedDay.attractions[i + 1];
      const route = next ? getUniversalRoute(a.id, next.id) : null;
      routeStops.push({
        attractionId: a.id,
        order: order++,
        day: dayIndex + 1,
        arrivalTime: getTimeSlot(i, plannedDay.attractions.length),
        stayDuration: a.estimatedDuration,
        transportToNext: route ? (() => {
          const resolved = resolveTransportForRoute(route, prefs);
          return { mode: resolved.mode === 'walking' ? 'transit' as const : resolved.mode, duration: resolved.duration, distance: resolved.distance, price: resolved.price, detail: resolved.detail };
        })() : null,
      });
    });
  });

  routeStore.loadFromPreset(routeStops, 'custom', 'voice-generated', travelDays);

  return { days, hotel, totalEstimatedCost, summaryText };
}

function selectAttractionsByPreference(categories: string[], travelDays: number): typeof attractions {
  const prefs = usePreferenceStore.getState();
  const maxPerDay = prefs.elderlyMode ? 2 : 3;
  const totalNeeded = travelDays * maxPerDay;
  return scoreAttractions(attractions, prefs)
    .slice(0, totalNeeded)
    .map(entry => entry.item);
}

function buildContinuousDailyPlan(
  selectedAttractions: typeof attractions,
  travelDays: number,
  hotelId: string | null,
): PlannedDay[] {
  const prefs = usePreferenceStore.getState();
  const groupedByZone = new Map<string, typeof attractions>();

  for (const attraction of selectedAttractions) {
    const current = groupedByZone.get(attraction.zone) ?? [];
    current.push(attraction);
    groupedByZone.set(attraction.zone, current);
  }

  const orderedZones = [...groupedByZone.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([zone]) => zone);

  const days: PlannedDay[] = Array.from({ length: travelDays }, (_, index) => ({
    day: index + 1,
    anchorStartId: hotelId,
    anchorEndId: hotelId,
    attractions: [],
  }));

  for (const zone of orderedZones) {
    const zoneAttractions = [...(groupedByZone.get(zone) ?? [])];
    while (zoneAttractions.length > 0) {
      const targetDay = days.reduce((bestIndex, day, index) => {
        const currentDuration = day.attractions.reduce((sum, item) => sum + item.estimatedDuration, 0);
        const bestDuration = days[bestIndex].attractions.reduce((sum, item) => sum + item.estimatedDuration, 0);
        return currentDuration < bestDuration ? index : bestIndex;
      }, 0);

      const candidate = pickNearestAttraction(
        zoneAttractions,
        getAnchorLocationId(days[targetDay], hotelId),
      );
      days[targetDay].attractions.push(candidate);
      const removeIndex = zoneAttractions.findIndex(item => item.id === candidate.id);
      zoneAttractions.splice(removeIndex, 1);
    }
  }

  return days.map(day => ({
    ...day,
    attractions: orderDayAttractions(day.attractions, day.anchorStartId, day.anchorEndId, prefs.elderlyMode ? 2 : 3),
  }));
}

function getAnchorLocationId(day: PlannedDay, hotelId: string | null): string | null {
  if (day.attractions.length === 0) {
    return hotelId;
  }
  return day.attractions[day.attractions.length - 1]?.id ?? hotelId;
}

function pickNearestAttraction(
  candidates: typeof attractions,
  fromId: string | null,
) {
  if (!fromId) {
    return candidates[0];
  }

  const prefs = usePreferenceStore.getState();
  let best = candidates[0];
  let bestTime = Infinity;

  for (const candidate of candidates) {
    const route = getUniversalRoute(fromId, candidate.id);
    const resolved = resolveTransportForRoute(route, prefs);
    const time = resolved.duration;
    if (time < bestTime) {
      best = candidate;
      bestTime = time;
    }
  }

  return best;
}

function orderDayAttractions(
  dayAttractions: typeof attractions,
  anchorStartId: string | null,
  anchorEndId: string | null,
  _maxPerDay: number,
): typeof attractions {
  const uniqueCandidates = dayAttractions.filter((item, index, all) => all.findIndex(entry => entry.id === item.id) === index);
  const ordered: typeof attractions = [];
  let currentLocationId = anchorStartId;
  const remaining = [...uniqueCandidates];

  while (remaining.length > 0) {
    const next = pickNearestAttraction(remaining, currentLocationId);
    ordered.push(next);
    currentLocationId = next.id;
    const idx = remaining.findIndex(item => item.id === next.id);
    remaining.splice(idx, 1);
  }

  if (anchorEndId && ordered.length > 2) {
    ordered.sort((a, b) => {
      const fromCurrentA = getUniversalRoute(anchorStartId || a.id, a.id)?.transit.time ?? 999;
      const toEndA = getUniversalRoute(a.id, anchorEndId)?.transit.time ?? 999;
      const fromCurrentB = getUniversalRoute(anchorStartId || b.id, b.id)?.transit.time ?? 999;
      const toEndB = getUniversalRoute(b.id, anchorEndId)?.transit.time ?? 999;
      return (fromCurrentA + toEndA) - (fromCurrentB + toEndB);
    });
  }

  return ordered;
}

function getTimeSlot(index: number, total: number): string {
  const startHour = 9;
  const slots = ['09:00', '11:00', '14:00', '16:00', '19:00'];
  return slots[Math.min(index, slots.length - 1)];
}

function selectHotel(
  level: string,
  selectedAttractions: typeof attractions
): { id: string; name: string; pricePerNight: number } | null {
  const prefs = usePreferenceStore.getState();
  const preferredZones = Array.from(new Set(selectedAttractions.map(item => item.zone)));
  const candidates = scoreHotels(
    hotels.filter(hotel => level === 'any' || hotel.level === level),
    prefs,
    preferredZones,
  );
  if (candidates.length === 0) return null;
  const best = candidates[0].item;
  return { id: best.id, name: best.name, pricePerNight: best.pricePerNight };
}

function selectRestaurant(
  zones: string[],
  cuisinePrefs: string[],
  mealType: 'breakfast' | 'lunch' | 'dinner',
  nearbyAttractionIds: string[]
): { id: string; name: string; cuisineType: string } | null {
  const prefs = usePreferenceStore.getState();
  const scored = scoreRestaurants(restaurants, {
    ...prefs,
    cuisinePrefs: cuisinePrefs.length > 0 ? prefs.cuisinePrefs : prefs.cuisinePrefs,
  }, { dayZones: zones, mealType, nearbyAttractionIds });
  if (scored.length === 0) return null;
  const pick = scored[0].item;
  return { id: pick.id, name: pick.name, cuisineType: pick.cuisineType };
}

function buildSummaryText(
  days: DaySummary[],
  hotel: { name: string; pricePerNight: number } | null,
  totalCost: number,
  groupSize: number
): string {
  let text = '行程规划好啦！';

  if (hotel) {
    text += `住宿安排在${hotel.name}，每晚${hotel.pricePerNight}元。`;
  }

  for (const day of days) {
    text += `第${day.day}天，`;
    const attractionNames = day.attractions.map(a => a.name);
    if (attractionNames.length === 1) {
      text += `去${attractionNames[0]}。`;
    } else if (attractionNames.length === 2) {
      text += `上午去${attractionNames[0]}，下午去${attractionNames[1]}。`;
    } else {
      text += `上午去${attractionNames[0]}，下午去${attractionNames[1]}，`;
      if (attractionNames.length > 2) {
        text += `然后去${attractionNames.slice(2).join('和')}。`;
      }
    }
    if (day.breakfast) {
      if (day.breakfast.source === 'hotel') {
        text += `早餐在酒店吃。`;
      } else {
        text += `早餐推荐${day.breakfast.name}。`;
      }
    }
    if (day.lunch) {
      text += `午餐推荐${day.lunch.name}。`;
    }
    if (day.dinner) {
      text += `晚餐推荐${day.dinner.name}。`;
    }
  }

  text += `预计${groupSize}人总费用约${totalCost}元。您觉得这个安排怎么样？`;
  return text;
}

/**
 * 获取当前路线的摘要文本
 */
export function getRouteSummaryText(): string {
  const routeStore = useRouteStore.getState();
  const stops = routeStore.routeStops;
  if (stops.length === 0) return '目前还没有生成路线。';

  const days = routeStore.travelDays;
  let text = `当前路线共${days}天，`;

  for (let d = 1; d <= days; d++) {
    const dayStops = stops.filter(s => s.day === d);
    const names = dayStops.map(s => {
      const a = getAttractionById(s.attractionId);
      return a?.name || s.attractionId;
    });
    if (names.length > 0) {
      text += `第${d}天去${names.join('、')}，`;
    }
  }

  return text.replace(/，$/, '。');
}
