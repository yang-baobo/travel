/**
 * 高德路线服务的兼容层。
 * 浏览器和 App 只请求本平台后端，真正的高德 Key 永远不进入客户端。
 */
import type { RouteOption } from '../types';
import { fetchTravelRoutes } from '../services/travelDataService';

const routeCache = new Map<string, { data: RouteOption; timestamp: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000;

function key(fromLng: number, fromLat: number, toLng: number, toLat: number): string {
  return [fromLng, fromLat, toLng, toLat].map(value => value.toFixed(6)).join('|');
}

export async function fetchAmapRoute(
  fromLng: number,
  fromLat: number,
  toLng: number,
  toLat: number,
): Promise<RouteOption | null> {
  const cacheKey = key(fromLng, fromLat, toLng, toLat);
  const cached = routeCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) return cached.data;

  try {
    const result = await fetchTravelRoutes(fromLng, fromLat, toLng, toLat);
    // 旧路线生成器要求公交与驾车方案都存在。这里不再用估算值冒充 API 数据。
    if (!result.transit || !result.driving) return null;
    const route: RouteOption = {
      transit: result.transit,
      driving: result.driving,
      walking: result.walking,
    };
    routeCache.set(cacheKey, { data: route, timestamp: Date.now() });
    return route;
  } catch (error) {
    console.warn('旅行路线服务请求失败:', error);
    return null;
  }
}

export function clearAmapCache(): void {
  routeCache.clear();
}

export function getAmapCacheSize(): number {
  return routeCache.size;
}
