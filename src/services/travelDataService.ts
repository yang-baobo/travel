import { apiRequest } from './apiClient';
import type {
  FliggyAttractionEditorialResponse,
  TravelPlaceCategory,
  TravelPlaceListResponse,
  TravelProviderStatus,
  TravelRoutesResponse,
} from '../types/travel';
import type { TravelPlace } from '../types/travel';
import type { HotelGeoRequest, HotelGeoResponse } from '../types/hotel';

export function fetchTravelConfig(): Promise<TravelProviderStatus> {
  return apiRequest<TravelProviderStatus>('/api/travel/config');
}

export function searchTravelPlaces(
  category: TravelPlaceCategory,
  keyword = '',
  page = 1,
  pageSize = 20,
): Promise<TravelPlaceListResponse> {
  const params = new URLSearchParams({
    category,
    keyword: keyword.trim(),
    page: String(page),
    pageSize: String(pageSize),
  });
  return apiRequest<TravelPlaceListResponse>(`/api/travel/explore?${params.toString()}`);
}

export function fetchFliggyAttractionEditorial(): Promise<FliggyAttractionEditorialResponse> {
  return apiRequest<FliggyAttractionEditorialResponse>(
    '/api/travel/attractions/editorial',
    undefined,
    45_000,
  );
}

/** Fetch a persisted place snapshot by its provider identity. */
export function fetchTravelPlaceDetail(
  source: 'amap' | 'fliggy',
  sourceId: string,
  category: 'attraction' | 'restaurant' = 'attraction',
): Promise<TravelPlace> {
  const params = new URLSearchParams({ source, sourceId, category });
  return apiRequest<TravelPlace>(`/api/travel/places/detail?${params.toString()}`, undefined, 8_000);
}

export function fetchTravelRoutes(
  fromLongitude: number,
  fromLatitude: number,
  toLongitude: number,
  toLatitude: number,
  mode?: 'transit' | 'driving' | 'walking',
): Promise<TravelRoutesResponse> {
  const params = new URLSearchParams({
    origin: `${fromLongitude},${fromLatitude}`,
    destination: `${toLongitude},${toLatitude}`,
  });
  if (mode) params.set('mode', mode);
  return apiRequest<TravelRoutesResponse>(`/api/travel/routes?${params.toString()}`, undefined, 12_000);
}

export function resolveTravelHotelGeography(payload: HotelGeoRequest): Promise<HotelGeoResponse> {
  return apiRequest<HotelGeoResponse>('/api/travel/hotels/geocode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, 12_000);
}

export function buildAmapNavigationUrl(
  name: string,
  longitude: number,
  latitude: number,
): string {
  const params = new URLSearchParams({
    sourceApplication: '北京旅行',
    poiname: name,
    lat: String(latitude),
    lon: String(longitude),
    dev: '0',
  });
  return `https://uri.amap.com/marker?${params.toString()}`;
}
