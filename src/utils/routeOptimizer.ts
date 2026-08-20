import { Attraction, RouteStop } from '../types';
import { getRouteOption } from '../data/travelTimeMatrix';
import { getUniversalRoute } from './universalRoute';

// 获取两点间交通时间（分钟），优先矩阵，回退到 universalRoute
function getTransitTime(fromId: string, toId: string): number {
  const matrixOpt = getRouteOption(fromId, toId);
  if (matrixOpt) return matrixOpt.transit.time;
  const uniRoute = getUniversalRoute(fromId, toId);
  if (uniRoute) return uniRoute.transit.time;
  return 999;
}

// 贪心最近邻算法优化景点游览顺序
// 从起点出发，每次选择距离当前位置最近的未访问景点
export const optimizeRouteOrder = (
  attractionIds: string[],
  startId?: string,
): string[] => {
  if (attractionIds.length <= 2) return [...attractionIds];

  const ids = [...attractionIds];
  const result: string[] = [];
  let current = startId || ids[0];

  // 将起点移到结果中
  const startIdx = ids.indexOf(current);
  if (startIdx >= 0) {
    ids.splice(startIdx, 1);
    result.push(current);
  }

  while (ids.length > 0) {
    let bestIdx = 0;
    let bestTime = Infinity;

    for (let i = 0; i < ids.length; i++) {
      const time = getTransitTime(current, ids[i]);
      if (time < bestTime) {
        bestTime = time;
        bestIdx = i;
      }
    }

    current = ids[bestIdx];
    result.push(current);
    ids.splice(bestIdx, 1);
  }

  return result;
};

// ===== 新增：带酒店锚点的每日路线优化 =====
// 贪心最近邻 + 2-opt 局部搜索，以酒店为起终点
export function optimizeDayRoute(
  attractionIds: string[],
  startAnchorId?: string | null,  // 起点（通常是前一晚酒店）
  endAnchorId?: string | null,    // 终点（通常是今晚酒店）
): string[] {
  if (attractionIds.length === 0) return [];
  if (attractionIds.length === 1) return [...attractionIds];

  // 第一轮：贪心最近邻，从起点锚点出发
  const ids = [...attractionIds];
  const result: string[] = [];
  let current = startAnchorId || ids[0];

  // 如果起点锚点是景点之一，先移出来
  const startIdx = ids.indexOf(current);
  if (startIdx >= 0) {
    ids.splice(startIdx, 1);
    result.push(current);
  }

  while (ids.length > 0) {
    let bestIdx = 0;
    let bestTime = Infinity;
    for (let i = 0; i < ids.length; i++) {
      const time = getTransitTime(current, ids[i]);
      if (time < bestTime) {
        bestTime = time;
        bestIdx = i;
      }
    }
    current = ids[bestIdx];
    result.push(current);
    ids.splice(bestIdx, 1);
  }

  // 如果起点锚点不在景点列表中（如酒店），result 仅含景点
  // 此时 result 就是从锚点出发的最近邻顺序

  // 第二轮：2-opt 局部搜索优化（考虑终点锚点）
  if (result.length >= 3) {
    let improved = true;
    let iterations = 0;
    const maxIterations = result.length * result.length; // 防止无限循环
    while (improved && iterations < maxIterations) {
      improved = false;
      iterations++;
      for (let i = 0; i < result.length - 1; i++) {
        for (let j = i + 1; j < result.length; j++) {
          const currentCost = calcSegmentCost(result, i, j, startAnchorId, endAnchorId);
          // 尝试翻转 i..j 之间的段
          const reversed = [...result];
          const segment = reversed.splice(i, j - i + 1);
          segment.reverse();
          reversed.splice(i, 0, ...segment);
          const newCost = calcSegmentCost(reversed, i, j, startAnchorId, endAnchorId);
          if (newCost < currentCost - 0.5) { // 至少节省0.5分钟才交换
            result.splice(0, result.length, ...reversed);
            improved = true;
          }
        }
      }
    }
  }

  return result;
}

// 计算路线段的相关交通成本
function calcSegmentCost(
  route: string[],
  i: number,
  j: number,
  startAnchorId?: string | null,
  endAnchorId?: string | null,
): number {
  let cost = 0;
  // 起点锚点 → 第一个景点
  if (i === 0 && startAnchorId && !route.includes(startAnchorId)) {
    cost += getTransitTime(startAnchorId, route[0]);
  }
  // 景点之间
  for (let k = Math.max(0, i - 1); k <= Math.min(j, route.length - 2); k++) {
    cost += getTransitTime(route[k], route[k + 1]);
  }
  // 最后一个景点 → 终点锚点
  if (j === route.length - 1 && endAnchorId) {
    cost += getTransitTime(route[route.length - 1], endAnchorId);
  }
  return cost;
}

// ===== 新增：计算路线总交通时间 =====
export function calculateTotalTransitTime(
  orderedIds: string[],
  startId?: string | null,
  endId?: string | null,
): number {
  let total = 0;
  // 起点 → 第一个
  if (startId && orderedIds.length > 0 && startId !== orderedIds[0]) {
    total += getTransitTime(startId, orderedIds[0]);
  }
  // 景点之间
  for (let i = 0; i < orderedIds.length - 1; i++) {
    total += getTransitTime(orderedIds[i], orderedIds[i + 1]);
  }
  // 最后一个 → 终点
  if (endId && orderedIds.length > 0 && endId !== orderedIds[orderedIds.length - 1]) {
    total += getTransitTime(orderedIds[orderedIds.length - 1], endId);
  }
  return total;
}

// 将景点列表按天分组（基于预估游览时间，每天 8 小时可用）
export const groupByDay = (
  attractions: Attraction[],
  hoursPerDay: number = 8,
): Attraction[][] => {
  const days: Attraction[][] = [[]];
  let currentDayHours = 0;

  for (const attr of attractions) {
    const totalTime = attr.estimatedDuration + 0.5; // 加 30 分钟交通缓冲
    if (currentDayHours + totalTime > hoursPerDay && days[days.length - 1].length > 0) {
      days.push([]);
      currentDayHours = 0;
    }
    days[days.length - 1].push(attr);
    currentDayHours += totalTime;
  }

  return days;
};

// 计算路线总时间（含交通+游览）
export const calculateRouteTotalTime = (
  stops: RouteStop[],
): { totalMinutes: number; transitMinutes: number; visitMinutes: number } => {
  let transitMinutes = 0;
  let visitMinutes = 0;

  for (const stop of stops) {
    visitMinutes += stop.stayDuration;
    if (stop.transportToNext) {
      transitMinutes += stop.transportToNext.duration;
    }
  }

  return {
    totalMinutes: transitMinutes + visitMinutes,
    transitMinutes,
    visitMinutes,
  };
};

// 生成路线 Stops（从景点ID列表和出发时间）
export const generateRouteStops = (
  attractionIds: string[],
  day: number = 1,
  startTime: string = '09:00',
): RouteStop[] => {
  const stops: RouteStop[] = [];
  let currentTime = parseTime(startTime);

  for (let i = 0; i < attractionIds.length; i++) {
    const attrId = attractionIds[i];
    const stop: RouteStop = {
      attractionId: attrId,
      order: i,
      day,
      arrivalTime: formatTime(currentTime),
      stayDuration: 120, // 默认 2 小时
      transportToNext: null,
    };

    if (i < attractionIds.length - 1) {
      const nextId = attractionIds[i + 1];
      const option = getRouteOption(attrId, nextId);
      if (option) {
        stop.transportToNext = {
          mode: 'transit',
          duration: option.transit.time,
          distance: option.transit.distance,
          price: option.transit.price,
          detail: option.transit.detail,
        };
      }
    }

    stops.push(stop);
    currentTime += 120; // 游览时间
    if (stop.transportToNext) {
      currentTime += stop.transportToNext.duration;
    }
  }

  return stops;
};

// 时间辅助函数
function parseTime(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}
