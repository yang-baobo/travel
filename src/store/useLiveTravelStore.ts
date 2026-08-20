import { create } from 'zustand';
import { searchTravelPlaces } from '../services/travelDataService';
import type { TravelPlace, TravelPlaceCategory } from '../types/travel';

const EMPTY_ITEMS: Record<TravelPlaceCategory, TravelPlace[]> = {
  attraction: [],
  hotel: [],
  restaurant: [],
};

interface LiveTravelState {
  items: Record<TravelPlaceCategory, TravelPlace[]>;
  page: Record<TravelPlaceCategory, number>;
  hasMore: Record<TravelPlaceCategory, boolean>;
  keywords: Record<TravelPlaceCategory, string>;
  loading: boolean;
  error: string | null;
  itinerary: TravelPlace[];
  search: (category: TravelPlaceCategory, keyword?: string, append?: boolean) => Promise<void>;
  getPlace: (placeId: string) => TravelPlace | undefined;
  addToItinerary: (place: TravelPlace) => void;
  removeFromItinerary: (placeId: string) => void;
  moveItineraryItem: (placeId: string, direction: -1 | 1) => void;
  clearError: () => void;
}

export const useLiveTravelStore = create<LiveTravelState>((set, get) => ({
  items: EMPTY_ITEMS,
  page: { attraction: 0, hotel: 0, restaurant: 0 },
  hasMore: { attraction: true, hotel: true, restaurant: true },
  keywords: { attraction: '', hotel: '', restaurant: '' },
  loading: false,
  error: null,
  itinerary: [],

  search: async (category, keyword = '', append = false) => {
    if (get().loading) return;
    const normalizedKeyword = keyword.trim();
    const currentPage = get().page[category];
    const page = append ? currentPage + 1 : 1;
    set({ loading: true, error: null });
    try {
      const result = await searchTravelPlaces(category, normalizedKeyword, page);
      set(state => ({
        items: {
          ...state.items,
          [category]: append ? [...state.items[category], ...result.items] : result.items,
        },
        page: { ...state.page, [category]: result.page },
        hasMore: { ...state.hasMore, [category]: result.hasMore },
        keywords: { ...state.keywords, [category]: normalizedKeyword },
        loading: false,
      }));
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : '加载失败，请稍后重试',
      });
    }
  },

  getPlace: placeId => {
    const state = get();
    return state.itinerary.find(item => item.id === placeId)
      || Object.values(state.items).flat().find(item => item.id === placeId);
  },

  addToItinerary: place => set(state => (
    state.itinerary.some(item => item.id === place.id)
      ? state
      : { itinerary: [...state.itinerary, place] }
  )),

  removeFromItinerary: placeId => set(state => ({
    itinerary: state.itinerary.filter(item => item.id !== placeId),
  })),

  moveItineraryItem: (placeId, direction) => set(state => {
    const from = state.itinerary.findIndex(item => item.id === placeId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= state.itinerary.length) return state;
    const itinerary = [...state.itinerary];
    [itinerary[from], itinerary[to]] = [itinerary[to], itinerary[from]];
    return { itinerary };
  }),

  clearError: () => set({ error: null }),
}));
