import { apiRequest } from './apiClient';
import type {
  TravelPlaceCategory,
  TravelPlaceListResponse,
  TravelProviderStatus,
  TravelRoutesResponse,
} from '../types/travel';
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
  return apiRequest<TravelPlaceListResponse>(`/api/travel/places?${params.toString()}`);
}

export function fetchTravelRoutes(
  fromLongitude: number,
  fromLatitude: number,
  toLongitude: number,
  toLatitude: number,
): Promise<TravelRoutesResponse> {
  const params = new URLSearchParams({
    origin: `${fromLongitude},${fromLatitude}`,
    destination: `${toLongitude},${toLatitude}`,
  });
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
