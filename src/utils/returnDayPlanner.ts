/**
 * 返程当天行程智能规划器
 * 处理最后一天退房、游览、去机场的完整决策逻辑
 */
import { Attraction } from '../types';
import { attractions } from '../data/attractions';
import { hotels } from '../data/hotels';
import { getUniversalRoute, getDistanceBetween, getLocationInfo } from './universalRoute';

// ===== 常量 =====
export const CHECKOUT_TIME = '12:00'; // 最晚退房时间 (deadline)
export const CHECKOUT_MINUTES = 720;  // 12:00 = 720min
export const CHECKOUT_DURATION = 15;  // 退房整理耗时(分钟)
export const AIRPORT_BUFFER_MINUTES = 120; // 提前2小时到机场
export const EN_ROUTE_RATIO = 1.5; // 绕路系数: 总绕行距离 ≤ 直达距离 × 1.5

/** 行李处理策略 */
export type LuggageStrategy = 'hotel' | 'attraction' | 'carry';

// ===== 时间工具 =====
export function timeToMin(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function minToTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ===== 核心接口 =====
export interface ReturnDayTiming {
  /** 航班起飞时间(分钟) */
  flightDepartMin: number;
  /** 需到达机场的时间(分钟) = 起飞 - 120 */
  arriveAirportMin: number;
  /** 酒店→机场交通耗时(分钟) */
  hotelToAirportMin: number;
  /** 酒店→机场交通距离(km) */
  hotelToAirportDist: number;
  /** 从酒店出发的最晚时间(分钟) = arriveAirportMin - hotelToAirportMin */
  latestDepartHotelMin: number;
  /** 退房后可用自由时间(分钟) = latestDepartHotelMin - actualCheckoutMin */
  freeMinutes: number;
  /** 实际退房完成时间(分钟) */
  actualCheckoutMin: number;
}

export interface EnRouteAttractionResult {
  attraction: Attraction;
  /** 综合得分 0-100 */
  score: number;
  /** 酒店→景点交通耗时(分钟) */
  hotelToAttrMin: number;
  /** 景点→机场交通耗时(分钟) */
  attrToAirportMin: number;
  /** 酒店→景点距离(km) */
  hotelToAttrDist: number;
  /** 景点→机场距离(km) */
  attrToAirportDist: number;
  /** 景点建议游览时长(分钟), 可能被压缩 */
  suggestedDurationMin: number;
  /** 是否与酒店同区 */
  sameZone: boolean;
}

// ===== 核心函数 =====

/**
 * 计算返程当天的关键时间节点
 * @param flightDepartTime 航班起飞时间 "HH:mm"
 * @param hotelId 酒店ID
 * @param transportMode 'transit' | 'driving'
 * @param checkoutMin 实际退房完成时间(分钟)，默认12:00向后兼容
 */
export function calcReturnDayTiming(
  flightDepartTime: string,
  hotelId: string,
  transportMode: 'transit' | 'driving',
  checkoutMin?: number,
): ReturnDayTiming | null {
  const route = getUniversalRoute(hotelId, 'airport-szx');
  if (!route) return null;

  const info = transportMode === 'driving' ? route.driving : route.transit;
  const flightDepartMin = timeToMin(flightDepartTime);
  const arriveAirportMin = flightDepartMin - AIRPORT_BUFFER_MINUTES;
  const hotelToAirportMin = info.time;
  const latestDepartHotelMin = arriveAirportMin - hotelToAirportMin;
  const actualCheckoutMin = checkoutMin ?? CHECKOUT_MINUTES;
  const freeMinutes = latestDepartHotelMin - actualCheckoutMin;

  return {
    flightDepartMin,
    arriveAirportMin,
    hotelToAirportMin,
    hotelToAirportDist: info.distance,
    latestDepartHotelMin,
    freeMinutes,
    actualCheckoutMin,
  };
}

/**
 * 判断航班是否"太早" — 用户设定的最早出门时间之前就要出发
 * @param latestDepartHotelMin 最晚离开酒店时间(分钟)
 * @param minDepartureTime 用户设定的最早出门时间 "HH:mm"
 */
export function isFlightTooEarly(
  latestDepartHotelMin: number,
  minDepartureTime: string,
): boolean {
  return latestDepartHotelMin < timeToMin(minDepartureTime);
}

/**
 * 智能推荐"顺路"景点
 * 在酒店→机场的路径上，找一个适合短暂游览的景点
 *
 * 评分维度 (总分100):
 *   路线效率  0-40分: 绕路比越小分越高, 超过EN_ROUTE_RATIO直接淘汰
 *   区域亲近  0-20分: 与酒店同区 +20
 *   时长匹配  0-20分: 游览时长 ≤ 可用时间 → 按匹配度给分
 *   免费加分  0-10分: 免票景点 +10
 *   评分加分  0-10分: rating * 2
 *
 * @param hotelId 酒店ID
 * @param excludeAttrIds 已经游览过的景点ID列表
 * @param availableMinutes 退房后到需出发去机场的可用分钟数
 * @param transportMode 交通方式
 */
export function findEnrouteAttraction(
  hotelId: string,
  excludeAttrIds: string[],
  availableMinutes: number,
  transportMode: 'transit' | 'driving',
): EnRouteAttractionResult | null {
  const hotelInfo = getLocationInfo(hotelId);
  if (!hotelInfo) return null;

  // 酒店→机场直达距离
  const directDist = getDistanceBetween(hotelId, 'airport-szx');
  if (directDist === null) return null;

  const candidates: EnRouteAttractionResult[] = [];

  for (const attr of attractions) {
    // 排除已游览
    if (excludeAttrIds.includes(attr.id)) continue;

    // 计算酒店→景点、景点→机场的路线
    const routeHA = getUniversalRoute(hotelId, attr.id);
    const routeAA = getUniversalRoute(attr.id, 'airport-szx');
    if (!routeHA || !routeAA) continue;

    const infoHA = transportMode === 'driving' ? routeHA.driving : routeHA.transit;
    const infoAA = transportMode === 'driving' ? routeAA.driving : routeAA.transit;

    // 绕路距离 = 酒店→景点 + 景点→机场
    const detourDist = infoHA.distance + infoAA.distance;
    const detourRatio = directDist > 0 ? detourDist / directDist : 999;

    // 超过绕路上限，淘汰
    if (detourRatio > EN_ROUTE_RATIO) continue;

    // 景点游览需要的最短时间 = 交通 + 游览(至少1小时，最多原时长)
    const transitMinTotal = infoHA.time + infoAA.time;
    const minVisitMin = 60; // 至少玩1小时
    const idealVisitMin = attr.estimatedDuration * 60;
    const totalNeeded = transitMinTotal + minVisitMin;

    // 可用时间不够最低要求，淘汰
    if (availableMinutes < totalNeeded) continue;

    // 实际可用游览时长: 取理想时长和剩余时间的较小值
    const maxVisitMin = availableMinutes - transitMinTotal;
    const suggestedDurationMin = Math.min(idealVisitMin, maxVisitMin);

    // ===== 评分 =====
    // 1. 路线效率 (0-40): 绕路比 1.0→40分, 1.5→0分
    const efficiencyScore = Math.max(0, 40 * (1 - (detourRatio - 1) / (EN_ROUTE_RATIO - 1)));

    // 2. 区域亲近 (0-20): 同区+20
    const sameZone = hotelInfo.zone === attr.zone;
    const zoneScore = sameZone ? 20 : 0;

    // 3. 时长匹配 (0-20): 游览时长占可用时间比例
    const durationFit = suggestedDurationMin / Math.max(1, maxVisitMin);
    const durationScore = Math.min(20, durationFit * 20);

    // 4. 免费加分 (0-10)
    const freeScore = attr.ticketPrice === 0 ? 10 : 0;

    // 5. 评分加分 (0-10): rating * 2
    const ratingScore = Math.min(10, attr.rating * 2);

    const score = Math.round(efficiencyScore + zoneScore + durationScore + freeScore + ratingScore);

    candidates.push({
      attraction: attr,
      score,
      hotelToAttrMin: infoHA.time,
      attrToAirportMin: infoAA.time,
      hotelToAttrDist: infoHA.distance,
      attrToAirportDist: infoAA.distance,
      suggestedDurationMin,
      sameZone,
    });
  }

  if (candidates.length === 0) return null;

  // 按综合得分降序，取最高
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

/**
 * 选择行李处理策略 — 比较酒店寄存/景点寄存/随身携带的总成本
 * @returns strategy + 额外时间成本(分钟) + 返回酒店取行李的交通耗时(仅hotel策略)
 */
export function chooseLuggageStrategy(
  hotelId: string,
  enrouteAttr: EnRouteAttractionResult | null,
  timing: ReturnDayTiming,
  transportMode: 'transit' | 'driving',
): { strategy: LuggageStrategy; backToHotelMin: number } {
  // 无顺路景点 → 直接带行李去机场
  if (!enrouteAttr) return { strategy: 'carry', backToHotelMin: 0 };

  const attr = enrouteAttr.attraction;

  // 策略B: 景点有寄存 → 寄存在景点，无需绕回酒店
  if (attr.luggageStorage) {
    return { strategy: 'attraction', backToHotelMin: 0 };
  }

  // 策略A: 酒店寄存 → 需要绕回酒店取行李
  // 计算额外耗时: 景点→酒店 (取行李后再从酒店去机场)
  const routeBack = getUniversalRoute(attr.id, hotelId);
  if (routeBack) {
    const backInfo = transportMode === 'driving' ? routeBack.driving : routeBack.transit;
    const backToHotelMin = backInfo.time;
    // 总路径: 退房→景点→酒店(取行李)→机场
    // 需要时间: hotelToAttr + visit + attrToHotel + hotelToAirport
    const totalNeeded = enrouteAttr.hotelToAttrMin
      + enrouteAttr.suggestedDurationMin
      + backToHotelMin
      + timing.hotelToAirportMin;

    if (timing.actualCheckoutMin + totalNeeded <= timing.latestDepartHotelMin + timing.hotelToAirportMin) {
      return { strategy: 'hotel', backToHotelMin };
    }
  }

  // 策略C: 时间不够绕回 → 随身携带
  return { strategy: 'carry', backToHotelMin: 0 };
}
