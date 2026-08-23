import { usePreferenceStore } from '../store/usePreferenceStore';
import { useRouteStore } from '../store/useRouteStore';
import { TravelHotel, TripHotelContext } from '../types/hotel';

export interface SelectedHotelRouteInput {
  hotelId: string;
  sourceHotelId: string;
  source: TravelHotel['source'];
  name: string;
  latitude: number | null;
  longitude: number | null;
  coordinateSource: TravelHotel['coordinateSource'];
  coordinateVerified: boolean;
  geoStatus: TravelHotel['geoStatus'];
}

export interface SelectedHotelItinerarySummary {
  hotelId: string;
  source: TravelHotel['source'];
  name: string;
  referencePrice: number | null;
  priceText: string | null;
  priceDisclaimer: string;
  bookingUrl: string | null;
}

export function getCurrentTripHotelContext(): TripHotelContext {
  const preferences = usePreferenceStore.getState();
  return {
    destination: preferences.selectedCity,
    checkInDate: preferences.travelStartDate,
    checkOutDate: preferences.travelReturnDate,
  };
}

export function getSelectedHotelForCurrentTrip(): TravelHotel | null {
  const context = getCurrentTripHotelContext();
  const routeStore = useRouteStore.getState();
  routeStore.reconcileSelectedHotelContext(context);
  return useRouteStore.getState().getSelectedHotelForTrip(context);
}

export function buildSelectedHotelRouteInput(): SelectedHotelRouteInput | null {
  const hotel = getSelectedHotelForCurrentTrip();
  if (!hotel) return null;
  return {
    hotelId: hotel.id,
    sourceHotelId: hotel.sourceHotelId,
    source: hotel.source,
    name: hotel.name,
    // FlyAI/provider coordinates remain observable metadata but are never route input
    // until the AMap matcher has verified this exact selected hotel.
    latitude: hotel.coordinateVerified && hotel.coordinateSource === 'amap' ? hotel.latitude : null,
    longitude: hotel.coordinateVerified && hotel.coordinateSource === 'amap' ? hotel.longitude : null,
    coordinateSource: hotel.coordinateSource,
    coordinateVerified: hotel.coordinateVerified,
    geoStatus: hotel.geoStatus,
  };
}

export function buildSelectedHotelItinerarySummary(): SelectedHotelItinerarySummary | null {
  const hotel = getSelectedHotelForCurrentTrip();
  if (!hotel) return null;
  return {
    hotelId: hotel.id,
    source: hotel.source,
    name: hotel.name,
    referencePrice: hotel.referencePrice,
    priceText: hotel.priceText,
    priceDisclaimer: hotel.priceDisclaimer,
    bookingUrl: hotel.bookingUrl,
  };
}
