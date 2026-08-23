import type { TransportPreference, TransportRule } from '../types';
import type { TravelRouteEndpoint, TravelRouteSegment, TravelRoutesResponse } from '../types/travel';

export function mapTransportPreferenceToAmapMode(
  preference: TransportPreference,
  rule: Pick<TransportRule, 'defaultMode'>,
): TravelRouteSegment['mode'] {
  if (preference === 'walking') return 'walking';
  if (preference === 'driving') return 'driving';
  if (preference === 'transit') return 'transit';
  return rule.defaultMode;
}

export function buildAmapRouteSegment(
  origin: TravelRouteEndpoint,
  destination: TravelRouteEndpoint,
  route: TravelRoutesResponse,
  mode: TravelRouteSegment['mode'],
): TravelRouteSegment {
  const option = route[mode];
  const samePoint = origin.id === destination.id
    || (origin.location.latitude === destination.location.latitude
      && origin.location.longitude === destination.location.longitude);
  const duration = option?.time;
  const distance = option?.distance;
  const available = option !== null
    && option !== undefined
    && Number.isFinite(duration)
    && Number.isFinite(distance)
    && ((duration as number) > 0 || samePoint)
    && ((distance as number) > 0 || samePoint);
  return {
    originId: origin.id,
    destinationId: destination.id,
    originName: origin.name,
    destinationName: destination.name,
    mode,
    distanceMeters: available ? Math.round((distance as number) * 1000) : null,
    durationMinutes: available ? Math.round(duration as number) : null,
    price: available && option && 'price' in option ? option.price : mode === 'walking' && available ? 0 : null,
    detail: available && option && mode === 'transit' && 'detail' in option ? option.detail : null,
    provider: 'amap',
    calculatedAt: new Date().toISOString(),
    estimated: false,
    status: available ? 'available' : 'no_route',
  };
}
