// ==================== 认证相关 ====================
export type UserRole = 'user' | 'guide' | 'admin';

export interface User {
  id: string;
  username: string;
  password: string;
  displayName: string;
  role: UserRole;
  avatar: string;
  guideId?: string;
}

// ==================== 景点相关 ====================
export interface Location {
  latitude: number;
  longitude: number;
  address: string;
}

export interface Attraction {
  id: string;
  name: string;
  description: string;
  category: string[];
  imageUrl: string;
  location: Location;
  rating: number;
  estimatedDuration: number; // 小时
  ticketPrice: number;
  openingHours: string;
  tags: string[];
  zone: string; // A/B/C/D/E
  luggageStorage?: {
    name: string;       // 寄存点名称
    address: string;    // 地址
    price: number;      // 元/件/天
    hours: string;      // 营业时间
    type?: '景区内' | '周边服务中心' | '商场' | '地铁站'; // 寄存位置类型
    distanceKm?: number; // 与景点入口距离(km)
  };
}

// ==================== 餐厅相关 ====================
export type CuisineType = '粤菜' | '湘菜' | '川菜' | '海鲜' | '日料' | '西餐' | '火锅' | '小吃' | '茶餐厅' | '素食';

export interface Restaurant {
  id: string;
  name: string;
  description: string;
  cuisineType: CuisineType;
  zone: string;
  location: Location;
  rating: number;
  pricePerPerson: number;
  openingHours: string;
  imageUrl: string;
  tags: string[];
  nearbyAttractions: string[];
  mealTypes: ('breakfast' | 'lunch' | 'dinner')[];
  groupMealPrice?: number; // 团餐固定人均价格
}

// ==================== 偏好相关 ====================
export type TransportPreference = 'transit' | 'driving' | 'walking' | 'any';
export type HotelLevelPreference = 'budget' | 'mid' | 'luxury' | 'any';
export type HotelStayMode = 'fixed' | 'flexible';
export type BudgetPreference = 'low' | 'medium' | 'high' | 'any';

// 酒店位置偏好（通用，不绑定具体城市区域）
export type HotelZonePreference =
  | 'city_center'
  | 'near_attraction'
  | 'near_shopping'
  | 'near_food_street'
  | 'quiet_area'
  | 'near_metro'
  | 'any';
export type HotelPriceRange = { min: number; max: number };
export type HotelAmenity = '泳池' | '健身房' | 'SPA' | 'WiFi' | '自助早餐' | '海景房' | '亲子乐园' | '商务中心';

// 交通自定义规则
export type FatigueLevel = 'relaxed' | 'standard' | 'intensive';
export type DetourTolerance = 'strict' | 'moderate' | 'optimal';
export type TimeCostPreference = 'save_money' | 'balanced' | 'save_time';
export type TransferComplexity = 'few' | 'normal' | 'any';

export interface TransportRule {
  walkMaxKm: number;              // 步行距离上限 (km), 距离<=此值步行
  defaultMode: 'transit' | 'driving'; // 超过步行距离后的默认交通方式
  maxTransitMinutes: number;      // 公交/地铁最长时间, 超过则改打车
  maxWalkToStationKm: number;     // 步行到站台/换乘最大距离, 超过则改打车
  dropOffLuggageAtHotel: boolean; // 到达后是否先去酒店放行李
  drivingSubMode: 'self' | 'taxi'; // 驾车子模式: 自驾 or 打车
  fatigueLevel: FatigueLevel;     // 疲劳控制: 轻松/标准/紧凑
  detourTolerance: DetourTolerance; // 绕路容忍度: 严格顺路/适度绕路/综合最优
  timeCostPreference: TimeCostPreference; // 时间费用偏好: 更省钱/平衡/更省时间
  transferComplexity: TransferComplexity; // 换乘复杂度: 少换乘/正常/不限制
}

// ==================== 航班相关 ====================
export type FlightClass = 'economy' | 'premium' | 'first';
export type AirlineType = 'budget' | 'standard';
export type LuggageOption = 'carryOnly' | 'checked';  // 仅手提7kg / 托运20kg+手提7kg
export type TripType = 'oneWay' | 'roundTrip';
export type TimePeriod = 'morning' | 'afternoon' | 'evening' | 'night';  // 上午/下午/傍晚/夜间

export interface Flight {
  id: string;
  flightNo: string;
  airline: string;
  airlineType: AirlineType;
  departureCity: string;
  arrivalCity: string;
  departureAirport: string;
  arrivalAirport: string;
  departureTime: string;  // "HH:mm"
  arrivalTime: string;    // "HH:mm"
  date: string;           // "YYYY-MM-DD"
  durationMin: number;
  cabin: FlightClass;
  basePrice: number;
  luggageOption: LuggageOption;
  luggageAddOnPrice: number;  // 托运行李加购价(仅carryOnly时有意义)
  isDirect: boolean;
  stopCity?: string;        // 经停城市
  stopDurationMin?: number; // 经停时间
  fuelSurcharge: number;
  airportTax: number;       // 已废弃，固定为0
  totalPrice: number;       // basePrice + fuelSurcharge + airportTax
  slotGroupId: string;      // 同一航班时刻的分组ID
}

export interface FlightPreference {
  preferredAirlineType: AirlineType | 'any';
  preferredCabin: FlightClass | 'any';
  preferDirectFlight: boolean;
  priceAlertThreshold: number;  // 同日差价阈值: 推荐航班比当天最低价贵超过此值时提醒
  nearbyDateAlertThreshold: number; // 临近日期差价阈值: 临近日期航班比规划日期便宜超过此值时提醒
  luggagePreference: LuggageOption | 'any';
}

// ==================== 购物车偏好 ====================
export interface CartPreferences {
  needHotel: boolean;
  needBreakfast: boolean;
  needLunch: boolean;
  needDinner: boolean;
  groupSize: number;
}

// ==================== 酒店相关 ====================
export type {
  HotelPriceType,
  HotelSearchParams,
  HotelSearchResponse,
  HotelSource,
  TravelHotel,
  TripHotelContext,
} from './hotel';

export type HotelLevel = 'budget' | 'mid' | 'luxury';
export type RoomType = '大床房' | '双床房' | '亲子房' | '套房' | '标准间';

export interface RoomOption {
  type: RoomType;
  priceAdjust: number; // 价格调整系数 (1.0 = 无调整)
  maxOccupancy: number; // 最大入住人数
  description: string;
}

export interface BreakfastOptions {
  included: boolean;   // 是否已含在房费中
  price: number;       // 不含早时加购价格（含早时为0）
  optional: boolean;   // 不含早时是否可加购
}

export interface Hotel {
  id: string;
  source?: 'static'; // 兼容历史演示类型；主数据导出时会显式补为 static
  name: string;
  description: string;
  zone: string;
  level: HotelLevel;
  pricePerNight: number;
  rating: number;
  location: Location;
  imageUrl: string;
  amenities: string[];
  nearbyAttractions: string[];
  roomTypes?: RoomOption[]; // 可选房型
  breakfastIncluded?: boolean; // [已废弃] 请使用 breakfastOptions
  breakfastOptions?: BreakfastOptions; // 早餐选项
}

// 路线版本
export type RouteVersion = 'economy' | 'luxury';


// ==================== 导游相关 ====================
export interface Guide {
  id: string;
  name: string;
  avatar: string;
  rating: number;
  yearsOfExperience: number;
  languages: string[];
  specialtyAreas: string[];
  description: string;
  perDayPrice: number;
  routeIds: string[];
  isAvailableForHire: boolean;
  phone: string;
  busyDates?: string[]; // "YYYY-MM-DD" format
}

// ==================== 路线相关 ====================
export interface MealPlan {
  type: 'breakfast' | 'lunch' | 'dinner';
  description: string;
  included: boolean;
  price?: number;
}

export interface RouteDayPlan {
  day: number;
  attractionIds: string[];
  description: string;
  meals: MealPlan[];
  hotel?: {
    name: string;
    included: boolean;
    price?: number;
  };
}

export interface RouteCostItem {
  id: string;
  name: string;
  category: CostCategory;
  unitPrice: number;
  quantity: number;
  description?: string;
  isPerPerson: boolean;
}

export interface GuideRoute {
  id: string;
  guideId: string;
  title: string;
  description: string;
  durationDays: number;
  totalFlatPrice: number;
  dailyPlan: RouteDayPlan[];
  mandatoryCosts: RouteCostItem[];
  optionalCosts: RouteCostItem[];
  coverImage: string;
  tags: string[];
  maxGroupSize: number;
  rating: number;
  reviewCount: number;
  busTransport?: {
    perPersonPerDay: number;
  };
}

export type RouteDifficulty = 'easy' | 'medium' | 'hard';

export interface PremiumCarType {
  id: string;
  name: string;
  description: string;
  multiplier: number;
  serviceFee: number;
}

export interface SystemRoute {
  id: string;
  title: string;
  description: string;
  durationDays: number;
  dailyPlan: RouteDayPlan[];
  estimatedCosts: RouteCostItem[];
  coverImage: string;
  tags: string[];
  difficulty: RouteDifficulty;
  suitableFor: string[];
}

// ==================== 交通相关 ====================
export type TransportMode = 'transit' | 'driving' | 'walking' | 'bus';

export interface TransitInfo {
  time: number;
  distance: number;
  price: number;
  detail: string;
  transfers: number;
  walkToStationKm?: number;   // 步行到最近站台的距离
  walkToStationMin?: number;  // 步行到站台时间
  transferWalkKm?: number;    // 换乘步行总距离
  transferWalkMin?: number;   // 换乘步行总时间
}

export interface DrivingInfo {
  time: number;
  distance: number;
  price: number;
}

export interface WalkingInfo {
  time: number;
  distance: number;
}

export interface BusInfo {
  line: string;
  stops: number;
  time: number;
  price: number;
}

export interface RouteOption {
  transit: TransitInfo;
  driving: DrivingInfo;
  walking: WalkingInfo | null;
  bus?: BusInfo;
}

// ==================== 路线节点 ====================
export interface TransportToNext {
  mode: TransportMode;
  duration: number;
  distance: number;
  price: number;
  detail: string;
}

export interface RouteStop {
  attractionId: string;
  order: number;
  day: number;
  arrivalTime: string;
  stayDuration: number;
  transportToNext: TransportToNext | null;
}

// ==================== 行程时间块（自定义路线规划用） ====================
export type ScheduleItemType = 'attraction' | 'restaurant' | 'transport' | 'hotel' | 'flight' | 'custom';

export interface ScheduleItem {
  id: string;
  type: ScheduleItemType;
  day: number;
  startTime: string; // "HH:mm"
  endTime: string;   // "HH:mm"
  durationMinutes: number;
  title: string;
  subtitle?: string;
  // 关联ID
  attractionId?: string;
  restaurantId?: string;
  // 交通信息
  transportMode?: TransportMode;
  transportDetail?: string;
  transportDistance?: number;
  transportPrice?: number;
  transportWalkToStationKm?: number;
  transportWalkToStationMin?: number;
  transportTransferWalkKm?: number;
  transportTransferWalkMin?: number;
  // 酒店
  hotelId?: string;
  // 航班
  flightId?: string;
  // 自定义备注
  customNote?: string;
  // 餐饮标识
  mealType?: 'breakfast' | 'lunch' | 'dinner';
  source?: 'hotel' | 'external';
}

// ==================== 费用相关 ====================
export type CostCategory = 'ticket' | 'transport' | 'food' | 'hotel' | 'guide' | 'flight' | 'other';

export interface CostItem {
  id: string;
  name: string;
  category: CostCategory;
  unitPrice: number;
  quantity: number;
  attractionId?: string;
  selected: boolean;
  mandatory?: boolean;
}

// ==================== 兴趣分类 ====================
export interface InterestCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
}

// ==================== 订单相关 ====================
export type OrderStatus = 'pending' | 'paid' | 'completed' | 'cancelled';

export interface Order {
  id: string;
  title: string;
  routeType: 'custom' | 'guide' | 'system';
  routeId?: string;
  attractionIds: string[];
  restaurantIds?: string[];
  hotelId?: string;
  guideId?: string;
  durationDays: number;
  groupSize: number;
  totalPrice: number;
  status: OrderStatus;
  createdAt: number;
  paidAt?: number;
}

// ==================== 导航参数 ====================
export type RootStackParamList = {
  Auth: undefined;
  UserTabs: undefined;
  GuideTabs: undefined;
  AdminTabs: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
};

// 探索 Tab
export type ExploreStackParamList = {
  Home: undefined;
  AIPlanning: { launchRealtime?: boolean } | undefined;
  BlindBox: undefined;
  LivePlaces: { category?: 'attraction' | 'hotel' | 'restaurant' };
  LivePlaceDetail: { placeId: string };
  LiveItinerary: undefined;
  ExploreMain: { tab?: 'attractions' | 'routes' | 'guides' };
  Preference: { returnToPlanning?: boolean } | undefined;
  Recommendation: undefined;
  AttractionDetail: { attractionId: string };
  PresetRouteList: undefined;
  PresetRouteDetail: { routeId: string; routeType: 'guide' | 'system' };
  GuideList: undefined;
  GuideDetail: { guideId: string };
  GuideRouteDetail: { routeId: string };
  HotelList: undefined;
  RestaurantDetail: { restaurantId: string };
  FlightSearch: undefined;
  FlightList: { departureCity: string; arrivalCity: string; date: string; tripType: TripType; returnDate?: string };
  Settlement: { orderTitle: string; routeType: 'guide' | 'system'; routeId: string; totalPrice: number; durationDays: number; attractionIds: string[]; guideId?: string; restaurantIds?: string[] };
};

// 自定义 Tab
export type CustomStackParamList = {
  CustomHome: undefined;
  BlindBox: undefined;
  LivePlaces: { category?: 'attraction' | 'hotel' | 'restaurant' };
  LivePlaceDetail: { placeId: string };
  LiveItinerary: undefined;
  HotelList: undefined;
  RoutePlan: undefined;
  RouteDetail: undefined;
  Cart: undefined;
  Settlement: { orderTitle: string; routeType: 'custom'; totalPrice: number; durationDays: number; attractionIds: string[]; hotelId?: string; guideId?: string; restaurantIds?: string[] };
};

// 订单 Tab
export type OrderStackParamList = {
  OrderList: undefined;
  OrderDetail: { orderId: string };
  AttractionDetail: { attractionId: string };
  GuideDetail: { guideId: string };
  PresetRouteDetail: { routeId: string; routeType: 'guide' | 'system' };
  HotelDetail: { hotelId: string };
  RestaurantDetail: { restaurantId: string };
};

// 个人 Tab
export type ProfileStackParamList = {
  Profile: undefined;
  Preference: undefined;
  Favorites: undefined;
};

// ==================== Store 相关 ====================
export type RouteSource = 'custom' | 'guide' | 'system';

export interface DailyGuideAssignment {
  [day: number]: string | null;
}
