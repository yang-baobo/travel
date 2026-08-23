import { HotelSearchParams, TravelHotel } from '../../../types/hotel';

export type HotelStarFilter = 'any' | '3' | '4' | '4-5' | '5';
export type HotelUiSort = 'none' | 'price_asc' | 'price_desc';

export interface HotelUiQueryInput {
  destination: string;
  checkInDate: string;
  checkOutDate: string;
  maxReferencePrice: number | null;
  starFilter: HotelStarFilter;
  keyword: string;
  sortBy: HotelUiSort;
}

const STAR_FILTERS: Record<HotelStarFilter, number[] | undefined> = {
  any: undefined,
  '3': [3],
  '4': [4],
  '4-5': [4, 5],
  '5': [5],
};

export function buildHotelSearchParams(input: HotelUiQueryInput): HotelSearchParams {
  const destination = input.destination.trim();
  if (!destination) throw new Error('destination is required');
  if (input.checkOutDate <= input.checkInDate) {
    throw new Error('checkOutDate must be later than checkInDate');
  }
  return {
    destination,
    checkInDate: input.checkInDate,
    checkOutDate: input.checkOutDate,
    maxReferencePrice: input.maxReferencePrice && input.maxReferencePrice > 0
      ? input.maxReferencePrice
      : undefined,
    stars: STAR_FILTERS[input.starFilter],
    keyword: input.keyword.trim() || undefined,
    sortBy: input.sortBy,
  };
}

export interface HotelCardViewModel {
  id: string;
  name: string;
  imageUrl: string | null;
  address: string | null;
  starText: string | null;
  ratingText: string | null;
  distanceText: string | null;
  priceText: string;
  priceCaption: string;
  tags: string[];
  isSelected: boolean;
  canOpenBooking: boolean;
}

export function formatHotelReferencePrice(hotel: TravelHotel): string {
  if (hotel.referencePrice === null) return '查看实时价格';
  const visible = hotel.priceText?.trim().replace(/\s*(?:起|起价)$/u, '')
    || `¥${Number.isInteger(hotel.referencePrice) ? hotel.referencePrice : hotel.referencePrice.toFixed(2)}`;
  return `${visible} 起`;
}

export function buildHotelCardViewModel(
  hotel: TravelHotel,
  selectedHotelId: string | null,
): HotelCardViewModel {
  return {
    id: hotel.id,
    name: hotel.name,
    imageUrl: hotel.imageUrl,
    address: hotel.address,
    starText: hotel.star !== null ? `${hotel.star}星` : hotel.starLabel,
    ratingText: hotel.rating !== null ? hotel.rating.toFixed(1) : null,
    distanceText: hotel.distanceMeters !== null
      ? hotel.distanceMeters >= 1000
        ? `${(hotel.distanceMeters / 1000).toFixed(1)}km`
        : `${Math.round(hotel.distanceMeters)}m`
      : null,
    priceText: formatHotelReferencePrice(hotel),
    priceCaption: hotel.referencePrice === null ? '前往飞猪查看' : '飞猪参考价',
    tags: hotel.tags.slice(0, 3),
    isSelected: selectedHotelId === hotel.id,
    canOpenBooking: Boolean(hotel.bookingUrl),
  };
}

export type HotelContentState = 'loading' | 'error' | 'empty' | 'ready';

export function getHotelContentState(input: {
  loading: boolean;
  errorMessage: string | null;
  hotelCount: number;
}): HotelContentState {
  if (input.loading) return 'loading';
  if (input.errorMessage) return 'error';
  if (input.hotelCount === 0) return 'empty';
  return 'ready';
}

export function getHotelSearchErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (code === 'NETWORK_ERROR') return '当前网络不可用，暂时无法查询实时酒店。';
    if (code === 'TIMEOUT' || code === 'HOTEL_PROVIDER_TIMEOUT') {
      return '实时酒店查询超时，请稍后重试。';
    }
    if (code === 'HOTEL_INVALID_REQUEST') {
      return '当前行程日期或酒店筛选无效，请返回行程设置检查后重试。';
    }
  }
  return '暂时没有获取到实时酒店信息，请稍后重试。';
}
