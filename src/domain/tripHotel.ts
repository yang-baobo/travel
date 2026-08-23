import { TripHotelContext } from '../types/hotel';

export function normalizeTripHotelContext(context: TripHotelContext): TripHotelContext {
  return {
    destination: context.destination.trim().toLocaleLowerCase(),
    checkInDate: context.checkInDate.trim(),
    checkOutDate: context.checkOutDate.trim(),
  };
}

export function isSameTripHotelContext(
  left: TripHotelContext | null,
  right: TripHotelContext,
): boolean {
  if (!left) return false;
  const normalizedLeft = normalizeTripHotelContext(left);
  const normalizedRight = normalizeTripHotelContext(right);
  return normalizedLeft.destination === normalizedRight.destination
    && normalizedLeft.checkInDate === normalizedRight.checkInDate
    && normalizedLeft.checkOutDate === normalizedRight.checkOutDate;
}
