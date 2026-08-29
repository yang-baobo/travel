import { create } from 'zustand';
import { searchTravelPlaces } from '../services/travelDataService';
import type { TravelPlace, TravelPlaceCategory } from '../types/travel';

const EMPTY_ITEMS: Record<TravelPlaceCategory, TravelPlace[]> = {
  attraction: [],
  hotel: [],
  restaurant: [],
};

export interface ItineraryItemMeta {
  day: number;
  durationMinutes: number;
}

// 按地点类型的默认游玩时长（分钟）；盲盒地点稍短一些。
export function defaultDurationForPlace(place: TravelPlace): number {
  if (place.tags.includes('旅行盲盒')) return 90;
  if (place.category === 'restaurant') return 60;
  if (place.category === 'hotel') return 30;
  return 120;
}

interface LiveTravelState {
  items: Record<TravelPlaceCategory, TravelPlace[]>;
  page: Record<TravelPlaceCategory, number>;
  hasMore: Record<TravelPlaceCategory, boolean>;
  keywords: Record<TravelPlaceCategory, string>;
  loading: boolean;
  error: string | null;
  itinerary: TravelPlace[];
  itemMeta: Record<string, ItineraryItemMeta>;
  search: (category: TravelPlaceCategory, keyword?: string, append?: boolean) => Promise<void>;
  getPlace: (placeId: string) => TravelPlace | undefined;
  addToItinerary: (place: TravelPlace, meta?: Partial<ItineraryItemMeta>) => void;
  removeFromItinerary: (placeId: string) => void;
  moveItineraryItem: (placeId: string, direction: -1 | 1) => void;
  setPlaceDay: (placeId: string, day: number) => void;
  setPlaceDuration: (placeId: string, durationMinutes: number) => void;
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
  itemMeta: {},

  search: async (category, keyword = '', append = false) => {
    if (get().loading) return;
    if (category === 'hotel') {
      set({ error: '酒店请使用酒店搜索页面，以便提供日期、价格和房型信息。' });
      return;
    }
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

  addToItinerary: (place, meta) => set(state => {
    if (state.itinerary.some(item => item.id === place.id)) return state;
    const lastDay = state.itinerary.length > 0
      ? state.itemMeta[state.itinerary[state.itinerary.length - 1].id]?.day ?? 1
      : 1;
    return {
      itinerary: [...state.itinerary, place],
      itemMeta: {
        ...state.itemMeta,
        [place.id]: {
          day: Math.max(1, meta?.day ?? lastDay),
          durationMinutes: meta?.durationMinutes ?? defaultDurationForPlace(place),
        },
      },
    };
  }),

  removeFromItinerary: placeId => set(state => {
    const { [placeId]: _removed, ...remainingMeta } = state.itemMeta;
    return {
      itinerary: state.itinerary.filter(item => item.id !== placeId),
      itemMeta: remainingMeta,
    };
  }),

  moveItineraryItem: (placeId, direction) => set(state => {
    const from = state.itinerary.findIndex(item => item.id === placeId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= state.itinerary.length) return state;
    const itinerary = [...state.itinerary];
    [itinerary[from], itinerary[to]] = [itinerary[to], itinerary[from]];
    return { itinerary };
  }),

  setPlaceDay: (placeId, day) => set(state => {
    const current = state.itemMeta[placeId];
    if (!current || day < 1) return state;
    return { itemMeta: { ...state.itemMeta, [placeId]: { ...current, day } } };
  }),

  setPlaceDuration: (placeId, durationMinutes) => set(state => {
    const current = state.itemMeta[placeId];
    if (!current || durationMinutes < 15) return state;
    return { itemMeta: { ...state.itemMeta, [placeId]: { ...current, durationMinutes } } };
  }),

  clearError: () => set({ error: null }),
}));
