/**
 * 高德路线服务的兼容层。
 * 浏览器和 App 只请求本平台后端，真正的高德 Key 永远不进入客户端。
 */
import type { RouteOption, TransportPreference, TransportRule } from '../types';
import type {
  TravelRouteEndpoint,
  TravelRouteSegment,
  TravelRoutesResponse,
} from '../types/travel';
import { fetchTravelRoutes } from '../services/travelDataService';
import {
  buildAmapRouteSegment,
  mapTransportPreferenceToAmapMode,
} from './amapRouteMapping';

export { buildAmapRouteSegment, mapTransportPreferenceToAmapMode } from './amapRouteMapping';

const routeCache = new Map<string, { data: TravelRoutesResponse; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function key(fromLng: number, fromLat: number, toLng: number, toLat: number): string {
  return [fromLng, fromLat, toLng, toLat].map(value => value.toFixed(6)).join('|');
}

export async function fetchAmapRoute(
  fromLng: number,
  fromLat: number,
  toLng: number,
  toLat: number,
): Promise<RouteOption | null> {
  const result = await fetchAmapRoutesRaw(fromLng, fromLat, toLng, toLat).catch(error => {
    console.warn('旅行路线服务请求失败:', error);
    return null;
  });
  // 旧路线生成器要求公交与驾车方案都存在。这里不再用估算值冒充 API 数据。
  if (!result?.transit || !result.driving) return null;
  return {
    transit: result.transit,
    driving: result.driving,
    walking: result.walking,
  };
}

export async function fetchAmapRoutesRaw(
  fromLng: number,
  fromLat: number,
  toLng: number,
  toLat: number,
): Promise<TravelRoutesResponse> {
  const cacheKey = key(fromLng, fromLat, toLng, toLat);
  const cached = routeCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) return cached.data;
  const result = await fetchTravelRoutes(fromLng, fromLat, toLng, toLat);
  routeCache.set(cacheKey, { data: result, timestamp: Date.now() });
  return result;
}

export async function fetchAmapRouteSegment(
  origin: TravelRouteEndpoint,
  destination: TravelRouteEndpoint,
  preference: TransportPreference,
  rule: Pick<TransportRule, 'defaultMode'>,
): Promise<TravelRouteSegment> {
  const mode = mapTransportPreferenceToAmapMode(preference, rule);
  if (origin.id === destination.id) {
    return buildAmapRouteSegment(origin, destination, {
      source: 'amap',
      city: { name: '北京', adcode: '110000', citycode: '010' },
      origin: `${origin.location.longitude},${origin.location.latitude}`,
      destination: `${destination.location.longitude},${destination.location.latitude}`,
      transit: mode === 'transit' ? { time: 0, distance: 0, price: 0, detail: '同一地点', transfers: 0 } : null,
      driving: mode === 'driving' ? { time: 0, distance: 0, price: 0 } : null,
      walking: mode === 'walking' ? { time: 0, distance: 0 } : null,
    }, mode);
  }
  const route = await fetchAmapRoutesRaw(
    origin.location.longitude,
    origin.location.latitude,
    destination.location.longitude,
    destination.location.latitude,
  );
  return buildAmapRouteSegment(origin, destination, route, mode);
}

export function clearAmapCache(): void {
  routeCache.clear();
}

export function getAmapCacheSize(): number {
  return routeCache.size;
}
