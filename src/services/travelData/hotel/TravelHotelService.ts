import { HotelSearchParams, HotelSearchResponse } from '../../../types/hotel';
import { BackendHotelProvider, HotelProvider } from './HotelProvider';

export class TravelHotelService {
  constructor(private readonly provider: HotelProvider = new BackendHotelProvider()) {}

  search(params: HotelSearchParams): Promise<HotelSearchResponse> {
    const normalized: HotelSearchParams = {
      ...params,
      destination: params.destination.trim(),
      keyword: params.keyword?.trim() || undefined,
      poiName: params.poiName?.trim() || undefined,
    };
    if (!normalized.destination) throw new Error('destination is required');
    if (normalized.checkOutDate <= normalized.checkInDate) {
      throw new Error('checkOutDate must be later than checkInDate');
    }
    return this.provider.search(normalized);
  }
}

export const travelHotelService = new TravelHotelService();
