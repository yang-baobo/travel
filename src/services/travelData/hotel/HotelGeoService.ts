import { useRouteStore } from '../../../store/useRouteStore';
import type {
  HotelGeoRequest,
  HotelGeoResponse,
  HotelGeoStatus,
  TravelHotel,
  TripHotelContext,
} from '../../../types/hotel';

type HotelGeoResolver = (request: HotelGeoRequest) => Promise<HotelGeoResponse>;

const defaultHotelGeoResolver: HotelGeoResolver = async request => {
  const { resolveTravelHotelGeography } = await import('../../travelDataService');
  return resolveTravelHotelGeography(request);
};

interface CachedHotelCoordinate {
  latitude: number;
  longitude: number;
  matchLevel: 'exact' | 'strong';
  confidence: number;
  amapPoiId: string | null;
  geocodedAt: string;
}

export interface HotelGeoHydrationResult {
  hotelId: string;
  status: HotelGeoStatus | 'stale';
  cached: boolean;
}

const coordinateCache = new Map<string, CachedHotelCoordinate>();
let latestRequestId = 0;

function normalizeIdentityPart(value: string | null): string {
  return (value || '').trim().replace(/\s+/g, '').toLowerCase();
}

export function buildHotelCoordinateCacheKey(
  hotel: Pick<TravelHotel, 'source' | 'sourceHotelId' | 'name' | 'address' | 'district'>,
  destination: string,
): string {
  return [
    hotel.source,
    hotel.sourceHotelId,
    normalizeIdentityPart(hotel.name),
    normalizeIdentityPart(hotel.address),
    normalizeIdentityPart(hotel.district),
    normalizeIdentityPart(destination),
  ].join('|');
}

export function clearHotelCoordinateCache(): void {
  coordinateCache.clear();
  latestRequestId = 0;
}

export function getHotelCoordinateCacheSize(): number {
  return coordinateCache.size;
}

function applyUnverifiedStatus(hotelId: string, status: HotelGeoStatus, response?: HotelGeoResponse): boolean {
  return useRouteStore.getState().updateSelectedHotelGeography(hotelId, {
    latitude: null,
    longitude: null,
    coordinateSource: null,
    coordinateVerified: false,
    geoStatus: status,
    geoMatchLevel: response?.matchLevel ?? null,
    geoConfidence: response?.confidence ?? null,
    amapPoiId: null,
    geocodedAt: response?.calculatedAt ?? null,
  });
}

export async function hydrateSelectedHotelGeography(
  hotelId: string,
  context: TripHotelContext,
  resolver: HotelGeoResolver = defaultHotelGeoResolver,
): Promise<HotelGeoHydrationResult> {
  const selectedHotel = useRouteStore.getState().selectedHotel;
  if (!selectedHotel || selectedHotel.id !== hotelId) {
    return { hotelId, status: 'stale', cached: false };
  }
  if (
    selectedHotel.coordinateVerified
    && selectedHotel.coordinateSource === 'amap'
    && selectedHotel.latitude !== null
    && selectedHotel.longitude !== null
  ) {
    return { hotelId, status: 'verified', cached: true };
  }

  const cacheKey = buildHotelCoordinateCacheKey(selectedHotel, context.destination);
  const cached = coordinateCache.get(cacheKey);
  if (cached) {
    const updated = useRouteStore.getState().updateSelectedHotelGeography(hotelId, {
      latitude: cached.latitude,
      longitude: cached.longitude,
      coordinateSource: 'amap',
      coordinateVerified: true,
      geoStatus: 'verified',
      geoMatchLevel: cached.matchLevel,
      geoConfidence: cached.confidence,
      amapPoiId: cached.amapPoiId,
      geocodedAt: cached.geocodedAt,
    });
    return { hotelId, status: updated ? 'verified' : 'stale', cached: true };
  }

  const requestId = ++latestRequestId;
  applyUnverifiedStatus(hotelId, 'resolving');
  const request: HotelGeoRequest = {
    hotelId: selectedHotel.id,
    source: selectedHotel.source,
    sourceHotelId: selectedHotel.sourceHotelId,
    name: selectedHotel.name,
    destination: context.destination,
    city: selectedHotel.city,
    district: selectedHotel.district,
    address: selectedHotel.address,
  };

  try {
    const response = await resolver(request);
    const currentHotel = useRouteStore.getState().selectedHotel;
    if (requestId !== latestRequestId || !currentHotel || currentHotel.id !== hotelId) {
      return { hotelId, status: 'stale', cached: false };
    }
    const isVerified = response.status === 'verified'
      && response.coordinateVerified
      && response.coordinateSource === 'amap'
      && response.latitude !== null
      && response.longitude !== null
      && Number.isFinite(response.latitude)
      && Number.isFinite(response.longitude)
      && (response.matchLevel === 'exact' || response.matchLevel === 'strong');
    if (!isVerified) {
      const status: HotelGeoStatus = response.status === 'ambiguous' ? 'ambiguous' : 'not_found';
      applyUnverifiedStatus(hotelId, status, response);
      return { hotelId, status, cached: false };
    }

    const verified: CachedHotelCoordinate = {
      latitude: response.latitude!,
      longitude: response.longitude!,
      matchLevel: response.matchLevel as 'exact' | 'strong',
      confidence: response.confidence,
      amapPoiId: response.amapPoiId,
      geocodedAt: response.calculatedAt,
    };
    coordinateCache.set(cacheKey, verified);
    const updated = useRouteStore.getState().updateSelectedHotelGeography(hotelId, {
      latitude: verified.latitude,
      longitude: verified.longitude,
      coordinateSource: 'amap',
      coordinateVerified: true,
      geoStatus: 'verified',
      geoMatchLevel: verified.matchLevel,
      geoConfidence: verified.confidence,
      amapPoiId: verified.amapPoiId,
      geocodedAt: verified.geocodedAt,
    });
    return { hotelId, status: updated ? 'verified' : 'stale', cached: response.cached };
  } catch {
    const currentHotel = useRouteStore.getState().selectedHotel;
    if (requestId !== latestRequestId || !currentHotel || currentHotel.id !== hotelId) {
      return { hotelId, status: 'stale', cached: false };
    }
    applyUnverifiedStatus(hotelId, 'error');
    return { hotelId, status: 'error', cached: false };
  }
}
