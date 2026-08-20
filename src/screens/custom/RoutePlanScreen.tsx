import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, shadow } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { CustomStackParamList, ScheduleItem, TransportMode, Flight, FlightClass, LuggageOption, RoomType, Hotel, TimePeriod } from '../../types';
import { useRouteStore } from '../../store/useRouteStore';
import { useFavoriteStore } from '../../store/useFavoriteStore';
import { usePreferenceStore } from '../../store/usePreferenceStore';
import { getAttractionById, attractions as allAttractions } from '../../data/attractions';
import { hotels, getRoomTypesForHotel, getRecommendedRoomTypes } from '../../data/hotels';
import { guides } from '../../data/guides';
import { restaurants, getRestaurantsByZone } from '../../data/restaurants';
import { getUniversalRoute } from '../../utils/universalRoute';
import { formatPrice, getZoneName, getHotelLevelName } from '../../utils/formatters';
import { searchFlights, findPremiumAlternative, findCheapFlights, findFlightsByGroup, findSameSlotAlternatives, findCheaperAlternative, findCheaperNearbyDate, matchFlightTimePeriod } from '../../data/flights';
import { PREMIUM_CAR_TYPES, calcPremiumPrice, calcCarCount } from '../../utils/airportTransfer';
import { calcReturnDayTiming, isFlightTooEarly, findEnrouteAttraction, chooseLuggageStrategy, CHECKOUT_TIME, CHECKOUT_MINUTES, CHECKOUT_DURATION } from '../../utils/returnDayPlanner';
import { useAssistantStore } from '../../store/useAssistantStore';
import { optimizeDayRoute, calculateTotalTransitTime } from '../../utils/routeOptimizer';
import {
  isAttractionClosedOnDate,
  optimizeTravelRoute,
  parseOpeningWindows,
} from '../../services/routeOptimizationService';
import { calculateRouteConvenience } from '../../utils/recommendationEngine';
import { getAirportHandlingTime } from '../../utils/routeGenerator';
import { MEAL_WINDOWS, MEAL_RHYTHM, MIN_MEAL_GAP, MEAL_DURATION, HOTEL_BREAKFAST_ID,
         isInMealWindow, getHotelBreakfastOptions, shouldInsertMeal, shouldPreemptForMeal,
         buildMealScheduleItem, getBreakfastHotelForDay } from '../../utils/mealScheduler';

type Nav = NativeStackNavigationProp<CustomStackParamList, 'RoutePlan'>;

// ===== Time Utilities =====
function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + mins;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}
function minutesToTime(mins: number): string {
  const nh = Math.floor(mins / 60) % 24;
  const nm = mins % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}
function isValidTime(t: string): boolean {
  return /^\d{2}:\d{2}$/.test(t) && timeToMinutes(t) >= 0 && timeToMinutes(t) < 1440;
}

function isCompleteOrder(order: string[] | undefined, attractionIds: string[]): order is string[] {
  if (!order || order.length !== attractionIds.length) return false;
  const expected = new Set(attractionIds);
  return order.every(id => expected.has(id)) && new Set(order).size === attractionIds.length;
}

const START_TIMES = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00'];
const END_TIMES = ['17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '21:00'];
const LUNCH_END_TIMES = ['13:30', '14:00', '14:30', '15:00'];
const DINNER_END_TIMES = ['19:30', '20:00', '20:30', '21:00'];
const GROUP_SIZES = [1, 2, 3, 4, 5, 6];

interface DragItem {
  id: string;
  attractionId: string;
  name: string;
  zone: string;
  imageUrl: string;
  defaultDuration: number; // hours
  customDuration: number;  // hours (user-overridden)
  ticketPrice: number;
}

type ItineraryNodeType = 'airport' | 'hotel' | 'restaurant' | 'attraction' | 'custom';
type CustomInsertType = 'time' | 'place';

interface ItineraryNode {
  id: string;
  day: number;
  type: ItineraryNodeType;
  name: string;
  durationMinutes: number;
  locationId?: string;
  subtitle?: string;
  mealType?: 'breakfast' | 'lunch' | 'dinner';
  editable: boolean;
  fixedStartTime?: string;
  targetArrivalTime?: string;
  sourceAttractionId?: string;
  sourceRestaurantId?: string;
  sourceHotelId?: string;
  customType?: CustomInsertType;
  isDayEndHotel?: boolean;
  isStartAnchor?: boolean;
}

interface CustomInsertedNode {
  id: string;
  day: number;
  afterNodeId: string | null;
  insertType: CustomInsertType;
  title: string;
  durationMinutes: number;
  locationId?: string;
  locationName?: string;
  locationSourceType?: 'attraction' | 'restaurant' | 'hotel' | 'custom';
}

interface SearchablePlaceOption {
  id: string;
  name: string;
  type: 'attraction' | 'restaurant' | 'hotel';
  subtitle: string;
}

type RenderScheduleItem = ScheduleItem & {
  nodeId?: string;
  edgeId?: string;
  canSwitchToTaxi?: boolean;
  recommendedTransportMode?: TransportMode;
  isLastHotelNode?: boolean;
  isEditableNode?: boolean;
  absoluteStartMinutes?: number;
  absoluteEndMinutes?: number;
};

interface HotelRecommendation {
  hotel: Hotel;
  score: number;
  matchLevel: 'exact' | 'relaxed';
  mismatchReasons: string[];
  explanation?: string;
}

// 旅行节奏配置
type TravelPace = 'intense' | 'comfort' | 'leisure';
const PACE_CONFIG: Record<TravelPace, { label: string; icon: string; hoursPerDay: number; desc: string; color: string }> = {
  intense: { label: '特种兵', icon: 'flash', hoursPerDay: 9, desc: '8-10h/天 暴走打卡', color: '#EF4444' },
  comfort: { label: '舒适', icon: 'happy', hoursPerDay: 6, desc: '5-6h/天 不赶不慢', color: '#3B82F6' },
  leisure: { label: '休闲', icon: 'cafe', hoursPerDay: 4, desc: '3-4h/天 慢节奏', color: '#10B981' },
};

// 每日主题配置
type DayTheme = 'intense' | 'normal' | 'light' | 'shopping' | 'free';
const DAY_THEME_CONFIG: Record<DayTheme, { label: string; icon: string; attrRatio: number; desc: string; hoursPerDay: number }> = {
  intense: { label: '暴走日', icon: 'flash-outline', attrRatio: 1.5, desc: '多塞景点', hoursPerDay: 10 },
  normal:  { label: '标准日', icon: 'walk-outline', attrRatio: 1.0, desc: '按节奏走', hoursPerDay: 6 },
  light:   { label: '轻松日', icon: 'leaf-outline', attrRatio: 0.5, desc: '少景点多休息', hoursPerDay: 4 },
  shopping:{ label: '购物日', icon: 'bag-outline', attrRatio: 0.3, desc: '商圈为主', hoursPerDay: 5 },
  free:    { label: '自由日', icon: 'sunny-outline', attrRatio: 0, desc: '无景点安排', hoursPerDay: 0 },
};

export default function RoutePlanScreen() {
  const navigation = useNavigation<Nav>();
  const { routeStops } = useRouteStore();
  const prefStore = usePreferenceStore();
  const isLocal = prefStore.isInDestCity;

  // 监听小猫助手的路线修改请求
  const pendingModification = useAssistantStore((s) => s.pendingModification);
  useEffect(() => {
    if (!pendingModification) return;
    const { type, payload } = pendingModification;
    try {
      switch (type) {
        case 'change_restaurant':
          if (payload?.day && payload?.meal && payload?.restaurantId) {
            const key = `${payload.day}-${payload.meal}`;
            setSelectedRestaurants(prev => ({ ...prev, [key]: payload.restaurantId }));
          }
          break;
        case 'change_hotel':
          if (payload?.day && payload?.hotelId) {
            setSelectedHotelIds(prev => ({ ...prev, [payload.day]: payload.hotelId }));
          }
          break;
        case 'add_attraction': {
          if (payload?.attractionId) {
            const attr = getAttractionById(payload.attractionId);
            if (attr && !dragItems.find(d => d.attractionId === payload.attractionId)) {
              setDragItems(prev => [...prev, {
                id: payload.attractionId,
                attractionId: payload.attractionId,
                name: attr.name,
                zone: attr.zone,
                imageUrl: attr.imageUrl,
                defaultDuration: attr.estimatedDuration,
                customDuration: attr.estimatedDuration,
                ticketPrice: attr.ticketPrice,
              }]);
            }
          }
          break;
        }
        case 'remove_attraction':
          if (payload?.attractionId) {
            setDragItems(prev => prev.filter(d => d.attractionId !== payload.attractionId));
          }
          break;
      }
    } catch (e) {
      console.error('Route modification error:', e);
    }
    useAssistantStore.getState().clearRouteModification();
  }, [pendingModification]);

  // 景点总时长（纯游玩）
  const totalAttrHours = useMemo(() => {
    return routeStops.reduce((sum, s) => {
      const attr = getAttractionById(s.attractionId);
      return sum + (attr?.estimatedDuration || 2);
    }, 0);
  }, [routeStops]);

  // 总行程需求时长（景点 + 交通 + 用餐 + 缓冲）
  const totalTripHours = useMemo(() => {
    const attrHours = totalAttrHours;
    const attrCount = routeStops.length;
    // 景点间交通：每段平均约 30 分钟
    const transportHours = Math.max(0, attrCount - 1) * 0.5;
    // 用餐时间：每天约 1.5h（午餐+晚餐），按最少天数估算
    const minDaysEst = Math.max(1, Math.ceil(attrHours / PACE_CONFIG['intense'].hoursPerDay));
    const mealHours = minDaysEst * 1.5;
    // 缓冲：每天约 30 分钟（等车、排队、休息）
    const bufferHours = minDaysEst * 0.5;
    return attrHours + transportHours + mealHours + bufferHours;
  }, [totalAttrHours, routeStops.length]);

  // 各节奏所需天数（基于总行程时长）
  const daysPerPace = useMemo(() => {
    const result: Record<TravelPace, number> = {} as any;
    for (const pace of Object.keys(PACE_CONFIG) as TravelPace[]) {
      result[pace] = Math.max(1, Math.ceil(totalTripHours / PACE_CONFIG[pace].hoursPerDay));
    }
    return result;
  }, [totalTripHours]);

  // 用户设置的天数：优先从日期范围派生，确保日期和天数一致
  const [selectedDays, setSelectedDays] = useState(() => {
    const start = new Date(prefStore.travelStartDate);
    const end = new Date(prefStore.travelReturnDate);
    const dateRangeDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (dateRangeDays >= 1) return dateRangeDays;
    return prefStore.travelDays > 0 ? prefStore.travelDays : daysPerPace['comfort'];
  });

  // 自动识别当前天数匹配哪种节奏
  const matchedPace = useMemo((): TravelPace | null => {
    for (const pace of ['intense', 'comfort', 'leisure'] as TravelPace[]) {
      if (selectedDays === daysPerPace[pace]) return pace;
    }
    return null;
  }, [selectedDays, daysPerPace]);

  // 旅行节奏: 优先用匹配结果，否则保留手动选择
  const [travelPace, setTravelPace] = useState<TravelPace>('comfort');
  // 每日主题: day -> theme (默认跟随全局节奏)
  const [dayThemes, setDayThemes] = useState<Record<number, DayTheme>>({});

  // 当matchedPace变化时同步travelPace
  useEffect(() => {
    if (matchedPace) setTravelPace(matchedPace);
  }, [matchedPace]);
  const [startTime, setStartTime] = useState(prefStore.dailyStartTime || '09:00');
  const [endTime, setEndTime] = useState(prefStore.dailyEndTime || '19:00');
  const [customStartTime, setCustomStartTime] = useState('');
  const [customEndTime, setCustomEndTime] = useState('');
  const [useCustomStart, setUseCustomStart] = useState(false);
  const [useCustomEnd, setUseCustomEnd] = useState(false);

  const [groupSize, setGroupSize] = useState(prefStore.groupSize);
  const [selectedHotelIds, setSelectedHotelIds] = useState<Record<number, string>>({}); // day -> hotelId
  const [extraNights, setExtraNights] = useState(0); // 额外住宿晚数（不影响行程天数）
  const [selectedGuideId, setSelectedGuideId] = useState<string | null>(null);
  const [noGuide, setNoGuide] = useState(false);
  // 导游模式: 'unified' 统一导游, 'perDay' 分天选导游
  const [guideMode, setGuideMode] = useState<'unified' | 'perDay'>('unified');
  // 分天导游选择: day -> guideId
  const [dailyGuideIds, setDailyGuideIds] = useState<Record<number, string>>({});

  // 收藏按钮点击标志位，防止嵌套 TouchableOpacity 同时响应
  const favTapRef = useRef(false);

  // Draggable attraction items
  const [dragItems, setDragItems] = useState<DragItem[]>(() =>
    routeStops.map(s => {
      const attr = getAttractionById(s.attractionId);
      return {
        id: s.attractionId,
        attractionId: s.attractionId,
        name: attr?.name || '',
        zone: attr?.zone || 'A',
        imageUrl: attr?.imageUrl || '',
        defaultDuration: attr?.estimatedDuration || 2,
        customDuration: attr?.estimatedDuration || 2,
        ticketPrice: attr?.ticketPrice || 0,
      };
    })
  );

  // Selected restaurants: key "day-meal" -> restaurantId
  const [selectedRestaurants, setSelectedRestaurants] = useState<Record<string, string>>({});

  // Unified edit mode
  const [isEditMode, setIsEditMode] = useState(false);

  // Inserted itinerary nodes (time/place)
  const [customNodes, setCustomNodes] = useState<CustomInsertedNode[]>([]);
  const [showInsertNodeModal, setShowInsertNodeModal] = useState(false);
  const [insertDay, setInsertDay] = useState(1);
  const [insertAfterNodeId, setInsertAfterNodeId] = useState<string | null>(null);
  const [insertType, setInsertType] = useState<CustomInsertType>('time');
  const [insertTitle, setInsertTitle] = useState('');
  const [insertDurationValue, setInsertDurationValue] = useState('60');
  const [insertSearchText, setInsertSearchText] = useState('');
  const [selectedInsertPlace, setSelectedInsertPlace] = useState<SearchablePlaceOption | null>(null);

  // Restaurant picker
  const [showRestPicker, setShowRestPicker] = useState(false);
  const [restPickerKey, setRestPickerKey] = useState('');

  // Duration editor
  const [editDurationId, setEditDurationId] = useState<string | null>(null);
  const [editDurationValue, setEditDurationValue] = useState('');

  // Expanded transport rows
  const [expandedTransport, setExpandedTransport] = useState<Set<string>>(new Set());
  const [transportModeOverrides, setTransportModeOverrides] = useState<Record<string, TransportMode>>({});

  // Time overflow warning modal
  const [showOverflowModal, setShowOverflowModal] = useState(false);
  const [overflowDay, setOverflowDay] = useState(0);
  const [overflowMinutes, setOverflowMinutes] = useState(0);

  // 天数调整确认弹窗
  const [showDayAdjustModal, setShowDayAdjustModal] = useState(false);
  const [suggestedDays, setSuggestedDays] = useState(0);
  const [dayAdjustReason, setDayAdjustReason] = useState<'date_change' | 'overflow'>('date_change');


  // Hotel search modal
  const [showHotelSearch, setShowHotelSearch] = useState(false);
  const [hotelSearchDay, setHotelSearchDay] = useState(1);
  const [hotelFilterLevel, setHotelFilterLevel] = useState<'all' | 'budget' | 'mid' | 'luxury'>('all');
  const [hotelSortBy, setHotelSortBy] = useState<'price' | 'rating' | 'distance'>('rating');
  const [hotelSearchText, setHotelSearchText] = useState('');

  // Guide search modal
  const [showGuideSearch, setShowGuideSearch] = useState(false);
  const [showGuideCalendar, setShowGuideCalendar] = useState(false);
  const [calendarGuideId, setCalendarGuideId] = useState<string | null>(null);

  // Travel date
  const [travelStartDate, setTravelStartDate] = useState(prefStore.travelStartDate);
  const [travelReturnDate, setTravelReturnDate] = useState(prefStore.travelReturnDate);

  // ===== 航班选择 =====
  const [departureFlight, setDepartureFlight] = useState<Flight | null>(null);
  const [returnFlight, setReturnFlight] = useState<Flight | null>(null);
  const [showFlightPicker, setShowFlightPicker] = useState<'departure' | 'return' | null>(null);
  const [flightSearchResults, setFlightSearchResults] = useState<Flight[]>([]);
  const dropOffAtHotel = prefStore.transportRule.dropOffLuggageAtHotel;
  const drivingSubMode = prefStore.transportRule.drivingSubMode;
  const drivingLabel = drivingSubMode === 'self' ? '自驾' : '打车';
  const getSelfDrivingPrice = (distKm: number) => Math.max(5, Math.round(distKm * 0.7 + 10));
  const [flightUpgradeHint, setFlightUpgradeHint] = useState<{ flight: Flight; premium: Flight } | null>(null);

  // ===== 机场交通方案选择 + 专车预约 =====
  const [airportPickupMode, setAirportPickupMode] = useState<'preference' | 'taxi'>('preference');
  const [airportDropoffMode, setAirportDropoffMode] = useState<'preference' | 'taxi'>('preference');
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [premiumDirection, setPremiumDirection] = useState<'pickup' | 'dropoff'>('pickup');
  const [selectedPremiumCarType, setSelectedPremiumCarType] = useState('comfort');
  const [premiumBookings, setPremiumBookings] = useState<{
    pickup: { carTypeId: string; price: number } | null;
    dropoff: { carTypeId: string; price: number } | null;
  }>({ pickup: null, dropoff: null });

  // ===== 独立接送机开关（无航班时使用） =====
  const [standalonePickup, setStandalonePickup] = useState(false);
  const [standaloneDropoff, setStandaloneDropoff] = useState(false);

  // ===== 酒店房型选择 & 详情弹窗 =====
  const [selectedRoomTypes, setSelectedRoomTypes] = useState<Record<number, RoomType>>({}); // day -> roomType
  const [showHotelDetail, setShowHotelDetail] = useState(false);
  const [hotelDetailDay, setHotelDetailDay] = useState(1);

  // ===== 航班方案切换 =====
  const [showFlightAlternatives, setShowFlightAlternatives] = useState<'departure' | 'return' | null>(null);

  // ===== 价差提醒 =====
  const [priceDiffWarning, setPriceDiffWarning] = useState<{ type: 'departure' | 'return'; diff: number; cheapest: Flight } | null>(null);
  const [nearbyDateWarning, setNearbyDateWarning] = useState<{ type: 'departure' | 'return'; diff: number; cheapest: Flight; date: string } | null>(null);

  // ===== 航班对比弹窗 =====
  const [showFlightCompareModal, setShowFlightCompareModal] = useState(false);
  const [flightCompareData, setFlightCompareData] = useState<{
    type: 'sameDay' | 'nearbyDate';
    direction: 'departure' | 'return';
    currentFlight: Flight;
    cheaperFlight: Flight;
    diff: number;
    date?: string;
  } | null>(null);

  // Attraction day assignments: attractionId -> dayNum
  const [attrDayMap, setAttrDayMap] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    const perDay = Math.ceil(routeStops.length / prefStore.travelDays);
    routeStops.forEach((s, i) => { map[s.attractionId] = Math.floor(i / perDay) + 1; });
    return map;
  });
  const optimizerRequestRef = useRef(0);
  const [optimizedDayOrders, setOptimizedDayOrders] = useState<Record<number, string[]>>({});
  const [optimizerStatus, setOptimizerStatus] = useState<'idle' | 'optimizing' | 'optimized' | 'partial' | 'fallback'>('idle');
  const [optimizerSolveTime, setOptimizerSolveTime] = useState(0);

  // 用户设置的每日开始/结束时间是硬窗口；节奏/主题只影响偏好，不再把游玩时长写死。
  const effectiveStart = useCustomStart && isValidTime(customStartTime) ? customStartTime : startTime;
  const effectiveEnd = useCustomEnd && isValidTime(customEndTime) ? customEndTime : endTime;
  const getMealLatestEndTime = useCallback((mealType: 'breakfast' | 'lunch' | 'dinner') => {
    if (mealType === 'lunch') return prefStore.lunchLatestEndTime;
    if (mealType === 'dinner') return prefStore.dinnerLatestEndTime;
    return minutesToTime(MEAL_RHYTHM.breakfast.hardEnd);
  }, [prefStore.dinnerLatestEndTime, prefStore.lunchLatestEndTime]);
  const getMealLatestEndMinutes = useCallback((mealType: 'breakfast' | 'lunch' | 'dinner') => (
    timeToMinutes(getMealLatestEndTime(mealType))
  ), [getMealLatestEndTime]);

  // Recalculate attrDayMap when selectedDays or dayThemes change - 按主题权重重新分布景点
  useEffect(() => {
    setAttrDayMap(() => {
      const map: Record<string, number> = {};
      const total = dragItems.length;
      if (total === 0) return map;

      // 计算每天权重 (基于日主题的 attrRatio)
      const defaultTheme: DayTheme = travelPace === 'intense' ? 'intense' : travelPace === 'leisure' ? 'light' : 'normal';
      const weights: number[] = [];
      for (let d = 1; d <= selectedDays; d++) {
        const theme = dayThemes[d] || defaultTheme;
        const attrRatio = DAY_THEME_CONFIG[theme].attrRatio;
        let playableStartMinute = timeToMinutes(effectiveStart);
        let playableEndMinute = timeToMinutes(effectiveEnd);
        if (d === 1 && departureFlight && !isLocal) {
          const departureMinute = timeToMinutes(departureFlight.departureTime);
          const rawArrivalMinute = timeToMinutes(departureFlight.arrivalTime);
          const arrivalMinute = rawArrivalMinute < departureMinute ? rawArrivalMinute + 1440 : rawArrivalMinute;
          const firstPlayableMinute = arrivalMinute + getAirportHandlingTime('SZX');
          playableStartMinute = Math.max(playableStartMinute, firstPlayableMinute);
        }
        if (d === selectedDays && returnFlight && !isLocal) {
          playableEndMinute = Math.min(playableEndMinute, timeToMinutes(returnFlight.departureTime) - 120);
        }
        const playableMinutes = Math.max(0, playableEndMinute - playableStartMinute);
        weights.push(attrRatio * playableMinutes);
      }
      const totalWeight = weights.reduce((s, w) => s + w, 0);

      // 若所有天都是自由日(totalWeight=0), 均匀分配
      if (totalWeight === 0) {
        const base = Math.floor(total / selectedDays);
        const extra = total % selectedDays;
        let idx = 0;
        for (let d = 1; d <= selectedDays; d++) {
          const count = base + (d <= extra ? 1 : 0);
          for (let j = 0; j < count && idx < total; j++, idx++) {
            map[dragItems[idx].attractionId] = d;
          }
        }
        return map;
      }

      // 按“预计游玩分钟 / 当天实际容量”做贪心均衡，不再只按景点数量平分。
      const dayLoads = Array.from({ length: selectedDays }, () => 0);
      dragItems.forEach(item => {
        const itemDemandMinutes = Math.round(item.customDuration * 60) + 30;
        let bestDayIndex = 0;
        let bestLoadRatio = Infinity;
        weights.forEach((capacityWeight, dayIndex) => {
          if (capacityWeight <= 0) return;
          const ratio = (dayLoads[dayIndex] + itemDemandMinutes) / capacityWeight;
          if (ratio < bestLoadRatio) {
            bestLoadRatio = ratio;
            bestDayIndex = dayIndex;
          }
        });
        map[item.attractionId] = bestDayIndex + 1;
        dayLoads[bestDayIndex] += itemDemandMinutes;
      });
      return map;
    });
  }, [selectedDays, dayThemes, travelPace, departureFlight, returnFlight, isLocal, effectiveStart, effectiveEnd, dragItems]);

  // Format date in Chinese
  const formatDateCN = useCallback((dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }, []);

  function findBestFlightForPeriod(results: Flight[], period: TimePeriod) {
    if (results.length === 0) return null;
    const exact = results.filter(flight => matchFlightTimePeriod(flight.departureTime, period));
    return (exact[0] || results[0]) ?? null;
  }

  // 根据出发/返程日期自动同步天数（日期范围决定旅行天数）
  useEffect(() => {
    const start = new Date(travelStartDate);
    const end = new Date(travelReturnDate);
    const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays >= 1 && diffDays !== selectedDays) {
      setSelectedDays(diffDays);
    }
  }, [travelStartDate, travelReturnDate]);

  // 天数变化时同步返回日期（双向同步，防止手动改天数后日期不一致）
  useEffect(() => {
    const start = new Date(travelStartDate);
    const newEnd = new Date(start);
    newEnd.setDate(newEnd.getDate() + selectedDays - 1);
    const newReturnDate = newEnd.toISOString().split('T')[0];
    if (newReturnDate !== travelReturnDate) {
      setTravelReturnDate(newReturnDate);
    }
  }, [selectedDays, travelStartDate]);

  // Helper: get travel dates array
  const travelDates = useMemo(() => {
    const dates: string[] = [];
    const start = new Date(travelStartDate);
    for (let i = 0; i < selectedDays; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().split('T')[0]);
    }
    return dates;
  }, [travelStartDate, selectedDays]);

  // ===== 航班自动选择：根据偏好选择最便宜的航班 =====
  useEffect(() => {
    if (isLocal) return; // 本地用户不需要航班
    const flightPref = prefStore.flightPreference;
    const results = searchFlights({
      departureCity: prefStore.departureCity,
      arrivalCity: '深圳',
      date: travelStartDate,
      cabin: flightPref.preferredCabin,
      airlineType: flightPref.preferredAirlineType,
      directOnly: flightPref.preferDirectFlight,
      luggageOption: flightPref.luggagePreference,
      timePeriod: prefStore.departureTimePeriod,
    });
    if (results.length === 0) return;
    if (departureFlight && matchFlightTimePeriod(departureFlight.departureTime, prefStore.departureTimePeriod)) return;
    const nextFlight = findBestFlightForPeriod(results, prefStore.departureTimePeriod);
    if (nextFlight) {
      setDepartureFlight(nextFlight);
    }
  }, [
    departureFlight,
    findBestFlightForPeriod,
    isLocal,
    prefStore.departureCity,
    prefStore.departureTimePeriod,
    prefStore.flightPreference,
    travelStartDate,
  ]);

  useEffect(() => {
    if (isLocal) return; // 本地用户不需要航班
    if (selectedDays <= 0) return;
    const returnDate = travelDates[travelDates.length - 1] || travelStartDate;
    const flightPref = prefStore.flightPreference;
    const results = searchFlights({
      departureCity: '深圳',
      arrivalCity: prefStore.departureCity,
      date: returnDate,
      cabin: flightPref.preferredCabin,
      airlineType: flightPref.preferredAirlineType,
      directOnly: flightPref.preferDirectFlight,
      luggageOption: flightPref.luggagePreference,
      timePeriod: prefStore.returnTimePeriod,
    });
    if (results.length === 0) return;
    if (returnFlight && matchFlightTimePeriod(returnFlight.departureTime, prefStore.returnTimePeriod)) return;
    const nextFlight = findBestFlightForPeriod(results, prefStore.returnTimePeriod);
    if (nextFlight) {
      setReturnFlight(nextFlight);
    }
  }, [
    findBestFlightForPeriod,
    isLocal,
    prefStore.departureCity,
    prefStore.flightPreference,
    prefStore.returnTimePeriod,
    returnFlight,
    selectedDays,
    travelDates,
    travelStartDate,
  ]);

  // ===== 本地用户切换时清除航班 =====
  useEffect(() => {
    if (isLocal) {
      setDepartureFlight(null);
      setReturnFlight(null);
    }
  }, [isLocal]);

  // ===== 差价检测: 同日差价 + 临近日期差价 =====
  useEffect(() => {
    if (isLocal) { setPriceDiffWarning(null); setNearbyDateWarning(null); return; }
    const flightPref = prefStore.flightPreference;
    // 检测同日差价
    let sameDayResult: { type: 'departure' | 'return'; diff: number; cheapest: Flight } | null = null;
    if (departureFlight) {
      const depResult = findCheaperAlternative(departureFlight);
      if (depResult && depResult.diff >= flightPref.priceAlertThreshold) {
        sameDayResult = { type: 'departure', diff: depResult.diff, cheapest: depResult.cheapest };
      }
    }
    if (!sameDayResult && returnFlight) {
      const retResult = findCheaperAlternative(returnFlight);
      if (retResult && retResult.diff >= flightPref.priceAlertThreshold) {
        sameDayResult = { type: 'return', diff: retResult.diff, cheapest: retResult.cheapest };
      }
    }
    setPriceDiffWarning(sameDayResult);

    // 检测临近日期差价
    let nearbyResult: { type: 'departure' | 'return'; diff: number; cheapest: Flight; date: string } | null = null;
    if (departureFlight) {
      const depNearby = findCheaperNearbyDate(departureFlight);
      if (depNearby && depNearby.diff >= flightPref.nearbyDateAlertThreshold) {
        nearbyResult = { type: 'departure', diff: depNearby.diff, cheapest: depNearby.cheapest, date: depNearby.date };
      }
    }
    if (!nearbyResult && returnFlight) {
      const retNearby = findCheaperNearbyDate(returnFlight);
      if (retNearby && retNearby.diff >= flightPref.nearbyDateAlertThreshold) {
        nearbyResult = { type: 'return', diff: retNearby.diff, cheapest: retNearby.cheapest, date: retNearby.date };
      }
    }
    setNearbyDateWarning(nearbyResult);
  }, [departureFlight, returnFlight, prefStore.flightPreference]);

  // Check if guide is busy on any travel date
  const isGuideBusy = useCallback((guide: typeof guides[0]) => {
    if (!guide.busyDates) return false;
    return travelDates.some(d => guide.busyDates!.includes(d));
  }, [travelDates]);

  const getGuideBusyDates = useCallback((guide: typeof guides[0]) => {
    if (!guide.busyDates) return [];
    return travelDates.filter(d => guide.busyDates!.includes(d));
  }, [travelDates]);

  const formatAmenityList = useCallback((amenities: string[]) => {
    if (amenities.length === 0) return '';
    if (amenities.length <= 3) return amenities.join('、');
    return `${amenities.slice(0, 3).join('、')}等`;
  }, []);

  const orderedIds = dragItems.map(d => d.attractionId);

  // 计算每天的有效起止时间（基于当日主题）
  const getDayEffectiveTimes = useCallback((dayNum: number) => {
    const defaultTheme: DayTheme = travelPace === 'intense' ? 'intense' : travelPace === 'leisure' ? 'light' : 'normal';
    const theme = dayThemes[dayNum] || defaultTheme;
    const cfg = DAY_THEME_CONFIG[theme];
    const startMinutes = timeToMinutes(effectiveStart);
    const endMinutes = timeToMinutes(effectiveEnd);
    const availableHours = Math.max(0, (endMinutes - startMinutes) / 60);

    if (theme === 'free') {
      return { start: effectiveStart, end: effectiveStart, hours: 0, theme, themeLabel: cfg.label };
    }

    // 所有非自由日都使用用户设置的真实时间窗口；主题只影响景点分配和 UI 标签。
    return { start: effectiveStart, end: effectiveEnd, hours: availableHours, theme, themeLabel: cfg.label };
  }, [effectiveStart, effectiveEnd, dayThemes, travelPace]);

  const attractionZones = useMemo(() => {
    const zones = new Set<string>();
    dragItems.forEach(d => zones.add(d.zone));
    return Array.from(zones);
  }, [dragItems]);

  // Hotel recommendations: use soft scoring instead of hard filtering, so we don't jump to expensive hotels just
  // because one amenity is missing.
  const perDayHotels = useMemo<Record<number, HotelRecommendation[]>>(() => {
    const result: Record<number, HotelRecommendation[]> = {};
    const favoriteHotelIds = useFavoriteStore.getState().favoriteHotelIds;
    const amenityPrefs = prefStore.hotelAmenityPrefs;
    const levelPref = prefStore.hotelLevelPref;
    const { min: minPrice, max: maxPrice } = prefStore.hotelPriceRange;

    for (let dayNum = 1; dayNum <= selectedDays; dayNum += 1) {
      const dayItems = dragItems.filter(item => attrDayMap[item.attractionId] === dayNum);
      const zoneSet = new Set(dayItems.map(item => item.zone));

      const scored = hotels.map((hotel): HotelRecommendation => {
        const amenityMatches = amenityPrefs.filter(pref => hotel.amenities.includes(pref));
        const missingAmenities = amenityPrefs.filter(pref => !hotel.amenities.includes(pref));
        const amenityScore = amenityPrefs.length === 0
          ? 0.8
          : amenityMatches.length / amenityPrefs.length;

        const inBudget = hotel.pricePerNight >= minPrice && hotel.pricePerNight <= maxPrice;
        const overBudgetRatio = maxPrice > 0 ? Math.max(0, (hotel.pricePerNight - maxPrice) / maxPrice) : 0;
        const underBudgetRatio = minPrice > 0 ? Math.max(0, (minPrice - hotel.pricePerNight) / minPrice) : 0;
        const priceScore = inBudget
          ? 1
          : hotel.pricePerNight > maxPrice
            ? Math.max(0.12, 1 - overBudgetRatio * 1.8)
            : Math.max(0.45, 1 - underBudgetRatio * 0.5);

        const zoneScore = zoneSet.size === 0
          ? 0.65
          : zoneSet.has(hotel.zone)
            ? 1
            : 0.45;

        const levelScore = levelPref === 'any'
          ? 0.7
          : hotel.level === levelPref
            ? 1
            : levelPref === 'budget'
              ? hotel.level === 'mid' ? 0.68 : 0.28
              : levelPref === 'mid'
                ? 0.6
                : hotel.level === 'mid' ? 0.72 : 0.4;

        const ratingScore = hotel.rating / 5;
        const favoriteScore = favoriteHotelIds.includes(hotel.id) ? 0.08 : 0;
        const score = zoneScore * 0.28 + priceScore * 0.32 + amenityScore * 0.2 + levelScore * 0.12 + ratingScore * 0.08 + favoriteScore;

        const mismatchReasons: string[] = [];
        if (!inBudget && hotel.pricePerNight > maxPrice) {
          mismatchReasons.push(`超出预算约${formatPrice(hotel.pricePerNight - maxPrice)}`);
        }
        if (missingAmenities.length > 0) {
          mismatchReasons.push(`缺少${formatAmenityList(missingAmenities)}`);
        }
        if (levelPref !== 'any' && hotel.level !== levelPref) {
          mismatchReasons.push(`不是${getHotelLevelName(levelPref)}`);
        }
        if (!zoneSet.has(hotel.zone) && zoneSet.size > 0) {
          mismatchReasons.push('离当天主路线稍远');
        }

        const matchLevel: 'exact' | 'relaxed' = mismatchReasons.length === 0 ? 'exact' : 'relaxed';
        let explanation: string | undefined;
        if (matchLevel === 'relaxed' && (mismatchReasons.some(reason => reason.startsWith('超出预算')) || missingAmenities.length > 0)) {
          const needText = [];
          if (levelPref !== 'any') needText.push(getHotelLevelName(levelPref));
          if (amenityPrefs.length > 0) needText.push(formatAmenityList(amenityPrefs));
          explanation = `当前价位附近暂无同时满足${needText.join(' + ')}的酒店，已推荐更接近的一家。`;
        }

        return { hotel, score, matchLevel, mismatchReasons, explanation };
      });

      scored.sort((a, b) => b.score - a.score);
      result[dayNum] = scored.slice(0, 4);
    }

    return result;
  }, [
    attrDayMap,
    dragItems,
    formatAmenityList,
    prefStore.hotelAmenityPrefs,
    prefStore.hotelLevelPref,
    prefStore.hotelPriceRange,
    selectedDays,
  ]);

  const recommendedGuides = useMemo(() => {
    const zoneMap: Record<string, string> = { A: '南山区', B: '福田区', C: '罗湖区', D: '龙岗区', E: '盐田区' };
    const zoneNames = attractionZones.map(z => zoneMap[z] || z);
    return guides.filter(g => g.isAvailableForHire && g.specialtyAreas.some(a => zoneNames.some(z => a.includes(z)))).slice(0, 4);
  }, [attractionZones]);

  // 收藏导游自动选择: 如果有收藏的导游且在旅行日期全部空闲，自动选中
  const availableFavoriteGuides = useMemo(() => {
    return prefStore.favoriteGuideIds
      .map(id => guides.find(g => g.id === id))
      .filter((g): g is typeof guides[0] => !!g && g.isAvailableForHire && !isGuideBusy(g));
  }, [prefStore.favoriteGuideIds, isGuideBusy]);

  useEffect(() => {
    // 仅在未手动选择导游且非自由行时自动选择
    if (noGuide || selectedGuideId) return;
    if (availableFavoriteGuides.length === 1) {
      setSelectedGuideId(availableFavoriteGuides[0].id);
    }
  }, [availableFavoriteGuides, noGuide, selectedGuideId]);

  const nearbyRestaurants = useMemo(() => {
    const rests = new Set<string>();
    attractionZones.forEach(z => getRestaurantsByZone(z).forEach(r => rests.add(r.id)));
    return restaurants.filter(r => rests.has(r.id));
  }, [attractionZones]);

  const searchablePlaceOptions = useMemo<SearchablePlaceOption[]>(() => {
    const attractionOptions = allAttractions.map(attr => ({
      id: attr.id,
      name: attr.name,
      type: 'attraction' as const,
      subtitle: `景点 · ${getZoneName(attr.zone)}`,
    }));
    const restaurantOptions = restaurants.map(rest => ({
      id: rest.id,
      name: rest.name,
      type: 'restaurant' as const,
      subtitle: `餐厅 · ${rest.cuisineType} · ${getZoneName(rest.zone)}`,
    }));
    const hotelOptions = hotels.map(hotel => ({
      id: hotel.id,
      name: hotel.name,
      type: 'hotel' as const,
      subtitle: `酒店 · ${getHotelLevelName(hotel.level)} · ${getZoneName(hotel.zone)}`,
    }));
    return [...attractionOptions, ...restaurantOptions, ...hotelOptions];
  }, []);

  const filteredInsertPlaceOptions = useMemo(() => {
    const q = insertSearchText.trim().toLowerCase();
    if (!q) return searchablePlaceOptions.slice(0, 30);
    return searchablePlaceOptions.filter(option =>
      option.name.toLowerCase().includes(q) ||
      option.subtitle.toLowerCase().includes(q)
    ).slice(0, 50);
  }, [insertSearchText, searchablePlaceOptions]);

  const getRecommendedTransportMode = useCallback((fromId: string, toId: string): TransportMode => {
    const route = getUniversalRoute(fromId, toId);
    if (!route) return prefStore.transportRule.defaultMode === 'driving' ? 'driving' : 'transit';
    if (route.walking && route.walking.distance <= prefStore.transportRule.walkMaxKm) {
      return 'walking';
    }
    return prefStore.transportRule.defaultMode === 'driving' ? 'driving' : 'transit';
  }, [prefStore.transportRule.defaultMode, prefStore.transportRule.walkMaxKm]);

  const createItineraryNodeFromCustom = useCallback((node: CustomInsertedNode): ItineraryNode => ({
    id: node.id,
    day: node.day,
    type: node.insertType === 'time'
      ? 'custom'
      : node.locationSourceType === 'restaurant'
        ? 'restaurant'
        : node.locationSourceType === 'hotel'
          ? 'hotel'
          : node.locationSourceType === 'attraction'
            ? 'attraction'
            : 'custom',
    name: node.title,
    durationMinutes: node.durationMinutes,
    locationId: node.locationId,
    editable: true,
    customType: node.insertType,
    subtitle: node.insertType === 'time' ? '自定义时间节点' : '自定义地点节点',
    sourceAttractionId: node.locationSourceType === 'attraction' ? node.locationId : undefined,
    sourceRestaurantId: node.locationSourceType === 'restaurant' ? node.locationId : undefined,
    sourceHotelId: node.locationSourceType === 'hotel' ? node.locationId : undefined,
  }), []);

  const injectCustomNodesIntoChain = useCallback((baseNodes: ItineraryNode[], dayNum: number) => {
    const nodes = [...baseNodes];
    const dayCustomNodes = customNodes.filter(node => node.day === dayNum);
    dayCustomNodes.forEach(customNode => {
      const itineraryNode = createItineraryNodeFromCustom(customNode);
      if (!customNode.afterNodeId) {
        const startAnchorIndex = nodes.findIndex(node => node.isStartAnchor);
        if (startAnchorIndex >= 0) {
          // 用户不在深圳时，首日的机场到达/取行李是硬起点；自定义节点也不能插到它前面。
          nodes.splice(startAnchorIndex + 1, 0, itineraryNode);
        } else {
          nodes.unshift(itineraryNode);
        }
        return;
      }
      const anchorIndex = nodes.findIndex(node => node.id === customNode.afterNodeId);
      if (anchorIndex === -1) {
        nodes.push(itineraryNode);
        return;
      }
      nodes.splice(anchorIndex + 1, 0, itineraryNode);
    });
    return nodes;
  }, [createItineraryNodeFromCustom, customNodes]);

  const buildMealNode = useCallback((dayNum: number, mealType: 'breakfast' | 'lunch' | 'dinner'): ItineraryNode | null => {
    const selectedId = selectedRestaurants[`${dayNum}-${mealType}`];
    if (!selectedId) return null;
    if (selectedId === HOTEL_BREAKFAST_ID) {
      const hotelId = getBreakfastHotelForDay(dayNum, selectedHotelIds);
      const hotel = hotelId ? hotels.find(h => h.id === hotelId) : null;
      if (!hotel || mealType !== 'breakfast') return null;
      const breakfast = getHotelBreakfastOptions(hotel);
      return {
        id: `day-${dayNum}-meal-${mealType}`,
        day: dayNum,
        type: 'restaurant',
        name: `酒店早餐 · ${hotel.name}`,
        durationMinutes: MEAL_DURATION.breakfast,
        locationId: hotel.id,
        editable: false,
        subtitle: breakfast?.included ? '含早，无需额外费用' : `早餐加购 ${formatPrice((breakfast?.price || 0) * groupSize)}`,
        mealType,
        sourceRestaurantId: HOTEL_BREAKFAST_ID,
      };
    }
    const restaurant = restaurants.find(rest => rest.id === selectedId);
    if (!restaurant) return null;
    return {
      id: `day-${dayNum}-meal-${mealType}`,
      day: dayNum,
      type: 'restaurant',
      name: restaurant.name,
      durationMinutes: MEAL_DURATION[mealType],
      locationId: restaurant.id,
      editable: false,
      subtitle: `${mealType === 'breakfast' ? '早餐' : mealType === 'lunch' ? '午餐' : '晚餐'} · ${restaurant.cuisineType} · 人均${formatPrice(restaurant.pricePerPerson)}`,
      mealType,
      sourceRestaurantId: restaurant.id,
    };
  }, [groupSize, selectedHotelIds, selectedRestaurants]);

  const estimateTravelMinutes = useCallback((fromId: string | null, toId: string | undefined): number => {
    if (!fromId || !toId || fromId === toId) return 0;
    const route = getUniversalRoute(fromId, toId);
    if (!route) return 10;
    const mode = getRecommendedTransportMode(fromId, toId);
    if (mode === 'driving') return route.driving.time;
    if (mode === 'walking' && route.walking) return route.walking.time;
    return route.transit.time;
  }, [getRecommendedTransportMode]);

  // OR-Tools owns the cross-day assignment and the order inside each day.
  // The existing greedy assignment remains the offline/error fallback.
  useEffect(() => {
    const requestId = ++optimizerRequestRef.current;
    if (dragItems.length === 0) {
      setOptimizedDayOrders({});
      setOptimizerStatus('idle');
      return undefined;
    }

    setOptimizedDayOrders({});
    const timer = setTimeout(() => {
      const runOptimization = async () => {
        setOptimizerStatus('optimizing');
        try {
          const nodeIds = Array.from(new Set([
            ...dragItems.map(item => item.attractionId),
            'airport-szx',
            ...Object.values(selectedHotelIds).filter(Boolean),
          ]));
          const durations = nodeIds.map(fromId => (
            nodeIds.map(toId => estimateTravelMinutes(fromId, toId))
          ));

          const optimizerDays = Array.from({ length: selectedDays }, (_, index) => {
            const dayNum = index + 1;
            const dayTimes = getDayEffectiveTimes(dayNum);
            let startMinute = timeToMinutes(dayTimes.start);
            let endMinute = timeToMinutes(dayTimes.end);
            const hasArrivalFlight = dayNum === 1 && !!departureFlight && !isLocal;
            const hasReturnFlight = dayNum === selectedDays && !!returnFlight && !isLocal;
            let startAnchorId: string | null = dayNum > 1 ? selectedHotelIds[dayNum - 1] || null : null;
            const endAnchorId: string | null = hasReturnFlight
              ? 'airport-szx'
              : dayNum < selectedDays ? selectedHotelIds[dayNum] || null : null;

            if (hasArrivalFlight && departureFlight) {
              const departureMinute = timeToMinutes(departureFlight.departureTime);
              const rawArrivalMinute = timeToMinutes(departureFlight.arrivalTime);
              const arrivalMinute = rawArrivalMinute < departureMinute ? rawArrivalMinute + 1440 : rawArrivalMinute;
              startMinute = Math.max(startMinute, arrivalMinute + getAirportHandlingTime('SZX'));
              startAnchorId = 'airport-szx';
              const arrivalHotelId = dropOffAtHotel ? selectedHotelIds[1] : null;
              if (arrivalHotelId) {
                startMinute += estimateTravelMinutes('airport-szx', arrivalHotelId) + 30;
                startAnchorId = arrivalHotelId;
              }
            }
            if (hasReturnFlight && returnFlight) {
              endMinute = Math.min(endMinute, timeToMinutes(returnFlight.departureTime) - 120);
            }

            const canReserveMeal = (meal: 'breakfast' | 'lunch' | 'dinner') => {
              const duration = MEAL_DURATION[meal];
              return startMinute <= getMealLatestEndMinutes(meal) - duration
                && endMinute >= MEAL_RHYTHM[meal].acceptStart + duration;
            };
            let reservedMinutes = dayTimes.theme === 'free' ? 0 : 30;
            if (prefStore.needBreakfast && (dayNum > 1 || isLocal) && canReserveMeal('breakfast')) {
              reservedMinutes += MEAL_DURATION.breakfast;
            }
            if (prefStore.needLunch && canReserveMeal('lunch')) reservedMinutes += MEAL_DURATION.lunch;
            if (prefStore.needDinner && canReserveMeal('dinner')) reservedMinutes += MEAL_DURATION.dinner;
            reservedMinutes += customNodes
              .filter(node => node.day === dayNum)
              .reduce((sum, node) => sum + node.durationMinutes, 0);

            return {
              day: dayNum,
              start_minute: startMinute,
              end_minute: Math.max(startMinute, endMinute),
              start_anchor_id: startAnchorId,
              end_anchor_id: endAnchorId,
              reserved_minutes: Math.min(720, reservedMinutes),
            };
          });

          const result = await optimizeTravelRoute({
            attractions: dragItems.map((item, index) => {
              const attraction = getAttractionById(item.attractionId);
              const defaultWindows = parseOpeningWindows(attraction?.openingHours || '全天开放');
              return {
                id: item.attractionId,
                duration_minutes: Math.max(1, Math.round(item.customDuration * 60)),
                opening_windows: defaultWindows,
                opening_windows_by_day: Object.fromEntries(
                  travelDates.map((date, dayIndex) => [
                    dayIndex + 1,
                    attraction && isAttractionClosedOnDate(attraction.openingHours, date) ? [] : defaultWindows,
                  ]),
                ),
                priority: Math.max(1, 100 - index),
              };
            }),
            days: optimizerDays,
            matrix: { node_ids: nodeIds, durations },
            max_solve_seconds: 3,
          });

          if (requestId !== optimizerRequestRef.current) return;
          const nextDayMap: Record<string, number> = {};
          const nextOrders: Record<number, string[]> = {};
          result.days.forEach(day => {
            nextOrders[day.day] = day.attraction_ids;
            day.attraction_ids.forEach(id => { nextDayMap[id] = day.day; });
          });
          setAttrDayMap(nextDayMap);
          setOptimizedDayOrders(nextOrders);
          setOptimizerSolveTime(result.solve_time_ms);
          setOptimizerStatus(result.status === 'optimized' ? 'optimized' : 'partial');
        } catch (error) {
          if (requestId !== optimizerRequestRef.current) return;
          console.warn('OR-Tools route optimization unavailable; using local fallback.', error);
          setOptimizedDayOrders({});
          setOptimizerStatus('fallback');
        }
      };
      void runOptimization();
    }, 350);

    return () => clearTimeout(timer);
  }, [
    customNodes,
    departureFlight,
    dragItems,
    dropOffAtHotel,
    estimateTravelMinutes,
    getDayEffectiveTimes,
    getMealLatestEndMinutes,
    isLocal,
    prefStore.needBreakfast,
    prefStore.needDinner,
    prefStore.needLunch,
    returnFlight,
    selectedDays,
    selectedHotelIds,
    travelDates,
  ]);

  const buildDayNodeChain = useCallback((dayNum: number, dayStart: string, dayEnd: string): ItineraryNode[] => {
    const rawDayAttrItems = dragItems.filter(item => attrDayMap[item.attractionId] === dayNum);
    const prevNightHotelId = dayNum > 1 ? selectedHotelIds[dayNum - 1] : null;
    const tonightHotelId = dayNum < selectedDays ? selectedHotelIds[dayNum] : null;
    const hasArrivalFlight = dayNum === 1 && !!departureFlight && !isLocal;
    const hasReturnFlight = dayNum === selectedDays && !!returnFlight && !isLocal;

    const startAnchorId = hasArrivalFlight
      ? 'airport-szx'
      : prevNightHotelId || null;
    const endAnchorId = hasReturnFlight
      ? 'airport-szx'
      : tonightHotelId || null;

    const rawDayAttrIds = rawDayAttrItems.map(item => item.attractionId);
    const optimizedAttrIds = isCompleteOrder(optimizedDayOrders[dayNum], rawDayAttrIds)
      ? optimizedDayOrders[dayNum]
      : rawDayAttrItems.length > 1
        ? optimizeDayRoute(rawDayAttrIds, startAnchorId || undefined, endAnchorId || undefined)
        : rawDayAttrIds;

    const orderedAttractions = optimizedAttrIds
      .map(id => rawDayAttrItems.find(item => item.attractionId === id))
      .filter((item): item is DragItem => item != null);

    const nodes: ItineraryNode[] = [];
    let simulatedMinutes = timeToMinutes(dayStart);
    const baseDayEndMinutes = timeToMinutes(dayEnd);
    const dayEndMinutes = hasReturnFlight
      ? Math.min(baseDayEndMinutes, timeToMinutes(returnFlight!.departureTime) - 120)
      : baseDayEndMinutes;
    let simulatedLocationId: string | null = null;
    let lastMealEndMinutes = 0;
    let lunchInserted = false;
    let dinnerInserted = false;

    const getFixedStartMinutes = (node: ItineraryNode) => {
      if (node.id === `day-${dayNum}-airport-arrival` && departureFlight) {
        const departureMinute = timeToMinutes(departureFlight.departureTime);
        const rawArrivalMinute = timeToMinutes(departureFlight.arrivalTime);
        return rawArrivalMinute < departureMinute ? rawArrivalMinute + 1440 : rawArrivalMinute;
      }
      return node.fixedStartTime ? timeToMinutes(node.fixedStartTime) : null;
    };

    const getEstimatedNodeTiming = (node: ItineraryNode) => {
      let start = simulatedMinutes + estimateTravelMinutes(simulatedLocationId, node.locationId);
      const fixedStartMinutes = getFixedStartMinutes(node);
      if (fixedStartMinutes !== null) {
        start = Math.max(start, fixedStartMinutes);
      }
      return { start, end: start + node.durationMinutes };
    };

    const appendNode = (node: ItineraryNode, options?: { allowBeyondDayEnd?: boolean }) => {
      const timing = getEstimatedNodeTiming(node);
      const travelToEndAnchor = endAnchorId && node.locationId
        ? estimateTravelMinutes(node.locationId, endAnchorId)
        : 0;
      if (!options?.allowBeyondDayEnd && timing.end + travelToEndAnchor > dayEndMinutes) {
        return false;
      }
      simulatedMinutes = timing.start;
      nodes.push(node);
      simulatedMinutes += node.durationMinutes;
      if (node.locationId) {
        simulatedLocationId = node.locationId;
      }
      if (node.mealType) {
        lastMealEndMinutes = simulatedMinutes;
        if (node.mealType === 'lunch') lunchInserted = true;
        if (node.mealType === 'dinner') dinnerInserted = true;
      }
      return true;
    };

    const withMealStartGuard = (node: ItineraryNode, mealType: 'lunch' | 'dinner'): ItineraryNode => {
      const rhythm = MEAL_RHYTHM[mealType];
      if (!rhythm) return node;
      // 饭点被提前抢占时，宁可在当前位置稍等，也不要把午餐/晚餐拖到很晚。
      if (simulatedMinutes < rhythm.acceptStart) {
        return { ...node, fixedStartTime: minutesToTime(rhythm.acceptStart) };
      }
      return node;
    };

    const appendMeal = (node: ItineraryNode | null, mealType: 'lunch' | 'dinner') => {
      if (!node) return false;
      if (mealType === 'lunch' && lunchInserted) return false;
      if (mealType === 'dinner' && dinnerInserted) return false;
      const guardedNode = withMealStartGuard(node, mealType);
      const timing = getEstimatedNodeTiming(guardedNode);
      if (timing.end > getMealLatestEndMinutes(mealType)) return false;
      return appendNode(guardedNode);
    };

    const preemptMealsBefore = (nextNode: ItineraryNode) => {
      const travelToNext = estimateTravelMinutes(simulatedLocationId, nextNode.locationId);
      const nextActivityDuration = travelToNext + nextNode.durationMinutes;
      const lunchLatestStart = getMealLatestEndMinutes('lunch') - MEAL_DURATION.lunch;
      const dinnerLatestStart = getMealLatestEndMinutes('dinner') - MEAL_DURATION.dinner;
      const canAdvanceLunch =
        !lunchInserted &&
        !!lunchNode &&
        simulatedMinutes + nextActivityDuration > lunchLatestStart &&
        simulatedMinutes >= MEAL_RHYTHM.lunch.acceptStart - 30 &&
        (lastMealEndMinutes <= 0 || simulatedMinutes - lastMealEndMinutes >= 120);
      if (canAdvanceLunch || shouldPreemptForMeal('lunch', simulatedMinutes, nextActivityDuration, lunchInserted, lastMealEndMinutes, getMealLatestEndMinutes('lunch'))) {
        appendMeal(lunchNode, 'lunch');
      }
      const canAdvanceDinner =
        !dinnerInserted &&
        !!dinnerNode &&
        simulatedMinutes + nextActivityDuration > dinnerLatestStart &&
        simulatedMinutes >= MEAL_RHYTHM.dinner.acceptStart - 30 &&
        (lastMealEndMinutes <= 0 || simulatedMinutes - lastMealEndMinutes >= 150);
      if (canAdvanceDinner || shouldPreemptForMeal('dinner', simulatedMinutes, nextActivityDuration, dinnerInserted, lastMealEndMinutes, getMealLatestEndMinutes('dinner'))) {
        appendMeal(dinnerNode, 'dinner');
      }
    };

    if (hasArrivalFlight) {
      appendNode({
        id: `day-${dayNum}-airport-arrival`,
        day: dayNum,
        type: 'airport',
        name: '深圳宝安国际机场',
        durationMinutes: getAirportHandlingTime('SZX'),
        locationId: 'airport-szx',
        editable: false,
        fixedStartTime: departureFlight!.arrivalTime,
        subtitle: '落地后取行李并出机场',
        isStartAnchor: true,
      }, { allowBeyondDayEnd: true });
      if (dropOffAtHotel && selectedHotelIds[1]) {
        const hotel = hotels.find(item => item.id === selectedHotelIds[1]);
        if (hotel) {
          appendNode({
            id: `day-${dayNum}-arrival-hotel`,
            day: dayNum,
            type: 'hotel',
            name: hotel.name,
            durationMinutes: 30,
            locationId: hotel.id,
            editable: false,
            subtitle: '先到酒店放行李 / 稍作休整',
            sourceHotelId: hotel.id,
          }, { allowBeyondDayEnd: true });
        }
      }
    } else if (prevNightHotelId) {
      const hotel = hotels.find(item => item.id === prevNightHotelId);
      if (hotel) {
        appendNode({
          id: `day-${dayNum}-start-hotel`,
          day: dayNum,
          type: 'hotel',
          name: hotel.name,
          durationMinutes: 0,
          locationId: hotel.id,
          editable: false,
          fixedStartTime: dayStart,
          subtitle: '从酒店出发',
          sourceHotelId: hotel.id,
          isStartAnchor: true,
        }, { allowBeyondDayEnd: true });
      }
    }

    const breakfastNode = buildMealNode(dayNum, 'breakfast');
    const canScheduleBreakfast =
      !!breakfastNode &&
      simulatedMinutes <= MEAL_RHYTHM.breakfast.hardEnd &&
      (dayNum > 1 || isLocal);
    if (canScheduleBreakfast && breakfastNode) appendNode(breakfastNode);

    const lunchNode = buildMealNode(dayNum, 'lunch');
    const dinnerNode = buildMealNode(dayNum, 'dinner');

    orderedAttractions.forEach((item) => {
      const attr = getAttractionById(item.attractionId);
      if (!attr) return;
      const actualMinutes = Math.round(item.customDuration * 60);
      const recommendedMinutes = Math.round(item.defaultDuration * 60);
      const durationNote = actualMinutes < recommendedMinutes
        ? `实际${actualMinutes}分钟 · 建议${recommendedMinutes}分钟（已压缩${recommendedMinutes - actualMinutes}分钟）`
        : `建议游玩${recommendedMinutes}分钟`;
      const attrNode: ItineraryNode = {
        id: `day-${dayNum}-attr-${item.attractionId}`,
        day: dayNum,
        type: 'attraction',
        name: attr.name,
        durationMinutes: actualMinutes,
        locationId: item.attractionId,
        editable: true,
        subtitle: `${durationNote} | ${attr.ticketPrice === 0 ? '免费' : formatPrice(attr.ticketPrice)}`,
        sourceAttractionId: item.attractionId,
      };
      preemptMealsBefore(attrNode);
      appendNode(attrNode);
    });

    if (lunchNode && !lunchInserted && simulatedMinutes <= getMealLatestEndMinutes('lunch') - MEAL_DURATION.lunch) {
      appendMeal(lunchNode, 'lunch');
    }
    if (dinnerNode && !dinnerInserted && simulatedMinutes <= getMealLatestEndMinutes('dinner') - MEAL_DURATION.dinner) {
      appendMeal(dinnerNode, 'dinner');
    }

    if (hasReturnFlight) {
      const flightBuffer = 120;
      const latestAirportArrival = addMinutes(returnFlight!.departureTime, -flightBuffer);
      appendNode({
        id: `day-${dayNum}-airport-departure`,
        day: dayNum,
        type: 'airport',
        name: '深圳宝安国际机场',
        durationMinutes: 0,
        locationId: 'airport-szx',
        editable: false,
        targetArrivalTime: latestAirportArrival,
        subtitle: `建议最晚 ${latestAirportArrival} 到达机场`,
      }, { allowBeyondDayEnd: true });
    } else if (tonightHotelId) {
      const hotel = hotels.find(item => item.id === tonightHotelId);
      if (hotel) {
        appendNode({
          id: `day-${dayNum}-end-hotel`,
          day: dayNum,
          type: 'hotel',
          name: hotel.name,
          durationMinutes: 0,
          locationId: hotel.id,
          editable: false,
          subtitle: '入住酒店 / 结束行程',
          sourceHotelId: hotel.id,
          isDayEndHotel: true,
        }, { allowBeyondDayEnd: true });
      }
    }

    return injectCustomNodesIntoChain(nodes, dayNum);
  }, [
    attrDayMap,
    buildMealNode,
    departureFlight,
    dragItems,
    dropOffAtHotel,
    estimateTravelMinutes,
    getMealLatestEndMinutes,
    injectCustomNodesIntoChain,
    isLocal,
    optimizedDayOrders,
    returnFlight,
    selectedDays,
    selectedHotelIds,
  ]);

  // Restaurant recommendation scoring: returns sorted list with reason tags
  // alreadyUsed: 已选餐厅id集合（用于去重）, usedCuisines: 已选菜系集合（用于保证多样性）
  const getRecommendedRestaurants = useCallback((dayNum: number, mealType: string, alreadyUsed: Set<string> = new Set(), usedCuisines: Set<string> = new Set()) => {
    // 使用 attrDayMap 获取当天实际景点（而非均匀切片），并按优化顺序排列
    const dayAttrIds_set = new Set(
      Object.entries(attrDayMap).filter(([_, d]) => d === dayNum).map(([id]) => id)
    );
    const dayItems = dragItems.filter(d => dayAttrIds_set.has(d.attractionId));
    // 对当天景点做快速排序以获取正确的前后位置
    const prevHotelId = dayNum > 1 ? selectedHotelIds[dayNum - 1] : null;
    const tonightHotelId = dayNum < selectedDays ? selectedHotelIds[dayNum] : null;
    const rawDayIds = dayItems.map(d => d.attractionId);
    const sortedIds = isCompleteOrder(optimizedDayOrders[dayNum], rawDayIds)
      ? optimizedDayOrders[dayNum]
      : dayItems.length > 1
        ? optimizeDayRoute(rawDayIds, prevHotelId, tonightHotelId)
        : rawDayIds;
    const sortedDayItems = sortedIds.map(id => dayItems.find(d => d.attractionId === id)).filter((d): d is DragItem => d != null);

    const dayZones = new Set(sortedDayItems.map(i => i.zone));
    const dayAttrIds = new Set(sortedDayItems.map(i => i.attractionId));
    const cuisinePrefs = prefStore.cuisinePrefs;

    // 确定用餐时间点附近的景点（基于优化后的排序位置）
    let mealNearbyAttrIds: Set<string>;
    let mealPrevAttrId: string | null = null;  // 用餐前一个景点
    let mealNextAttrIds: string[] = [];         // 用餐后续景点
    if (mealType === 'breakfast') {
      mealNearbyAttrIds = new Set(sortedDayItems.slice(0, 1).map(i => i.attractionId));
      mealPrevAttrId = prevHotelId;
      mealNextAttrIds = sortedDayItems.slice(0, 2).map(i => i.attractionId);
    } else if (mealType === 'lunch') {
      const mid = Math.floor(sortedDayItems.length / 2);
      mealNearbyAttrIds = new Set(sortedDayItems.slice(Math.max(0, mid - 1), mid + 2).map(i => i.attractionId));
      mealPrevAttrId = sortedDayItems[Math.max(0, mid - 1)]?.attractionId || null;
      mealNextAttrIds = sortedDayItems.slice(mid, mid + 2).map(i => i.attractionId);
    } else {
      mealNearbyAttrIds = new Set(sortedDayItems.slice(-2).map(i => i.attractionId));
      mealPrevAttrId = sortedDayItems[sortedDayItems.length - 1]?.attractionId || null;
      mealNextAttrIds = tonightHotelId ? [tonightHotelId] : [];
    }

    return nearbyRestaurants
      .filter(r => r.mealTypes.includes(mealType as any))
      .map(r => {
        let score = 0;
        const reasons: string[] = [];

        // 顺路评分：基于实际路线位置计算偏离度
        if (mealPrevAttrId && mealNextAttrIds.length > 0) {
          const convScore = calculateRouteConvenience(r.id, mealPrevAttrId, mealNextAttrIds);
          if (convScore > 0.7) {
            score += 40;
            reasons.push('非常顺路');
          } else if (convScore > 0.4) {
            score += 25;
            reasons.push('顺路');
          } else if (convScore > 0.2) {
            score += 10;
            reasons.push('略偏');
          }
        } else if (r.nearbyAttractions.some(a => mealNearbyAttrIds.has(a))) {
          // 无法计算顺路度时，回退到 nearbyAttractions 判断
          score += 30;
          reasons.push('附近');
        } else if (dayZones.has(r.zone)) {
          score += 15;
          reasons.push('同区域');
        } else if (r.nearbyAttractions.some(a => dayAttrIds.has(a))) {
          score += 10;
          reasons.push('就近');
        }

        // 匹配用户菜系偏好
        if (cuisinePrefs.length > 0 && cuisinePrefs.includes(r.cuisineType)) {
          score += 30;
          reasons.push('偏好菜系');
        }

        // 菜系多样性：避免连续吃同一种菜
        if (usedCuisines.has(r.cuisineType)) {
          score -= 20;
        } else {
          score += 10;
          reasons.push('换口味');
        }

        // 避免重复选同一家餐厅
        if (alreadyUsed.has(r.id)) {
          score -= 40;
        }

        // High rating
        if (r.rating >= 4.5) {
          score += 15;
          reasons.push('高评分');
        }

        // Good value (price under 80)
        if (r.pricePerPerson <= 80) {
          score += 8;
        }

        // Group meal available
        if (groupSize >= 2 && r.groupMealPrice) {
          score += 5;
          reasons.push('有团餐');
        }

        // 收藏餐厅优先
        if (useFavoriteStore.getState().favoriteRestaurantIds.includes(r.id)) {
          score += 25;
          reasons.push('收藏');
        }

        return { restaurant: r, score, reasons: reasons.filter(r => r !== '换口味' || !usedCuisines.has('')) };
      })
      .sort((a, b) => b.score - a.score);
  }, [nearbyRestaurants, dragItems, selectedDays, prefStore.cuisinePrefs, groupSize, attrDayMap, optimizedDayOrders, selectedHotelIds]);

  // ===== 餐食自动选择：根据偏好自动选择推荐餐厅，保证多样性和顺路 =====
  // 同时参考航班到达/出发时间，排除不合理的餐次
  useEffect(() => {
    const newSelections: Record<string, string> = {};
    const alreadyUsed = new Set<string>();
    const allowedMealKeys = new Set<string>();
    for (let d = 1; d <= selectedDays; d++) {
      const dayCuisines = new Set<string>();
      const dayTimes = getDayEffectiveTimes(d);
      const dayStartMinutes = d === 1 && departureFlight && !isLocal
        ? timeToMinutes(departureFlight.arrivalTime) + getAirportHandlingTime('SZX') + (dropOffAtHotel && selectedHotelIds[1] ? 30 : 0)
        : timeToMinutes(dayTimes.start);
      const dayEndMinutes = d === selectedDays && returnFlight && !isLocal
        ? Math.min(timeToMinutes(dayTimes.end), timeToMinutes(returnFlight.departureTime) - 120)
        : timeToMinutes(dayTimes.end);
      const canFitMealWindow = (meal: 'breakfast' | 'lunch' | 'dinner') => {
        const duration = MEAL_DURATION[meal];
        const latestStart = getMealLatestEndMinutes(meal) - duration;
        const earliestFinish = MEAL_RHYTHM[meal].acceptStart + duration;
        return dayStartMinutes <= latestStart && dayEndMinutes >= earliestFinish;
      };

      // 确定当天实际可用的餐次（考虑航班时间）
      const mealTypes: string[] = [];

      if (d === 1 && !isLocal && !departureFlight) {
        // 不在深圳且未选航班：D1 不安排任何餐饮
      } else {
        // 只安排当天时间线上仍有可能发生的餐次，避免下午两点还出现早餐。
        if (prefStore.needBreakfast && canFitMealWindow('breakfast') && (d > 1 || isLocal)) mealTypes.push('breakfast');
        if (prefStore.needLunch && canFitMealWindow('lunch')) mealTypes.push('lunch');
        if (prefStore.needDinner && canFitMealWindow('dinner')) mealTypes.push('dinner');
      }

      for (const meal of mealTypes) {
        const key = `${d}-${meal}`;
        allowedMealKeys.add(key);

        // 早餐特殊：优先使用酒店早餐
        if (meal === 'breakfast') {
          const hotelId = getBreakfastHotelForDay(d, selectedHotelIds);
          const hotel = hotelId ? hotels.find(h => h.id === hotelId) : null;
          const bkOpts = getHotelBreakfastOptions(hotel);
          if (bkOpts && (bkOpts.included || bkOpts.optional)) {
            // 酒店提供早餐，标记为 HOTEL_BREAKFAST_ID
            if (!selectedRestaurants[key] || selectedRestaurants[key] !== HOTEL_BREAKFAST_ID) {
              newSelections[key] = HOTEL_BREAKFAST_ID;
            } else {
              newSelections[key] = HOTEL_BREAKFAST_ID;
            }
            continue;
          }
        }

        if (selectedRestaurants[key] && selectedRestaurants[key] !== HOTEL_BREAKFAST_ID) {
          newSelections[key] = selectedRestaurants[key];
          alreadyUsed.add(selectedRestaurants[key]);
          const rest = restaurants.find(r => r.id === selectedRestaurants[key]);
          if (rest) dayCuisines.add(rest.cuisineType);
        } else {
          const scored = getRecommendedRestaurants(d, meal, alreadyUsed, dayCuisines);
          if (scored.length > 0) {
            const chosen = scored[0].restaurant;
            newSelections[key] = chosen.id;
            alreadyUsed.add(chosen.id);
            dayCuisines.add(chosen.cuisineType);
          }
        }
      }
    }
    setSelectedRestaurants(prev => {
      const next = { ...prev };
      let changed = false;
      Object.keys(next).forEach(key => {
        if (!allowedMealKeys.has(key)) {
          delete next[key];
          changed = true;
        }
      });
      Object.entries(newSelections).forEach(([key, value]) => {
        if (next[key] !== value) {
          next[key] = value;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [selectedDays, prefStore.needBreakfast, prefStore.needLunch, prefStore.needDinner, departureFlight, returnFlight, selectedHotelIds, getDayEffectiveTimes, getMealLatestEndMinutes, isLocal, dropOffAtHotel]);

  // ===== 酒店选择后自动选择推荐房型 =====
  useEffect(() => {
    const newRooms: Record<number, RoomType> = { ...selectedRoomTypes };
    Object.entries(selectedHotelIds).forEach(([dayStr, hotelId]) => {
      const day = parseInt(dayStr);
      if (!hotelId || newRooms[day]) return;
      const hotel = hotels.find(h => h.id === hotelId);
      if (!hotel) return;
      const recommended = getRecommendedRoomTypes(groupSize, hotel);
      if (recommended.length > 0) {
        newRooms[day] = recommended[0].type;
      }
    });
    setSelectedRoomTypes(newRooms);
  }, [selectedHotelIds, groupSize]);

  // Filtered hotels for search modal
  const filteredHotels = useMemo(() => {
    let list = [...hotels];
    if (hotelFilterLevel !== 'all') {
      list = list.filter(h => h.level === hotelFilterLevel);
    }
    // 设施偏好筛选: 优先显示满足所有设施偏好的酒店，其次显示部分匹配的
    const amenityPrefs = prefStore.hotelAmenityPrefs;
    if (amenityPrefs.length > 0) {
      list.sort((a, b) => {
        const aMatch = amenityPrefs.filter(p => a.amenities.includes(p)).length;
        const bMatch = amenityPrefs.filter(p => b.amenities.includes(p)).length;
        return bMatch - aMatch;
      });
    }
    if (hotelSearchText.trim()) {
      const q = hotelSearchText.trim().toLowerCase();
      list = list.filter(h => h.name.toLowerCase().includes(q) || h.description.toLowerCase().includes(q));
    }
    if (hotelSortBy === 'price') list.sort((a, b) => a.pricePerNight - b.pricePerNight);
    else if (hotelSortBy === 'rating') list.sort((a, b) => b.rating - a.rating);
    else {
      const perDay = Math.ceil(dragItems.length / selectedDays);
      const dayItems = dragItems.slice((hotelSearchDay - 1) * perDay, hotelSearchDay * perDay);
      const dayZones = new Set(dayItems.map(i => i.zone));
      list.sort((a, b) => {
        const aIn = dayZones.has(a.zone) ? 0 : 1;
        const bIn = dayZones.has(b.zone) ? 0 : 1;
        return aIn - bIn || b.rating - a.rating;
      });
    }
    return list;
  }, [hotelFilterLevel, hotelSortBy, hotelSearchText, hotelSearchDay, dragItems, selectedDays, prefStore.hotelAmenityPrefs]);

  // ===== Auto-recommend hotels on mount / preference change (餐厅不自动推荐，保留手动选择) =====
  useEffect(() => {
    // Auto-select hotels only
    if (prefStore.needHotel && selectedDays > 1) {
      setSelectedHotelIds(prev => {
        const merged = { ...prev };
        for (let d = 1; d < selectedDays; d++) {
          if (!merged[d]) {
            const dayH = perDayHotels[d];
            if (dayH && dayH.length > 0) merged[d] = dayH[0].hotel.id;
          }
        }
        return merged;
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDays, prefStore.needHotel]);

  // ===== Build Schedule =====
  // 辅助: 从路线结果提取交通估算信息
  const extractTransitEst = (route: ReturnType<typeof getUniversalRoute>) => {
    if (!route) return { time: 10, distance: 2, price: 5, detail: '步行/公交', walkToStationKm: 0.3, walkToStationMin: 4, transferWalkKm: 0, transferWalkMin: 0 };
    const t = route.transit;
    return { time: t.time, distance: t.distance, price: t.price, detail: t.detail, walkToStationKm: t.walkToStationKm || 0, walkToStationMin: t.walkToStationMin || 0, transferWalkKm: t.transferWalkKm || 0, transferWalkMin: t.transferWalkMin || 0 };
  };
  const makeTransportItem = (id: string, dayNum: number, fromName: string, toName: string, est: ReturnType<typeof extractTransitEst>, currentTime: string): ScheduleItem => ({
    id, type: 'transport', day: dayNum,
    startTime: currentTime, endTime: addMinutes(currentTime, est.time),
    durationMinutes: est.time, title: `${fromName} → ${toName}`,
    subtitle: `${est.time}分钟 | ${est.distance}km | ${formatPrice(est.price)}`,
    transportMode: 'transit', transportDetail: est.detail,
    transportDistance: est.distance, transportPrice: est.price,
    transportWalkToStationKm: est.walkToStationKm, transportWalkToStationMin: est.walkToStationMin,
    transportTransferWalkKm: est.transferWalkKm, transportTransferWalkMin: est.transferWalkMin,
  });

  const schedule = useMemo<RenderScheduleItem[][]>(() => {
    const days: RenderScheduleItem[][] = [];

    for (let d = 0; d < selectedDays; d++) {
      const dayNum = d + 1;
      const dayTimes = getDayEffectiveTimes(dayNum);
      const items: RenderScheduleItem[] = [];
      const dayNodes = buildDayNodeChain(dayNum, dayTimes.start, dayTimes.end);
      let currentMinutes = timeToMinutes(dayTimes.start);
      let previousNode: ItineraryNode | null = null;
      const arrivalFlightStartMinutes = dayNum === 1 && departureFlight && !isLocal
        ? timeToMinutes(departureFlight.departureTime)
        : null;
      const arrivalFlightEndMinutes = dayNum === 1 && departureFlight && !isLocal
        ? (() => {
            const arrivalMinutes = timeToMinutes(departureFlight.arrivalTime);
            return arrivalFlightStartMinutes !== null && arrivalMinutes < arrivalFlightStartMinutes
              ? arrivalMinutes + 1440
              : arrivalMinutes;
          })()
        : null;
      const firstLocalProjectStartMinutes = arrivalFlightEndMinutes !== null
        ? arrivalFlightEndMinutes + getAirportHandlingTime('SZX')
        : null;
      const getTransitNodeLabel = (node: ItineraryNode) => {
        if (node.type === 'restaurant' && node.sourceRestaurantId === HOTEL_BREAKFAST_ID && node.locationId) {
          return hotels.find(h => h.id === node.locationId)?.name || node.name;
        }
        return node.name;
      };

      if (dayNum === 1 && departureFlight && !isLocal) {
        items.push({
          id: `${dayNum}-flight-departure`,
          type: 'flight',
          day: dayNum,
          startTime: departureFlight.departureTime,
          endTime: departureFlight.arrivalTime,
          durationMinutes: departureFlight.durationMin,
          title: `${departureFlight.airline} ${departureFlight.flightNo}`,
          subtitle: `${departureFlight.departureCity}→${departureFlight.arrivalCity} | ${departureFlight.cabin === 'economy' ? '经济舱' : departureFlight.cabin === 'premium' ? '超级经济舱' : '头等舱'}`,
          flightId: departureFlight.id,
          absoluteStartMinutes: arrivalFlightStartMinutes ?? timeToMinutes(departureFlight.departureTime),
          absoluteEndMinutes: arrivalFlightEndMinutes ?? timeToMinutes(departureFlight.arrivalTime),
        });
        currentMinutes = arrivalFlightEndMinutes ?? timeToMinutes(departureFlight.arrivalTime);
      }

      for (const node of dayNodes) {
        if (node.fixedStartTime && !previousNode?.locationId) {
          const fixedMinutes = node.id === `day-${dayNum}-airport-arrival` && arrivalFlightEndMinutes !== null
            ? arrivalFlightEndMinutes
            : timeToMinutes(node.fixedStartTime);
          currentMinutes = Math.max(currentMinutes, fixedMinutes);
        }

        if (
          firstLocalProjectStartMinutes !== null &&
          !node.isStartAnchor &&
          currentMinutes < firstLocalProjectStartMinutes
        ) {
          currentMinutes = firstLocalProjectStartMinutes;
        }

        if (previousNode?.locationId && node.locationId && previousNode.locationId !== node.locationId) {
          const route = getUniversalRoute(previousNode.locationId, node.locationId);
          if (route) {
            const edgeId = `${dayNum}:${previousNode.id}->${node.id}`;
            const recommendedMode = getRecommendedTransportMode(previousNode.locationId, node.locationId);
            const chosenMode = transportModeOverrides[edgeId] || recommendedMode;
            const routeInfo = chosenMode === 'driving'
              ? {
                  time: route.driving.time,
                  distance: route.driving.distance,
                  price: route.driving.price,
                  detail: `${drivingLabel}前往`,
                  walkToStationKm: 0,
                  walkToStationMin: 0,
                  transferWalkKm: 0,
                  transferWalkMin: 0,
                }
              : chosenMode === 'walking' && route.walking
                ? {
                    time: route.walking.time,
                    distance: route.walking.distance,
                    price: 0,
                    detail: '步行前往',
                    walkToStationKm: 0,
                    walkToStationMin: 0,
                    transferWalkKm: 0,
                    transferWalkMin: 0,
                  }
                : extractTransitEst(route);

            const transportStart = minutesToTime(currentMinutes);
            const transportEnd = addMinutes(transportStart, routeInfo.time);
            const transportAbsoluteStart = currentMinutes;
            const transportAbsoluteEnd = currentMinutes + routeInfo.time;
            items.push({
              id: edgeId,
              edgeId,
              type: 'transport',
              day: dayNum,
              startTime: transportStart,
              endTime: transportEnd,
              durationMinutes: routeInfo.time,
              title: `${getTransitNodeLabel(previousNode)} → ${getTransitNodeLabel(node)}`,
              subtitle: `${chosenMode === 'driving' ? drivingLabel : chosenMode === 'walking' ? '步行' : '公交/地铁'} · ${routeInfo.distance.toFixed(1)}km`,
              transportMode: chosenMode,
              recommendedTransportMode: recommendedMode,
              transportDetail: routeInfo.detail,
              transportDistance: routeInfo.distance,
              transportPrice: chosenMode === 'walking'
                ? 0
                : chosenMode === 'driving' && drivingSubMode === 'self'
                  ? getSelfDrivingPrice(routeInfo.distance)
                  : routeInfo.price,
              transportWalkToStationKm: routeInfo.walkToStationKm,
              transportWalkToStationMin: routeInfo.walkToStationMin,
              transportTransferWalkKm: routeInfo.transferWalkKm,
              transportTransferWalkMin: routeInfo.transferWalkMin,
              canSwitchToTaxi: recommendedMode !== 'driving',
              absoluteStartMinutes: transportAbsoluteStart,
              absoluteEndMinutes: transportAbsoluteEnd,
            });
            currentMinutes += routeInfo.time;
          }
        }

        if (node.fixedStartTime) {
          const fixedMinutes = node.id === `day-${dayNum}-airport-arrival` && arrivalFlightEndMinutes !== null
            ? arrivalFlightEndMinutes
            : timeToMinutes(node.fixedStartTime);
          currentMinutes = Math.max(currentMinutes, fixedMinutes);
        }

        if (
          firstLocalProjectStartMinutes !== null &&
          !node.isStartAnchor &&
          currentMinutes < firstLocalProjectStartMinutes
        ) {
          currentMinutes = firstLocalProjectStartMinutes;
        }

        if (node.targetArrivalTime && currentMinutes > timeToMinutes(node.targetArrivalTime)) {
          const overflowMinutes = currentMinutes - timeToMinutes(node.targetArrivalTime);
          items.push({
            id: `${node.id}-overflow`,
            type: 'custom',
            day: dayNum,
            startTime: minutesToTime(currentMinutes),
            endTime: minutesToTime(currentMinutes),
            durationMinutes: 0,
            title: '返程时间偏紧',
            subtitle: `当前到机场已晚于建议时间 ${overflowMinutes} 分钟`,
            customNote: '请减少景点、压缩停留时间或增加天数',
            absoluteStartMinutes: currentMinutes,
            absoluteEndMinutes: currentMinutes,
          });
        }

        const nodeAbsoluteStart = currentMinutes;
        const nodeAbsoluteEnd = node.isDayEndHotel ? nodeAbsoluteStart : nodeAbsoluteStart + node.durationMinutes;
        const nodeStart = minutesToTime(currentMinutes);
        const nodeEnd = addMinutes(nodeStart, node.durationMinutes);
        const subtitle = node.isDayEndHotel
          ? '入住酒店 / 结束行程'
          : node.subtitle;

        items.push({
          id: node.id,
          nodeId: node.id,
          type: node.type === 'airport' ? 'custom' : node.type,
          day: dayNum,
          startTime: nodeStart,
          endTime: node.isDayEndHotel ? nodeStart : nodeEnd,
          durationMinutes: node.isDayEndHotel ? 0 : node.durationMinutes,
          title: node.name,
          subtitle,
          attractionId: node.sourceAttractionId,
          restaurantId: node.sourceRestaurantId,
          mealType: node.mealType,
          source: node.sourceRestaurantId === HOTEL_BREAKFAST_ID ? 'hotel' : node.mealType ? 'external' : undefined,
          hotelId: node.sourceHotelId,
          customNote: node.type === 'airport' ? subtitle : undefined,
          isLastHotelNode: node.isDayEndHotel,
          isEditableNode: node.editable,
          absoluteStartMinutes: nodeAbsoluteStart,
          absoluteEndMinutes: nodeAbsoluteEnd,
        });

        currentMinutes += node.durationMinutes;
        previousNode = node.locationId ? node : previousNode;
      }

      if (dayNum === selectedDays && returnFlight && !isLocal) {
        const returnStartMinutes = timeToMinutes(returnFlight.departureTime);
        const returnArrivalRawMinutes = timeToMinutes(returnFlight.arrivalTime);
        const returnEndMinutes = returnArrivalRawMinutes < returnStartMinutes
          ? returnArrivalRawMinutes + 1440
          : returnArrivalRawMinutes;
        items.push({
          id: `${dayNum}-flight-return`,
          type: 'flight',
          day: dayNum,
          startTime: returnFlight.departureTime,
          endTime: returnFlight.arrivalTime,
          durationMinutes: returnFlight.durationMin,
          title: `${returnFlight.airline} ${returnFlight.flightNo}`,
          subtitle: `${returnFlight.departureCity}→${returnFlight.arrivalCity} | ${returnFlight.cabin === 'economy' ? '经济舱' : returnFlight.cabin === 'premium' ? '超级经济舱' : '头等舱'}`,
          flightId: returnFlight.id,
          absoluteStartMinutes: returnStartMinutes,
          absoluteEndMinutes: returnEndMinutes,
        });
      }

      if (dayNum === 1 && !isLocal && !departureFlight) {
        items.unshift({
          id: `${dayNum}-no-flight`,
          type: 'custom',
          day: dayNum,
          startTime: dayTimes.start,
          endTime: dayTimes.start,
          durationMinutes: 0,
          title: '请选择去程航班',
          customNote: '您当前不在深圳，请先选择去程航班后再生成首日路线',
          absoluteStartMinutes: timeToMinutes(dayTimes.start),
          absoluteEndMinutes: timeToMinutes(dayTimes.start),
        });
      }

      items.sort((a, b) => (a.absoluteStartMinutes ?? timeToMinutes(a.startTime)) - (b.absoluteStartMinutes ?? timeToMinutes(b.startTime)));
      const compactedItems = items.filter((item, index) => {
        const nextItem = items[index + 1];
        if (
          item.type === 'hotel' &&
          item.durationMinutes === 0 &&
          nextItem?.type === 'restaurant' &&
          nextItem.source === 'hotel' &&
          nextItem.startTime === item.startTime &&
          item.hotelId &&
          nextItem.hotelId === item.hotelId
        ) {
          return false;
        }
        return true;
      });
      const shouldShowIdleBlocks = compactedItems.some(item =>
        item.type === 'attraction' ||
        (item.type === 'custom' && item.nodeId?.startsWith('custom-node-'))
      );
      const withIdleBlocks: RenderScheduleItem[] = [];
      compactedItems.forEach((item, index) => {
        withIdleBlocks.push(item);
        const nextItem = compactedItems[index + 1];
        if (!nextItem) return;
        if (!shouldShowIdleBlocks) return;

        const gapMinutes = (nextItem.absoluteStartMinutes ?? timeToMinutes(nextItem.startTime)) - (item.absoluteEndMinutes ?? timeToMinutes(item.endTime));
        if (gapMinutes < 30) return;

        withIdleBlocks.push({
          id: `${dayNum}-idle-${index}`,
          type: 'custom',
          day: dayNum,
          startTime: item.endTime,
          endTime: nextItem.startTime,
          durationMinutes: gapMinutes,
          title: gapMinutes >= 90 ? '自由活动' : '休息 / 自由安排',
          subtitle: nextItem.type === 'restaurant'
            ? `距离下一项 ${nextItem.title} 还有 ${gapMinutes} 分钟`
            : `这段时间暂不安排行程，可自行安排`,
          customNote: gapMinutes >= 90 ? '可逛街、休息、喝咖啡或按现场情况灵活调整' : '预留缓冲，避免一路赶行程',
          absoluteStartMinutes: item.absoluteEndMinutes ?? timeToMinutes(item.endTime),
          absoluteEndMinutes: nextItem.absoluteStartMinutes ?? timeToMinutes(nextItem.startTime),
        });
      });
      days.push(withIdleBlocks);
    }

    return days;
  }, [
    buildDayNodeChain,
    departureFlight,
    drivingLabel,
    drivingSubMode,
    getDayEffectiveTimes,
    getRecommendedTransportMode,
    isLocal,
    returnFlight,
    selectedDays,
    transportModeOverrides,
  ]);

  // ===== 分钟级可行性分析 =====
  // 以实际日窗口、航班、交通、用餐和缓冲为约束；时间轴放不下的景点不会被静默忽略。
  const feasibilityAnalysis = useMemo(() => {
    const scheduledAttractionIds = new Set(
      schedule.flat().filter(item => item.type === 'attraction' && item.attractionId).map(item => item.attractionId!),
    );
    const unplacedAttractions = dragItems.filter(item => !scheduledAttractionIds.has(item.attractionId));
    const recommendedAttractionMinutes = dragItems.reduce((sum, item) => sum + Math.round(item.defaultDuration * 60), 0);
    const actualAttractionMinutes = dragItems.reduce((sum, item) => sum + Math.round(item.customDuration * 60), 0);
    const minimumAttractionMinutes = dragItems.reduce((sum, item) => (
      sum + Math.max(30, Math.round(item.defaultDuration * 60 * 0.5))
    ), 0);

    let availableMinutes = 0;
    let transitMinutes = 0;
    let mealMinutes = 0;
    let activeDayCount = 0;

    for (let dayNum = 1; dayNum <= selectedDays; dayNum += 1) {
      const dayTimes = getDayEffectiveTimes(dayNum);
      if (dayTimes.theme === 'free') continue;
      activeDayCount += 1;
      let dayStartMinutes = timeToMinutes(dayTimes.start);
      let dayEndMinutes = timeToMinutes(dayTimes.end);
      const hasArrivalFlight = dayNum === 1 && !!departureFlight && !isLocal;
      const hasReturnFlight = dayNum === selectedDays && !!returnFlight && !isLocal;

      if (hasArrivalFlight && departureFlight) {
        const departureMinute = timeToMinutes(departureFlight.departureTime);
        const rawArrivalMinute = timeToMinutes(departureFlight.arrivalTime);
        const arrivalMinute = rawArrivalMinute < departureMinute ? rawArrivalMinute + 1440 : rawArrivalMinute;
        dayStartMinutes = Math.max(dayStartMinutes, arrivalMinute + getAirportHandlingTime('SZX') + (dropOffAtHotel && selectedHotelIds[1] ? 30 : 0));
      }
      if (hasReturnFlight && returnFlight) {
        dayEndMinutes = Math.min(dayEndMinutes, timeToMinutes(returnFlight.departureTime) - 120);
      }
      availableMinutes += Math.max(0, dayEndMinutes - dayStartMinutes);

      const canReserveMeal = (meal: 'breakfast' | 'lunch' | 'dinner') => {
        const duration = MEAL_DURATION[meal];
        return dayStartMinutes <= getMealLatestEndMinutes(meal) - duration
          && dayEndMinutes >= MEAL_RHYTHM[meal].acceptStart + duration;
      };
      if (prefStore.needBreakfast && (dayNum > 1 || isLocal) && canReserveMeal('breakfast')) mealMinutes += MEAL_DURATION.breakfast;
      if (prefStore.needLunch && canReserveMeal('lunch')) mealMinutes += MEAL_DURATION.lunch;
      if (prefStore.needDinner && canReserveMeal('dinner')) mealMinutes += MEAL_DURATION.dinner;

      const dayAttractionIds = dragItems
        .filter(item => attrDayMap[item.attractionId] === dayNum)
        .map(item => item.attractionId);
      const startAnchorId = hasArrivalFlight ? 'airport-szx' : (dayNum > 1 ? selectedHotelIds[dayNum - 1] : null);
      const endAnchorId = hasReturnFlight ? 'airport-szx' : (dayNum < selectedDays ? selectedHotelIds[dayNum] : null);
      const orderedIds = optimizeDayRoute(dayAttractionIds, startAnchorId, endAnchorId);
      let previousId: string | null = startAnchorId || null;
      orderedIds.forEach(id => {
        transitMinutes += estimateTravelMinutes(previousId, id);
        previousId = id;
      });
      if (endAnchorId) transitMinutes += estimateTravelMinutes(previousId, endAnchorId);
    }

    const bufferMinutes = activeDayCount * 30;
    const customMinutes = customNodes.reduce((sum, node) => sum + node.durationMinutes, 0);
    const fixedMinutes = transitMinutes + mealMinutes + bufferMinutes + customMinutes;
    const recommendedRequiredMinutes = recommendedAttractionMinutes + fixedMinutes;
    const actualRequiredMinutes = actualAttractionMinutes + fixedMinutes;
    const shortageMinutes = Math.max(
      0,
      actualRequiredMinutes - availableMinutes,
      unplacedAttractions.reduce((sum, item) => sum + Math.round(item.customDuration * 60), 0),
    );
    const availableForAttractions = Math.max(0, availableMinutes - fixedMinutes);
    const canCompressToMinimum = minimumAttractionMinutes <= availableForAttractions;
    const rawScale = recommendedAttractionMinutes > 0 ? availableForAttractions / recommendedAttractionMinutes : 1;
    const shortageScale = recommendedAttractionMinutes > 0
      ? 1 - shortageMinutes / recommendedAttractionMinutes
      : 1;
    const compressionScale = Math.min(1, Math.max(0.5, Math.min(rawScale, shortageScale)));
    const compressionTargets: Record<string, number> = {};
    const compressionPreview = dragItems.map(item => {
      const recommendedMinutes = Math.round(item.defaultDuration * 60);
      const minimumMinutes = Math.max(30, Math.round(recommendedMinutes * 0.5));
      const targetMinutes = Math.min(
        recommendedMinutes,
        Math.max(minimumMinutes, Math.floor((recommendedMinutes * compressionScale) / 15) * 15),
      );
      compressionTargets[item.attractionId] = targetMinutes;
      return { id: item.attractionId, name: item.name, recommendedMinutes, targetMinutes };
    }).filter(item => item.targetMinutes < item.recommendedMinutes);

    const normalDayMinutes = Math.max(120, timeToMinutes(effectiveEnd) - timeToMinutes(effectiveStart) - 120);
    const extraDays = Math.max(1, Math.ceil(Math.max(shortageMinutes, recommendedRequiredMinutes - availableMinutes) / normalDayMinutes));

    return {
      hasConflict: unplacedAttractions.length > 0,
      unplacedAttractions,
      availableMinutes,
      recommendedRequiredMinutes,
      shortageMinutes,
      suggestedDays: Math.min(30, selectedDays + extraDays),
      canCompressToMinimum,
      compressionTargets,
      compressionPreview,
    };
  }, [
    attrDayMap,
    customNodes,
    departureFlight,
    dragItems,
    dropOffAtHotel,
    effectiveEnd,
    effectiveStart,
    estimateTravelMinutes,
    getDayEffectiveTimes,
    getMealLatestEndMinutes,
    isLocal,
    prefStore.needBreakfast,
    prefStore.needDinner,
    prefStore.needLunch,
    returnFlight,
    schedule,
    selectedDays,
    selectedHotelIds,
  ]);

  // ===== Time Overflow Detection (per-day based on theme) =====
  const overflowStatus = useMemo(() => {
    const result: Record<number, number> = {}; // day -> overflow minutes (positive = overflow)
    schedule.forEach((dayItems, idx) => {
      const dayNum = idx + 1;
      const dayTimes = getDayEffectiveTimes(dayNum);
      if (dayTimes.theme === 'free') return; // 自由日不检测溢出
      const availableMinutes = timeToMinutes(dayTimes.end) - timeToMinutes(dayTimes.start);
      const usedMinutes = dayItems.reduce((sum, item) => sum + item.durationMinutes, 0);
      if (usedMinutes > availableMinutes) {
        result[dayNum] = usedMinutes - availableMinutes;
      }
    });
    return result;
  }, [schedule, getDayEffectiveTimes]);

  // ===== 溢出触发：按当前完整约束生成签名，同一冲突只提示一次 =====
  const lastOverflowSignatureRef = useRef('');
  useEffect(() => {
    if (!feasibilityAnalysis.hasConflict && showDayAdjustModal && dayAdjustReason === 'overflow') {
      setShowDayAdjustModal(false);
    }
  }, [dayAdjustReason, feasibilityAnalysis.hasConflict, showDayAdjustModal]);

  useEffect(() => {
    if (showDayAdjustModal || showOverflowModal) return;
    if (!feasibilityAnalysis.hasConflict) return;
    const signature = [
      selectedDays,
      feasibilityAnalysis.unplacedAttractions.map(item => item.attractionId).sort().join(','),
      dragItems.map(item => `${item.attractionId}:${item.customDuration}`).join(','),
      prefStore.lunchLatestEndTime,
      prefStore.dinnerLatestEndTime,
      departureFlight?.id || '',
      returnFlight?.id || '',
    ].join('|');
    if (lastOverflowSignatureRef.current === signature) return;
    lastOverflowSignatureRef.current = signature;
    setSuggestedDays(feasibilityAnalysis.suggestedDays);
    setDayAdjustReason('overflow');
    setShowDayAdjustModal(true);
  }, [
    departureFlight?.id,
    dragItems,
    feasibilityAnalysis,
    prefStore.dinnerLatestEndTime,
    prefStore.lunchLatestEndTime,
    returnFlight?.id,
    selectedDays,
    showDayAdjustModal,
    showOverflowModal,
  ]);

  // ===== Cost Calculation =====
  const ticketTotal = dragItems.reduce((s, d) => s + d.ticketPrice, 0) * groupSize;
  const transportTotal = useMemo(() => {
    let total = 0;
    for (const dayItems of schedule) {
      dayItems.filter(i => i.type === 'transport').forEach(i => {
        const price = i.transportPrice || 0;
        if (i.transportMode === 'driving') {
          // 打车/自驾按车数计费（每车4人）
          total += price * calcCarCount(groupSize);
        } else if (i.transportMode === 'walking') {
          // 步行免费
        } else {
          // 公交/地铁按人数计费
          total += price * groupSize;
        }
      });
    }
    return total;
  }, [schedule, groupSize]);
  const mealTotal = useMemo(() => {
    let total = 0;
    const billedMeals = new Set<string>();
    schedule.flat().filter(item => item.type === 'restaurant' && item.mealType).forEach(item => {
      const key = `${item.day}-${item.mealType}`;
      if (billedMeals.has(key)) return;
      billedMeals.add(key);
      const rId = item.restaurantId;
      if (!rId) return;
      if (rId === HOTEL_BREAKFAST_ID) {
        // 酒店早餐：从酒店 breakfastOptions 获取价格
        const dayNum = parseInt(key.split('-')[0], 10);
        const hotelId = getBreakfastHotelForDay(dayNum, selectedHotelIds);
        const hotel = hotelId ? hotels.find(h => h.id === hotelId) : null;
        const bkOpts = getHotelBreakfastOptions(hotel);
        if (bkOpts) {
          // 含早则价格0，否则加购价格 × 人数
          if (!bkOpts.included && bkOpts.price > 0) {
            total += bkOpts.price * groupSize;
          }
        }
        return;
      }
      const r = restaurants.find(x => x.id === rId);
      if (r) {
        // Use group meal price if available and group size >= 2
        const price = (groupSize >= 2 && r.groupMealPrice) ? r.groupMealPrice : r.pricePerPerson;
        total += price * groupSize;
      }
    });
    return total;
  }, [schedule, groupSize, selectedHotelIds]);
  const totalHotelNights = Math.max(0, selectedDays - 1) + extraNights;
  const hotelCost = useMemo(() => {
    let total = 0;
    for (let d = 1; d <= totalHotelNights; d++) {
      const hotelId = selectedHotelIds[d];
      if (hotelId) {
        const hotel = hotels.find(h => h.id === hotelId);
        if (hotel) {
          const roomType = selectedRoomTypes[d];
          const roomInfo = roomType ? getRoomTypesForHotel(hotel).find(r => r.type === roomType) : null;
          total += roomInfo ? Math.round(hotel.pricePerNight * roomInfo.priceAdjust) : hotel.pricePerNight;
        }
      }
    }
    return total; // Hotel is per room, not per person
  }, [selectedHotelIds, selectedRoomTypes, selectedDays, extraNights]);
  const guideCost = noGuide ? 0 : guideMode === 'unified'
    ? (selectedGuideId ? (guides.find(g => g.id === selectedGuideId)?.perDayPrice || 0) * selectedDays : 0)
    : Object.values(dailyGuideIds).reduce((sum, gId) => {
        const g = guides.find(x => x.id === gId);
        return sum + (g?.perDayPrice || 0);
      }, 0);
  const flightCost = ((departureFlight?.totalPrice || 0) + (returnFlight?.totalPrice || 0)) * groupSize;
  const totalPrice = ticketTotal + transportTotal + mealTotal + hotelCost + guideCost + flightCost;

  // ===== Reorder handlers =====
  const moveItem = useCallback((index: number, direction: -1 | 1) => {
    const newIdx = index + direction;
    if (newIdx < 0 || newIdx >= dragItems.length) return;
    setDragItems(prev => {
      const arr = [...prev];
      [arr[index], arr[newIdx]] = [arr[newIdx], arr[index]];
      return arr;
    });
  }, [dragItems.length]);

  const handleDurationSave = (itemId: string) => {
    const val = parseFloat(editDurationValue);
    if (isNaN(val) || val <= 0 || val > 12) {
      Alert.alert('提示', '请输入0.5-12之间的小时数');
      return;
    }
    if (itemId.startsWith('custom-node:')) {
      const customId = itemId.replace('custom-node:', '');
      setCustomNodes(prev => prev.map(node => node.id === customId ? { ...node, durationMinutes: Math.round(val * 60) } : node));
    } else {
      setDragItems(prev => prev.map(d => d.id === itemId ? { ...d, customDuration: val } : d));
    }
    setEditDurationId(null);
  };

  const handleAutoAdjust = (day: number) => {
    // Compress meal times and suggest earlier start / later end
    const overflow = overflowStatus[day];
    if (!overflow) return;
    // Strategy: extend end time by overflow minutes (capped at 22:00)
    const currentEnd = timeToMinutes(effectiveEnd);
    const newEnd = Math.min(currentEnd + overflow, 22 * 60);
    const newEndStr = `${String(Math.floor(newEnd / 60)).padStart(2, '0')}:${String(newEnd % 60).padStart(2, '0')}`;
    setCustomEndTime(newEndStr);
    setUseCustomEnd(true);
    // If still not enough, also extend start earlier
    const remaining = overflow - (newEnd - currentEnd);
    if (remaining > 0) {
      const currentStart = timeToMinutes(effectiveStart);
      const newStart = Math.max(currentStart - remaining, 6 * 60);
      const newStartStr = `${String(Math.floor(newStart / 60)).padStart(2, '0')}:${String(newStart % 60).padStart(2, '0')}`;
      setCustomStartTime(newStartStr);
      setUseCustomStart(true);
    }
    setShowOverflowModal(false);
  };

  const openInsertNodeModal = useCallback((day: number, afterNodeId: string | null) => {
    setInsertDay(day);
    setInsertAfterNodeId(afterNodeId);
    setInsertType('time');
    setInsertTitle('');
    setInsertDurationValue('60');
    setInsertSearchText('');
    setSelectedInsertPlace(null);
    setShowInsertNodeModal(true);
  }, []);

  const handleCreateInsertedNode = useCallback(() => {
    const duration = parseInt(insertDurationValue, 10);
    if (!duration || duration <= 0 || duration > 720) {
      Alert.alert('提示', '请输入 1-720 分钟之间的停留时间');
      return;
    }
    if (insertType === 'place' && !selectedInsertPlace && !insertTitle.trim()) {
      Alert.alert('提示', '请选择一个地点，或输入自定义地点名称');
      return;
    }

    const title = selectedInsertPlace?.name || insertTitle.trim() || '自定义安排';
    const newNode: CustomInsertedNode = {
      id: `custom-node-${Date.now()}`,
      day: insertDay,
      afterNodeId: insertAfterNodeId,
      insertType,
      title,
      durationMinutes: duration,
      locationId: selectedInsertPlace?.id,
      locationName: selectedInsertPlace?.name || title,
      locationSourceType: selectedInsertPlace?.type || 'custom',
    };
    setCustomNodes(prev => [...prev, newNode]);
    setShowInsertNodeModal(false);
  }, [insertAfterNodeId, insertDay, insertDurationValue, insertTitle, insertType, selectedInsertPlace]);

  const applyTransportModeOverride = useCallback((edgeId: string, mode?: TransportMode) => {
    setTransportModeOverrides(prev => {
      const next = { ...prev };
      if (!mode) delete next[edgeId];
      else next[edgeId] = mode;
      return next;
    });
  }, []);

  const toggleTransportExpand = (id: string) => {
    setExpandedTransport(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSettlement = () => {
    navigation.navigate('Settlement', {
      orderTitle: `自定义${selectedDays}日游 (${orderedIds.length}景点)`,
      routeType: 'custom',
      totalPrice,
      durationDays: selectedDays,
      attractionIds: orderedIds,
      hotelId: selectedHotelIds[1] || undefined,
      guideId: selectedGuideId || undefined,
      restaurantIds: [...new Set(Object.values(selectedRestaurants))],
    });
  };

  const getItemIcon = (item: ScheduleItem): string => {
    if (item.type === 'attraction') return 'location';
    if (item.type === 'restaurant') return item.source === 'hotel' ? 'bed' : 'restaurant';
    if (item.type === 'transport') return 'car';
    if (item.type === 'hotel') return 'bed';
    if (item.type === 'flight') return 'airplane';
    return 'time';
  };
  const getItemColor = (item: ScheduleItem): string => {
    if (item.type === 'attraction') return colors.primary;
    if (item.type === 'restaurant') return item.source === 'hotel' ? '#10B981' : colors.warningYellow;
    if (item.type === 'transport') return colors.accent;
    if (item.type === 'hotel') return '#8B5CF6';
    if (item.type === 'flight') return '#F97316';
    return colors.successGreen;
  };

  // ===== Render Reorderable Item =====
  const renderOrderItem = (item: DragItem, idx: number) => {
    const currentDay = attrDayMap[item.attractionId] || 1;
    return (
      <View key={item.id} style={styles.orderCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: spacing.sm }}>
          <View style={styles.orderNum}><Text style={styles.orderNumText}>{idx + 1}</Text></View>
          <Image source={{ uri: item.imageUrl }} style={styles.orderImg} />
          <View style={{ flex: 1 }}>
            <Text style={typography.body} numberOfLines={1}>{item.name}</Text>
            <Text style={typography.caption}>{getZoneName(item.zone)}</Text>
            {item.customDuration < item.defaultDuration && (
              <Text style={[typography.caption, { color: colors.warningYellow, marginTop: 2 }]}> 
                建议{Math.round(item.defaultDuration * 60)}分钟 · 实际{Math.round(item.customDuration * 60)}分钟
              </Text>
            )}
            {/* Day selector */}
            {selectedDays > 1 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                {Array.from({ length: selectedDays }, (_, i) => i + 1).map(d => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.dayChipMini, currentDay === d && styles.dayChipMiniActive]}
                    onPress={() => setAttrDayMap(prev => ({ ...prev, [item.attractionId]: d }))}
                  >
                    <Text style={[styles.dayChipMiniText, currentDay === d && styles.dayChipMiniTextActive]}>D{d}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
          {/* Duration badge - tap to edit */}
          <TouchableOpacity
            style={styles.durationBadge}
            onPress={() => { setEditDurationId(item.id); setEditDurationValue(String(item.customDuration)); }}
          >
            <Ionicons name="time-outline" size={12} color={colors.accent} />
            <Text style={styles.durationText}>{item.customDuration}h</Text>
          </TouchableOpacity>
          {/* Up/Down arrows */}
          <View style={styles.arrows}>
            <TouchableOpacity onPress={() => moveItem(idx, -1)} disabled={idx === 0} style={styles.arrowBtn}>
              <Ionicons name="chevron-up" size={18} color={idx === 0 ? colors.disabled : colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => moveItem(idx, 1)} disabled={idx === dragItems.length - 1} style={styles.arrowBtn}>
              <Ionicons name="chevron-down" size={18} color={idx === dragItems.length - 1 ? colors.disabled : colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  // 只显示用户在偏好中选择的餐型
  const mealTypes: ('breakfast' | 'lunch' | 'dinner')[] = useMemo(() => {
    const types: ('breakfast' | 'lunch' | 'dinner')[] = [];
    if (prefStore.needBreakfast) types.push('breakfast');
    if (prefStore.needLunch) types.push('lunch');
    if (prefStore.needDinner) types.push('dinner');
    return types;
  }, [prefStore.needBreakfast, prefStore.needLunch, prefStore.needDinner]);

  const getMealLabel = (m: string) => m === 'breakfast' ? '早餐' : m === 'lunch' ? '午餐' : '晚餐';
  const getMealIcon = (m: string) => m === 'breakfast' ? 'sunny-outline' : m === 'lunch' ? 'restaurant-outline' : 'moon-outline';

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* ===== Day + Group Size + Travel Date ===== */}
        <View style={styles.section}>
          <Text style={typography.h2}>出行设置</Text>
          <Text style={[typography.bodySmall, { marginTop: 4 }]}>已选 {dragItems.length} 个景点</Text>

          {/* 旅行节奏选择 - 显示各节奏所需天数 */}
          <Text style={[typography.body, { marginTop: spacing.lg, marginBottom: spacing.sm }]}>旅行节奏</Text>
          {dragItems.length > 0 && (
            <Text style={[typography.caption, { marginBottom: spacing.sm, color: colors.textSecondary }]}> 
              {dragItems.length}个景点共约{totalAttrHours}h · 当前{selectedDays}天
              {matchedPace ? `属于「${PACE_CONFIG[matchedPace].label}」模式` : ''}
            </Text>
          )}
          {dragItems.length > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: spacing.sm }}>
              <Ionicons
                name={optimizerStatus === 'optimizing' ? 'sync-outline' : optimizerStatus === 'fallback' ? 'phone-portrait-outline' : 'git-network-outline'}
                size={13}
                color={optimizerStatus === 'fallback' ? colors.textSecondary : colors.primary}
              />
              <Text style={[typography.caption, { color: optimizerStatus === 'fallback' ? colors.textSecondary : colors.primary }]}> 
                {optimizerStatus === 'optimizing' && 'OR-Tools 正在组装路线…'}
                {optimizerStatus === 'optimized' && `OR-Tools 已优化 · ${optimizerSolveTime}ms`}
                {optimizerStatus === 'partial' && 'OR-Tools 已优化 · 有景点需调整'}
                {optimizerStatus === 'fallback' && '当前使用本地路线算法'}
                {optimizerStatus === 'idle' && '路线算法已就绪'}
              </Text>
            </View>
          )}
          <View style={styles.paceRow}>
            {(Object.keys(PACE_CONFIG) as TravelPace[]).map(pace => {
              const cfg = PACE_CONFIG[pace];
              const paceDays = daysPerPace[pace];
              const sel = travelPace === pace;
              const isCurrent = selectedDays === paceDays;
              return (
                <TouchableOpacity
                  key={pace}
                  style={[styles.paceCard, sel && { borderColor: cfg.color, backgroundColor: `${cfg.color}08` }]}
                  onPress={() => { setTravelPace(pace); setSelectedDays(paceDays); }}
                  activeOpacity={0.7}
                >
                  <Ionicons name={cfg.icon as any} size={20} color={sel ? cfg.color : colors.disabled} />
                  <Text style={[styles.paceLabel, sel && { color: cfg.color }]}>{cfg.label}</Text>
                  <View style={[styles.paceDaysBadge, sel && { backgroundColor: cfg.color }]}>
                    <Text style={[styles.paceDaysText, sel && { color: '#FFF' }]}>{paceDays}天</Text>
                  </View>
                  <Text style={[typography.caption, { textAlign: 'center', fontSize: 10 }]}>{cfg.desc}</Text>
                  {isCurrent && sel && <View style={[styles.paceCheck, { backgroundColor: cfg.color }]}><Ionicons name="checkmark" size={10} color="#FFF" /></View>}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 天数与节奏不匹配时的提示 */}
          {dragItems.length > 0 && !matchedPace && (
            <View style={styles.optimalDaysTip}>
              <Ionicons name="information-circle-outline" size={14} color={colors.textSecondary} />
              <Text style={[typography.caption, { color: colors.textSecondary, flex: 1 }]}>
                当前{selectedDays}天不属于标准节奏，可点击上方卡片快速切换
              </Text>
            </View>
          )}

          {/* Days input */}
          <View style={styles.settingRow}>
            <Text style={typography.body}>游玩天数</Text>
            <View style={styles.inputRow}>
              <TouchableOpacity style={styles.inputBtn} onPress={() => setSelectedDays(d => Math.max(1, d - 1))}>
                <Ionicons name="remove" size={18} color={colors.textPrimary} />
              </TouchableOpacity>
              <TextInput
                style={styles.numberInput}
                value={String(selectedDays)}
                onChangeText={t => { const n = parseInt(t); if (!isNaN(n) && n >= 1 && n <= 30) setSelectedDays(n); else if (t === '') setSelectedDays(1); }}
                keyboardType="number-pad"
                maxLength={2}
              />
              <Text style={typography.bodySmall}>天</Text>
              <TouchableOpacity style={styles.inputBtn} onPress={() => setSelectedDays(d => Math.min(30, d + 1))}>
                <Ionicons name="add" size={18} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Group size input */}
          <View style={styles.settingRow}>
            <Text style={typography.body}>出行人数</Text>
            <View style={styles.inputRow}>
              <TouchableOpacity style={styles.inputBtn} onPress={() => setGroupSize(s => Math.max(1, s - 1))}>
                <Ionicons name="remove" size={18} color={colors.textPrimary} />
              </TouchableOpacity>
              <TextInput
                style={styles.numberInput}
                value={String(groupSize)}
                onChangeText={t => { const n = parseInt(t); if (!isNaN(n) && n >= 1 && n <= 99) setGroupSize(n); else if (t === '') setGroupSize(1); }}
                keyboardType="number-pad"
                maxLength={2}
              />
              <Text style={typography.bodySmall}>人</Text>
              <TouchableOpacity style={styles.inputBtn} onPress={() => setGroupSize(s => Math.min(99, s + 1))}>
                <Ionicons name="add" size={18} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          <Text style={[typography.caption, { marginTop: 4, color: colors.textSecondary }]}>
            {formatDateCN(travelStartDate)} - {formatDateCN(travelReturnDate)}，共{selectedDays}天{Math.max(0, selectedDays - 1)}晚
          </Text>

          {/* 每日行程时间 */}
          <Text style={[typography.body, { marginTop: spacing.lg, marginBottom: spacing.sm }]}>每日行程时间</Text>
          <View style={styles.timeRow}>
            <View style={styles.timePicker}>
              <Text style={typography.caption}>开始时间</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipRow}>
                  {START_TIMES.map(t => (
                    <TouchableOpacity key={t} style={[styles.timeChip, !useCustomStart && startTime === t && styles.chipActive]} onPress={() => { setStartTime(t); setUseCustomStart(false); }}>
                      <Text style={[styles.timeChipText, !useCustomStart && startTime === t && styles.chipTextActive]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity style={[styles.timeChip, useCustomStart && styles.chipActive]} onPress={() => setUseCustomStart(true)}>
                    <Text style={[styles.timeChipText, useCustomStart && styles.chipTextActive]}>自定义</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
              {useCustomStart && (
                <TextInput
                  style={styles.customTimeInput}
                  value={customStartTime}
                  onChangeText={setCustomStartTime}
                  placeholder="输入时间 如 07:30"
                  placeholderTextColor={colors.disabled}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                />
              )}
            </View>
            <View style={styles.timePicker}>
              <Text style={typography.caption}>结束时间</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipRow}>
                  {END_TIMES.map(t => (
                    <TouchableOpacity key={t} style={[styles.timeChip, !useCustomEnd && endTime === t && styles.chipActive]} onPress={() => { setEndTime(t); setUseCustomEnd(false); }}>
                      <Text style={[styles.timeChipText, !useCustomEnd && endTime === t && styles.chipTextActive]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity style={[styles.timeChip, useCustomEnd && styles.chipActive]} onPress={() => setUseCustomEnd(true)}>
                    <Text style={[styles.timeChipText, useCustomEnd && styles.chipTextActive]}>自定义</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
              {useCustomEnd && (
                <TextInput
                  style={styles.customTimeInput}
                  value={customEndTime}
                  onChangeText={setCustomEndTime}
                  placeholder="输入时间 如 22:00"
                  placeholderTextColor={colors.disabled}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                />
              )}
            </View>
          </View>
          <Text style={[typography.caption, { marginTop: 4, color: colors.textSecondary }]}> 
            每天 {effectiveStart} - {effectiveEnd} 安排行程
          </Text>

          <Text style={[typography.body, { marginTop: spacing.lg, marginBottom: 4 }]}>用餐最晚结束时间</Text>
          <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.sm }]}> 
            超过你能接受的时间时，系统会调整路线或先让你选择。
          </Text>
          {prefStore.needLunch && (
            <View style={styles.timePicker}>
              <Text style={typography.caption}>午餐结束不晚于</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipRow}>
                  {LUNCH_END_TIMES.map(t => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.timeChip, prefStore.lunchLatestEndTime === t && styles.chipActive]}
                      onPress={() => prefStore.setLunchLatestEndTime(t)}
                    >
                      <Text style={[styles.timeChipText, prefStore.lunchLatestEndTime === t && styles.chipTextActive]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}
          {prefStore.needDinner && (
            <View style={[styles.timePicker, { marginTop: spacing.sm }]}> 
              <Text style={typography.caption}>晚餐结束不晚于</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipRow}>
                  {DINNER_END_TIMES.map(t => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.timeChip, prefStore.dinnerLatestEndTime === t && styles.chipActive]}
                      onPress={() => prefStore.setDinnerLatestEndTime(t)}
                    >
                      <Text style={[styles.timeChipText, prefStore.dinnerLatestEndTime === t && styles.chipTextActive]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}
        </View>

        {/* ===== 航班选择 (仅非本地用户) ===== */}
        {!isLocal && (
        <View style={styles.section}>
          <Text style={typography.h2}>航班选择</Text>
          <Text style={[typography.caption, { marginBottom: spacing.md }]}>选择去程和返程航班</Text>

          {/* 去程航班 */}
          <TouchableOpacity
            style={styles.flightSelectCard}
            onPress={() => {
              if (departureFlight) {
                setShowFlightAlternatives('departure');
              } else {
                const results = searchFlights({
                  departureCity: prefStore.departureCity,
                  arrivalCity: '深圳',
                  date: travelStartDate,
                  cabin: prefStore.flightPreference.preferredCabin,
                  airlineType: prefStore.flightPreference.preferredAirlineType,
                  directOnly: prefStore.flightPreference.preferDirectFlight,
                  luggageOption: prefStore.flightPreference.luggagePreference,
                  timePeriod: prefStore.departureTimePeriod,
                });
                setFlightSearchResults(results);
                setShowFlightPicker('departure');
              }
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="airplane" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.flightSelectLabel}>去程航班</Text>
              {departureFlight ? (
                <View>
                  <Text style={styles.flightSelectInfo}>
                    {departureFlight.airline} {departureFlight.flightNo} | {departureFlight.departureTime}-{departureFlight.arrivalTime}
                  </Text>
                  <Text style={styles.flightSelectSub}>
                    {departureFlight.cabin === 'economy' ? '经济舱' : departureFlight.cabin === 'premium' ? '超级经济舱' : '头等舱'} | {departureFlight.luggageOption === 'checked' ? '托运20kg+手提7kg' : '仅手提7kg'} | {departureFlight.isDirect ? '直飞' : `经停${departureFlight.stopCity}`}
                  </Text>
                  <Text style={[styles.flightSelectPrice, { color: colors.priceRed }]}>{formatPrice(departureFlight.totalPrice)}</Text>
                  <Text style={[typography.caption, { color: colors.accent, marginTop: 2 }]}>点击查看其他方案</Text>
                </View>
              ) : (
                <Text style={styles.flightSelectPlaceholder}>点击选择去程航班 ({formatDateCN(travelStartDate)})</Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>

          {/* 返程航班 */}
          {selectedDays > 0 && (
            <TouchableOpacity
              style={[styles.flightSelectCard, { marginTop: spacing.sm }]}
              onPress={() => {
                if (returnFlight) {
                  setShowFlightAlternatives('return');
                } else {
                  const returnDate = travelDates[travelDates.length - 1] || travelStartDate;
                  const results = searchFlights({
                    departureCity: '深圳',
                    arrivalCity: prefStore.departureCity,
                    date: returnDate,
                    cabin: prefStore.flightPreference.preferredCabin,
                    airlineType: prefStore.flightPreference.preferredAirlineType,
                    directOnly: prefStore.flightPreference.preferDirectFlight,
                    luggageOption: prefStore.flightPreference.luggagePreference,
                    timePeriod: prefStore.returnTimePeriod,
                  });
                  setFlightSearchResults(results);
                  setShowFlightPicker('return');
                }
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="airplane" size={20} color={colors.primary} style={{ transform: [{ rotate: '180deg' }] }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.flightSelectLabel}>返程航班</Text>
                {returnFlight ? (
                  <View>
                    <Text style={styles.flightSelectInfo}>
                      {returnFlight.airline} {returnFlight.flightNo} | {returnFlight.departureTime}-{returnFlight.arrivalTime}
                    </Text>
                    <Text style={styles.flightSelectSub}>
                      {returnFlight.cabin === 'economy' ? '经济舱' : returnFlight.cabin === 'premium' ? '超级经济舱' : '头等舱'} | {returnFlight.luggageOption === 'checked' ? '托运20kg+手提7kg' : '仅手提7kg'} | {returnFlight.isDirect ? '直飞' : `经停${returnFlight.stopCity}`}
                    </Text>
                    <Text style={[styles.flightSelectPrice, { color: colors.priceRed }]}>{formatPrice(returnFlight.totalPrice)}</Text>
                    <Text style={[typography.caption, { color: colors.accent, marginTop: 2 }]}>点击查看其他方案</Text>
                  </View>
                ) : (
                  <Text style={styles.flightSelectPlaceholder}>点击选择返程航班 ({formatDateCN(travelDates[travelDates.length - 1] || travelStartDate)})</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          )}

          {/* 升舱提示 */}
          {flightUpgradeHint && (
            <View style={styles.upgradeHintBox}>
              <Ionicons name="arrow-up-circle" size={18} color={colors.successGreen} />
              <Text style={[typography.bodySmall, { flex: 1, color: colors.successGreen }]}>
                经济舱+行李加购价格({formatPrice(flightUpgradeHint.flight.totalPrice + (flightUpgradeHint.flight.airlineType === 'budget' ? 180 : 0))})已超过超级经济舱({formatPrice(flightUpgradeHint.premium.totalPrice)})，建议升舱!
              </Text>
              <TouchableOpacity
                style={styles.upgradeBtn}
                onPress={() => {
                  if (showFlightPicker === 'departure' || departureFlight?.id === flightUpgradeHint.flight.id) {
                    setDepartureFlight(flightUpgradeHint.premium);
                  } else {
                    setReturnFlight(flightUpgradeHint.premium);
                  }
                  setFlightUpgradeHint(null);
                }}
              >
                <Text style={styles.upgradeBtnText}>一键升舱</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 航班费用小计 */}
          {(departureFlight || returnFlight) && (
            <View style={styles.flightCostSummary}>
              <Ionicons name="cash-outline" size={16} color={colors.textSecondary} />
              <Text style={[typography.bodySmall, { flex: 1 }]}>
                航班费用小计: {formatPrice((departureFlight?.totalPrice || 0) + (returnFlight?.totalPrice || 0))}
                {departureFlight && returnFlight ? ` (去程${formatPrice(departureFlight.totalPrice)} + 返程${formatPrice(returnFlight.totalPrice)})` : ''}
              </Text>
            </View>
          )}

          {/* 价差提醒 */}
          {priceDiffWarning && (() => {
            const f = priceDiffWarning.cheapest;
            const cabinLabel = f.cabin === 'economy' ? '经济舱' : f.cabin === 'premium' ? '超级经济舱' : '头等舱';
            const currentFl = priceDiffWarning.type === 'departure' ? departureFlight : returnFlight;
            return (
            <TouchableOpacity
              style={{ backgroundColor: '#FFF3E0', padding: spacing.sm, borderRadius: 8, marginTop: spacing.sm }}
              onPress={() => {
                if (currentFl) {
                  setFlightCompareData({
                    type: 'sameDay', direction: priceDiffWarning.type,
                    currentFlight: currentFl, cheaperFlight: f,
                    diff: priceDiffWarning.diff,
                  });
                  setShowFlightCompareModal(true);
                }
              }}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <Ionicons name="alert-circle" size={18} color="#E65100" />
                <Text style={[typography.bodySmall, { flex: 1, color: '#E65100', fontWeight: '600' }]}>
                  当前{priceDiffWarning.type === 'departure' ? '去程' : '返程'}航班比最低价贵{priceDiffWarning.diff}元
                </Text>
                <Ionicons name="chevron-forward" size={16} color="#E65100" />
              </View>
              <Text style={[typography.caption, { color: '#BF360C', marginTop: 4, marginLeft: 26 }]}>
                {f.airline} {f.flightNo} · {f.departureTime}-{f.arrivalTime} · {cabinLabel}{f.isDirect ? '·直飞' : `·经停${f.stopCity}`} · {formatPrice(f.totalPrice)}
              </Text>
              <Text style={[typography.caption, { color: '#E65100', marginTop: 2, marginLeft: 26 }]}>
                点击查看详情
              </Text>
            </TouchableOpacity>
            );
          })()}

          {/* 临近日期差价提醒 */}
          {nearbyDateWarning && (() => {
            const f = nearbyDateWarning.cheapest;
            const cabinLabel = f.cabin === 'economy' ? '经济舱' : f.cabin === 'premium' ? '超级经济舱' : '头等舱';
            const currentFl = nearbyDateWarning.type === 'departure' ? departureFlight : returnFlight;
            return (
            <TouchableOpacity
              style={{ backgroundColor: '#E3F2FD', padding: spacing.sm, borderRadius: 8, marginTop: spacing.sm }}
              onPress={() => {
                if (currentFl) {
                  setFlightCompareData({
                    type: 'nearbyDate', direction: nearbyDateWarning.type,
                    currentFlight: currentFl, cheaperFlight: f,
                    diff: nearbyDateWarning.diff, date: nearbyDateWarning.date,
                  });
                  setShowFlightCompareModal(true);
                }
              }}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <Ionicons name="calendar-outline" size={18} color="#1565C0" />
                <Text style={[typography.bodySmall, { flex: 1, color: '#1565C0', fontWeight: '600' }]}>
                  {nearbyDateWarning.type === 'departure' ? '去程' : '返程'}{nearbyDateWarning.date}有更便宜航班，可省{nearbyDateWarning.diff}元
                </Text>
                <Ionicons name="chevron-forward" size={16} color="#1565C0" />
              </View>
              <Text style={[typography.caption, { color: '#0D47A1', marginTop: 4, marginLeft: 26 }]}>
                {f.airline} {f.flightNo} · {f.departureTime}-{f.arrivalTime} · {cabinLabel}{f.isDirect ? '·直飞' : `·经停${f.stopCity}`} · {formatPrice(f.totalPrice)}
              </Text>
              <Text style={[typography.caption, { color: '#1565C0', marginTop: 2, marginLeft: 26 }]}>
                点击查看详情
              </Text>
            </TouchableOpacity>
            );
          })()}
        </View>
        )}

        {/* ===== Time Selection with Custom Input ===== */}
        <View style={styles.section}>
          <Text style={typography.h2}>行程时间</Text>
          <View style={styles.timeRow}>
            <View style={styles.timePicker}>
              <Text style={typography.caption}>开始时间</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipRow}>
                  {START_TIMES.map(t => (
                    <TouchableOpacity key={t} style={[styles.timeChip, !useCustomStart && startTime === t && styles.chipActive]} onPress={() => { setStartTime(t); setUseCustomStart(false); }}>
                      <Text style={[styles.timeChipText, !useCustomStart && startTime === t && styles.chipTextActive]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity style={[styles.timeChip, useCustomStart && styles.chipActive]} onPress={() => setUseCustomStart(true)}>
                    <Text style={[styles.timeChipText, useCustomStart && styles.chipTextActive]}>自定义</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
              {useCustomStart && (
                <TextInput
                  style={styles.customTimeInput}
                  value={customStartTime}
                  onChangeText={setCustomStartTime}
                  placeholder="输入时间 如 07:30"
                  placeholderTextColor={colors.disabled}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                />
              )}
            </View>
            <View style={styles.timePicker}>
              <Text style={typography.caption}>结束时间</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipRow}>
                  {END_TIMES.map(t => (
                    <TouchableOpacity key={t} style={[styles.timeChip, !useCustomEnd && endTime === t && styles.chipActive]} onPress={() => { setEndTime(t); setUseCustomEnd(false); }}>
                      <Text style={[styles.timeChipText, !useCustomEnd && endTime === t && styles.chipTextActive]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity style={[styles.timeChip, useCustomEnd && styles.chipActive]} onPress={() => setUseCustomEnd(true)}>
                    <Text style={[styles.timeChipText, useCustomEnd && styles.chipTextActive]}>自定义</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
              {useCustomEnd && (
                <TextInput
                  style={styles.customTimeInput}
                  value={customEndTime}
                  onChangeText={setCustomEndTime}
                  placeholder="输入时间 如 22:00"
                  placeholderTextColor={colors.disabled}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                />
              )}
            </View>
          </View>
        </View>

        {/* ===== Timeline Schedule ===== */}
        <View style={styles.section}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <Text style={typography.h2}>详细行程</Text>
            <TouchableOpacity
              style={[styles.editModeBtn, isEditMode && styles.editModeBtnActive]}
              onPress={() => setIsEditMode(prev => !prev)}
            >
              <Ionicons name={isEditMode ? 'create' : 'create-outline'} size={18} color={isEditMode ? '#FFF' : colors.primary} />
              <Text style={[styles.editModeBtnText, isEditMode && styles.editModeBtnTextActive]}>
                {isEditMode ? '完成编辑' : '编辑'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* 路线优化提示 */}
          {dragItems.length > 2 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, padding: spacing.sm, backgroundColor: '#E8F5E9', borderRadius: 8, marginBottom: spacing.md }}>
              <Ionicons name="navigate" size={16} color="#2E7D32" />
              <Text style={[typography.caption, { color: '#2E7D32', flex: 1 }]}>
                路线已智能优化 · 以酒店为起终点，减少回头路
              </Text>
            </View>
          )}
          {schedule.map((dayItems, dayIdx) => {
            const dayNum = dayIdx + 1;
            const overflow = overflowStatus[dayNum];
            const dayTimes = getDayEffectiveTimes(dayNum);
            return (
              <View key={dayIdx} style={styles.dayCard}>
                <View style={styles.dayHead}>
                  <View style={styles.dayNumBadge}><Text style={styles.dayNumText}>D{dayNum}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={typography.body}>
                      {dayTimes.theme === 'free' ? '自由活动' : `${dayTimes.start} - ${dayTimes.end}`}
                    </Text>
                    <Text style={[typography.caption, { color: dayTimes.theme === 'intense' ? '#EF4444' : dayTimes.theme === 'light' ? '#10B981' : colors.textSecondary }]}>
                      {dayTimes.themeLabel}{dayTimes.hours > 0 ? ` · 约${dayTimes.hours}h游玩` : ''}
                    </Text>
                  </View>
                  {overflow && (
                    <TouchableOpacity
                      style={styles.overflowBadge}
                      onPress={() => { setOverflowDay(dayNum); setOverflowMinutes(overflow); setShowOverflowModal(true); }}
                    >
                      <Ionicons name="warning" size={14} color={colors.priceRed} />
                      <Text style={styles.overflowText}>超出{overflow}分钟</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {/* 当日主题标签 */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md, marginTop: -spacing.sm }}>
                  <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                    {(Object.keys(DAY_THEME_CONFIG) as DayTheme[]).map(theme => {
                      const cfg = DAY_THEME_CONFIG[theme];
                      const defaultTheme: DayTheme = travelPace === 'intense' ? 'intense' : travelPace === 'leisure' ? 'light' : 'normal';
                      const currentTheme = dayThemes[dayNum] || defaultTheme;
                      const sel = currentTheme === theme;
                      return (
                        <TouchableOpacity
                          key={theme}
                          style={[styles.dayThemeChip, sel && styles.dayThemeChipActive]}
                          onPress={() => setDayThemes(prev => ({ ...prev, [dayNum]: theme }))}
                          activeOpacity={0.7}
                        >
                          <Ionicons name={cfg.icon as any} size={12} color={sel ? '#FFF' : colors.textSecondary} />
                          <Text style={[styles.dayThemeText, sel && styles.dayThemeTextActive]}>{cfg.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>

                {/* 接机服务开关 - Day 1 且无航班时 */}
                {dayNum === 1 && !(departureFlight && !isLocal) && (
                  <TouchableOpacity
                    style={[styles.airportToggleCard, standalonePickup && styles.airportToggleCardActive]}
                    onPress={() => setStandalonePickup(p => !p)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="airplane" size={18} color={standalonePickup ? colors.primary : colors.textSecondary} />
                    <View style={{ flex: 1 }}>
                      <Text style={[typography.body, standalonePickup && { color: colors.primary, fontWeight: '600' }]}>
                        接机服务
                      </Text>
                      <Text style={typography.caption}>
                        深圳宝安机场 → 首个景点 (可选专车)
                      </Text>
                    </View>
                    <Ionicons
                      name={standalonePickup ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={standalonePickup ? colors.primary : colors.disabled}
                    />
                  </TouchableOpacity>
                )}

                {dayItems.map((item, i) => {
                  const isExpanded = expandedTransport.has(item.id);
                  return (
                    <View key={item.id} style={styles.scheduleItem}>
                      <View style={styles.timeCol}>
                        <Text style={styles.timeText}>{item.startTime}</Text>
                        <Text style={styles.timeEnd}>{item.endTime}</Text>
                      </View>
                      <View style={styles.dotCol}>
                        <View style={[styles.sDot, { backgroundColor: getItemColor(item) }]}>
                          <Ionicons name={getItemIcon(item) as any} size={12} color="#FFF" />
                        </View>
                        {i < dayItems.length - 1 && <View style={[styles.sLine, { backgroundColor: getItemColor(item) + '40' }]} />}
                      </View>
                      <View style={[styles.sContent, { borderLeftColor: getItemColor(item) }]}>
                        <Text style={typography.body} numberOfLines={1}>{item.title}</Text>
                        {item.subtitle && <Text style={typography.caption}>{item.subtitle}</Text>}
                        {!item.isLastHotelNode && (
                          <Text style={[typography.caption, { color: getItemColor(item) }]}>{item.durationMinutes}分钟</Text>
                        )}
                        {/* 景点侧面快捷操作：调整时长、调整日期、调整顺序 */}
                        {isEditMode && item.type === 'attraction' && item.attractionId && (
                          <View style={styles.attrQuickActions}>
                            {/* 调整时长 */}
                            <TouchableOpacity
                              style={styles.quickActionBtn}
                              onPress={() => {
                                const di = dragItems.find(d => d.attractionId === item.attractionId);
                                if (di) { setEditDurationId(di.id); setEditDurationValue(String(di.customDuration)); }
                              }}
                            >
                              <Ionicons name="time-outline" size={12} color={colors.accent} />
                              <Text style={styles.quickActionText}>时长</Text>
                            </TouchableOpacity>
                            {/* 调整日期 */}
                            {selectedDays > 1 && (
                              <View style={styles.quickDayRow}>
                                {Array.from({ length: selectedDays }, (_, di) => di + 1).map(d => (
                                  <TouchableOpacity
                                    key={d}
                                    style={[styles.quickDayChip, (attrDayMap[item.attractionId!] || dayNum) === d && styles.quickDayChipActive]}
                                    onPress={() => setAttrDayMap(prev => ({ ...prev, [item.attractionId!]: d }))}
                                  >
                                    <Text style={[styles.quickDayChipText, (attrDayMap[item.attractionId!] || dayNum) === d && styles.quickDayChipTextActive]}>D{d}</Text>
                                  </TouchableOpacity>
                                ))}
                              </View>
                            )}
                            {/* 调整顺序 */}
                            <View style={styles.quickOrderBtns}>
                              <TouchableOpacity
                                style={styles.quickOrderBtn}
                                onPress={() => {
                                  const idx = dragItems.findIndex(d => d.attractionId === item.attractionId);
                                  if (idx > 0) moveItem(idx, -1);
                                }}
                              >
                                <Ionicons name="arrow-up" size={12} color={colors.textSecondary} />
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.quickOrderBtn}
                                onPress={() => {
                                  const idx = dragItems.findIndex(d => d.attractionId === item.attractionId);
                                  if (idx < dragItems.length - 1) moveItem(idx, 1);
                                }}
                              >
                                <Ionicons name="arrow-down" size={12} color={colors.textSecondary} />
                              </TouchableOpacity>
                            </View>
                          </View>
                        )}
                        {isEditMode && item.type === 'custom' && item.nodeId?.startsWith('custom-node-') && (
                          <View style={styles.attrQuickActions}>
                            <TouchableOpacity
                              style={styles.quickActionBtn}
                              onPress={() => {
                                const customNode = customNodes.find(node => node.id === item.nodeId);
                                if (customNode) {
                                  setEditDurationId(`custom-node:${customNode.id}`);
                                  setEditDurationValue(String((customNode.durationMinutes / 60).toFixed(1)));
                                }
                              }}
                            >
                              <Ionicons name="time-outline" size={12} color={colors.accent} />
                              <Text style={styles.quickActionText}>时长</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                        {/* Expandable transport detail */}
                        {item.type === 'transport' && (
                          <TouchableOpacity onPress={() => toggleTransportExpand(item.id)} style={styles.expandBtn}>
                            <Text style={[typography.caption, { color: colors.accent }]}>
                              {isExpanded ? '收起详情' : '展开详情'}
                            </Text>
                            <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.accent} />
                          </TouchableOpacity>
                        )}
                        {item.type === 'transport' && isExpanded && (
                          <View style={styles.transportDetail}>
                            <Text style={typography.caption}>{item.transportDetail}</Text>
                            {item.transportDistance != null && (
                              <Text style={typography.caption}>距离: {item.transportDistance}km | 费用: {formatPrice(item.transportPrice || 0)}</Text>
                            )}
                            {(item.transportWalkToStationKm != null && item.transportWalkToStationKm > 0) && (
                              <View style={styles.walkDetailRow}>
                                <Ionicons name="walk-outline" size={12} color={colors.accent} />
                                <Text style={[typography.caption, { color: colors.accent }]}>
                                  步行到站: {item.transportWalkToStationKm}km ({item.transportWalkToStationMin}分钟)
                                </Text>
                              </View>
                            )}
                            {(item.transportTransferWalkKm != null && item.transportTransferWalkKm > 0) && (
                              <View style={styles.walkDetailRow}>
                                <Ionicons name="swap-horizontal-outline" size={12} color={colors.warningYellow} />
                                <Text style={[typography.caption, { color: colors.warningYellow }]}>
                                  换乘步行: {item.transportTransferWalkKm}km ({item.transportTransferWalkMin}分钟)
                                </Text>
                              </View>
                            )}
                            {isEditMode && item.edgeId && (
                              <View style={styles.transportEditRow}>
                                {item.transportMode !== 'driving' ? (
                                  <TouchableOpacity
                                    style={styles.transportSwitchBtn}
                                    onPress={() => applyTransportModeOverride(item.edgeId!, 'driving')}
                                  >
                                    <Ionicons name="car-outline" size={12} color={colors.transport} />
                                    <Text style={styles.transportSwitchText}>转打车</Text>
                                  </TouchableOpacity>
                                ) : (
                                  <TouchableOpacity
                                    style={styles.transportSwitchBtn}
                                    onPress={() => applyTransportModeOverride(item.edgeId!, item.recommendedTransportMode)}
                                  >
                                    <Ionicons name="refresh-outline" size={12} color={colors.transport} />
                                    <Text style={styles.transportSwitchText}>恢复推荐</Text>
                                  </TouchableOpacity>
                                )}
                              </View>
                            )}
                            {/* Airport dual option selector */}
                            {isEditMode && (() => {
                              const isPickupSeg = item.id.includes('t-airport');
                              const isDropoffSeg = item.id.includes('t-to-airport');
                              if (!isPickupSeg && !isDropoffSeg) return null;
                              const direction = isDropoffSeg ? 'dropoff' : 'pickup';
                              const currentMode = direction === 'pickup' ? airportPickupMode : airportDropoffMode;
                              const setMode = direction === 'pickup' ? setAirportPickupMode : setAirportDropoffMode;
                              const booking = direction === 'pickup' ? premiumBookings.pickup : premiumBookings.dropoff;
                              const prefIsDriving = prefStore.transportRule.defaultMode === 'driving';
                              // Get route info for both options
                              const targetId = item.id.replace(/^\d+-t-(airport-|to-airport)/, '').replace('airport-', '');
                              const segRoute = (() => {
                                // Re-derive route from schedule item context
                                const dist = item.transportDistance || 0;
                                const transitPrice = item.transportMode === 'transit' ? (item.transportPrice || 0) : Math.max(2, Math.round(2 + dist * 0.28));
                                const drivingPriceEst = item.transportMode === 'driving' ? (item.transportPrice || 0) : Math.max(10, Math.round(10 + Math.max(0, dist - 2) * 2.6 + (item.durationMinutes || 20) * 0.3 * 0.8));
                                return { transitPrice, drivingPrice: drivingPriceEst, distance: dist, transitTime: item.transportMode === 'transit' ? item.durationMinutes : Math.round(dist / 20 * 60), drivingTime: item.transportMode === 'driving' ? item.durationMinutes : Math.round(dist / 30 * 60) };
                              })();
                              return (
                                <View>
                                  {!prefIsDriving && (
                                    <View style={styles.airportOptionRow}>
                                      <TouchableOpacity
                                        style={[styles.airportOptionChip, currentMode === 'preference' && styles.airportOptionChipActive]}
                                        onPress={() => { setMode('preference'); if (direction === 'pickup') setPremiumBookings(p => ({ ...p, pickup: null })); else setPremiumBookings(p => ({ ...p, dropoff: null })); }}
                                      >
                                        <Ionicons name="subway-outline" size={14} color={currentMode === 'preference' ? '#FFF' : colors.textPrimary} />
                                        <Text style={[styles.airportOptionChipText, currentMode === 'preference' && styles.airportOptionChipTextActive]}>
                                          公交/地铁 {segRoute.transitTime}分 {formatPrice(segRoute.transitPrice)}
                                        </Text>
                                      </TouchableOpacity>
                                      <TouchableOpacity
                                        style={[styles.airportOptionChip, currentMode === 'taxi' && styles.airportOptionChipActive]}
                                        onPress={() => setMode('taxi')}
                                      >
                                        <Ionicons name="car-outline" size={14} color={currentMode === 'taxi' ? '#FFF' : colors.textPrimary} />
                                        <Text style={[styles.airportOptionChipText, currentMode === 'taxi' && styles.airportOptionChipTextActive]}>
                                          打车 {segRoute.drivingTime}分 {formatPrice(segRoute.drivingPrice)}
                                        </Text>
                                      </TouchableOpacity>
                                    </View>
                                  )}
                                  {(currentMode === 'taxi' || prefIsDriving) && (
                                    <TouchableOpacity
                                      style={styles.premiumEntryRow}
                                      onPress={() => { setPremiumDirection(direction); setShowPremiumModal(true); }}
                                    >
                                      <Ionicons name="car-sport-outline" size={16} color={colors.transport} />
                                      {booking ? (
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                          <Ionicons name="checkmark-circle" size={14} color={colors.successGreen} />
                                          <Text style={styles.premiumEntryText}>
                                            已预约 · {PREMIUM_CAR_TYPES.find(c => c.id === booking.carTypeId)?.name} · {formatPrice(booking.price * calcCarCount(groupSize))}
                                          </Text>
                                        </View>
                                      ) : (
                                        <Text style={styles.premiumEntryText}>
                                          预约{direction === 'pickup' ? '接机' : '送机'}专车 &gt;
                                        </Text>
                                      )}
                                    </TouchableOpacity>
                                  )}
                                </View>
                              );
                            })()}
                          </View>
                        )}
                        {isEditMode && item.nodeId && item.type !== 'flight' && (
                          <TouchableOpacity
                            style={styles.inlineInsertBtn}
                            onPress={() => openInsertNodeModal(dayNum, item.nodeId!)}
                          >
                            <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
                            <Text style={styles.inlineInsertText}>在此后插入节点</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}

                {/* Meal selection for this day */}
                {mealTypes.length > 0 && (
                  <View style={styles.mealSection}>
                    <Text style={[typography.bodySmall, { fontWeight: '600', marginBottom: spacing.sm }]}>用餐安排</Text>
                    {mealTypes.map(meal => {
                      const key = `${dayNum}-${meal}`;
                      const scheduledMeal = dayItems.find(item => item.type === 'restaurant' && item.mealType === meal);
                      // 时间轴是唯一事实来源：没有真正排进去的餐厅不展示、不计费。
                      const selId = scheduledMeal?.restaurantId;
                      const isHotelBk = selId === HOTEL_BREAKFAST_ID;
                      const selRest = !isHotelBk && selId ? restaurants.find(r => r.id === selId) : null;
                      const unavailableLabel = dayNum === selectedDays && !!returnFlight && !isLocal
                        ? '未安排（返程时间不足）'
                        : `未安排（需在 ${getMealLatestEndTime(meal)} 前结束）`;
                      // 酒店早餐信息
                      const bkHotelId = meal === 'breakfast' ? getBreakfastHotelForDay(dayNum, selectedHotelIds) : null;
                      const bkHotel = bkHotelId ? hotels.find(h => h.id === bkHotelId) : null;
                      const bkOpts = bkHotel ? getHotelBreakfastOptions(bkHotel) : null;
                      return (
                        <View key={meal}>
                          <TouchableOpacity style={styles.mealRow} onPress={() => { setRestPickerKey(key); setShowRestPicker(true); }}>
                            <Ionicons name={getMealIcon(meal) as any} size={16} color={isHotelBk ? '#10B981' : colors.warningYellow} />
                            <View>
                              <Text style={typography.body}>{getMealLabel(meal)}</Text>
                              <Text style={[typography.caption, { color: scheduledMeal ? colors.textSecondary : colors.warningYellow }]}> 
                                {scheduledMeal ? `${scheduledMeal.startTime}–${scheduledMeal.endTime}` : unavailableLabel}
                              </Text>
                            </View>
                            {isHotelBk ? (
                              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                                <View style={{ backgroundColor: '#10B98120', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                                  <Text style={{ fontSize: 11, color: '#10B981', fontWeight: '600' }}>酒店早餐</Text>
                                </View>
                                <Text style={[typography.bodySmall, { color: colors.textPrimary }]} numberOfLines={1}>
                                  {bkHotel?.name || ''}
                                </Text>
                                {bkOpts && !bkOpts.included && bkOpts.price > 0 && (
                                  <Text style={[typography.caption, { color: colors.priceRed }]}>
                                    +{formatPrice(bkOpts.price * groupSize)}
                                  </Text>
                                )}
                              </View>
                            ) : selRest ? (
                              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                                <View style={styles.autoRecommendBadge}>
                                  <Text style={styles.autoRecommendText}>推荐</Text>
                                </View>
                                <Text style={[typography.bodySmall, { color: colors.textPrimary }]} numberOfLines={1}>
                                  {selRest.name}
                                </Text>
                                <Text style={[typography.caption, { color: colors.priceRed }]}>
                                  {formatPrice((groupSize >= 2 && selRest.groupMealPrice ? selRest.groupMealPrice : selRest.pricePerPerson) * groupSize)}
                                </Text>
                              </View>
                            ) : (
                              <Text style={[typography.bodySmall, { flex: 1, textAlign: 'right', color: colors.disabled }]}> 
                                本日无实际用餐地点
                              </Text>
                            )}
                            <Ionicons name="chevron-forward" size={16} color={colors.disabled} />
                          </TouchableOpacity>
                          {selRest && (
                            <TouchableOpacity
                              style={styles.searchMoreBtn}
                              onPress={() => { setRestPickerKey(key); setShowRestPicker(true); }}
                            >
                              <Ionicons name="search-outline" size={12} color={colors.primary} />
                              <Text style={[typography.caption, { color: colors.primary }]}>搜索更多餐厅</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* Per-day hotel recommendation */}
                {selectedDays > 1 && dayNum < selectedDays && (
                  <View style={styles.hotelSection}>
                    <Text style={[typography.bodySmall, { fontWeight: '600', marginBottom: spacing.sm }]}>
                      第{dayNum}晚住宿
                    </Text>
                    {selectedHotelIds[dayNum] ? (() => {
                      const hotel = hotels.find(h => h.id === selectedHotelIds[dayNum]);
                      if (!hotel) return <Text style={typography.caption}>暂无推荐酒店</Text>;
                      const hotelRecommendation = perDayHotels[dayNum]?.find(entry => entry.hotel.id === hotel.id);
                      const roomType = selectedRoomTypes[dayNum];
                      const roomInfo = roomType ? getRoomTypesForHotel(hotel).find(r => r.type === roomType) : null;
                      const roomPrice = roomInfo ? Math.round(hotel.pricePerNight * roomInfo.priceAdjust) : hotel.pricePerNight;
                      return (
                        <TouchableOpacity
                          style={[styles.hotelMiniCard, styles.hotelMiniCardActive]}
                          onPress={() => { setHotelDetailDay(dayNum); setShowHotelDetail(true); }}
                          activeOpacity={0.7}
                        >
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <Text style={typography.bodySmall} numberOfLines={1}>{hotel.name}</Text>
                              {getHotelBreakfastOptions(hotel)?.included && (
                                <View style={{ backgroundColor: '#10B98120', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 }}>
                                  <Text style={{ fontSize: 10, color: '#10B981', fontWeight: '600' }}>含早</Text>
                                </View>
                              )}
                            </View>
                            <Text style={typography.caption}>
                              {getHotelLevelName(hotel.level)}
                              {roomType ? ` · ${roomType}` : ''}
                              {' | '}<Text style={{ color: colors.priceRed, fontWeight: '600' }}>{formatPrice(roomPrice)}/晚</Text>
                            </Text>
                            {hotelRecommendation?.matchLevel === 'relaxed' && hotelRecommendation.explanation && (
                              <Text style={[typography.caption, { color: colors.warningYellow, marginTop: 4 }]} numberOfLines={2}>
                                {hotelRecommendation.explanation}
                              </Text>
                            )}
                          </View>
                          <TouchableOpacity
                            onPress={(e) => { e.stopPropagation(); setSelectedHotelIds(prev => { const next = { ...prev }; delete next[dayNum]; return next; }); setSelectedRoomTypes(prev => { const next = { ...prev }; delete next[dayNum]; return next; }); }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons name="close-circle" size={18} color={colors.priceRed} />
                          </TouchableOpacity>
                          <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                        </TouchableOpacity>
                      );
                    })() : (
                      <TouchableOpacity
                        style={styles.hotelMiniCard}
                        onPress={() => { setHotelSearchDay(dayNum); setShowHotelSearch(true); }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[typography.bodySmall, { color: colors.disabled }]}>点击选择酒店</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={colors.disabled} />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.moreHotelBtn}
                      onPress={() => { setHotelSearchDay(dayNum); setShowHotelSearch(true); }}
                    >
                      <Ionicons name="search-outline" size={14} color={colors.primary} />
                      <Text style={[typography.bodySmall, { color: colors.primary }]}>搜索更多酒店</Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                )}

                {/* 送机服务开关 - 最后一天且无航班时 */}
                {dayNum === selectedDays && !(returnFlight && !isLocal) && (
                  <TouchableOpacity
                    style={[styles.airportToggleCard, standaloneDropoff && styles.airportToggleCardActive]}
                    onPress={() => setStandaloneDropoff(p => !p)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="airplane" size={18} color={standaloneDropoff ? colors.primary : colors.textSecondary}
                      style={{ transform: [{ rotate: '45deg' }] }} />
                    <View style={{ flex: 1 }}>
                      <Text style={[typography.body, standaloneDropoff && { color: colors.primary, fontWeight: '600' }]}>
                        送机服务
                      </Text>
                      <Text style={typography.caption}>
                        最后景点 → 深圳宝安机场 (可选专车)
                      </Text>
                    </View>
                    <Ionicons
                      name={standaloneDropoff ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={standaloneDropoff ? colors.primary : colors.disabled}
                    />
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

          {/* 额外住宿晚 */}
          {extraNights > 0 && Array.from({ length: extraNights }, (_, i) => {
            const nightNum = (selectedDays - 1) + i + 1; // 额外的晚序号（接在常规住宿后面）
            const dayLabel = `额外第${i + 1}晚`;
            return (
              <View key={`extra-night-${i}`} style={[styles.dayCard, { borderLeftColor: '#8B5CF6', borderLeftWidth: 3 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <Ionicons name="moon-outline" size={18} color="#8B5CF6" />
                    <Text style={[typography.bodySmall, { fontWeight: '700' }]}>{dayLabel}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      setExtraNights(n => n - 1);
                      setSelectedHotelIds(prev => { const next = { ...prev }; delete next[nightNum]; return next; });
                      setSelectedRoomTypes(prev => { const next = { ...prev }; delete next[nightNum]; return next; });
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.priceRed} />
                  </TouchableOpacity>
                </View>
                <View style={styles.hotelSection}>
                  <Text style={[typography.bodySmall, { fontWeight: '600', marginBottom: spacing.sm }]}>
                    第{nightNum}晚住宿
                  </Text>
                  {selectedHotelIds[nightNum] ? (() => {
                    const hotel = hotels.find(h => h.id === selectedHotelIds[nightNum]);
                    if (!hotel) return <Text style={typography.caption}>暂无推荐酒店</Text>;
                    const hotelRecommendation = perDayHotels[nightNum]?.find(entry => entry.hotel.id === hotel.id);
                    const roomType = selectedRoomTypes[nightNum];
                    const roomInfo = roomType ? getRoomTypesForHotel(hotel).find(r => r.type === roomType) : null;
                    const roomPrice = roomInfo ? Math.round(hotel.pricePerNight * roomInfo.priceAdjust) : hotel.pricePerNight;
                    return (
                      <TouchableOpacity
                        style={[styles.hotelMiniCard, styles.hotelMiniCardActive]}
                        onPress={() => { setHotelDetailDay(nightNum); setShowHotelDetail(true); }}
                        activeOpacity={0.7}
                      >
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text style={typography.bodySmall} numberOfLines={1}>{hotel.name}</Text>
                            {getHotelBreakfastOptions(hotel)?.included && (
                              <View style={{ backgroundColor: '#10B98120', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 }}>
                                <Text style={{ fontSize: 10, color: '#10B981', fontWeight: '600' }}>含早</Text>
                              </View>
                            )}
                          </View>
                          <Text style={typography.caption}>
                            {getHotelLevelName(hotel.level)}
                            {roomType ? ` · ${roomType}` : ''}
                            {' | '}<Text style={{ color: colors.priceRed, fontWeight: '600' }}>{formatPrice(roomPrice)}/晚</Text>
                          </Text>
                          {hotelRecommendation?.matchLevel === 'relaxed' && hotelRecommendation.explanation && (
                            <Text style={[typography.caption, { color: colors.warningYellow, marginTop: 4 }]} numberOfLines={2}>
                              {hotelRecommendation.explanation}
                            </Text>
                          )}
                        </View>
                        <TouchableOpacity
                          onPress={(e) => { e.stopPropagation(); setSelectedHotelIds(prev => { const next = { ...prev }; delete next[nightNum]; return next; }); setSelectedRoomTypes(prev => { const next = { ...prev }; delete next[nightNum]; return next; }); }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="close-circle" size={18} color={colors.priceRed} />
                        </TouchableOpacity>
                        <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                      </TouchableOpacity>
                    );
                  })() : (
                    <TouchableOpacity
                      style={styles.hotelMiniCard}
                      onPress={() => { setHotelSearchDay(nightNum); setShowHotelSearch(true); }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[typography.bodySmall, { color: colors.disabled }]}>点击选择酒店</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.disabled} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}

          {/* 多加一晚按钮 */}
          <TouchableOpacity
            style={styles.addExtraNightBtn}
            onPress={() => setExtraNights(n => n + 1)}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
            <Text style={[typography.body, { color: colors.primary, fontWeight: '600' }]}>多加一晚住宿</Text>
          </TouchableOpacity>
        </View>

        {/* ===== Guide ===== */}
        <View style={styles.section}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={typography.h2}>导游选择</Text>
            {!noGuide && (
              <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} onPress={() => setShowGuideSearch(true)}>
                <Text style={[typography.bodySmall, { color: colors.primary }]}>全部导游</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.primary} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity style={[styles.noGBtn, noGuide && styles.noGBtnOn]} onPress={() => { setNoGuide(!noGuide); if (!noGuide) { setSelectedGuideId(null); setDailyGuideIds({}); } }}>
            <Ionicons name={noGuide ? 'checkbox' : 'square-outline'} size={20} color={noGuide ? colors.primary : colors.disabled} />
            <Text style={[typography.body, noGuide && { color: colors.primary }]}>不需要导游，自由行</Text>
          </TouchableOpacity>
          {!noGuide && (
            <>
              {/* 导游模式切换 */}
              <View style={styles.guideModeRow}>
                <TouchableOpacity
                  style={[styles.guideModeBtn, guideMode === 'unified' && styles.guideModeBtnActive]}
                  onPress={() => { setGuideMode('unified'); setDailyGuideIds({}); }}
                >
                  <Ionicons name="person-outline" size={14} color={guideMode === 'unified' ? '#FFF' : colors.textPrimary} />
                  <Text style={[styles.guideModeBtnText, guideMode === 'unified' && styles.guideModeBtnTextActive]}>统一导游</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.guideModeBtn, guideMode === 'perDay' && styles.guideModeBtnActive]}
                  onPress={() => { setGuideMode('perDay'); setSelectedGuideId(null); }}
                >
                  <Ionicons name="people-outline" size={14} color={guideMode === 'perDay' ? '#FFF' : colors.textPrimary} />
                  <Text style={[styles.guideModeBtnText, guideMode === 'perDay' && styles.guideModeBtnTextActive]}>分天选导游</Text>
                </TouchableOpacity>
              </View>
              <Text style={[typography.caption, { marginBottom: spacing.md, color: colors.textSecondary }]}>
                {guideMode === 'unified' ? '全程由同一位导游陪同' : '每天可选择不同的导游'}
              </Text>

              {/* 统一导游模式 */}
              {guideMode === 'unified' && (
                <>
                  {/* 收藏导游自动选中提示 */}
                  {availableFavoriteGuides.length === 1 && selectedGuideId === availableFavoriteGuides[0].id && (
                    <View style={styles.favAutoTip}>
                      <Ionicons name="heart" size={14} color={colors.primary} />
                      <Text style={[typography.caption, { color: colors.primary, flex: 1 }]}>
                        已自动选择收藏导游「{availableFavoriteGuides[0].name}」
                      </Text>
                    </View>
                  )}
                  {availableFavoriteGuides.length > 1 && !selectedGuideId && (
                    <View style={styles.favAutoTip}>
                      <Ionicons name="heart" size={14} color={colors.warningYellow} />
                      <Text style={[typography.caption, { color: colors.warningYellow, flex: 1 }]}>
                        您有{availableFavoriteGuides.length}位收藏导游空闲，请选择一位
                      </Text>
                    </View>
                  )}
                  {recommendedGuides.slice(0, 3).map(g => {
                    const sel = selectedGuideId === g.id;
                    const busy = isGuideBusy(g);
                    const busyDates = getGuideBusyDates(g);
                    const isFav = prefStore.favoriteGuideIds.includes(g.id);
                    return (
                      <TouchableOpacity key={g.id} style={[styles.selCard, sel && styles.selCardActive, busy && styles.selCardBusy]} onPress={() => { if (favTapRef.current) { favTapRef.current = false; return; } setSelectedGuideId(sel ? null : g.id); }} activeOpacity={0.7}>
                        <Image source={{ uri: g.avatar }} style={styles.guideAv} />
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                            <Text style={typography.body}>{g.name}</Text>
                            {isFav && <Ionicons name="heart" size={12} color={colors.priceRed} />}
                            {busy ? (
                              <View style={styles.busyBadge}>
                                <Text style={styles.busyBadgeText}>部分日期不可用</Text>
                              </View>
                            ) : (
                              <View style={styles.availBadge}>
                                <Text style={styles.availBadgeText}>可预约</Text>
                              </View>
                            )}
                          </View>
                          <Text style={typography.caption}>{g.yearsOfExperience}年经验 | {g.languages.join('/')}</Text>
                          {busy && busyDates.length > 0 && (
                            <Text style={[typography.caption, { color: colors.priceRed, marginTop: 2 }]}>
                              不可用: {busyDates.map(d => formatDateCN(d)).join(', ')}
                            </Text>
                          )}
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                            <Text style={typography.priceSmall}>{formatPrice(g.perDayPrice)}/天</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                              <Pressable
                                style={({ pressed }) => [styles.favBtn, pressed && { opacity: 0.6 }]}
                                onPress={() => { favTapRef.current = true; prefStore.toggleFavoriteGuide(g.id); }}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                              >
                                <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={22} color={isFav ? colors.priceRed : colors.textSecondary} />
                              </Pressable>
                              <Pressable
                                style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 2, padding: 4 }, pressed && { opacity: 0.6 }]}
                                onPress={() => { favTapRef.current = true; setCalendarGuideId(g.id); setShowGuideCalendar(true); }}
                              >
                                <Ionicons name="calendar-outline" size={14} color={colors.primary} />
                                <Text style={[typography.caption, { color: colors.primary }]}>日历</Text>
                              </Pressable>
                            </View>
                          </View>
                        </View>
                        {sel && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
                      </TouchableOpacity>
                    );
                  })}
                  {recommendedGuides.length > 3 && (
                    <TouchableOpacity style={styles.moreGuideBtn} onPress={() => setShowGuideSearch(true)}>
                      <Text style={[typography.bodySmall, { color: colors.primary }]}>查看全部 {guides.filter(g => g.isAvailableForHire).length} 位导游</Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.primary} />
                    </TouchableOpacity>
                  )}
                  {selectedGuideId && isGuideBusy(guides.find(g => g.id === selectedGuideId)!) && (
                    <View style={styles.guideWarning}>
                      <Ionicons name="warning-outline" size={16} color={colors.priceRed} />
                      <Text style={[typography.bodySmall, { color: colors.priceRed, flex: 1 }]}>
                        该导游在您的出行日期内有不可用日期，建议更换导游或调整出行日期
                      </Text>
                    </View>
                  )}
                </>
              )}

              {/* 分天选导游模式 */}
              {guideMode === 'perDay' && (
                <>
                  {Array.from({ length: selectedDays }, (_, i) => i + 1).map(dayNum => {
                    const dayGuideId = dailyGuideIds[dayNum] || null;
                    const dayGuide = dayGuideId ? guides.find(g => g.id === dayGuideId) : null;
                    const dateStr = travelDates[dayNum - 1] || '';
                    return (
                      <View key={dayNum} style={styles.perDayGuideCard}>
                        <View style={styles.perDayGuideHeader}>
                          <View style={styles.perDayBadge}>
                            <Text style={styles.perDayBadgeText}>D{dayNum}</Text>
                          </View>
                          <Text style={[typography.bodySmall, { fontWeight: '600' }]}>
                            第{dayNum}天 {dateStr ? formatDateCN(dateStr) : ''}
                          </Text>
                        </View>
                        {dayGuide ? (
                          <View style={styles.perDayGuideSelected}>
                            <Image source={{ uri: dayGuide.avatar }} style={styles.perDayGuideAv} />
                            <View style={{ flex: 1 }}>
                              <Text style={typography.body}>{dayGuide.name}</Text>
                              <Text style={typography.caption}>{formatPrice(dayGuide.perDayPrice)}/天</Text>
                            </View>
                            <TouchableOpacity
                              onPress={() => setDailyGuideIds(prev => { const next = { ...prev }; delete next[dayNum]; return next; })}
                              style={styles.perDayRemoveBtn}
                            >
                              <Ionicons name="close-circle" size={20} color={colors.priceRed} />
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <Text style={[typography.caption, { color: colors.textSecondary, marginLeft: spacing.xxxl }]}>未选择导游 (自由行)</Text>
                        )}
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.sm }}>
                          <View style={{ flexDirection: 'row', gap: spacing.xs, paddingLeft: spacing.xxxl }}>
                            {recommendedGuides.slice(0, 5).map(g => {
                              const isSel = dayGuideId === g.id;
                              const dayDateStr = travelDates[dayNum - 1];
                              const isBusyThisDay = dayDateStr && g.busyDates?.includes(dayDateStr);
                              const isFavChip = prefStore.favoriteGuideIds.includes(g.id);
                              return (
                                <TouchableOpacity
                                  key={g.id}
                                  style={[styles.perDayGuideChip, isSel && styles.perDayGuideChipActive, isBusyThisDay && { opacity: 0.4 }]}
                                  onPress={() => {
                                    if (isBusyThisDay) return;
                                    setDailyGuideIds(prev => ({ ...prev, [dayNum]: isSel ? '' : g.id }));
                                  }}
                                  activeOpacity={0.7}
                                >
                                  <Image source={{ uri: g.avatar }} style={styles.perDayChipAv} />
                                  <Text style={[styles.perDayChipText, isSel && styles.perDayChipTextActive]} numberOfLines={1}>{g.name}</Text>
                                  {isFavChip && <Ionicons name="heart" size={10} color={colors.priceRed} />}
                                  {isBusyThisDay && <Ionicons name="close-circle" size={10} color={colors.priceRed} />}
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </ScrollView>
                      </View>
                    );
                  })}
                  {guideCost > 0 && (
                    <View style={[styles.costSubtotalRow, { marginTop: spacing.md }]}>
                      <Text style={typography.bodySmall}>导游费合计</Text>
                      <Text style={typography.priceSmall}>{formatPrice(guideCost)}</Text>
                    </View>
                  )}
                </>
              )}
            </>
          )}
        </View>

        {/* ===== 额外食宿选项 ===== */}
        <View style={styles.section}>
          <Text style={typography.h2}>额外食宿选项</Text>
          <Text style={[typography.caption, { marginTop: 4, color: colors.textSecondary }]}>想多住几晚或加几顿美食</Text>
          <View style={styles.extraRow}>
            <TouchableOpacity
              style={styles.extraCard}
              onPress={() => {
                setSelectedDays(d => d + 1);
                Alert.alert('已添加', `已延长为 ${selectedDays + 1} 天行程，景点已自动重新分布`);
              }}
            >
              <Ionicons name="bed-outline" size={22} color="#8B5CF6" />
              <Text style={[typography.bodySmall, { fontWeight: '600' }]}>多住一晚</Text>
              <Text style={[typography.caption, { textAlign: 'center' }]}>+1天行程</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.extraCard}
              onPress={() => setIsEditMode(true)}
            >
              <Ionicons name="create-outline" size={22} color={colors.warningYellow} />
              <Text style={[typography.bodySmall, { fontWeight: '600' }]}>编辑行程</Text>
              <Text style={[typography.caption, { textAlign: 'center' }]}>插入节点/调交通</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.extraCard}
              onPress={() => {
                const lastDay = selectedDays;
                setHotelSearchDay(lastDay);
                setShowHotelSearch(true);
              }}
            >
              <Ionicons name="swap-horizontal-outline" size={22} color={colors.primary} />
              <Text style={[typography.bodySmall, { fontWeight: '600' }]}>换酒店</Text>
              <Text style={[typography.caption, { textAlign: 'center' }]}>浏览更多</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom bar */}
      <View style={styles.bar}>
        <View><Text style={typography.caption}>合计 ({groupSize}人)</Text><Text style={typography.price}>{formatPrice(totalPrice)}</Text></View>
        <TouchableOpacity onPress={handleSettlement} activeOpacity={0.8}>
          <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.barBtn}>
            <Text style={styles.barBtnText}>去结算</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* ===== Insert Itinerary Node Modal ===== */}
      <Modal visible={showInsertNodeModal} transparent animationType="slide" onRequestClose={() => setShowInsertNodeModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={styles.modalOverlay} onPress={() => Keyboard.dismiss()}>
            <Pressable style={styles.modalContent} onPress={e => e.stopPropagation()}>
              <Text style={typography.h2}>插入行程节点</Text>
              <Text style={[typography.bodySmall, { marginTop: 4, marginBottom: spacing.lg }]}>插入后会自动重算后续时间和交通</Text>

              <View style={styles.chipRow}>
                <TouchableOpacity style={[styles.timeChip, insertType === 'time' && styles.chipActive]} onPress={() => setInsertType('time')}>
                  <Text style={[styles.timeChipText, insertType === 'time' && styles.chipTextActive]}>时间型</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.timeChip, insertType === 'place' && styles.chipActive]} onPress={() => setInsertType('place')}>
                  <Text style={[styles.timeChipText, insertType === 'place' && styles.chipTextActive]}>地点型</Text>
                </TouchableOpacity>
              </View>

              <Text style={[typography.caption, { marginTop: spacing.md }]}>节点名称</Text>
              <TextInput
                style={styles.noteInput}
                value={insertTitle}
                onChangeText={setInsertTitle}
                placeholder={insertType === 'time' ? '例如：午休、自由活动、喝咖啡' : '例如：加一个海边散步点'}
                placeholderTextColor={colors.disabled}
              />

              <Text style={[typography.caption, { marginTop: spacing.md }]}>停留时长（分钟）</Text>
              <TextInput
                style={styles.timeInput}
                value={insertDurationValue}
                onChangeText={setInsertDurationValue}
                placeholder="例如：60"
                placeholderTextColor={colors.disabled}
                keyboardType="number-pad"
              />

              {insertType === 'place' && (
                <>
                  <Text style={[typography.caption, { marginTop: spacing.md }]}>搜索地点</Text>
                  <TextInput
                    style={styles.timeInput}
                    value={insertSearchText}
                    onChangeText={setInsertSearchText}
                    placeholder="搜索景点 / 餐厅 / 酒店"
                    placeholderTextColor={colors.disabled}
                  />
                  <ScrollView style={{ maxHeight: 220, marginTop: spacing.sm }} keyboardShouldPersistTaps="handled">
                    {filteredInsertPlaceOptions.map(option => {
                      const isSelected = selectedInsertPlace?.id === option.id;
                      return (
                        <TouchableOpacity
                          key={option.id}
                          style={[styles.placeOptionRow, isSelected && styles.placeOptionRowActive]}
                          onPress={() => {
                            setSelectedInsertPlace(option);
                            setInsertTitle(option.name);
                          }}
                        >
                          <Text style={typography.bodySmall}>{option.name}</Text>
                          <Text style={typography.caption}>{option.subtitle}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </>
              )}

              <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl }}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowInsertNodeModal(false)}><Text style={{ color: colors.textSecondary, fontWeight: '600' }}>取消</Text></TouchableOpacity>
                <TouchableOpacity style={styles.modalConfirmBtn} onPress={handleCreateInsertedNode}><Text style={{ color: '#FFF', fontWeight: '600' }}>确定插入</Text></TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ===== Restaurant Picker Modal ===== */}
      <Modal visible={showRestPicker} transparent animationType="slide" onRequestClose={() => setShowRestPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '75%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
              <Text style={typography.h2}>选择餐厅</Text>
              <TouchableOpacity onPress={() => { setSelectedRestaurants(p => { const n = { ...p }; delete n[restPickerKey]; return n; }); setShowRestPicker(false); }}>
                <Text style={[typography.bodySmall, { color: colors.priceRed }]}>不选</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {(() => {
                const parts = restPickerKey.split('-');
                const dayNum = parseInt(parts[0]) || 1;
                const mealType = parts[1] || 'lunch';
                const scored = getRecommendedRestaurants(dayNum, mealType);
                // 酒店早餐选项（仅早餐餐次显示）
                const bkHotelId = mealType === 'breakfast' ? getBreakfastHotelForDay(dayNum, selectedHotelIds) : null;
                const bkHotel = bkHotelId ? hotels.find(h => h.id === bkHotelId) : null;
                const bkOpts = bkHotel ? getHotelBreakfastOptions(bkHotel) : null;
                const isHotelBkSelected = selectedRestaurants[restPickerKey] === HOTEL_BREAKFAST_ID;
                return (
                  <>
                    {bkHotel && bkOpts && (bkOpts.included || bkOpts.optional) && (
                      <TouchableOpacity
                        style={[styles.restItem, isHotelBkSelected && { borderColor: '#10B981' }, { borderLeftWidth: 3, borderLeftColor: '#10B981' }]}
                        onPress={() => { setSelectedRestaurants(p => ({ ...p, [restPickerKey]: HOTEL_BREAKFAST_ID })); setShowRestPicker(false); }}
                      >
                        <View style={{ width: 56, height: 56, borderRadius: borderRadius.md, backgroundColor: '#10B98120', alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="bed" size={24} color="#10B981" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                            <Text style={typography.body} numberOfLines={1}>酒店早餐</Text>
                            <View style={{ backgroundColor: '#10B98120', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                              <Text style={{ fontSize: 11, color: '#10B981', fontWeight: '600' }}>{bkOpts.included ? '含早' : `+¥${bkOpts.price}/人`}</Text>
                            </View>
                          </View>
                          <Text style={typography.caption}>{bkHotel.name}</Text>
                          <Text style={[typography.caption, { color: '#10B981' }]}>
                            {bkOpts.included ? '已含在房费中，无需额外费用' : `加购 ¥${bkOpts.price}/人`}
                          </Text>
                        </View>
                        {isHotelBkSelected && <Ionicons name="checkmark-circle" size={20} color="#10B981" />}
                      </TouchableOpacity>
                    )}
                    {scored.map((item, idx) => {
                      const r = item.restaurant;
                      const sel = selectedRestaurants[restPickerKey] === r.id;
                      const useGroupPrice = groupSize >= 2 && r.groupMealPrice;
                      const isTop = idx === 0 && item.score > 0;
                      return (
                        <TouchableOpacity key={r.id} style={[styles.restItem, sel && { borderColor: colors.primary }, isTop && styles.restItemRecommended]} onPress={() => { setSelectedRestaurants(p => ({ ...p, [restPickerKey]: r.id })); setShowRestPicker(false); }}>
                          <Image source={{ uri: r.imageUrl }} style={styles.restImg} />
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                              <Text style={typography.body} numberOfLines={1}>{r.name}</Text>
                              {isTop && (
                                <View style={styles.recommendBadge}>
                                  <Ionicons name="star" size={10} color="#FFF" />
                                  <Text style={styles.recommendText}>推荐</Text>
                                </View>
                              )}
                            </View>
                            <Text style={typography.caption}>{r.cuisineType} | {getZoneName(r.zone)} | {r.rating}分</Text>
                            {item.reasons.length > 0 && (
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
                                {item.reasons.map(reason => (
                                  <View key={reason} style={styles.reasonTag}>
                                    <Text style={styles.reasonText}>{reason}</Text>
                                  </View>
                                ))}
                              </View>
                            )}
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 3 }}>
                              <Text style={typography.priceSmall}>人均 {formatPrice(r.pricePerPerson)}</Text>
                              {useGroupPrice && (
                                <View style={styles.groupMealBadge}>
                                  <Text style={styles.groupMealText}>团餐 {formatPrice(r.groupMealPrice!)}/人</Text>
                                </View>
                              )}
                            </View>
                          </View>
                          {sel && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                        </TouchableOpacity>
                      );
                    })}
                  </>
                );
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ===== Duration Editor Modal ===== */}
      <Modal visible={!!editDurationId} transparent animationType="fade" onRequestClose={() => setEditDurationId(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={styles.modalOverlay} onPress={() => Keyboard.dismiss()}>
            <Pressable style={[styles.modalContent, { paddingBottom: spacing.xl }]} onPress={e => e.stopPropagation()}>
              <Text style={typography.h2}>修改游玩时长</Text>
              <Text style={[typography.bodySmall, { marginTop: 4, marginBottom: spacing.lg }]}>
                {dragItems.find(d => d.id === editDurationId)?.name}
              </Text>
              <TextInput
                style={styles.timeInput}
                value={editDurationValue}
                onChangeText={setEditDurationValue}
                placeholder="输入小时数，如 1.5"
                placeholderTextColor={colors.disabled}
                keyboardType="decimal-pad"
                returnKeyType="done"
                onSubmitEditing={() => editDurationId && handleDurationSave(editDurationId)}
              />
              <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl }}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setEditDurationId(null)}>
                  <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalConfirmBtn} onPress={() => editDurationId && handleDurationSave(editDurationId)}>
                  <Text style={{ color: '#FFF', fontWeight: '600' }}>确定</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ===== Time Overflow Warning Modal ===== */}
      <Modal visible={showOverflowModal} transparent animationType="fade" onRequestClose={() => setShowOverflowModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.warningIcon}>
              <Ionicons name="warning" size={32} color={colors.priceRed} />
            </View>
            <Text style={[typography.h2, { textAlign: 'center', marginTop: spacing.md }]}>时间超出</Text>
            <Text style={[typography.body, { textAlign: 'center', marginTop: spacing.sm, color: colors.textSecondary }]}>
              第{overflowDay}天行程超出可用时间 {overflowMinutes} 分钟
            </Text>
            <Text style={[typography.bodySmall, { textAlign: 'center', marginTop: spacing.xs }]}>
              你可以手动调整景点时长或顺序，也可以让系统自动调整
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl }}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowOverflowModal(false)}>
                <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>知道了</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmBtn} onPress={() => handleAutoAdjust(overflowDay)}>
                <Text style={{ color: '#FFF', fontWeight: '600' }}>自动调整</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== Day Adjust Confirmation Modal ===== */}
      <Modal visible={showDayAdjustModal} transparent animationType="fade" onRequestClose={() => setShowDayAdjustModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.warningIcon}>
              <Ionicons name="calendar-outline" size={32} color={colors.warningYellow} />
            </View>
            <Text style={[typography.h2, { textAlign: 'center', marginTop: spacing.md }]}>
              {dayAdjustReason === 'date_change' ? '行程天数变更' : '行程时间不足'}
            </Text>
            {dayAdjustReason === 'date_change' ? (
              <>
                <Text style={[typography.body, { textAlign: 'center', marginTop: spacing.sm, color: colors.textSecondary }]}>
                  你的出行日期对应 {suggestedDays} 天，当前规划为 {selectedDays} 天
                </Text>
                <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
                  {suggestedDays > selectedDays && (
                    <TouchableOpacity style={{ width: '100%', paddingVertical: 14, borderRadius: borderRadius.lg, backgroundColor: colors.primary, alignItems: 'center' }} onPress={() => {
                      setSelectedDays(suggestedDays);
                      setShowDayAdjustModal(false);
                    }}>
                      <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 15 }}>调整为 {suggestedDays} 天</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            ) : (
              <>
                <Text style={[typography.body, { textAlign: 'center', marginTop: spacing.sm, color: colors.textSecondary }]}> 
                  当前 {selectedDays} 天约可用 {(feasibilityAnalysis.availableMinutes / 60).toFixed(1)}h，完整体验约需 {(feasibilityAnalysis.recommendedRequiredMinutes / 60).toFixed(1)}h；
                  {feasibilityAnalysis.unplacedAttractions.length} 个景点暂时排不进时间轴。
                </Text>
                {feasibilityAnalysis.compressionPreview.length > 0 && (
                  <View style={{ marginTop: spacing.md, padding: spacing.md, borderRadius: borderRadius.md, backgroundColor: `${colors.warningYellow}10` }}> 
                    <Text style={[typography.caption, { color: colors.textPrimary, fontWeight: '600', marginBottom: 4 }]}>选择“全部景点都去”后的时间预览</Text>
                    {feasibilityAnalysis.compressionPreview.slice(0, 3).map(item => (
                      <Text key={item.id} style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}> 
                        {item.name}：建议{item.recommendedMinutes}分钟 → 实际{item.targetMinutes}分钟
                      </Text>
                    ))}
                    {feasibilityAnalysis.compressionPreview.length > 3 && (
                      <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>还有 {feasibilityAnalysis.compressionPreview.length - 3} 个景点会调整</Text>
                    )}
                  </View>
                )}
                <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
                  <TouchableOpacity style={{ width: '100%', paddingVertical: 14, borderRadius: borderRadius.lg, backgroundColor: colors.primary, alignItems: 'center' }} onPress={() => {
                    setSelectedDays(feasibilityAnalysis.suggestedDays);
                    setShowDayAdjustModal(false);
                  }}>
                    <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 15 }}>增加到 {feasibilityAnalysis.suggestedDays} 天</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 }}>保留全部景点的推荐游玩时长</Text>
                  </TouchableOpacity>
                  {feasibilityAnalysis.suggestedDays < 30 && (
                    <TouchableOpacity style={{ width: '100%', paddingVertical: 12, borderRadius: borderRadius.lg, borderWidth: 1.5, borderColor: colors.primary, alignItems: 'center' }} onPress={() => {
                      setSelectedDays(Math.min(30, feasibilityAnalysis.suggestedDays + 1));
                      setShowDayAdjustModal(false);
                    }}>
                      <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 14 }}>更从容：安排 {Math.min(30, feasibilityAnalysis.suggestedDays + 1)} 天</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={{ width: '100%', paddingVertical: 14, borderRadius: borderRadius.lg, backgroundColor: '#F59E0B', alignItems: 'center', opacity: feasibilityAnalysis.canCompressToMinimum ? 1 : 0.55 }}
                    onPress={() => {
                      if (!feasibilityAnalysis.canCompressToMinimum) {
                        Alert.alert('仍然放不下', '即使把景点压缩到推荐时长的50%（且不少于30分钟），当前天数仍无法完成。请增加天数或减少景点。');
                        return;
                      }
                      setDragItems(prev => prev.map(d => ({
                        ...d,
                        customDuration: (feasibilityAnalysis.compressionTargets[d.attractionId] || Math.round(d.defaultDuration * 60)) / 60,
                      })));
                      setShowDayAdjustModal(false);
                    }}
                  >
                    <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 15 }}>全部景点都去（压缩停留）</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 }}>不低于建议时长的50%，且每处至少30分钟</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ width: '100%', paddingVertical: 14, borderRadius: borderRadius.lg, backgroundColor: colors.secondary, alignItems: 'center' }} onPress={() => {
                    setShowDayAdjustModal(false);
                  }}>
                    <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 15 }}>保持推荐体验，手动减少景点</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 }}>维持推荐时长，自行移除优先级较低的景点</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
            <TouchableOpacity style={{ marginTop: spacing.md, alignSelf: 'center', paddingVertical: spacing.sm }} onPress={() => setShowDayAdjustModal(false)}>
              <Text style={{ color: colors.textSecondary }}>暂不调整</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ===== Hotel Detail Modal (房型/价格/图片) ===== */}
      <Modal visible={showHotelDetail} transparent animationType="slide" onRequestClose={() => setShowHotelDetail(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '80%' }]}>
            {(() => {
              const hotelId = selectedHotelIds[hotelDetailDay];
              const hotel = hotelId ? hotels.find(h => h.id === hotelId) : null;
              if (!hotel) return <Text style={typography.body}>未选择酒店</Text>;
              const roomTypes = getRoomTypesForHotel(hotel);
              const currentRoom = selectedRoomTypes[hotelDetailDay];
              return (
                <>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
                    <Text style={typography.h2}>酒店详情</Text>
                    <TouchableOpacity onPress={() => setShowHotelDetail(false)}>
                      <Ionicons name="close" size={24} color={colors.textPrimary} />
                    </TouchableOpacity>
                  </View>

                  {/* 酒店图片 */}
                  <Image source={{ uri: hotel.imageUrl }} style={{ width: '100%', height: 160, borderRadius: borderRadius.md, marginBottom: spacing.md }} resizeMode="cover" />

                  {/* 酒店基本信息 */}
                  <Text style={[typography.h3, { marginBottom: 4 }]}>{hotel.name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
                    <View style={{ backgroundColor: colors.primary + '15', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '600' }}>{getHotelLevelName(hotel.level)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                      <Ionicons name="star" size={12} color="#F59E0B" />
                      <Text style={{ fontSize: 12, color: colors.textSecondary }}>{hotel.rating}</Text>
                    </View>
                    {getHotelBreakfastOptions(hotel)?.included && (
                      <View style={{ backgroundColor: '#10B98120', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 11, color: '#10B981', fontWeight: '600' }}>含早餐</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[typography.caption, { marginBottom: spacing.md }]}>{hotel.description}</Text>

                  {/* 设施标签 */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.lg }}>
                    {hotel.amenities.map(a => (
                      <View key={a} style={{ backgroundColor: colors.border, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ fontSize: 11, color: colors.textSecondary }}>{a}</Text>
                      </View>
                    ))}
                  </View>

                  {/* 房型选择 */}
                  <Text style={[typography.body, { fontWeight: '600', marginBottom: spacing.sm }]}>选择房型</Text>
                  <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 200 }}>
                    {roomTypes.map(room => {
                      const price = Math.round(hotel.pricePerNight * room.priceAdjust);
                      const isSelected = currentRoom === room.type;
                      return (
                        <TouchableOpacity
                          key={room.type}
                          style={{
                            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                            padding: spacing.md, borderRadius: borderRadius.md,
                            borderWidth: 1.5, borderColor: isSelected ? colors.primary : colors.border,
                            backgroundColor: isSelected ? colors.primary + '08' : colors.surface,
                            marginBottom: spacing.sm,
                          }}
                          onPress={() => setSelectedRoomTypes(prev => ({ ...prev, [hotelDetailDay]: room.type }))}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[typography.body, { fontWeight: '600' }]}>
                              {room.type}
                              {isSelected && <Text style={{ color: colors.primary }}> (已选)</Text>}
                            </Text>
                            <Text style={typography.caption}>{room.description} · 最多{room.maxOccupancy}人</Text>
                          </View>
                          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.priceRed }}>{formatPrice(price)}<Text style={{ fontSize: 11, fontWeight: '400' }}>/晚</Text></Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  {/* 更换酒店按钮 */}
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.md, paddingVertical: spacing.sm }}
                    onPress={() => { setShowHotelDetail(false); setHotelSearchDay(hotelDetailDay); setShowHotelSearch(true); }}
                  >
                    <Ionicons name="swap-horizontal-outline" size={16} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontWeight: '500' }}>更换其他酒店</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* ===== Hotel Search Modal ===== */}
      <Modal visible={showHotelSearch} transparent animationType="slide" onRequestClose={() => setShowHotelSearch(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={styles.modalOverlay} onPress={() => Keyboard.dismiss()}>
            <Pressable style={[styles.modalContent, { maxHeight: '85%' }]} onPress={e => e.stopPropagation()}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
                <Text style={typography.h2}>搜索酒店 · 第{hotelSearchDay}晚</Text>
                <TouchableOpacity onPress={() => setShowHotelSearch(false)}>
                  <Ionicons name="close" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Search bar */}
              <View style={styles.hotelSearchBar}>
                <Ionicons name="search-outline" size={16} color={colors.textSecondary} />
                <TextInput
                  style={styles.hotelSearchInput}
                  value={hotelSearchText}
                  onChangeText={setHotelSearchText}
                  placeholder="搜索酒店名称..."
                  placeholderTextColor={colors.disabled}
                  returnKeyType="search"
                />
                {hotelSearchText.length > 0 && (
                  <TouchableOpacity onPress={() => setHotelSearchText('')}>
                    <Ionicons name="close-circle" size={16} color={colors.disabled} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Filter chips: level */}
              <Text style={[typography.caption, { marginTop: spacing.md, marginBottom: spacing.xs }]}>档次筛选</Text>
              <View style={styles.chipRow}>
                {([['all', '全部'], ['budget', '经济型'], ['mid', '中档'], ['luxury', '豪华']] as const).map(([val, label]) => (
                  <TouchableOpacity key={val} style={[styles.timeChip, hotelFilterLevel === val && styles.chipActive]} onPress={() => setHotelFilterLevel(val)}>
                    <Text style={[styles.timeChipText, hotelFilterLevel === val && styles.chipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Sort chips */}
              <Text style={[typography.caption, { marginTop: spacing.md, marginBottom: spacing.xs }]}>排序方式</Text>
              <View style={styles.chipRow}>
                {([['rating', '评分最高'], ['price', '价格最低'], ['distance', '距离最近']] as const).map(([val, label]) => (
                  <TouchableOpacity key={val} style={[styles.timeChip, hotelSortBy === val && styles.chipActive]} onPress={() => setHotelSortBy(val)}>
                    <Text style={[styles.timeChipText, hotelSortBy === val && styles.chipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Results */}
              <Text style={[typography.caption, { marginTop: spacing.md, marginBottom: spacing.sm }]}>共 {filteredHotels.length} 家酒店</Text>
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 360 }}>
                {filteredHotels.map(hotel => {
                  const sel = selectedHotelIds[hotelSearchDay] === hotel.id;
                  return (
                    <TouchableOpacity
                      key={hotel.id}
                      style={[styles.hotelSearchCard, sel && styles.hotelSearchCardActive]}
                      onPress={() => { setSelectedHotelIds(prev => ({ ...prev, [hotelSearchDay]: sel ? '' : hotel.id })); setShowHotelSearch(false); }}
                      activeOpacity={0.7}
                    >
                      <Image source={{ uri: hotel.imageUrl }} style={styles.hotelSearchImg} />
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                          <Text style={typography.body} numberOfLines={1}>{hotel.name}</Text>
                          {sel && <Ionicons name="checkmark-circle" size={16} color={colors.primary} />}
                        </View>
                        <Text style={typography.caption}>{getHotelLevelName(hotel.level)} | {getZoneName(hotel.zone)} | {hotel.rating}分</Text>
                        <Text style={[typography.caption, { marginTop: 2 }]} numberOfLines={1}>{hotel.description}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 3 }}>
                          <Text style={typography.priceSmall}>{formatPrice(hotel.pricePerNight)}/晚</Text>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3, flex: 1 }}>
                            {hotel.amenities.slice(0, 3).map(a => (
                              <View key={a} style={styles.amenityTag}>
                                <Text style={styles.amenityText}>{a}</Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
                {filteredHotels.length === 0 && (
                  <View style={{ alignItems: 'center', paddingVertical: spacing.xxl }}>
                    <Ionicons name="bed-outline" size={40} color={colors.disabled} />
                    <Text style={[typography.bodySmall, { color: colors.textSecondary, marginTop: spacing.sm }]}>没有找到符合条件的酒店</Text>
                  </View>
                )}
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ===== Guide Search Modal ===== */}
      <Modal visible={showGuideSearch} transparent animationType="slide" onRequestClose={() => setShowGuideSearch(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
              <Text style={typography.h2}>全部导游</Text>
              <TouchableOpacity onPress={() => setShowGuideSearch(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={[typography.caption, { marginBottom: spacing.md }]}>
              出行日期: {formatDateCN(travelStartDate)} - {formatDateCN(travelDates[travelDates.length - 1] || travelStartDate)}
            </Text>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 500 }}>
              {guides.filter(g => g.isAvailableForHire).map(g => {
                const sel = selectedGuideId === g.id;
                const busy = isGuideBusy(g);
                const busyDates = getGuideBusyDates(g);
                const allBusy = busyDates.length === travelDates.length;
                const isFav = prefStore.favoriteGuideIds.includes(g.id);
                return (
                  <TouchableOpacity
                    key={g.id}
                    style={[styles.guideSearchCard, sel && styles.guideSearchCardActive, allBusy && { opacity: 0.5 }]}
                    onPress={() => { if (favTapRef.current) { favTapRef.current = false; return; } setSelectedGuideId(sel ? null : g.id); if (!sel) setShowGuideSearch(false); }}
                    activeOpacity={0.7}
                  >
                    <Image source={{ uri: g.avatar }} style={styles.guideAv} />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                        <Text style={typography.body}>{g.name}</Text>
                        {isFav && <Ionicons name="heart" size={12} color={colors.priceRed} />}
                        {allBusy ? (
                          <View style={[styles.busyBadge, { backgroundColor: `${colors.priceRed}15` }]}>
                            <Text style={[styles.busyBadgeText, { color: colors.priceRed }]}>完全不可用</Text>
                          </View>
                        ) : busy ? (
                          <View style={styles.busyBadge}>
                            <Text style={styles.busyBadgeText}>部分不可用</Text>
                          </View>
                        ) : (
                          <View style={styles.availBadge}>
                            <Text style={styles.availBadgeText}>可预约</Text>
                          </View>
                        )}
                        {sel && <Ionicons name="checkmark-circle" size={16} color={colors.primary} />}
                      </View>
                      <Text style={typography.caption}>
                        {g.yearsOfExperience}年经验 | {g.languages.join('/')} | {g.specialtyAreas.join(', ')}
                      </Text>
                      <Text style={[typography.caption, { marginTop: 2 }]} numberOfLines={1}>{g.description}</Text>
                      {busy && busyDates.length > 0 && (
                        <Text style={[typography.caption, { color: colors.priceRed, marginTop: 2 }]}>
                          不可用: {busyDates.map(d => formatDateCN(d)).join(', ')}
                        </Text>
                      )}
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                        <Text style={typography.priceSmall}>{formatPrice(g.perDayPrice)}/天</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                          <Pressable
                            style={({ pressed }) => [styles.favBtn, pressed && { opacity: 0.6 }]}
                            onPress={() => { favTapRef.current = true; prefStore.toggleFavoriteGuide(g.id); }}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          >
                            <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={22} color={isFav ? colors.priceRed : colors.textSecondary} />
                          </Pressable>
                          <Pressable
                            style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 2, padding: 4 }, pressed && { opacity: 0.6 }]}
                            onPress={() => { favTapRef.current = true; setCalendarGuideId(g.id); setShowGuideCalendar(true); }}
                          >
                            <Ionicons name="calendar-outline" size={14} color={colors.primary} />
                            <Text style={[typography.caption, { color: colors.primary }]}>日历</Text>
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ===== Guide Calendar Modal ===== */}
      <Modal visible={showGuideCalendar} transparent animationType="fade" onRequestClose={() => setShowGuideCalendar(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '80%' }]}>
            {(() => {
              const guide = guides.find(g => g.id === calendarGuideId);
              if (!guide) return <Text style={typography.body}>未找到导游信息</Text>;
              const guideBusy = guide.busyDates || [];
              // Build calendar for current and next month
              const now = new Date(travelStartDate);
              const calMonth = now.getMonth();
              const calYear = now.getFullYear();
              const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
              const firstDayOfWeek = new Date(calYear, calMonth, 1).getDay();
              const cells: { date: string; day: number; isBusy: boolean; isTravel: boolean; isPast: boolean }[] = [];
              const today = new Date('2026-03-24'); // 固定基准日期
              for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dateObj = new Date(calYear, calMonth, day);
                cells.push({
                  date: dateStr,
                  day,
                  isBusy: guideBusy.includes(dateStr),
                  isTravel: travelDates.includes(dateStr),
                  isPast: dateObj < today,
                });
              }
              const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
              return (
                <>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
                    <Text style={typography.h2}>{guide.name} 的日历</Text>
                    <TouchableOpacity onPress={() => setShowGuideCalendar(false)}>
                      <Ionicons name="close" size={24} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  <Text style={[typography.bodySmall, { marginBottom: spacing.md, color: colors.textSecondary }]}>
                    {calYear}年{calMonth + 1}月
                  </Text>
                  {/* Legend */}
                  <View style={{ flexDirection: 'row', gap: spacing.lg, marginBottom: spacing.md }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: `${colors.primary}30` }} />
                      <Text style={typography.caption}>出行日期</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: `${colors.priceRed}30` }} />
                      <Text style={typography.caption}>导游繁忙</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.successGreen }} />
                      <Text style={typography.caption}>可用</Text>
                    </View>
                  </View>
                  {/* Week header */}
                  <View style={{ flexDirection: 'row', marginBottom: spacing.xs }}>
                    {weekDays.map(w => (
                      <View key={w} style={{ flex: 1, alignItems: 'center' }}>
                        <Text style={[typography.caption, { fontWeight: '600' }]}>{w}</Text>
                      </View>
                    ))}
                  </View>
                  {/* Calendar grid */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                    {/* Empty cells for offset */}
                    {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                      <View key={`empty-${i}`} style={styles.calCell} />
                    ))}
                    {cells.map(cell => {
                      const isBusyTravel = cell.isBusy && cell.isTravel;
                      let bgColor = 'transparent';
                      let textColor = colors.textPrimary;
                      if (cell.isPast) {
                        textColor = colors.disabled;
                      } else if (isBusyTravel) {
                        bgColor = `${colors.priceRed}25`;
                        textColor = colors.priceRed;
                      } else if (cell.isBusy) {
                        bgColor = `${colors.priceRed}12`;
                        textColor = colors.priceRed;
                      } else if (cell.isTravel) {
                        bgColor = `${colors.primary}20`;
                        textColor = colors.primary;
                      }
                      return (
                        <View key={cell.date} style={[styles.calCell, { backgroundColor: bgColor }]}>
                          <Text style={[styles.calCellText, { color: textColor }]}>{cell.day}</Text>
                          {isBusyTravel && (
                            <Ionicons name="close" size={10} color={colors.priceRed} style={{ position: 'absolute', top: 1, right: 2 }} />
                          )}
                          {cell.isTravel && !cell.isBusy && !cell.isPast && (
                            <View style={{ position: 'absolute', bottom: 1, width: 4, height: 4, borderRadius: 2, backgroundColor: colors.successGreen }} />
                          )}
                        </View>
                      );
                    })}
                  </View>
                  {/* Summary */}
                  <View style={{ marginTop: spacing.lg, padding: spacing.md, backgroundColor: colors.background, borderRadius: borderRadius.md }}>
                    {getGuideBusyDates(guide).length > 0 ? (
                      <Text style={[typography.bodySmall, { color: colors.priceRed }]}>
                        您的出行日期中，{guide.name} 有 {getGuideBusyDates(guide).length} 天不可用：{getGuideBusyDates(guide).map(d => formatDateCN(d)).join('、')}
                      </Text>
                    ) : (
                      <Text style={[typography.bodySmall, { color: colors.successGreen }]}>
                        {guide.name} 在您的全部出行日期均可用
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity
                    style={[styles.modalConfirmBtn, { marginTop: spacing.lg }]}
                    onPress={() => setShowGuideCalendar(false)}
                  >
                    <Text style={{ color: '#FFF', fontWeight: '600' }}>关闭</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* ===== Flight Picker Modal ===== */}
      <Modal visible={showFlightPicker !== null} transparent animationType="slide" onRequestClose={() => setShowFlightPicker(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
              <Text style={typography.h2}>{showFlightPicker === 'departure' ? '选择去程航班' : '选择返程航班'}</Text>
              <TouchableOpacity onPress={() => setShowFlightPicker(null)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {flightSearchResults.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: spacing.xxxl }}>
                  <Ionicons name="airplane-outline" size={48} color={colors.disabled} />
                  <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.md }]}>该日期暂无航班</Text>
                </View>
              ) : (
                flightSearchResults.map(flight => {
                  const isSelected = showFlightPicker === 'departure'
                    ? departureFlight?.id === flight.id
                    : returnFlight?.id === flight.id;
                  const cabinLabel = flight.cabin === 'economy' ? '经济舱' : flight.cabin === 'premium' ? '超级经济舱' : '头等舱';
                  return (
                    <TouchableOpacity
                      key={flight.id}
                      style={[styles.flightPickerCard, isSelected && { borderColor: colors.primary, borderWidth: 2 }]}
                      onPress={() => {
                        // 选择航班
                        if (showFlightPicker === 'departure') {
                          setDepartureFlight(flight);
                        } else {
                          setReturnFlight(flight);
                        }
                        // 检查是否需要升舱提示
                        if (flight.cabin === 'economy' && flight.luggageOption === 'carryOnly') {
                          const premium = findPremiumAlternative(flight);
                          const economyWithLuggage = flight.totalPrice + (flight.airlineType === 'budget' ? 180 : 0);
                          if (premium && economyWithLuggage >= premium.totalPrice) {
                            setFlightUpgradeHint({ flight, premium });
                          } else {
                            setFlightUpgradeHint(null);
                          }
                        } else {
                          setFlightUpgradeHint(null);
                        }
                        setShowFlightPicker(null);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                          <Text style={{ fontSize: 14, fontWeight: '600' }}>{flight.airline}</Text>
                          <Text style={[typography.caption]}>{flight.flightNo}</Text>
                          {flight.airlineType === 'budget' && (
                            <View style={{ backgroundColor: `${colors.warningYellow}20`, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 10 }}>
                              <Text style={{ fontSize: 10, fontWeight: '600', color: colors.warningYellow }}>廉航</Text>
                            </View>
                          )}
                        </View>
                        <View style={{ backgroundColor: `${colors.primary}15`, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                          <Text style={{ fontSize: 11, fontWeight: '500', color: colors.primary }}>{cabinLabel}</Text>
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: spacing.sm }}>
                        <View style={{ alignItems: 'center', width: 55 }}>
                          <Text style={{ fontSize: 18, fontWeight: '700' }}>{flight.departureTime}</Text>
                          <Text style={typography.caption}>{flight.departureCity}</Text>
                        </View>
                        <View style={{ flex: 1, alignItems: 'center' }}>
                          <Text style={[typography.caption]}>{Math.floor(flight.durationMin / 60)}h{flight.durationMin % 60 > 0 ? (flight.durationMin % 60) + 'm' : ''}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', width: '70%', marginVertical: 3 }}>
                            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.primary }} />
                            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                            {!flight.isDirect && <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.warningYellow }} />}
                            {!flight.isDirect && <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />}
                            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.primary }} />
                          </View>
                          <Text style={[typography.caption]}>{flight.isDirect ? '直飞' : `经停${flight.stopCity}`}</Text>
                        </View>
                        <View style={{ alignItems: 'center', width: 55 }}>
                          <Text style={{ fontSize: 18, fontWeight: '700' }}>{flight.arrivalTime}</Text>
                          <Text style={typography.caption}>{flight.arrivalCity}</Text>
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ionicons name="briefcase-outline" size={13} color={colors.textSecondary} />
                          <Text style={[typography.caption]}>{flight.luggageOption === 'checked' ? '托运20kg+手提7kg' : '仅手提7kg'}</Text>
                        </View>
                        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.priceRed }}>{formatPrice(flight.totalPrice)}</Text>
                      </View>
                      <Text style={[typography.caption, { marginTop: 2 }]}>
                        票价{flight.basePrice}元{flight.fuelSurcharge > 0 ? ` + 燃油附加费${flight.fuelSurcharge}元` : ''}
                      </Text>
                      {isSelected && (
                        <View style={{ position: 'absolute', top: 8, right: 8 }}>
                          <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ===== Flight Alternatives Modal (方案切换) ===== */}
      <Modal visible={showFlightAlternatives !== null} transparent animationType="slide" onRequestClose={() => setShowFlightAlternatives(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '70%' }]}>
            {(() => {
              const currentFlight = showFlightAlternatives === 'departure' ? departureFlight : returnFlight;
              if (!currentFlight) return null;
              const groupFlights = findFlightsByGroup(currentFlight.slotGroupId);
              const getCabinLabel = (c: string) => c === 'economy' ? '经济舱' : c === 'premium' ? '超级经济舱' : '头等舱';
              return (
                <>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
                    <View>
                      <Text style={typography.h3}>航班方案选择</Text>
                      <Text style={[typography.caption, { marginTop: 2 }]}>{currentFlight.airline} {currentFlight.flightNo} | {currentFlight.departureTime}→{currentFlight.arrivalTime}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setShowFlightAlternatives(null)}>
                      <Ionicons name="close" size={24} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  <ScrollView showsVerticalScrollIndicator={false}>
                    {groupFlights.map(flight => {
                      const isSelected = flight.id === currentFlight.id;
                      return (
                        <TouchableOpacity
                          key={flight.id}
                          style={[styles.flightPickerCard, isSelected && { borderColor: colors.primary, borderWidth: 2, backgroundColor: `${colors.primary}08` }]}
                          onPress={() => {
                            if (showFlightAlternatives === 'departure') {
                              setDepartureFlight(flight);
                            } else {
                              setReturnFlight(flight);
                            }
                            setShowFlightAlternatives(null);
                          }}
                          activeOpacity={0.7}
                        >
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                              <View style={{ backgroundColor: `${colors.primary}15`, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.primary }}>{getCabinLabel(flight.cabin)}</Text>
                              </View>
                              <Text style={typography.bodySmall}>
                                {flight.luggageOption === 'checked' ? '托运20kg+手提7kg' : '仅手提7kg'}
                              </Text>
                            </View>
                            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.priceRed }}>{formatPrice(flight.totalPrice)}</Text>
                          </View>
                          <Text style={[typography.caption, { marginTop: 4 }]}>
                            票价{flight.basePrice}元{flight.fuelSurcharge > 0 ? ` + 燃油附加费${flight.fuelSurcharge}元` : ''}{flight.luggageAddOnPrice > 0 ? ` + 行李加购${flight.luggageAddOnPrice}元` : ''}
                          </Text>
                          {isSelected && (
                            <View style={{ position: 'absolute', top: 8, right: 8 }}>
                              <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  <TouchableOpacity
                    style={{ marginTop: spacing.md, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.primary, paddingVertical: 12, borderRadius: 8, alignItems: 'center' }}
                    onPress={() => {
                      setShowFlightAlternatives(null);
                      // 打开全列表选择器
                      const isDepart = showFlightAlternatives === 'departure';
                      const results = searchFlights({
                        departureCity: isDepart ? prefStore.departureCity : '深圳',
                        arrivalCity: isDepart ? '深圳' : prefStore.departureCity,
                        date: isDepart ? travelStartDate : (travelDates[travelDates.length - 1] || travelStartDate),
                        cabin: prefStore.flightPreference.preferredCabin,
                        airlineType: prefStore.flightPreference.preferredAirlineType,
                        directOnly: prefStore.flightPreference.preferDirectFlight,
                        luggageOption: prefStore.flightPreference.luggagePreference,
                        timePeriod: isDepart ? prefStore.departureTimePeriod : prefStore.returnTimePeriod,
                      });
                      setFlightSearchResults(results);
                      setShowFlightPicker(isDepart ? 'departure' : 'return');
                    }}
                  >
                    <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 15 }}>更换航班时刻</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* Premium Airport Transfer Modal */}
      <Modal visible={showPremiumModal} transparent animationType="slide" onRequestClose={() => setShowPremiumModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={typography.h3}>预约{premiumDirection === 'pickup' ? '接机' : '送机'}专车</Text>
              <TouchableOpacity onPress={() => setShowPremiumModal(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.lg }]}>
                专业司机准时接送，行李帮提，舒适出行
              </Text>

              {/* Route info */}
              {(() => {
                const seg = schedule.flat().find(it => it.type === 'transport' && (premiumDirection === 'pickup' ? it.id.includes('t-airport') && !it.id.includes('t-to-airport') : it.id.includes('t-to-airport')));
                if (!seg) return null;
                return (
                  <View style={styles.premiumRouteCard}>
                    <Ionicons name="navigate-outline" size={16} color={colors.transport} />
                    <View style={{ flex: 1 }}>
                      <Text style={[typography.bodySmall, { fontWeight: '600' }]}>{seg.title}</Text>
                      <Text style={typography.caption}>{seg.transportDistance?.toFixed(1)}km · 预计{seg.durationMinutes}分钟</Text>
                    </View>
                  </View>
                );
              })()}

              {/* Car type selection */}
              <Text style={[typography.bodySmall, { fontWeight: '600', marginTop: spacing.lg, marginBottom: spacing.md }]}>选择车型</Text>
              <View style={styles.carTypeRow}>
                {PREMIUM_CAR_TYPES.map(car => {
                  const isActive = selectedPremiumCarType === car.id;
                  const seg = schedule.flat().find(it => it.type === 'transport' && (premiumDirection === 'pickup' ? it.id.includes('t-airport') && !it.id.includes('t-to-airport') : it.id.includes('t-to-airport')));
                  const baseTaxiPrice = seg?.transportDistance ? Math.max(10, Math.round(10 + Math.max(0, seg.transportDistance - 2) * 2.6 + (seg.durationMinutes || 20) * 0.3 * 0.8)) : 50;
                  const premPrice = calcPremiumPrice(baseTaxiPrice, car.id);
                  const carCount = calcCarCount(groupSize);
                  return (
                    <TouchableOpacity
                      key={car.id}
                      style={[styles.carTypeCard, isActive && styles.carTypeCardActive]}
                      onPress={() => setSelectedPremiumCarType(car.id)}
                    >
                      <Ionicons name={car.id === 'luxury' ? 'diamond-outline' : car.id === 'business' ? 'briefcase-outline' : 'car-outline'} size={24} color={isActive ? colors.transport : colors.textSecondary} />
                      <Text style={[typography.bodySmall, { fontWeight: '600', marginTop: spacing.xs, color: isActive ? colors.transport : colors.textPrimary }]}>{car.name}</Text>
                      <Text style={[typography.caption, { textAlign: 'center', marginTop: 2 }]}>{car.description}</Text>
                      <Text style={[typography.priceSmall, { marginTop: spacing.sm, color: isActive ? colors.transport : colors.priceRed }]}>
                        {formatPrice(premPrice * carCount)}
                      </Text>
                      {carCount > 1 && <Text style={typography.caption}>{carCount}辆车</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Price breakdown */}
              {(() => {
                const seg = schedule.flat().find(it => it.type === 'transport' && (premiumDirection === 'pickup' ? it.id.includes('t-airport') && !it.id.includes('t-to-airport') : it.id.includes('t-to-airport')));
                const baseTaxiPrice = seg?.transportDistance ? Math.max(10, Math.round(10 + Math.max(0, seg.transportDistance - 2) * 2.6 + (seg.durationMinutes || 20) * 0.3 * 0.8)) : 50;
                const premPrice = calcPremiumPrice(baseTaxiPrice, selectedPremiumCarType);
                const carCount = calcCarCount(groupSize);
                const carType = PREMIUM_CAR_TYPES.find(c => c.id === selectedPremiumCarType);
                return (
                  <View style={styles.premiumPriceBreakdown}>
                    <View style={styles.premiumPriceRow}>
                      <Text style={typography.caption}>基础打车费</Text>
                      <Text style={typography.caption}>{formatPrice(baseTaxiPrice)}</Text>
                    </View>
                    <View style={styles.premiumPriceRow}>
                      <Text style={typography.caption}>车型服务费 ({carType?.name})</Text>
                      <Text style={typography.caption}>+{formatPrice(premPrice - baseTaxiPrice)}</Text>
                    </View>
                    {carCount > 1 && (
                      <View style={styles.premiumPriceRow}>
                        <Text style={typography.caption}>车辆数</Text>
                        <Text style={typography.caption}>{carCount}辆</Text>
                      </View>
                    )}
                    <View style={[styles.premiumPriceRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: spacing.xs }]}>
                      <Text style={[typography.bodySmall, { fontWeight: '700' }]}>合计</Text>
                      <Text style={typography.price}>{formatPrice(premPrice * carCount)}</Text>
                    </View>
                  </View>
                );
              })()}
            </ScrollView>

            {/* Buttons */}
            <View style={styles.premiumBtnRow}>
              {(premiumDirection === 'pickup' ? premiumBookings.pickup : premiumBookings.dropoff) ? (
                <TouchableOpacity
                  style={[styles.premiumBtn, { backgroundColor: colors.priceRed }]}
                  onPress={() => {
                    setPremiumBookings(prev => ({ ...prev, [premiumDirection]: null }));
                    setShowPremiumModal(false);
                  }}
                >
                  <Text style={styles.premiumBtnText}>取消预约</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[styles.premiumBtn, { backgroundColor: colors.transport, flex: 1 }]}
                onPress={() => {
                  const seg = schedule.flat().find(it => it.type === 'transport' && (premiumDirection === 'pickup' ? it.id.includes('t-airport') && !it.id.includes('t-to-airport') : it.id.includes('t-to-airport')));
                  const baseTaxiPrice = seg?.transportDistance ? Math.max(10, Math.round(10 + Math.max(0, seg.transportDistance - 2) * 2.6 + (seg.durationMinutes || 20) * 0.3 * 0.8)) : 50;
                  const premPrice = calcPremiumPrice(baseTaxiPrice, selectedPremiumCarType);
                  setPremiumBookings(prev => ({ ...prev, [premiumDirection]: { carTypeId: selectedPremiumCarType, price: premPrice } }));
                  if (premiumDirection === 'pickup') setAirportPickupMode('taxi');
                  else setAirportDropoffMode('taxi');
                  setShowPremiumModal(false);
                }}
              >
                <Text style={styles.premiumBtnText}>确认预约</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== 航班对比确认弹窗 ===== */}
      <Modal visible={showFlightCompareModal} transparent animationType="slide" onRequestClose={() => setShowFlightCompareModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' }}>
            {/* 标题栏 */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={[typography.h2, { flex: 1 }]}>航班方案对比</Text>
              <TouchableOpacity onPress={() => setShowFlightCompareModal(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {flightCompareData && (
              <ScrollView style={{ padding: spacing.lg }}>
                {/* 类型徽章 */}
                <View style={{ alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, backgroundColor: flightCompareData.type === 'sameDay' ? '#FFF3E0' : '#E3F2FD', marginBottom: spacing.md }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: flightCompareData.type === 'sameDay' ? '#E65100' : '#1565C0' }}>
                    {flightCompareData.type === 'sameDay' ? '同日更便宜' : `临近日期更便宜 (${flightCompareData.date})`}
                  </Text>
                </View>

                {/* 并排对比卡片 */}
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  {/* 当前航班 */}
                  {(() => {
                    const renderFlightCard = (flight: Flight, label: string, isRecommend: boolean) => {
                      const cabinLabel = flight.cabin === 'economy' ? '经济舱' : flight.cabin === 'premium' ? '超级经济舱' : '头等舱';
                      const luggageLabel = flight.luggageOption === 'checked' ? '托运20kg+手提7kg' : '仅手提7kg';
                      return (
                        <View style={{
                          flex: 1, borderWidth: 1.5, borderRadius: 12, padding: spacing.md,
                          borderColor: isRecommend ? colors.primary : colors.border,
                          backgroundColor: isRecommend ? colors.primary + '06' : colors.surface,
                        }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: isRecommend ? colors.primary : colors.textSecondary, marginBottom: 8, textAlign: 'center' }}>
                            {label}
                          </Text>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary, marginBottom: 4 }}>
                            {flight.airline} {flight.flightNo}
                          </Text>
                          {flightCompareData.type === 'nearbyDate' && (
                            <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 2 }}>
                              {flight.date}
                            </Text>
                          )}
                          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginVertical: 6 }}>
                            {flight.departureTime} → {flight.arrivalTime}
                          </Text>
                          <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 2 }}>
                            {flight.departureCity} → {flight.arrivalCity}
                          </Text>
                          <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 2 }}>
                            {cabinLabel} · {flight.isDirect ? '直飞' : `经停${flight.stopCity || ''}`}
                          </Text>
                          <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 8 }}>
                            {luggageLabel}
                          </Text>
                          <Text style={{ fontSize: 18, fontWeight: '700', color: isRecommend ? '#2E7D32' : colors.textPrimary }}>
                            {formatPrice(flight.totalPrice)}
                          </Text>
                        </View>
                      );
                    };
                    return (
                      <>
                        {renderFlightCard(flightCompareData.currentFlight, '当前航班', false)}
                        {renderFlightCard(flightCompareData.cheaperFlight, '推荐航班', true)}
                      </>
                    );
                  })()}
                </View>

                {/* 节省金额 */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, padding: spacing.md, backgroundColor: '#E8F5E9', borderRadius: 12, marginTop: spacing.lg }}>
                  <Ionicons name="cash-outline" size={20} color="#2E7D32" />
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#2E7D32' }}>
                    可节省 {formatPrice(flightCompareData.diff)}
                  </Text>
                </View>

                {/* 临近日期提醒 */}
                {flightCompareData.type === 'nearbyDate' && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, padding: spacing.sm, backgroundColor: '#FFF8E1', borderRadius: 8, marginTop: spacing.sm }}>
                    <Ionicons name="warning-outline" size={16} color="#F57F17" />
                    <Text style={{ fontSize: 12, color: '#F57F17', flex: 1 }}>
                      切换后出行日期将调整为 {flightCompareData.date}，请确认行程是否可以调整
                    </Text>
                  </View>
                )}

                {/* 按钮区 */}
                <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl, marginBottom: spacing.xxl }}>
                  <TouchableOpacity
                    style={{ flex: 1, paddingVertical: 14, borderRadius: 24, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center' }}
                    onPress={() => setShowFlightCompareModal(false)}
                  >
                    <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textSecondary }}>取消</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1, paddingVertical: 14, borderRadius: 24, backgroundColor: colors.primary, alignItems: 'center' }}
                    onPress={() => {
                      if (!flightCompareData) return;
                      if (flightCompareData.direction === 'departure') {
                        setDepartureFlight(flightCompareData.cheaperFlight);
                      } else {
                        setReturnFlight(flightCompareData.cheaperFlight);
                      }
                      setShowFlightCompareModal(false);
                    }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: '600', color: '#FFF' }}>确认切换</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: spacing.xl },
  section: { marginBottom: spacing.xxl },
  chipRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' },
  chip: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: borderRadius.full, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 15, fontWeight: '500', color: colors.textPrimary },
  chipTextActive: { color: '#FFF' },
  timeRow: { gap: spacing.md, marginTop: spacing.md },
  timePicker: { gap: spacing.xs },
  timeChip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  timeChipText: { fontSize: 13, fontWeight: '500', color: colors.textPrimary },
  customTimeInput: { borderWidth: 1.5, borderColor: colors.primary, borderRadius: borderRadius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, fontSize: 16, color: colors.textPrimary, marginTop: spacing.sm, backgroundColor: colors.surface },
  // Reorderable list
  orderCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.sm, gap: spacing.sm, borderWidth: 1, borderColor: colors.border, ...shadow.light },
  arrows: { gap: 2 },
  arrowBtn: { padding: 6, borderRadius: borderRadius.sm, backgroundColor: colors.background },
  orderNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  orderNumText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  orderImg: { width: 48, height: 48, borderRadius: borderRadius.sm, backgroundColor: colors.border },
  durationBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: `${colors.accent}12`, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: borderRadius.full },
  durationText: { fontSize: 12, fontWeight: '600', color: colors.accent },
  // Schedule
  addCbBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dayCard: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.lg, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.border, ...shadow.light },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  dayNumBadge: { backgroundColor: colors.primary, width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  dayNumText: { fontSize: 13, fontWeight: '700', color: '#FFF', letterSpacing: 0.5 },
  overflowBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: `${colors.priceRed}10`, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: borderRadius.full, marginLeft: 'auto' },
  overflowText: { fontSize: 11, fontWeight: '600', color: colors.priceRed },
  scheduleItem: { flexDirection: 'row', marginBottom: spacing.md, minHeight: 60 },
  timeCol: { width: 46, alignItems: 'flex-end', paddingRight: spacing.sm },
  timeText: { fontSize: 12, fontWeight: '600', color: colors.textPrimary },
  timeEnd: { fontSize: 10, color: colors.textSecondary, marginTop: 2 },
  dotCol: { width: 28, alignItems: 'center' },
  sDot: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  sLine: { width: 2, flex: 1, marginTop: 2 },
  sContent: { flex: 1, paddingLeft: spacing.md, borderLeftWidth: 2, paddingBottom: spacing.sm },
  expandBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  transportDetail: { backgroundColor: `${colors.accent}08`, padding: spacing.sm, borderRadius: borderRadius.sm, marginTop: spacing.xs },
  walkDetailRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, marginTop: 3 },
  mealSection: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, marginTop: spacing.sm },
  mealRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  hotelSection: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, marginTop: spacing.sm },
  hotelMiniCard: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.xs, gap: spacing.sm, backgroundColor: colors.surface },
  hotelMiniCardActive: { borderColor: colors.primary, backgroundColor: `${colors.primary}06` },
  airportToggleCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: borderRadius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface, marginTop: spacing.md },
  airportToggleCardActive: { borderColor: colors.primary, backgroundColor: `${colors.primary}06` },
  addExtraNightBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: 14, marginTop: spacing.md, borderRadius: borderRadius.md, borderWidth: 1.5, borderColor: colors.primary, borderStyle: 'dashed', backgroundColor: `${colors.primary}06` },
  // Guide/Cost
  selCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.lg, marginBottom: spacing.sm, borderWidth: 1.5, borderColor: colors.border, ...shadow.light },
  selCardActive: { borderColor: colors.primary, backgroundColor: `${colors.primary}04` },
  noGBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.lg, marginBottom: spacing.md, marginTop: spacing.sm, borderRadius: borderRadius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  noGBtnOn: { borderWidth: 1.5, borderColor: colors.primary, backgroundColor: `${colors.primary}04` },
  guideAv: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.border, marginRight: spacing.md },
  costBox: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.xl, marginTop: spacing.md, borderWidth: 1, borderColor: colors.border, ...shadow.light },
  costLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm },
  costDiv: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  bar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.lg, paddingBottom: spacing.xxxl, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, ...shadow.medium },
  barBtn: { paddingHorizontal: spacing.xxxl, paddingVertical: 14, borderRadius: borderRadius.full },
  barBtnText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.surface, borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl, padding: spacing.xl, paddingBottom: spacing.xxxl },
  timeInputRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: spacing.md },
  timeInput: { borderWidth: 1.5, borderColor: colors.border, borderRadius: borderRadius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, fontSize: 16, color: colors.textPrimary, marginTop: spacing.xs, backgroundColor: colors.background },
  noteInput: { borderWidth: 1.5, borderColor: colors.border, borderRadius: borderRadius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, fontSize: 14, color: colors.textPrimary, marginTop: spacing.xs, minHeight: 60, textAlignVertical: 'top', backgroundColor: colors.background },
  modalCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: borderRadius.full, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', backgroundColor: colors.surface },
  modalConfirmBtn: { flex: 1, paddingVertical: 14, borderRadius: borderRadius.full, backgroundColor: colors.primary, alignItems: 'center' },
  warningIcon: { alignSelf: 'center', width: 56, height: 56, borderRadius: 28, backgroundColor: `${colors.priceRed}10`, justifyContent: 'center', alignItems: 'center' },
  // Restaurant picker
  restItem: { flexDirection: 'row', alignItems: 'flex-start', padding: spacing.md, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm, gap: spacing.md, backgroundColor: colors.surface },
  restItemRecommended: { borderColor: colors.primary, backgroundColor: `${colors.primary}04` },
  restImg: { width: 56, height: 56, borderRadius: borderRadius.sm, backgroundColor: colors.border },
  groupMealBadge: { backgroundColor: `${colors.successGreen}12`, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.full },
  groupMealText: { fontSize: 10, fontWeight: '600', color: colors.successGreen },
  recommendBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: colors.primary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: borderRadius.full },
  recommendText: { fontSize: 9, fontWeight: '700', color: '#FFF' },
  reasonTag: { backgroundColor: `${colors.secondary}15`, paddingHorizontal: 6, paddingVertical: 1, borderRadius: borderRadius.full },
  reasonText: { fontSize: 10, fontWeight: '500', color: colors.secondary },
  // Hotel search
  moreHotelBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: spacing.sm, marginTop: spacing.xs, borderRadius: borderRadius.md, borderWidth: 1, borderColor: `${colors.primary}30`, borderStyle: 'dashed' },
  hotelSearchBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1.5, borderColor: colors.border, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.background },
  hotelSearchInput: { flex: 1, fontSize: 14, color: colors.textPrimary, padding: 0 },
  hotelSearchCard: { flexDirection: 'row', padding: spacing.md, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm, gap: spacing.md, backgroundColor: colors.surface },
  hotelSearchCardActive: { borderColor: colors.primary, backgroundColor: `${colors.primary}04` },
  hotelSearchImg: { width: 72, height: 72, borderRadius: borderRadius.sm, backgroundColor: colors.border },
  amenityTag: { backgroundColor: `${colors.accent}10`, paddingHorizontal: 5, paddingVertical: 1, borderRadius: borderRadius.full },
  amenityText: { fontSize: 9, fontWeight: '500', color: colors.accent },
  // Settings input row
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  inputBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' },
  numberInput: { width: 48, height: 36, borderWidth: 1.5, borderColor: colors.primary, borderRadius: borderRadius.md, textAlign: 'center', fontSize: 16, fontWeight: '600', color: colors.textPrimary, backgroundColor: colors.surface, padding: 0 },
  dateDisplay: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.md, backgroundColor: `${colors.primary}08`, borderWidth: 1, borderColor: `${colors.primary}25` },
  // Day chip mini (for attraction day assignment)
  dayChipMini: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  dayChipMiniActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayChipMiniText: { fontSize: 10, fontWeight: '600', color: colors.textSecondary },
  dayChipMiniTextActive: { color: '#FFF' },
  // Auto recommend
  autoRecommendBadge: { backgroundColor: `${colors.successGreen}15`, paddingHorizontal: 5, paddingVertical: 1, borderRadius: borderRadius.full },
  autoRecommendText: { fontSize: 9, fontWeight: '600', color: colors.successGreen },
  searchMoreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3, paddingVertical: 2, marginBottom: spacing.xs },
  // Guide busy/available badges
  busyBadge: { backgroundColor: '#FFF3E0', paddingHorizontal: 6, paddingVertical: 1, borderRadius: borderRadius.full },
  busyBadgeText: { fontSize: 9, fontWeight: '600', color: '#E65100' },
  availBadge: { backgroundColor: `${colors.successGreen}12`, paddingHorizontal: 6, paddingVertical: 1, borderRadius: borderRadius.full },
  availBadgeText: { fontSize: 9, fontWeight: '600', color: colors.successGreen },
  selCardBusy: { borderColor: '#FFE0B2' },
  moreGuideBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: spacing.md, borderRadius: borderRadius.md, borderWidth: 1, borderColor: `${colors.primary}30`, borderStyle: 'dashed', marginTop: spacing.xs },
  guideWarning: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, backgroundColor: `${colors.priceRed}08`, borderRadius: borderRadius.md, marginTop: spacing.sm },
  favAutoTip: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, backgroundColor: `${colors.primary}08`, borderRadius: borderRadius.md, marginBottom: spacing.sm },
  favBtn: { padding: 6, borderRadius: 20, backgroundColor: `${colors.border}60` },
  // Guide mode toggle
  guideModeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm, marginTop: spacing.sm },
  guideModeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: spacing.md, borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  guideModeBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  guideModeBtnText: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  guideModeBtnTextActive: { color: '#FFF' },
  // Per-day guide selection
  perDayGuideCard: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  perDayGuideHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  perDayBadge: { backgroundColor: colors.primary, width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  perDayBadgeText: { fontSize: 11, fontWeight: '700', color: '#FFF' },
  perDayGuideSelected: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginLeft: spacing.xxxl, padding: spacing.sm, backgroundColor: `${colors.primary}08`, borderRadius: borderRadius.md },
  perDayGuideAv: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.border },
  perDayRemoveBtn: { padding: 4 },
  perDayGuideChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  perDayGuideChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  perDayChipAv: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.border },
  perDayChipText: { fontSize: 11, fontWeight: '500', color: colors.textPrimary },
  perDayChipTextActive: { color: '#FFF' },
  costSubtotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md },
  // Guide search modal
  guideSearchCard: { flexDirection: 'row', padding: spacing.md, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm, gap: spacing.md, backgroundColor: colors.surface },
  guideSearchCardActive: { borderColor: colors.primary, backgroundColor: `${colors.primary}04` },
  // Calendar
  calCell: { width: '14.28%' as any, aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: borderRadius.sm, position: 'relative' as const },
  calCellText: { fontSize: 13, fontWeight: '500' },
  // Date picker
  datePickerCell: { width: 64, height: 72, justifyContent: 'center', alignItems: 'center', borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  datePickerCellActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  datePickerDay: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  datePickerWeek: { fontSize: 10, color: colors.textSecondary, marginTop: 2 },
  datePickerMonth: { fontSize: 9, color: colors.textSecondary },
  // 旅行节奏选择
  paceRow: { flexDirection: 'row', gap: spacing.sm },
  paceCard: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    position: 'relative' as const,
  },
  paceLabel: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  paceCheck: { position: 'absolute' as const, top: 6, right: 6, width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  paceDaysBadge: { backgroundColor: colors.background, paddingHorizontal: 8, paddingVertical: 2, borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.border },
  paceDaysText: { fontSize: 12, fontWeight: '700', color: colors.textPrimary },
  // 每日主题标签
  dayThemeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  dayThemeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayThemeText: { fontSize: 11, fontWeight: '500', color: colors.textSecondary },
  dayThemeTextActive: { color: '#FFF' },
  // 最优天数推荐
  optimalDaysTip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: `${colors.primary}08`,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: `${colors.primary}20`,
  },
  optimalDaysBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  optimalDaysBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFF',
  },
  // 景点快捷操作
  attrQuickActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 0.5,
    borderTopColor: `${colors.border}80`,
  },
  quickActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: `${colors.accent}10`,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  quickActionText: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.accent,
  },
  editModeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  editModeBtnActive: {
    backgroundColor: colors.primary,
  },
  editModeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  editModeBtnTextActive: {
    color: '#FFF',
  },
  inlineInsertBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
  },
  inlineInsertText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
  quickDayRow: {
    flexDirection: 'row',
    gap: 3,
  },
  quickDayChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  quickDayChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  quickDayChipText: {
    fontSize: 9,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  quickDayChipTextActive: {
    color: '#FFF',
  },
  quickOrderBtns: {
    flexDirection: 'row',
    gap: 2,
    marginLeft: 'auto',
  },
  quickOrderBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // 额外食宿
  extraRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  extraCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
    ...shadow.light,
  },
  // 航班选择相关样式
  flightSelectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.light,
  },
  flightSelectLabel: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  flightSelectInfo: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginTop: 2 },
  flightSelectSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  flightSelectPrice: { fontSize: 16, fontWeight: '700', marginTop: 2 },
  flightSelectPlaceholder: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  hotelDropOffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  toggleBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  toggleBtnText: { fontSize: 13, fontWeight: '500', color: colors.textPrimary },
  toggleBtnTextActive: { color: '#FFF' },
  upgradeHintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    backgroundColor: `${colors.successGreen}10`,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  upgradeBtn: {
    backgroundColor: colors.successGreen,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  upgradeBtnText: { fontSize: 12, fontWeight: '600', color: '#FFF' },
  flightCostSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    backgroundColor: `${colors.primary}08`,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  flightPickerCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.light,
  },
  // Airport transfer dual-option & premium booking
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  airportOptionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  airportOptionChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  airportOptionChipActive: {
    backgroundColor: colors.transport,
    borderColor: colors.transport,
  },
  airportOptionChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  airportOptionChipTextActive: {
    color: '#FFF',
  },
  premiumEntryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    backgroundColor: `${colors.transport}10`,
    borderRadius: borderRadius.md,
  },
  premiumEntryText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.transport,
  },
  transportEditRow: {
    flexDirection: 'row',
    marginTop: spacing.sm,
  },
  transportSwitchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: `${colors.transport}10`,
  },
  transportSwitchText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.transport,
  },
  placeOptionRow: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
  },
  placeOptionRowActive: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}08`,
  },
  premiumRouteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: `${colors.transport}08`,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: `${colors.transport}20`,
  },
  carTypeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  carTypeCard: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  carTypeCardActive: {
    borderColor: colors.transport,
    backgroundColor: `${colors.transport}08`,
  },
  premiumPriceBreakdown: {
    marginTop: spacing.lg,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  premiumPriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  premiumBtnRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  premiumBtn: {
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.full,
    alignItems: 'center',
  },
  premiumBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
});
