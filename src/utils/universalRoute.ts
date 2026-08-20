import { RouteOption } from '../types';
import { attractions } from '../data/attractions';
import { restaurants } from '../data/restaurants';
import { hotels } from '../data/hotels';
import { getRouteOption } from '../data/travelTimeMatrix';
import { fetchAmapRoute } from './amapService';

// ======================================================================
// 通用路线查询器
// 优先级: 1.高德地图 API(异步) → 2.已有矩阵精确数据 → 3.基于坐标估算
// 同步接口 getUniversalRoute 保持向后兼容（离线模式）
// 异步接口 getUniversalRouteAsync 优先走高德 API
// ======================================================================

interface LocationInfo {
  id: string;
  name: string;
  lat: number;
  lng: number;
  zone: string;
}

// 构建全局位置注册表 (55个节点: 15景点 + 10酒店 + 30餐厅)
const locationRegistry: Record<string, LocationInfo> = {};

for (const a of attractions) {
  locationRegistry[a.id] = { id: a.id, name: a.name, lat: a.location.latitude, lng: a.location.longitude, zone: a.zone };
}
for (const r of restaurants) {
  locationRegistry[r.id] = { id: r.id, name: r.name, lat: r.location.latitude, lng: r.location.longitude, zone: r.zone };
}
for (const h of hotels) {
  locationRegistry[h.id] = { id: h.id, name: h.name, lat: h.location.latitude, lng: h.location.longitude, zone: h.zone };
}

// 注册深圳宝安国际机场为特殊节点
locationRegistry['airport-szx'] = { id: 'airport-szx', name: '深圳宝安国际机场', lat: 22.6393, lng: 113.8129, zone: 'F' };

// Haversine 公式计算两点间直线距离 (km)
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const ZONE_NAMES: Record<string, string> = {
  A: '南山区',
  B: '福田区',
  C: '罗湖区',
  D: '龙岗区',
  E: '盐田/大鹏',
  F: '宝安区',
};

// 节点类型标签
function getNodeTypeLabel(id: string): string {
  if (id.startsWith('a')) return '景点';
  if (id.startsWith('r')) return '餐厅';
  if (id.startsWith('h')) return '酒店';
  return '';
}

/**
 * 根据直线距离和区域信息估算路线
 * 按深圳真实交通规则:
 * - 地铁平均速度约 25-35 km/h (含候车)
 * - 出租车约 30-45 km/h (含拥堵)
 * - 公交约 15-20 km/h
 * - 步行约 5 km/h
 * - 出租车计价: 起步10元/2km, 2.6元/km
 * - 地铁: 2元起步, 递增
 */
function estimateRouteFromCoords(
  fromLoc: LocationInfo,
  toLoc: LocationInfo,
): RouteOption {
  const straightDist = haversineKm(fromLoc.lat, fromLoc.lng, toLoc.lat, toLoc.lng);
  const sameZone = fromLoc.zone === toLoc.zone;

  // 道路距离 ≈ 直线距离 × 1.3~1.5 (城市路网弯曲系数)
  const roadFactor = sameZone ? 1.3 : 1.4;
  const roadDist = Math.round(straightDist * roadFactor * 10) / 10;

  // === 公共交通 ===
  // 同区内平均 25km/h (近距离含步行可能更快)
  // 跨区平均 20km/h (含换乘等待)
  const transitSpeed = sameZone ? (roadDist < 3 ? 30 : 25) : (roadDist > 25 ? 18 : 20);
  const transitTime = Math.max(5, Math.round(roadDist / transitSpeed * 60));

  // 地铁票价: 2元起步, 大约 0.3元/km
  const transitPrice = Math.max(2, Math.round(2 + roadDist * 0.28));

  // 换乘次数: 同区0次, 跨区1-2次
  const transfers = sameZone ? 0 : (roadDist > 20 ? 2 : 1);

  // === 步行到站台 & 换乘步行估算 ===
  // 深圳城区站点密度较高，南山/福田一般300-600m内有站
  // 龙岗/盐田偏远区可能需要800-1200m
  const isUrban = ['A', 'B', 'C'].includes(fromLoc.zone);
  const walkToStationKm = isUrban
    ? Math.round((0.3 + Math.random() * 0.3) * 10) / 10
    : Math.round((0.5 + Math.random() * 0.5) * 10) / 10;
  const walkToStationMin = Math.max(3, Math.round(walkToStationKm / 5 * 60));

  // 换乘步行: 每次换乘约200-500m
  const transferWalkKm = transfers > 0
    ? Math.round((transfers * (0.2 + Math.random() * 0.3)) * 10) / 10
    : 0;
  const transferWalkMin = transfers > 0
    ? Math.max(2, Math.round(transferWalkKm / 4.5 * 60))
    : 0;

  // === 驾车/打车 ===
  const drivingSpeed = sameZone ? 35 : 30;
  const drivingTime = Math.max(3, Math.round(roadDist / drivingSpeed * 60));
  // 出租车: 10元起步(2km) + 2.6元/km, 拥堵附加 ~0.8元/分钟 * (time*0.3)
  const baseFare = 10;
  const kmFare = Math.max(0, roadDist - 2) * 2.6;
  const congestion = drivingTime * 0.3 * 0.8;
  const drivingPrice = Math.max(10, Math.round(baseFare + kmFare + congestion));

  // === 步行 ===
  // 仅当直线距离 < 2km 时提供 (实际步行约 2.5km)
  const walking = straightDist < 2.0
    ? { time: Math.max(3, Math.round(straightDist * 1.25 / 5 * 60)), distance: Math.round(straightDist * 1.25 * 10) / 10 }
    : null;

  // 描述文字
  const fromType = getNodeTypeLabel(fromLoc.id);
  const toType = getNodeTypeLabel(toLoc.id);
  const zonePart = sameZone
    ? `${ZONE_NAMES[fromLoc.zone] || fromLoc.zone}内`
    : `${ZONE_NAMES[fromLoc.zone] || fromLoc.zone}→${ZONE_NAMES[toLoc.zone] || toLoc.zone}`;

  let detail: string;
  if (straightDist < 1) {
    detail = `步行/短途公交 ${fromType}${fromLoc.name}→${toType}${toLoc.name}`;
  } else if (sameZone) {
    detail = `${zonePart}公交/地铁 ${fromLoc.name}→${toLoc.name}`;
  } else {
    detail = `${zonePart} 地铁换乘 ${fromLoc.name}→${toLoc.name}`;
  }

  return {
    transit: { time: transitTime, distance: roadDist, price: transitPrice, detail, transfers, walkToStationKm, walkToStationMin, transferWalkKm, transferWalkMin },
    driving: { time: drivingTime, distance: roadDist, price: drivingPrice },
    walking,
  };
}

/**
 * 通用路线查询: 支持任意两个节点之间的路线查询
 * 包括 景点(a01-a15) / 酒店(h01-h10) / 餐厅(r01-r30) 的所有组合
 *
 * @param fromId - 起点ID (如 'a01', 'r05', 'h03')
 * @param toId   - 终点ID
 * @returns RouteOption 或 null (同一节点)
 */
export function getUniversalRoute(fromId: string, toId: string): RouteOption | null {
  if (fromId === toId) return null;

  // 1. 优先查已有精确矩阵 (景点↔景点, 酒店↔景点, 酒店↔酒店)
  const existing = getRouteOption(fromId, toId);
  if (existing) return existing;

  // 2. 基于坐标估算路线
  const fromLoc = locationRegistry[fromId];
  const toLoc = locationRegistry[toId];
  if (!fromLoc || !toLoc) return null;

  return estimateRouteFromCoords(fromLoc, toLoc);
}

/**
 * 获取节点的位置信息
 */
export function getLocationInfo(id: string): LocationInfo | null {
  return locationRegistry[id] || null;
}

/**
 * 获取两点间直线距离 (km)
 */
export function getDistanceBetween(fromId: string, toId: string): number | null {
  const from = locationRegistry[fromId];
  const to = locationRegistry[toId];
  if (!from || !to) return null;
  return Math.round(haversineKm(from.lat, from.lng, to.lat, to.lng) * 100) / 100;
}

// ======================================================================
// 异步路线查询 — 优先高德 API，失败时回退离线
// ======================================================================

/**
 * 异步通用路线查询（高德 API 优先）
 * 查询顺序: 高德 API → 离线矩阵 → 坐标估算
 * 比同步版本更准确，但有 200~500ms 网络延迟
 */
export async function getUniversalRouteAsync(
  fromId: string,
  toId: string,
): Promise<RouteOption | null> {
  if (fromId === toId) return null;

  const fromLoc = locationRegistry[fromId];
  const toLoc = locationRegistry[toId];

  // 如果坐标信息都有，优先尝试高德 API
  if (fromLoc && toLoc) {
    try {
      const amapResult = await fetchAmapRoute(fromLoc.lng, fromLoc.lat, toLoc.lng, toLoc.lat);
      if (amapResult) return amapResult;
    } catch (e) {
      // API 失败，继续走离线
    }
  }

  // 回退到离线查询
  return getUniversalRoute(fromId, toId);
}

/**
 * 批量异步路线查询（并行请求，提高效率）
 * @param pairs - [[fromId, toId], [fromId, toId], ...]
 * @returns 与输入顺序对应的 RouteOption 数组
 */
export async function getUniversalRoutesBatch(
  pairs: [string, string][],
): Promise<(RouteOption | null)[]> {
  return Promise.all(
    pairs.map(([from, to]) => getUniversalRouteAsync(from, to))
  );
}
