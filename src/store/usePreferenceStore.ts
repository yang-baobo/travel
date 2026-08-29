import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TransportPreference, HotelLevelPreference, BudgetPreference, CuisineType, HotelZonePreference, HotelPriceRange, HotelAmenity, TransportRule, FlightPreference, FlightClass, AirlineType, LuggageOption, TimePeriod, HotelStayMode, FatigueLevel, DetourTolerance, TimeCostPreference, TransferComplexity } from '../types';

function getLocalDateAfter(days: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 新行程默认使用未来日期，避免真实酒店供应商拒绝已经过期的固定演示日期。
const getDefaultStartDate = () => getLocalDateAfter(1);
// A three-day trip spans the start date plus two nights. Keeping this aligned
// with PlanningRequest.days prevents a newly created session from being
// rejected by the strict date validator.
const getDefaultReturnDate = () => getLocalDateAfter(2);

const DEFAULT_TRANSPORT_RULE: TransportRule = {
  walkMaxKm: 1,
  defaultMode: 'transit',
  maxTransitMinutes: 60,
  maxWalkToStationKm: 1,
  dropOffLuggageAtHotel: true,
  drivingSubMode: 'taxi',
  fatigueLevel: 'standard',
  detourTolerance: 'moderate',
  timeCostPreference: 'balanced',
  transferComplexity: 'normal',
};

const DEFAULT_FLIGHT_PREFERENCE: FlightPreference = {
  preferredAirlineType: 'any',
  preferredCabin: 'any',
  preferDirectFlight: false,
  priceAlertThreshold: 200,
  nearbyDateAlertThreshold: 150,
  luggagePreference: 'any',
};

export interface PreferenceState {
  selectedCategories: string[];
  budgetRange: [number, number];
  travelDays: number;
  groupSize: number;
  hasSetPreferences: boolean;

  // 用户选择"稍后再说"后不再弹出首次偏好设置弹窗
  preferencePromptDismissed: boolean;

  // 记录已完成偏好设置的用户ID列表
  completedUserIds: string[];

  // 城市选择
  selectedCity: string;

  transportPref: TransportPreference;
  hotelLevelPref: HotelLevelPreference;
  budgetPref: BudgetPreference;

  needHotel: boolean;
  needBreakfast: boolean;
  needLunch: boolean;
  needDinner: boolean;
  lunchLatestEndTime: string;
  dinnerLatestEndTime: string;

  cuisinePrefs: CuisineType[];
  travelStartDate: string;
  travelReturnDate: string;
  departureTimePeriod: TimePeriod;
  returnTimePeriod: TimePeriod;

  // 酒店偏好
  hotelZonePref: HotelZonePreference;
  hotelPriceRange: HotelPriceRange;
  hotelAmenityPrefs: HotelAmenity[];
  hotelStayMode: HotelStayMode;

  // 交通自定义规则
  transportRule: TransportRule;

  // 航班偏好
  flightPreference: FlightPreference;

  // 导游收藏
  favoriteGuideIds: string[];

  // 返程当天设置
  returnDayTourEnabled: boolean;
  returnDayMinDepartureTime: string;
  returnDayWaitOption: 'hotel' | 'airport';

  // 本地定位 & 出发城市
  isInDestCity: boolean;          // 是否已在目的地城市
  departureCity: string;          // 出发城市（不在本地时）

  // 每日行程时间
  dailyStartTime: string;
  dailyEndTime: string;

  // 长辈模式
  elderlyMode: boolean;

  setSelectedCity: (city: string) => void;
  setCategories: (ids: string[]) => void;
  toggleCategory: (id: string) => void;
  setBudgetRange: (range: [number, number]) => void;
  setTravelDays: (days: number) => void;
  setGroupSize: (size: number) => void;
  setTransportPref: (pref: TransportPreference) => void;
  setHotelLevelPref: (pref: HotelLevelPreference) => void;
  setBudgetPref: (pref: BudgetPreference) => void;
  setNeedHotel: (v: boolean) => void;
  setNeedBreakfast: (v: boolean) => void;
  setNeedLunch: (v: boolean) => void;
  setNeedDinner: (v: boolean) => void;
  setLunchLatestEndTime: (time: string) => void;
  setDinnerLatestEndTime: (time: string) => void;
  toggleCuisinePref: (c: CuisineType) => void;
  setTravelStartDate: (date: string) => void;
  setTravelReturnDate: (date: string) => void;
  setDepartureTimePeriod: (period: TimePeriod) => void;
  setReturnTimePeriod: (period: TimePeriod) => void;
  setHotelZonePref: (zone: HotelZonePreference) => void;
  setHotelPriceRange: (range: HotelPriceRange) => void;
  toggleHotelAmenityPref: (a: HotelAmenity) => void;
  setHotelStayMode: (mode: HotelStayMode) => void;
  setTransportRule: (rule: Partial<TransportRule>) => void;
  setFlightPreference: (pref: Partial<FlightPreference>) => void;
  toggleFavoriteGuide: (guideId: string) => void;
  setReturnDayTourEnabled: (v: boolean) => void;
  setReturnDayMinDepartureTime: (time: string) => void;
  setReturnDayWaitOption: (opt: 'hotel' | 'airport') => void;
  setIsInDestCity: (v: boolean) => void;
  setDepartureCity: (city: string) => void;
  setElderlyMode: (v: boolean) => void;
  setDailyStartTime: (time: string) => void;
  setDailyEndTime: (time: string) => void;
  markPreferencesSet: () => void;
  markPreferencesSetForUser: (userId: string) => void;
  checkUserPreferences: (userId: string) => boolean;
  dismissPreferencePrompt: () => void;
  resetPreferences: () => void;
}

export const usePreferenceStore = create<PreferenceState>()(persist((set, get) => ({
  selectedCategories: [],
  budgetRange: [200, 1000],
  travelDays: 3,
  groupSize: 2,
  hasSetPreferences: false,
  preferencePromptDismissed: false,
  completedUserIds: [],
  selectedCity: '北京',
  transportPref: 'any',
  hotelLevelPref: 'any',
  budgetPref: 'any',
  needHotel: true,
  needBreakfast: false,
  needLunch: true,
  needDinner: true,
  lunchLatestEndTime: '14:00',
  dinnerLatestEndTime: '20:00',
  cuisinePrefs: [],
  travelStartDate: getDefaultStartDate(),
  travelReturnDate: getDefaultReturnDate(),
  departureTimePeriod: 'morning' as TimePeriod,
  returnTimePeriod: 'afternoon' as TimePeriod,
  hotelZonePref: 'any',
  hotelPriceRange: { min: 0, max: 2000 },
  hotelAmenityPrefs: [],
  hotelStayMode: 'flexible' as HotelStayMode,
  transportRule: { ...DEFAULT_TRANSPORT_RULE },
  flightPreference: { ...DEFAULT_FLIGHT_PREFERENCE },
  favoriteGuideIds: [],
  returnDayTourEnabled: true,
  returnDayMinDepartureTime: '09:00',
  returnDayWaitOption: 'hotel' as const,
  isInDestCity: false,
  departureCity: '大连',
  elderlyMode: false,
  dailyStartTime: '09:00',
  dailyEndTime: '19:00',

  setSelectedCity: (city) => set({ selectedCity: city }),
  setCategories: (ids) => set({ selectedCategories: ids }),
  toggleCategory: (id) => {
    const current = get().selectedCategories;
    if (current.includes(id)) {
      set({ selectedCategories: current.filter(c => c !== id) });
    } else {
      set({ selectedCategories: [...current, id] });
    }
  },
  setBudgetRange: (range) => set({ budgetRange: range }),
  setTravelDays: (days) => set({ travelDays: days }),
  setGroupSize: (size) => set({ groupSize: size }),
  setTransportPref: (pref) => set({ transportPref: pref }),
  setHotelLevelPref: (pref) => set({ hotelLevelPref: pref }),
  setBudgetPref: (pref) => set({ budgetPref: pref }),
  setNeedHotel: (v) => set({ needHotel: v }),
  setNeedBreakfast: (v) => set({ needBreakfast: v }),
  setNeedLunch: (v) => set({ needLunch: v }),
  setNeedDinner: (v) => set({ needDinner: v }),
  setLunchLatestEndTime: (time) => set({ lunchLatestEndTime: time }),
  setDinnerLatestEndTime: (time) => set({ dinnerLatestEndTime: time }),
  toggleCuisinePref: (c) => {
    const current = get().cuisinePrefs;
    if (current.includes(c)) {
      set({ cuisinePrefs: current.filter(x => x !== c) });
    } else {
      set({ cuisinePrefs: [...current, c] });
    }
  },
  setTravelStartDate: (date) => set({ travelStartDate: date }),
  setTravelReturnDate: (date) => set({ travelReturnDate: date }),
  setDepartureTimePeriod: (period) => set({ departureTimePeriod: period }),
  setReturnTimePeriod: (period) => set({ returnTimePeriod: period }),
  setHotelZonePref: (zone) => set({ hotelZonePref: zone }),
  setHotelPriceRange: (range) => set({ hotelPriceRange: range }),
  toggleHotelAmenityPref: (a) => {
    const current = get().hotelAmenityPrefs;
    if (current.includes(a)) {
      set({ hotelAmenityPrefs: current.filter(x => x !== a) });
    } else {
      set({ hotelAmenityPrefs: [...current, a] });
    }
  },
  setHotelStayMode: (mode) => set({ hotelStayMode: mode }),
  setTransportRule: (rule) => set({ transportRule: { ...get().transportRule, ...rule } }),
  setFlightPreference: (pref) => set({ flightPreference: { ...get().flightPreference, ...pref } }),
  toggleFavoriteGuide: (guideId) => {
    const current = get().favoriteGuideIds;
    if (current.includes(guideId)) {
      set({ favoriteGuideIds: current.filter(id => id !== guideId) });
    } else {
      set({ favoriteGuideIds: [...current, guideId] });
    }
  },
  setReturnDayTourEnabled: (v) => set({ returnDayTourEnabled: v }),
  setReturnDayMinDepartureTime: (time) => set({ returnDayMinDepartureTime: time }),
  setReturnDayWaitOption: (opt) => set({ returnDayWaitOption: opt }),
  setIsInDestCity: (v) => set({ isInDestCity: v }),
  setDepartureCity: (city) => set({ departureCity: city }),
  setElderlyMode: (v) => set({ elderlyMode: v }),
  setDailyStartTime: (time) => set({ dailyStartTime: time }),
  setDailyEndTime: (time) => set({ dailyEndTime: time }),
  markPreferencesSet: () => set({ hasSetPreferences: true }),
  markPreferencesSetForUser: (userId) => {
    const current = get().completedUserIds;
    if (!current.includes(userId)) {
      set({ hasSetPreferences: true, completedUserIds: [...current, userId] });
    } else {
      set({ hasSetPreferences: true });
    }
  },
  checkUserPreferences: (userId) => get().completedUserIds.includes(userId),
  dismissPreferencePrompt: () => set({ preferencePromptDismissed: true }),
  resetPreferences: () => set({
    selectedCity: '北京',
    selectedCategories: [],
    budgetRange: [200, 1000],
    travelDays: 3,
    groupSize: 2,
    hasSetPreferences: false,
    preferencePromptDismissed: false,
    transportPref: 'any',
    hotelLevelPref: 'any',
    budgetPref: 'any',
    needHotel: true,
    needBreakfast: false,
    needLunch: true,
    needDinner: true,
    lunchLatestEndTime: '14:00',
    dinnerLatestEndTime: '20:00',
    cuisinePrefs: [],
    travelStartDate: getDefaultStartDate(),
    travelReturnDate: getDefaultReturnDate(),
    departureTimePeriod: 'morning' as TimePeriod,
    returnTimePeriod: 'afternoon' as TimePeriod,
    hotelZonePref: 'any',
    hotelPriceRange: { min: 0, max: 2000 },
    hotelAmenityPrefs: [],
    hotelStayMode: 'flexible' as HotelStayMode,
    transportRule: { ...DEFAULT_TRANSPORT_RULE },
    flightPreference: { ...DEFAULT_FLIGHT_PREFERENCE },
    favoriteGuideIds: [],
    returnDayTourEnabled: true,
    returnDayMinDepartureTime: '09:00',
    returnDayWaitOption: 'hotel' as const,
    isInDestCity: false,
    departureCity: '大连',
    dailyStartTime: '09:00',
    dailyEndTime: '19:00',
  }),
}), {
  name: 'travel-platform-preferences-v1',
  storage: createJSONStorage(() => AsyncStorage),
}));
