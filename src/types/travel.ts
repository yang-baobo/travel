import type { DrivingInfo, TransitInfo, WalkingInfo } from './index';

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
