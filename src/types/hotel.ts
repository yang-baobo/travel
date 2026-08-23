export type HotelSource = 'fliggy' | 'static';
export type HotelPriceType = 'search_reference';
export type HotelCoordinateSource = 'amap' | 'provider' | null;
export type HotelGeoStatus = 'unresolved' | 'resolving' | 'verified' | 'ambiguous' | 'not_found' | 'error';
export type HotelGeoMatchLevel = 'exact' | 'strong' | 'ambiguous' | 'not_found';

export interface TravelHotel {
  id: string;
  source: HotelSource;
  sourceHotelId: string;
  name: string;
  city: string | null;
  district: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  coordinateSource: HotelCoordinateSource;
  coordinateVerified: boolean;
  geoStatus: HotelGeoStatus;
  geoMatchLevel: HotelGeoMatchLevel | null;
  geoConfidence: number | null;
  amapPoiId: string | null;
  geocodedAt: string | null;
  star: number | null;
  starLabel: string | null;
  rating: number | null;
  reviewCount: number | null;
  referencePrice: number | null;
  priceText: string | null;
  priceCurrency: 'CNY' | null;
  priceType: HotelPriceType;
  priceDisclaimer: string;
  originalPrice: number | null;
  roomInformation: Record<string, unknown>[] | null;
  roomAvailability: boolean | null;
  imageUrl: string | null;
  tags: string[];
  facilities: string[] | null;
  distanceMeters: number | null;
  nearbyText: string | null;
  bookingUrl: string | null;
  checkInDate: string;
  checkOutDate: string;
}

export interface HotelSearchParams {
  destination: string;
  checkInDate: string;
  checkOutDate: string;
  maxReferencePrice?: number;
  stars?: number[];
  keyword?: string;
  poiName?: string;
  sortBy?: 'none' | 'price_asc' | 'price_desc' | 'distance_candidate' | 'rating';
}

export interface HotelSearchResponse {
  hotels: TravelHotel[];
  meta: {
    source: 'fliggy';
    count: number;
    queryStatus: 'ok' | 'no_results';
    priceMeaning: 'search_reference';
    priceDisclaimer: string;
    nearbyPrecision: 'candidate_recall_only' | 'not_requested';
    ratingAvailable: boolean;
  };
}

export interface TripHotelContext {
  destination: string;
  checkInDate: string;
  checkOutDate: string;
}

export interface HotelGeoRequest {
  hotelId: string;
  source: HotelSource;
  sourceHotelId: string;
  name: string;
  destination: string;
  city: string | null;
  district: string | null;
  address: string | null;
}

export interface HotelGeoResponse {
  hotelId: string;
  status: 'verified' | 'ambiguous' | 'not_found';
  matchLevel: HotelGeoMatchLevel;
  confidence: number;
  latitude: number | null;
  longitude: number | null;
  coordinateSource: 'amap' | null;
  coordinateVerified: boolean;
  amapPoiId: string | null;
  matchedName: string | null;
  matchedAddress: string | null;
  matchedDistrict: string | null;
  provider: 'amap';
  calculatedAt: string;
  latencyMs: number;
  rejectedWrongCityCount: number;
  cached: boolean;
}
