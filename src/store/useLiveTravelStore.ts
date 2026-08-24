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

export type SavedTripItemSource = 'manual' | 'ai_supplement' | 'ai_generated' | 'blind_box_preference' | 'blind_box_detour';
export type SavedTripSource = 'manual' | 'ai' | 'ai_supplement';

export interface SavedTripItem {
  id: string;
  category: 'attraction' | 'hotel' | 'restaurant' | 'experience';
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  startTime: string;
  endTime: string;
  duration: number;
  price: number;
  source: SavedTripItemSource;
  order: number;
  dayNumber: number;
}

export interface SavedTripDay {
  id: string;
  tripId: string;
  dayNumber: number;
  date: string;
  title: string;
  items: SavedTripItem[];
}

export interface SavedTrip {
  id: string;
  city: string;
  title: string;
  startDate: string;
  endDate: string;
  days: number;
  travelers: string;
  budget: number;
  pace: string;
  source: SavedTripSource;
  createdAt: string;
  dayPlans: SavedTripDay[];
}

export interface CreateTripFromAIPayload {
  city: string;
  title: string;
  startDate: string;
  days: number;
  travelers: string;
  budget: number;
  pace: string;
  source: SavedTripSource;
  items: Array<{
    id: string;
    category: SavedTripItem['category'];
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    price: number;
    durationMinutes: number;
    startTime: string;
    endTime: string;
    source: SavedTripItemSource;
  }>;
  replaceExisting?: boolean;
}

export interface BlindBoxInsertPayload {
  tripId: string;
  dayId: string;
  item: Omit<SavedTripItem, 'id' | 'order' | 'dayNumber'> & { id?: string };
  insertAfterItemId?: string | null;
  insertBeforeItemId?: string | null;
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
  currentTrip: SavedTrip | null;
  tripDays: SavedTripDay[];
  search: (category: TravelPlaceCategory, keyword?: string, append?: boolean) => Promise<void>;
  getPlace: (placeId: string) => TravelPlace | undefined;
  addToItinerary: (place: TravelPlace, meta?: Partial<ItineraryItemMeta>) => void;
  removeFromItinerary: (placeId: string) => void;
  moveItineraryItem: (placeId: string, direction: -1 | 1) => void;
  setPlaceDay: (placeId: string, day: number) => void;
  setPlaceDuration: (placeId: string, durationMinutes: number) => void;
  createTripFromAI: (payload: CreateTripFromAIPayload) => SavedTrip;
  insertBlindBoxIntoDay: (payload: BlindBoxInsertPayload) => SavedTrip;
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
  currentTrip: null,
  tripDays: [],

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

  createTripFromAI: payload => {
    const state = get();
    if (!Number.isInteger(payload.days) || ![3, 4, 5, 7].includes(payload.days)) {
      throw new Error('行程天数必须是3、4、5或7天');
    }
    if ((state.itinerary.length > 0 || state.currentTrip) && !payload.replaceExisting) {
      throw new Error(state.currentTrip ? '已有当前行程，请确认后再覆盖创建' : '已有手动行程，请先处理后再创建AI行程');
    }
    if (payload.items.some(item => !item.id || !item.name || !item.address || !Number.isFinite(item.latitude) || !Number.isFinite(item.longitude))) {
      throw new Error('行程地点缺少有效坐标或地址');
    }

    const tripId = `trip-ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const endDate = addDaysISO(payload.startDate, payload.days - 1);
    const dayPlans: SavedTripDay[] = Array.from({ length: payload.days }, (_, index) => {
      const dayNumber = index + 1;
      const dayItems = payload.items
        .filter((_, itemIndex) => itemIndex % payload.days === index)
        .map((item, itemIndex) => ({
          ...item,
          id: `${item.id}-${tripId}-${dayNumber}-${itemIndex}`,
          duration: item.durationMinutes,
          order: itemIndex + 1,
          dayNumber,
        }));
      return {
        id: `${tripId}-day-${dayNumber}`,
        tripId,
        dayNumber,
        date: addDaysISO(payload.startDate, index),
        title: dayItems.length ? `北京探索 · 第${dayNumber}天` : '自由安排 / 休息',
        items: dayItems,
      };
    });
    const newTrip: SavedTrip = {
      id: tripId,
      city: payload.city,
      title: payload.title,
      startDate: payload.startDate,
      endDate,
      days: payload.days,
      travelers: payload.travelers,
      budget: payload.budget,
      pace: payload.pace,
      source: payload.source,
      createdAt: new Date().toISOString(),
      dayPlans,
    };
    const newItinerary = dayPlans.flatMap(day => day.items.map(item => toTravelPlace(item)));
    const newItemMeta = Object.fromEntries(dayPlans.flatMap(day => day.items.map(item => [item.id, { day: day.dayNumber, durationMinutes: item.duration }]))) as Record<string, ItineraryItemMeta>;

    // 所有数据先在内存中构建并校验，最后只进行一次状态更新，避免留下半条行程。
    set({ currentTrip: newTrip, tripDays: dayPlans, itinerary: newItinerary, itemMeta: newItemMeta });
    return newTrip;
  },

  insertBlindBoxIntoDay: payload => {
    const state = get();
    const trip = state.currentTrip;
    if (!trip || trip.id !== payload.tripId) throw new Error('当前行程不存在，请先创建行程');
    const dayIndex = trip.dayPlans.findIndex(day => day.id === payload.dayId);
    if (dayIndex < 0) throw new Error('选择的行程日期不存在');
    if (payload.item.id && state.itinerary.some(place => place.id === payload.item.id)) throw new Error('这个盲盒项目已经插入当前行程');
    const day = trip.dayPlans[dayIndex];
    if (day.items.some(item => item.name === payload.item.name && item.startTime === payload.item.startTime)) throw new Error('相同时间段已有这个盲盒项目');
    const itemId = `${payload.item.id ?? 'blind-box'}-${trip.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newItem: SavedTripItem = { ...payload.item, id: itemId, order: 0, dayNumber: day.dayNumber };
    const nextItems = [...day.items, newItem].sort((a, b) => a.startTime.localeCompare(b.startTime)).map((item, index) => ({ ...item, order: index + 1 }));
    const nextDays = trip.dayPlans.map((entry, index) => index === dayIndex ? { ...entry, items: nextItems } : entry);
    const nextTrip = { ...trip, dayPlans: nextDays };
    const nextItinerary = nextDays.flatMap(entry => entry.items.map(item => toTravelPlace(item)));
    const nextMeta = Object.fromEntries(nextDays.flatMap(entry => entry.items.map(item => [item.id, { day: entry.dayNumber, durationMinutes: item.duration }]))) as Record<string, ItineraryItemMeta>;
    set({ currentTrip: nextTrip, tripDays: nextDays, itinerary: nextItinerary, itemMeta: nextMeta });
    return nextTrip;
  },

  clearError: () => set({ error: null }),
}));

function addDaysISO(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function toTravelPlace(item: SavedTripItem): TravelPlace {
  return {
    id: item.id,
    source: 'amap',
    category: item.category === 'restaurant' ? 'restaurant' : item.category === 'hotel' ? 'hotel' : 'attraction',
    city: '北京',
    name: item.name,
    address: item.address,
    district: '北京',
    location: { latitude: item.latitude as number, longitude: item.longitude as number },
    typeName: item.category,
    typeCode: item.category,
    rating: null,
    cost: item.price,
    phone: '',
    openHours: `${item.startTime}-${item.endTime}`,
    businessArea: '北京',
    tags: ['AI行程'],
    photoUrls: [],
    booking: { enabled: false, provider: item.category === 'restaurant' ? 'meituan' : 'ctrip', label: '', url: null },
  };
}
