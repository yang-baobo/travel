/**
 * mealScheduler — 餐饮调度核心逻辑
 * 集中管理时间窗口验证、餐间间隔、酒店早餐优先级等决策
 * 供 RoutePlanScreen 和 routeGenerator 复用
 *
 * 核心原则：先像正常人一样吃饭休息，再追求路线效率。
 */

import { Hotel, BreakfastOptions, ScheduleItem } from '../types';

// ==================== 常量 ====================

/** 餐饮时间窗口（分钟）— 分层：理想 / 可接受 / 软边界 */
export interface MealTimeWindow {
  ideal: number;       // 理想用餐时间
  acceptStart: number; // 可接受窗口开始
  acceptEnd: number;   // 可接受窗口结束
  softStart: number;   // 软边界开始（小惩罚）
  softEnd: number;     // 软边界结束（大惩罚之前的最后机会）
  hardEnd: number;     // 硬截止：超过此时间视为严重问题
}

export const MEAL_RHYTHM: Record<string, MealTimeWindow> = {
  breakfast: {
    ideal: 480,        // 08:00
    acceptStart: 420,  // 07:00
    acceptEnd: 540,    // 09:00
    softStart: 360,    // 06:00
    softEnd: 600,      // 10:00
    hardEnd: 600,      // 10:00
  },
  lunch: {
    ideal: 720,        // 12:00
    acceptStart: 690,  // 11:30
    acceptEnd: 810,    // 13:30
    softStart: 660,    // 11:00
    softEnd: 840,      // 14:00
    hardEnd: 870,      // 14:30
  },
  dinner: {
    ideal: 1080,       // 18:00
    acceptStart: 1050, // 17:30
    acceptEnd: 1170,   // 19:30
    softStart: 1020,   // 17:00
    softEnd: 1200,     // 20:00
    hardEnd: 1230,     // 20:30
  },
};

/** 兼容旧的 MEAL_WINDOWS 接口 */
export const MEAL_WINDOWS: Record<string, { start: number; end: number }> = {
  breakfast: { start: MEAL_RHYTHM.breakfast.softStart, end: MEAL_RHYTHM.breakfast.softEnd },
  lunch:     { start: MEAL_RHYTHM.lunch.softStart,     end: MEAL_RHYTHM.lunch.softEnd },
  dinner:    { start: MEAL_RHYTHM.dinner.softStart,     end: MEAL_RHYTHM.dinner.softEnd },
};

/** 餐间最小间隔（分钟） */
export const MIN_MEAL_GAP = 180; // 3 小时

/** 各餐用餐时长（分钟） */
export const MEAL_DURATION: Record<string, number> = {
  breakfast: 45,
  lunch: 60,
  dinner: 75,
};

/** selectedRestaurants 中酒店早餐的标记 ID */
export const HOTEL_BREAKFAST_ID = '__hotel__';

// ==================== 工具函数 ====================

/**
 * 判断当前时间是否在某餐的软边界时间窗口内
 */
export function isInMealWindow(mealType: string, currentMinutes: number): boolean {
  const w = MEAL_RHYTHM[mealType];
  if (!w) return false;
  return currentMinutes >= w.softStart && currentMinutes <= w.softEnd;
}

/**
 * 饭点抢占检查：在景点循环中，判断是否应该先吃饭再去下一个景点
 *
 * 核心逻辑：如果开始下一个景点后，会把用餐推迟到可接受窗口之外，
 * 则应该先安排用餐。
 *
 * @param mealType 餐类型
 * @param currentMinutes 当前时间（分钟）
 * @param nextActivityDuration 下一个活动的预计耗时（交通+景点，分钟）
 * @param mealInserted 该餐是否已经插入
 * @param lastMealEndMinutes 上一餐结束时间
 * @param latestMealEndMinutes 用户要求的最晚用餐结束时间
 * @returns 是否应该抢占（先吃饭）
 */
export function shouldPreemptForMeal(
  mealType: 'lunch' | 'dinner',
  currentMinutes: number,
  nextActivityDuration: number,
  mealInserted: boolean,
  lastMealEndMinutes: number,
  latestMealEndMinutes?: number,
): boolean {
  if (mealInserted) return false;

  const w = MEAL_RHYTHM[mealType];
  if (!w) return false;
  const latestStartMinutes = latestMealEndMinutes != null
    ? latestMealEndMinutes - MEAL_DURATION[mealType]
    : w.acceptEnd;

  // 餐间间隔不足，不抢占
  if (lastMealEndMinutes > 0 && currentMinutes - lastMealEndMinutes < MIN_MEAL_GAP) {
    return false;
  }

  // 情况1：已经进入可接受窗口 → 直接吃（由 shouldInsertMeal 处理）
  // 这里处理的是"还没到窗口，但做完下一个活动就会错过"的情况

  // 如果当前时间还没到可接受窗口开始
  if (currentMinutes < w.acceptStart) {
    // 如果做完下一个活动会错过用户允许的最晚开饭时间 → 抢占
    const afterActivity = currentMinutes + nextActivityDuration;
    if (afterActivity > latestStartMinutes) {
      return true;
    }
    return false;
  }

  // 当前已在可接受窗口内，且仍能在用户截止时间前吃完
  if (currentMinutes <= latestStartMinutes) {
    // 如果下一个活动超过30分钟，先吃饭
    if (nextActivityDuration > 30) {
      return true;
    }
    // 短活动（<30分钟）可以先做完再吃
    return false;
  }

  // 已经错过用户允许的结束时间，交给上层提示，不再强塞一餐。
  return false;
}

/**
 * 获取酒店早餐选项（兼容旧的 breakfastIncluded 字段）
 */
export function getHotelBreakfastOptions(hotel: Hotel | null | undefined): BreakfastOptions | null {
  if (!hotel) return null;

  // 优先使用新字段
  if (hotel.breakfastOptions) {
    return hotel.breakfastOptions;
  }

  // 兼容旧字段
  if (hotel.breakfastIncluded) {
    return { included: true, price: 0, optional: false };
  }

  // 检查 amenities 中是否包含早餐
  if (hotel.amenities?.some(a => a.includes('早餐'))) {
    return { included: true, price: 0, optional: false };
  }

  return null;
}

/**
 * 获取当天提供早餐的酒店
 * Day N 的早餐来自 Day N-1 晚上住的酒店
 * Day 1 本地用户：如果有选 Day 1 的酒店（第1晚住宿），Day 1 早餐用该酒店
 */
export function getBreakfastHotelForDay(
  dayNum: number,
  selectedHotelIds: Record<number, string>,
): string | null {
  if (dayNum === 1) {
    // Day 1：第1晚住的酒店提供次日（Day 2）早餐
    // Day 1 的早餐需要用户已在深圳（本地用户），且选了 Day 1 住宿
    // 大多数情况：Day 1 没有之前住宿，所以没有酒店早餐
    return null;
  }
  // Day N 的早餐来自 Day N-1 的住宿
  return selectedHotelIds[dayNum - 1] || null;
}

// ==================== 核心决策函数 ====================

export interface ShouldInsertMealParams {
  mealType: 'breakfast' | 'lunch' | 'dinner';
  currentMinutes: number;
  lastMealEndMinutes: number;
  userNeedsMeal: boolean;
  hotelBreakfastOptions?: BreakfastOptions | null;
}

export interface ShouldInsertMealResult {
  shouldInsert: boolean;
  source: 'hotel' | 'external' | 'rest' | 'skip';
}

/**
 * 核心决策：是否应该在当前位置插入该餐
 *
 * 逻辑优先级：
 * 1. 时间窗口 → 不在窗口内则跳过
 * 2. 餐间间隔 → 与上一餐间隔 < 3h 则跳过
 * 3. 用户不需要该餐（午餐/晚餐） → 插入休息时间占位
 * 4. 用户不需要早餐 → 跳过（早上不需要强制休息）
 * 5. 早餐特殊 → 酒店有早餐则优先用酒店
 */
export function shouldInsertMeal(params: ShouldInsertMealParams): ShouldInsertMealResult {
  const { mealType, currentMinutes, lastMealEndMinutes, userNeedsMeal, hotelBreakfastOptions } = params;

  // 1. 时间窗口检查（优先）
  if (!isInMealWindow(mealType, currentMinutes)) {
    return { shouldInsert: false, source: 'skip' };
  }

  // 2. 餐间间隔检查
  if (lastMealEndMinutes > 0 && currentMinutes - lastMealEndMinutes < MIN_MEAL_GAP) {
    return { shouldInsert: false, source: 'skip' };
  }

  // 3. 用户不需要该餐：午餐/晚餐仍预留休息时间，早餐跳过
  if (!userNeedsMeal) {
    if (mealType === 'lunch' || mealType === 'dinner') {
      return { shouldInsert: true, source: 'rest' };
    }
    return { shouldInsert: false, source: 'skip' };
  }

  // 4. 早餐特殊逻辑
  if (mealType === 'breakfast') {
    if (hotelBreakfastOptions) {
      if (hotelBreakfastOptions.included) {
        return { shouldInsert: true, source: 'hotel' };
      }
      if (hotelBreakfastOptions.optional) {
        return { shouldInsert: true, source: 'hotel' };
      }
    }
    return { shouldInsert: true, source: 'external' };
  }

  // 5. 午餐/晚餐
  return { shouldInsert: true, source: 'external' };
}

// ==================== ScheduleItem 构建 ====================

export interface BuildMealItemParams {
  dayNum: number;
  mealType: 'breakfast' | 'lunch' | 'dinner';
  source: 'hotel' | 'external';
  startTime: string;
  restaurantId?: string;
  restaurantName?: string;
  restaurantSubtitle?: string;
  hotelName?: string;
  hotelBreakfastIncluded?: boolean;
  hotelBreakfastPrice?: number;
}

/**
 * 构建餐饮 ScheduleItem
 */
export function buildMealScheduleItem(params: BuildMealItemParams): ScheduleItem {
  const duration = MEAL_DURATION[params.mealType];
  const { dayNum, mealType, source, startTime, restaurantId, restaurantName,
          restaurantSubtitle, hotelName, hotelBreakfastIncluded, hotelBreakfastPrice } = params;

  const [h, m] = startTime.split(':').map(Number);
  const endMinutes = h * 60 + m + duration;
  const endTime = `${String(Math.floor(endMinutes / 60) % 24).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;

  if (source === 'hotel') {
    const priceLabel = hotelBreakfastIncluded ? '含早' : `+¥${hotelBreakfastPrice || 0}/人`;
    return {
      id: `${dayNum}-${mealType}`,
      type: 'restaurant',
      day: dayNum,
      startTime,
      endTime,
      durationMinutes: duration,
      title: '酒店早餐',
      subtitle: `${hotelName || ''} (${priceLabel})`,
      mealType,
      source: 'hotel',
    };
  }

  return {
    id: `${dayNum}-${mealType}`,
    type: 'restaurant',
    day: dayNum,
    startTime,
    endTime,
    durationMinutes: duration,
    title: restaurantName || '',
    subtitle: restaurantSubtitle || '',
    restaurantId,
    mealType,
    source: 'external',
  };
}
