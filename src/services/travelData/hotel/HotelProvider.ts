import { apiRequest } from '../../apiClient';
import { HotelSearchParams, HotelSearchResponse } from '../../../types/hotel';

export interface HotelProvider {
  search(params: HotelSearchParams): Promise<HotelSearchResponse>;
}

export class BackendHotelProvider implements HotelProvider {
  search(params: HotelSearchParams): Promise<HotelSearchResponse> {
    return apiRequest<HotelSearchResponse>('/api/travel/hotels/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    }, 45_000);
  }
}
