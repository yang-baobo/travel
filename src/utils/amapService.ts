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
import { ApiError } from '../services/apiClient';
import {
  buildAmapRouteSegment,
  mapTransportPreferenceToAmapMode,
} from './amapRouteMapping';

export { buildAmapRouteSegment, mapTransportPreferenceToAmapMode } from './amapRouteMapping';

const routeCache = new Map<string, { data: TravelRoutesResponse; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function key(fromLng: number, fromLat: number, toLng: number, toLat: number, mode?: string): string {
  return [...[fromLng, fromLat, toLng, toLat].map(value => value.toFixed(6)), mode || 'all'].join('|');
}

function retryableRouteError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  return error.status === 0 || error.status === 429 || error.status >= 500
    || ['TIMEOUT', 'NETWORK_ERROR', 'AMAP_RATE_LIMITED', 'AMAP_TIMEOUT', 'AMAP_NETWORK_ERROR'].includes(error.code || '');
}

async function wait(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
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
  mode?: 'transit' | 'driving' | 'walking',
): Promise<TravelRoutesResponse> {
  const cacheKey = key(fromLng, fromLat, toLng, toLat, mode);
  const cached = routeCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) return cached.data;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await fetchTravelRoutes(fromLng, fromLat, toLng, toLat, mode);
      routeCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    } catch (error) {
      lastError = error;
      if (attempt === 1 || !retryableRouteError(error)) throw error;
      await wait(150 * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('真实路线服务不可用');
}

export async function fetchAmapRouteSegment(
  origin: TravelRouteEndpoint,
  destination: TravelRouteEndpoint,
  preference: TransportPreference,
  rule: Pick<TransportRule, 'defaultMode'> & Partial<Pick<TransportRule, 'walkMaxKm' | 'maxTransitMinutes' | 'maxWalkToStationKm'>>,
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
  if (preference !== 'any') {
    const route = await fetchAmapRoutesRaw(origin.location.longitude, origin.location.latitude, destination.location.longitude, destination.location.latitude, mode);
    return buildAmapRouteSegment(origin, destination, route, mode);
  }
  // “Any” is deliberately bounded: use the configured preference first and
  // make at most one fallback call, instead of fanning every pair into three
  // upstream requests.
  const candidates = Array.from(new Set<TravelRouteSegment['mode']>([mode, 'walking', 'transit', 'driving']));
  let lastSegment: TravelRouteSegment | null = null;
  for (const candidate of candidates.slice(0, 2)) {
    try {
      const route = await fetchAmapRoutesRaw(origin.location.longitude, origin.location.latitude, destination.location.longitude, destination.location.latitude, candidate);
      const segment = buildAmapRouteSegment(origin, destination, route, candidate);
      lastSegment = segment;
      const maxWalk = (rule.walkMaxKm ?? 1) * 1000;
      if (segment.status === 'available'
        && (candidate !== 'walking' || (segment.distanceMeters ?? Infinity) <= maxWalk)
        && (candidate !== 'transit' || rule.maxTransitMinutes === undefined || (segment.durationMinutes ?? Infinity) <= rule.maxTransitMinutes)) return segment;
    } catch (error) {
      if (!retryableRouteError(error)) throw error;
      lastSegment = null;
    }
  }
  if (lastSegment) return lastSegment;
  return {
    originId: origin.id,
    destinationId: destination.id,
    originName: origin.name,
    destinationName: destination.name,
    mode,
    distanceMeters: null,
    durationMinutes: null,
    price: null,
    detail: '高德未返回可用路线',
    provider: 'amap',
    calculatedAt: new Date().toISOString(),
    estimated: false,
    status: 'no_route',
  };
}

export function clearAmapCache(): void {
  routeCache.clear();
}

export function getAmapCacheSize(): number {
  return routeCache.size;
}
