import type { DrivingInfo, TransitInfo, WalkingInfo } from './index';
import type { TransportMode } from './index';

export type TravelPlaceCategory = 'attraction' | 'hotel' | 'restaurant';

export interface TravelLocation {
  latitude: number;
  longitude: number;
}

export interface PartnerBooking {
  enabled: boolean;
  provider: 'ctrip' | 'meituan';
  label: string;
  url: string | null;
}

export interface TravelPlace {
  id: string;
  source: 'amap';
  category: TravelPlaceCategory;
  city: '北京';
  name: string;
  address: string;
  district: string;
  location: TravelLocation;
  typeName: string;
  typeCode: string;
  rating: number | null;
  cost: number | null;
  phone: string;
  openHours: string;
  businessArea: string;
  tags: string[];
  photoUrls: string[];
  booking: PartnerBooking;
}

export interface TravelPlaceListResponse {
  city: { name: '北京'; adcode: '110000'; citycode: '010' };
  category: TravelPlaceCategory;
  source: 'amap';
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  items: TravelPlace[];
}

export interface FliggyAttractionTicket {
  itemId: string | null;
  name: string | null;
  priceText: string | null;
}

export interface FliggyAttractionEditorial {
  id: string;
  source: 'fliggy';
  sourcePoiId: string;
  city: '北京';
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  category: string | null;
  poiLevel: string | null;
  description: string | null;
  imageUrl: string;
  jumpUrl: string | null;
  ticket: FliggyAttractionTicket | null;
}

export interface FliggyAttractionEditorialResponse {
  attractions: FliggyAttractionEditorial[];
  meta: {
    source: 'fliggy';
    city: '北京';
    count: number;
    imageMeaning: string;
    generatedAt?: string;
  };
}

export interface TravelProviderStatus {
  city: { name: '北京'; adcode: '110000'; citycode: '010' };
  amap: { configured: boolean; capabilities: string[] };
  ctrip: { configured: boolean; capabilities: string[] };
  meituan: { configured: boolean; capabilities: string[] };
}

export interface TravelRoutesResponse {
  source: 'amap';
  city: { name: '北京'; adcode: '110000'; citycode: '010' };
  origin: string;
  destination: string;
  transit: TransitInfo | null;
  driving: DrivingInfo | null;
  walking: WalkingInfo | null;
}

export interface TravelRouteEndpoint {
  id: string;
  name: string;
  location: TravelLocation;
}

export interface TravelRouteSegment {
  originId: string;
  destinationId: string;
  originName: string;
  destinationName: string;
  mode: Extract<TransportMode, 'transit' | 'driving' | 'walking'>;
  distanceMeters: number | null;
  durationMinutes: number | null;
  price: number | null;
  detail: string | null;
  provider: 'amap';
  calculatedAt: string;
  estimated: false;
  status: 'available' | 'no_route';
}
