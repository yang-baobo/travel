import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RouteStop, RouteSource, DailyGuideAssignment } from '../types';
import { HotelGeoMatchLevel, HotelGeoStatus, TravelHotel, TripHotelContext } from '../types/hotel';
import { isSameTripHotelContext, normalizeTripHotelContext } from '../domain/tripHotel';

export interface RouteUserWeights {
  attraction: number;
  time: number;
  comfort: number;
  transport: number;
  cost: number;
  hotel: number;
  restaurant: number;
  preference: number;
}

export interface RouteUserProfile {
  preferredPace: 'intense' | 'comfort' | 'leisure' | 'relaxed';
  maxAcceptableOvertimeMinutes: number;
  prefersLowCost: boolean;
  dislikesLongTransport: boolean;
  prefersGoodRestaurants: boolean;
  prefersLateStart: boolean;
  prefersEarlyEnd: boolean;
  favoriteCategories: string[];
  dailyBufferMinutes: number;
}

const DEFAULT_USER_WEIGHTS: RouteUserWeights = {
  attraction: 0.20,
  time: 0.20,
  comfort: 0.15,
  transport: 0.10,
  cost: 0.10,
  hotel: 0.10,
  restaurant: 0.10,
  preference: 0.05,
};

const DEFAULT_USER_PROFILE: RouteUserProfile = {
  preferredPace: 'comfort',
  maxAcceptableOvertimeMinutes: 30,
  prefersLowCost: false,
  dislikesLongTransport: false,
  prefersGoodRestaurants: false,
  prefersLateStart: false,
  prefersEarlyEnd: false,
  favoriteCategories: [],
  dailyBufferMinutes: 30,
};

function clampWeight(value: number): number {
  return Math.max(0.03, Math.min(0.35, value));
}

function normalizeWeights(weights: RouteUserWeights): RouteUserWeights {
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  if (total <= 0) return { ...DEFAULT_USER_WEIGHTS };
  return {
    attraction: weights.attraction / total,
    time: weights.time / total,
    comfort: weights.comfort / total,
    transport: weights.transport / total,
    cost: weights.cost / total,
    hotel: weights.hotel / total,
    restaurant: weights.restaurant / total,
    preference: weights.preference / total,
  };
}

interface RouteState {
  routeSource: RouteSource;
  routeStops: RouteStop[];
  currentRouteId: string | null; // guide route or system route
  dailyGuideAssignment: DailyGuideAssignment;
  travelDays: number;
  userWeights: RouteUserWeights;
  userProfile: RouteUserProfile;
  selectedHotel: TravelHotel | null;
  selectedHotelContext: TripHotelContext | null;

  setRouteSource: (source: RouteSource) => void;
  setCurrentRouteId: (id: string | null) => void;
  setTravelDays: (days: number) => void;
  updateUserWeights: (weights: Partial<RouteUserWeights>) => void;
  updateUserProfile: (profile: Partial<RouteUserProfile>) => void;
  learnFromAttractionRemoval: (categoryNames?: string[]) => void;
  learnFromFreeTimeAdded: () => void;
  learnFromHotelChange: (changedToCheaper: boolean) => void;
  learnFromRestaurantChange: (changedToHigherRated: boolean) => void;
  learnFromOvertimeDecision: (acceptedOvertimeMinutes: number, accepted: boolean) => void;
  learnFromTimePreference: (prefersLateStart: boolean, prefersEarlyEnd: boolean) => void;
  selectHotel: (hotel: TravelHotel, context: TripHotelContext) => void;
  updateSelectedHotelGeography: (hotelId: string, update: {
    latitude: number | null;
    longitude: number | null;
    coordinateSource: TravelHotel['coordinateSource'];
    coordinateVerified: boolean;
    geoStatus: HotelGeoStatus;
    geoMatchLevel: HotelGeoMatchLevel | null;
    geoConfidence: number | null;
    amapPoiId: string | null;
    geocodedAt: string | null;
  }) => boolean;
  clearSelectedHotel: () => void;
  getSelectedHotelForTrip: (context: TripHotelContext) => TravelHotel | null;
  reconcileSelectedHotelContext: (context: TripHotelContext) => void;

  // 自定义路线操作
  addStop: (stop: RouteStop) => void;
  removeStop: (attractionId: string) => void;
  reorderStops: (stops: RouteStop[]) => void;
  updateStop: (attractionId: string, updates: Partial<RouteStop>) => void;
  clearStops: () => void;

  // 导游分配操作
  assignGuide: (day: number, guideId: string | null) => void;
  clearGuideAssignments: () => void;

  // 从预设路线加载
  loadFromPreset: (stops: RouteStop[], source: RouteSource, routeId: string, travelDays?: number, guideAssignment?: DailyGuideAssignment) => void;

  resetRoute: () => void;
}

export const useRouteStore = create<RouteState>()(persist((set, get) => ({
  routeSource: 'custom',
  routeStops: [],
  currentRouteId: null,
  dailyGuideAssignment: {},
  travelDays: 1,
  userWeights: { ...DEFAULT_USER_WEIGHTS },
  userProfile: { ...DEFAULT_USER_PROFILE },
  selectedHotel: null,
  selectedHotelContext: null,

  setRouteSource: (source) => set({ routeSource: source }),
  setCurrentRouteId: (id) => set({ currentRouteId: id }),
  setTravelDays: (days) => set({ travelDays: days }),
  updateUserWeights: (weights) => set((state) => ({
    userWeights: normalizeWeights({
      attraction: clampWeight(weights.attraction ?? state.userWeights.attraction),
      time: clampWeight(weights.time ?? state.userWeights.time),
      comfort: clampWeight(weights.comfort ?? state.userWeights.comfort),
      transport: clampWeight(weights.transport ?? state.userWeights.transport),
      cost: clampWeight(weights.cost ?? state.userWeights.cost),
      hotel: clampWeight(weights.hotel ?? state.userWeights.hotel),
      restaurant: clampWeight(weights.restaurant ?? state.userWeights.restaurant),
      preference: clampWeight(weights.preference ?? state.userWeights.preference),
    }),
  })),
  updateUserProfile: (profile) => set((state) => ({
    userProfile: {
      ...state.userProfile,
      ...profile,
      maxAcceptableOvertimeMinutes: profile.maxAcceptableOvertimeMinutes !== undefined
        ? Math.max(0, Math.min(90, profile.maxAcceptableOvertimeMinutes))
        : state.userProfile.maxAcceptableOvertimeMinutes,
      dailyBufferMinutes: profile.dailyBufferMinutes !== undefined
        ? Math.max(0, Math.min(180, profile.dailyBufferMinutes))
        : state.userProfile.dailyBufferMinutes,
    },
  })),
  learnFromAttractionRemoval: (categoryNames = []) => set((state) => ({
    userWeights: normalizeWeights({
      ...state.userWeights,
      transport: clampWeight(state.userWeights.transport + 0.03),
      comfort: clampWeight(state.userWeights.comfort + 0.02),
    }),
    userProfile: {
      ...state.userProfile,
      dislikesLongTransport: true,
      favoriteCategories: [...new Set([...state.userProfile.favoriteCategories, ...categoryNames])],
    },
  })),
  learnFromFreeTimeAdded: () => set((state) => ({
    userWeights: normalizeWeights({
      ...state.userWeights,
      comfort: clampWeight(state.userWeights.comfort + 0.05),
      time: clampWeight(state.userWeights.time + 0.02),
    }),
    userProfile: {
      ...state.userProfile,
      preferredPace: 'relaxed',
      dailyBufferMinutes: Math.min(120, state.userProfile.dailyBufferMinutes + 30),
    },
  })),
  learnFromHotelChange: (changedToCheaper) => set((state) => ({
    userWeights: normalizeWeights({
      ...state.userWeights,
      cost: clampWeight(state.userWeights.cost + (changedToCheaper ? 0.05 : -0.01)),
      hotel: clampWeight(state.userWeights.hotel + (changedToCheaper ? -0.01 : 0.03)),
    }),
    userProfile: {
      ...state.userProfile,
      prefersLowCost: changedToCheaper || state.userProfile.prefersLowCost,
    },
  })),
  learnFromRestaurantChange: (changedToHigherRated) => set((state) => ({
    userWeights: normalizeWeights({
      ...state.userWeights,
      restaurant: clampWeight(state.userWeights.restaurant + (changedToHigherRated ? 0.05 : 0)),
      cost: clampWeight(state.userWeights.cost + (changedToHigherRated ? -0.01 : 0.02)),
    }),
    userProfile: {
      ...state.userProfile,
      prefersGoodRestaurants: changedToHigherRated || state.userProfile.prefersGoodRestaurants,
    },
  })),
  learnFromOvertimeDecision: (acceptedOvertimeMinutes, accepted) => set((state) => ({
    userWeights: normalizeWeights({
      ...state.userWeights,
      time: clampWeight(state.userWeights.time + (accepted ? -0.02 : 0.05)),
      comfort: clampWeight(state.userWeights.comfort + (accepted ? -0.01 : 0.03)),
    }),
    userProfile: {
      ...state.userProfile,
      maxAcceptableOvertimeMinutes: accepted
        ? Math.min(60, Math.max(state.userProfile.maxAcceptableOvertimeMinutes, acceptedOvertimeMinutes))
        : Math.max(15, Math.min(state.userProfile.maxAcceptableOvertimeMinutes, Math.max(15, acceptedOvertimeMinutes - 15))),
    },
  })),
  learnFromTimePreference: (prefersLateStart, prefersEarlyEnd) => set((state) => ({
    userProfile: {
      ...state.userProfile,
      prefersLateStart,
      prefersEarlyEnd,
    },
    userWeights: normalizeWeights({
      ...state.userWeights,
      time: clampWeight(state.userWeights.time + ((prefersLateStart || prefersEarlyEnd) ? 0.03 : 0)),
    }),
  })),
  selectHotel: (hotel, context) => set({
    selectedHotel: {
      ...hotel,
      coordinateSource: hotel.coordinateSource ?? (
        hotel.latitude !== null && hotel.longitude !== null ? 'provider' : null
      ),
      coordinateVerified: hotel.coordinateSource === 'amap' && hotel.coordinateVerified === true,
      geoStatus: hotel.coordinateSource === 'amap' && hotel.coordinateVerified === true
        ? 'verified'
        : 'unresolved',
      geoMatchLevel: hotel.coordinateSource === 'amap' && hotel.coordinateVerified === true
        ? hotel.geoMatchLevel
        : null,
      geoConfidence: hotel.coordinateSource === 'amap' && hotel.coordinateVerified === true
        ? hotel.geoConfidence
        : null,
      amapPoiId: hotel.coordinateSource === 'amap' && hotel.coordinateVerified === true
        ? hotel.amapPoiId
        : null,
      geocodedAt: hotel.coordinateSource === 'amap' && hotel.coordinateVerified === true
        ? hotel.geocodedAt
        : null,
    },
    selectedHotelContext: normalizeTripHotelContext(context),
  }),
  updateSelectedHotelGeography: (hotelId, update) => {
    const current = get().selectedHotel;
    if (!current || current.id !== hotelId) return false;
    const validVerifiedCoordinate = update.coordinateVerified
      && update.coordinateSource === 'amap'
      && update.latitude !== null
      && update.longitude !== null
      && Number.isFinite(update.latitude)
      && Number.isFinite(update.longitude);
    set({
      selectedHotel: {
        ...current,
        ...update,
        latitude: validVerifiedCoordinate ? update.latitude : null,
        longitude: validVerifiedCoordinate ? update.longitude : null,
        coordinateSource: validVerifiedCoordinate ? 'amap' : null,
        coordinateVerified: validVerifiedCoordinate,
        geoStatus: validVerifiedCoordinate ? 'verified' : update.geoStatus,
      },
    });
    return true;
  },
  clearSelectedHotel: () => set({ selectedHotel: null, selectedHotelContext: null }),
  getSelectedHotelForTrip: (context) => {
    const state = get();
    return state.selectedHotel && isSameTripHotelContext(state.selectedHotelContext, context)
      ? state.selectedHotel
      : null;
  },
  reconcileSelectedHotelContext: (context) => {
    const state = get();
    if (state.selectedHotel && !isSameTripHotelContext(state.selectedHotelContext, context)) {
      set({ selectedHotel: null, selectedHotelContext: null });
    }
  },

  addStop: (stop) => {
    const current = get().routeStops;
    // 避免重复添加
    if (current.some(s => s.attractionId === stop.attractionId)) return;
    set({ routeStops: [...current, { ...stop, order: current.length }] });
  },

  removeStop: (attractionId) => {
    const current = get().routeStops.filter(s => s.attractionId !== attractionId);
    // 重新排序
    set({ routeStops: current.map((s, i) => ({ ...s, order: i })) });
  },

  reorderStops: (stops) => set({ routeStops: stops }),

  updateStop: (attractionId, updates) => {
    set({
      routeStops: get().routeStops.map(s =>
        s.attractionId === attractionId ? { ...s, ...updates } : s
      ),
    });
  },

  clearStops: () => set({ routeStops: [] }),

  assignGuide: (day, guideId) => {
    set({
      dailyGuideAssignment: {
        ...get().dailyGuideAssignment,
        [day]: guideId,
      },
    });
  },

  clearGuideAssignments: () => set({ dailyGuideAssignment: {} }),

  loadFromPreset: (stops, source, routeId, travelDays, guideAssignment) => {
    set({
      routeStops: stops,
      routeSource: source,
      currentRouteId: routeId,
      travelDays: travelDays ?? Math.max(1, ...stops.map(s => s.day)),
      dailyGuideAssignment: guideAssignment ?? {},
    });
  },

  resetRoute: () => set({
    routeSource: 'custom',
    routeStops: [],
    currentRouteId: null,
    dailyGuideAssignment: {},
    travelDays: 1,
    userWeights: { ...DEFAULT_USER_WEIGHTS },
    userProfile: { ...DEFAULT_USER_PROFILE },
    selectedHotel: null,
    selectedHotelContext: null,
  }),
}), {
  name: 'route-user-learning',
  storage: createJSONStorage(() => AsyncStorage),
  partialize: (state) => ({
    userWeights: state.userWeights,
    userProfile: state.userProfile,
  }),
}));
