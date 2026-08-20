import {
  Attraction,
  BudgetPreference,
  Flight,
  FlightPreference,
  Guide,
  GuideRoute,
  Hotel,
  Restaurant,
} from '../types';
import type { PreferenceState } from '../store/usePreferenceStore';
import { getHotelBreakfastOptions } from './mealScheduler';

export type RecommendationEntity = 'hotel' | 'restaurant' | 'attraction' | 'guide' | 'flight';
export type TravelModeProfile = 'elderly_relaxed' | 'young_budget' | 'comfort_quality';

type WeightMap = Record<string, number>;

export interface FeatureScoreMap {
  [key: string]: number;
}

export interface ScoredItem<T> {
  item: T;
  score: number;
  features: FeatureScoreMap;
  matchLevel?: 'exact' | 'relaxed';
  mismatchReasons?: string[];
}

export interface RouteEfficiencyInput {
  totalWalkKm: number;
  transferCount: number;
  detourDistanceKm: number;
  overloadMinutes: number;
  maxAcceptableWalkKm: number;
  maxAcceptableTransfers: number;
  maxDailyActiveMinutes: number;
}

export interface PlanComponentScores {
  hotelScore?: number;
  attractionScore?: number;
  restaurantScore?: number;
  guideScore?: number;
  flightScore?: number;
  routeEfficiency?: number;
}

type GuideWithRoutes = Guide & { routes?: GuideRoute[] };

const EPSILON = 1e-6;

const MODE_WEIGHTS: Record<TravelModeProfile, Record<RecommendationEntity, WeightMap>> = {
  elderly_relaxed: {
    hotel: { price_fit: 0.15, location_fit: 0.15, comfort_fit: 0.2, elderly_fit: 0.25, transport_fit: 0.2, rating_fit: 0.05 },
    restaurant: { taste_fit: 0.15, price_fit: 0.1, distance_fit: 0.15, elderly_fit: 0.25, environment_fit: 0.25, rating_fit: 0.1 },
    attraction: { interest_fit: 0.15, physical_fit: 0.3, time_fit: 0.15, cost_fit: 0.1, route_fit: 0.2, popularity_fit: 0.1 },
    guide: { route_match: 0.15, experience_fit: 0.15, communication_fit: 0.15, elderly_care_fit: 0.3, price_fit: 0.1, schedule_fit: 0.15 },
    flight: { price_fit: 0.1, time_fit: 0.2, direct_fit: 0.25, comfort_fit: 0.25, airline_fit: 0.05, luggage_fit: 0.15 },
  },
  young_budget: {
    hotel: { price_fit: 0.3, location_fit: 0.2, comfort_fit: 0.1, elderly_fit: 0.05, transport_fit: 0.2, rating_fit: 0.15 },
    restaurant: { taste_fit: 0.2, price_fit: 0.25, distance_fit: 0.2, elderly_fit: 0.05, environment_fit: 0.1, rating_fit: 0.2 },
    attraction: { interest_fit: 0.2, physical_fit: 0.1, time_fit: 0.15, cost_fit: 0.25, route_fit: 0.15, popularity_fit: 0.15 },
    guide: { route_match: 0.2, experience_fit: 0.1, communication_fit: 0.15, elderly_care_fit: 0.05, price_fit: 0.3, schedule_fit: 0.2 },
    flight: { price_fit: 0.35, time_fit: 0.15, direct_fit: 0.1, comfort_fit: 0.1, airline_fit: 0.1, luggage_fit: 0.2 },
  },
  comfort_quality: {
    hotel: { price_fit: 0.1, location_fit: 0.15, comfort_fit: 0.3, elderly_fit: 0.1, transport_fit: 0.15, rating_fit: 0.2 },
    restaurant: { taste_fit: 0.2, price_fit: 0.1, distance_fit: 0.1, elderly_fit: 0.1, environment_fit: 0.25, rating_fit: 0.25 },
    attraction: { interest_fit: 0.2, physical_fit: 0.1, time_fit: 0.15, cost_fit: 0.1, route_fit: 0.15, popularity_fit: 0.3 },
    guide: { route_match: 0.2, experience_fit: 0.25, communication_fit: 0.2, elderly_care_fit: 0.1, price_fit: 0.05, schedule_fit: 0.2 },
    flight: { price_fit: 0.1, time_fit: 0.2, direct_fit: 0.2, comfort_fit: 0.3, airline_fit: 0.1, luggage_fit: 0.1 },
  },
};

const PLAN_WEIGHTS: Record<TravelModeProfile, WeightMap> = {
  elderly_relaxed: { hotel: 0.2, attraction: 0.2, restaurant: 0.15, guide: 0.15, flight: 0.1, routeEfficiency: 0.2 },
  young_budget: { hotel: 0.15, attraction: 0.25, restaurant: 0.15, guide: 0.1, flight: 0.2, routeEfficiency: 0.15 },
  comfort_quality: { hotel: 0.2, attraction: 0.2, restaurant: 0.2, guide: 0.15, flight: 0.15, routeEfficiency: 0.1 },
};

const BIAS_DELTAS: Record<string, Partial<Record<RecommendationEntity, WeightMap>>> = {
  save_money: {
    hotel: { price_fit: 0.08, comfort_fit: -0.03, rating_fit: -0.02 },
    restaurant: { price_fit: 0.08, environment_fit: -0.03 },
    attraction: { cost_fit: 0.08, popularity_fit: -0.02 },
    guide: { price_fit: 0.08, experience_fit: -0.03 },
    flight: { price_fit: 0.1, comfort_fit: -0.04, direct_fit: -0.02 },
  },
  comfort: {
    hotel: { comfort_fit: 0.08, price_fit: -0.04 },
    restaurant: { environment_fit: 0.08, price_fit: -0.03 },
    attraction: { physical_fit: 0.05, route_fit: 0.03 },
    guide: { elderly_care_fit: 0.05, experience_fit: 0.03 },
    flight: { comfort_fit: 0.1, price_fit: -0.05 },
  },
  less_walk: {
    hotel: { elderly_fit: 0.07, transport_fit: 0.05 },
    restaurant: { elderly_fit: 0.08, distance_fit: 0.04 },
    attraction: { physical_fit: 0.12, route_fit: 0.05 },
    guide: { elderly_care_fit: 0.1, route_match: 0.03 },
    flight: { comfort_fit: 0.05, direct_fit: 0.05 },
  },
  convenience: {
    hotel: { transport_fit: 0.08, location_fit: 0.05 },
    restaurant: { distance_fit: 0.1 },
    attraction: { route_fit: 0.1, time_fit: 0.03 },
    guide: { schedule_fit: 0.05, route_match: 0.05 },
    flight: { time_fit: 0.08, direct_fit: 0.06 },
  },
  quiet: {
    hotel: { elderly_fit: 0.05, comfort_fit: 0.04 },
    restaurant: { environment_fit: 0.12 },
    attraction: { physical_fit: 0.04, popularity_fit: -0.05 },
    guide: { communication_fit: 0.04, elderly_care_fit: 0.04 },
  },
};

const LIGHT_DIET_TAGS = ['清淡', '素食', '粥', '汤', '蒸', '茶点', '早茶', '健康'];
const QUIET_TAGS = ['安静', '清幽', '清净', '海景', '慢节奏', '休息', '老人友好'];
const ELDERLY_TAGS = ['elderly', '老人友好', '陪同照顾', 'assist', 'light_walk', 'slow_travel', 'convenient', '无障碍', '轻步行'];
const SPICY_TAGS = ['辣', '麻辣', '火锅', '湘菜', '川菜'];

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeWeights(weights: WeightMap): WeightMap {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, value]) => sum + Math.max(0, value), 0);
  if (total <= EPSILON) {
    const even = 1 / Math.max(entries.length, 1);
    return Object.fromEntries(entries.map(([key]) => [key, even]));
  }
  return Object.fromEntries(entries.map(([key, value]) => [key, Math.max(0, value) / total]));
}

function computeWeightedScore(features: FeatureScoreMap, weights: WeightMap): number {
  const normalizedWeights = normalizeWeights(weights);
  return clamp01(
    Object.entries(normalizedWeights).reduce((sum, [key, weight]) => {
      return sum + weight * clamp01(features[key] ?? 0);
    }, 0)
  );
}

function normalizedRating(rating: number, min = 3.5, max = 5): number {
  return clamp01((rating - min) / Math.max(max - min, EPSILON));
}

function targetBudgetValue(budgetPref: BudgetPreference, fallback: number): number {
  if (budgetPref === 'low') return fallback * 0.75;
  if (budgetPref === 'high') return fallback * 1.35;
  return fallback;
}

function priceFit(itemPrice: number, targetPrice: number): number {
  return clamp01(1 - Math.abs(itemPrice - targetPrice) / Math.max(targetPrice, 1));
}

function expDecay(value: number, k: number): number {
  return clamp01(Math.exp(-value / Math.max(k, EPSILON)));
}

function overlapScore(userTags: string[], itemTags: string[]): number {
  if (userTags.length === 0) return 0.5;
  const set = new Set(itemTags);
  const hit = userTags.filter(tag => set.has(tag)).length;
  return clamp01(hit / Math.max(userTags.length, 1));
}

function includesAny(texts: string[], keywords: string[]): boolean {
  return texts.some(text => keywords.some(keyword => text.includes(keyword)));
}

function hotelZoneMatch(prefs: PreferenceState, hotel: Hotel, preferredZones: string[]): number {
  const searchableText = `${hotel.name} ${hotel.description} ${hotel.amenities.join(' ')}`;
  if (prefs.hotelZonePref === 'any' && preferredZones.length === 0) return 0.7;
  if (preferredZones.includes(hotel.zone)) return 1;
  if (prefs.hotelZonePref === 'near_attraction' && hotel.nearbyAttractions.length > 0) return 0.9;
  if (prefs.hotelZonePref === 'near_shopping' && /购物|商圈|商场|海岸城|购物公园|壹方城|东门|华强北|会展中心|卓悦/.test(searchableText)) return 0.85;
  if (prefs.hotelZonePref === 'near_food_street' && /美食|餐饮|食街|海岸城|东门|华强北|茶餐厅|夜宵/.test(searchableText)) return 0.85;
  if (prefs.hotelZonePref === 'quiet_area' && /安静|清净|休息|慢节奏|不吵|舒展|环境|公园|海边/.test(searchableText)) return 0.85;
  if (prefs.hotelZonePref === 'near_metro' && /地铁|近站|换乘|交通|出行|方便|枢纽/.test(searchableText)) return 0.85;
  if (prefs.hotelZonePref === 'city_center' && ['A', 'B', 'C'].includes(hotel.zone)) return 0.8;
  if (prefs.hotelZonePref === 'near_metro' && ['A', 'B', 'C'].includes(hotel.zone)) return 0.72;
  if (prefs.hotelZonePref === 'quiet_area' && ['D', 'E'].includes(hotel.zone)) return 0.72;
  return 0.3;
}

function comfortFitForHotel(prefs: PreferenceState, hotel: Hotel): number {
  const levelFit =
    prefs.hotelLevelPref === 'any'
      ? hotel.level === 'mid' ? 0.9 : 0.75
      : prefs.hotelLevelPref === hotel.level ? 1 : 0.35;
  const amenityFit = prefs.hotelAmenityPrefs.length > 0
    ? prefs.hotelAmenityPrefs.filter(item => hotel.amenities.includes(item)).length / prefs.hotelAmenityPrefs.length
    : hotel.amenities.length >= 5 ? 0.85 : 0.65;
  return clamp01(0.5 * levelFit + 0.5 * amenityFit);
}

function elderlyFitForHotel(prefs: PreferenceState, hotel: Hotel): number {
  const quietFit = includesAny([hotel.description, ...hotel.amenities], QUIET_TAGS) ? 0.95 : 0.65;
  const breakfastFit = getHotelBreakfastOptions(hotel)?.included ? 0.9 : 0.55;
  const walkFit = prefs.transportRule.walkMaxKm <= 1 ? (hotel.nearbyAttractions.length > 0 ? 0.85 : 0.65) : 0.75;
  const barrierFreeFit = hotel.level === 'luxury' ? 0.92 : hotel.level === 'mid' ? 0.78 : 0.62;
  return clamp01(0.3 * quietFit + 0.25 * breakfastFit + 0.2 * walkFit + 0.25 * barrierFreeFit);
}

function transportFitForHotel(prefs: PreferenceState, hotel: Hotel, preferredZones: string[]): number {
  const taxiFit = prefs.transportRule.defaultMode === 'driving' ? 0.88 : 0.72;
  const zoneFit = preferredZones.length === 0 ? 0.7 : (preferredZones.includes(hotel.zone) ? 1 : 0.4);
  const accessFit = hotel.nearbyAttractions.length >= 2 ? 0.85 : 0.6;
  return clamp01(0.35 * taxiFit + 0.35 * zoneFit + 0.3 * accessFit);
}

function environmentFitForRestaurant(prefs: PreferenceState, restaurant: Restaurant): number {
  const quietBoost = includesAny([restaurant.description, ...restaurant.tags], QUIET_TAGS) ? 0.95 : 0.55;
  const seatingFit = restaurant.groupMealPrice ? 0.8 : 0.65;
  const queuePenalty = includesAny([restaurant.description, ...restaurant.tags], ['排队', '夜宵', '网红']) ? 0.2 : 0;
  const base = 0.55 * quietBoost + 0.45 * seatingFit - queuePenalty;
  return clamp01(base + (prefs.elderlyMode ? 0.08 : 0));
}

function elderlyFitForRestaurant(prefs: PreferenceState, restaurant: Restaurant): number {
  const lightDietFit = prefs.cuisinePrefs.includes('素食') || includesAny([restaurant.description, ...restaurant.tags], LIGHT_DIET_TAGS) ? 0.95 : 0.6;
  const quietFit = environmentFitForRestaurant(prefs, restaurant);
  const quickMealFit = restaurant.mealTypes.includes('breakfast') || restaurant.pricePerPerson <= 80 ? 0.82 : 0.64;
  const easyAccessFit = restaurant.nearbyAttractions.length > 0 ? 0.85 : 0.65;
  return clamp01(0.3 * lightDietFit + 0.25 * quietFit + 0.2 * quickMealFit + 0.25 * easyAccessFit);
}

function physicalFitForAttraction(prefs: PreferenceState, attraction: Attraction): number {
  const walkPenalty = prefs.transportRule.walkMaxKm <= 1 && !includesAny(attraction.tags, ELDERLY_TAGS) ? 0.25 : 0;
  const durationFit = attraction.estimatedDuration <= 2 ? 0.95 : attraction.estimatedDuration <= 4 ? 0.72 : 0.45;
  const restFit = includesAny(attraction.tags, ['休闲', '轻松', 'light_walk', 'elderly']) ? 0.92 : 0.6;
  const stairsFit = includesAny(attraction.tags, ['登山', '徒步', 'hard']) ? 0.35 : 0.88;
  return clamp01(0.3 * durationFit + 0.25 * restFit + 0.25 * stairsFit + 0.2 * (1 - walkPenalty));
}

function popularityFit(prefs: PreferenceState, attraction: Attraction): number {
  const base = normalizedRating(attraction.rating);
  if (prefs.elderlyMode && includesAny(attraction.tags, ['热门', '打卡'])) return clamp01(base - 0.08);
  return base;
}

function routeMatchForGuide(zones: string[], guide: GuideWithRoutes): number {
  if (zones.length === 0) return 0.7;
  const zoneNames = zones.map(zone => zoneToDistrict(zone));
  const areaHits = guide.specialtyAreas.filter(area => zoneNames.some(zoneName => area.includes(zoneName))).length;
  const routeHits = guide.routes?.filter(route =>
    route.tags.some(tag => zoneNames.some(zoneName => tag.includes(zoneName)))
  ).length ?? 0;
  return clamp01((areaHits + routeHits) / Math.max(zoneNames.length + 1, 1));
}

function elderlyCareFitForGuide(prefs: PreferenceState, guide: GuideWithRoutes): number {
  const sourceTexts = [guide.description, ...guide.specialtyAreas, ...(guide.routes?.flatMap(route => route.tags) ?? [])];
  const careFit = includesAny(sourceTexts, ['老人友好', '陪同照顾', 'assist', 'slow_travel', 'light_walk', 'convenient']) ? 0.95 : 0.55;
  const calmFit = includesAny(sourceTexts, ['慢节奏', '轻步行', '轻松']) ? 0.88 : 0.62;
  const transitFit = includesAny(sourceTexts, ['交通', '地铁', '无障碍', '路线规划']) ? 0.82 : 0.58;
  return clamp01(0.45 * careFit + 0.3 * calmFit + 0.25 * transitFit + (prefs.elderlyMode ? 0.08 : 0));
}

function communicationFitForGuide(guide: GuideWithRoutes, prefs: PreferenceState): number {
  const langFit = guide.languages.includes('普通话') ? 1 : 0.6;
  const styleFit = includesAny([guide.description, ...guide.specialtyAreas], ['讲解', '细致', '耐心', '路线规划']) ? 0.9 : 0.7;
  return clamp01(0.6 * langFit + 0.4 * styleFit);
}

function flightTimeFit(flight: Flight, prefs: FlightPreference): number {
  const depMinutes = timeToMinutes(flight.departureTime);
  const preferredCabinFit = prefs.preferredCabin === 'any' ? 0.8 : (prefs.preferredCabin === flight.cabin ? 1 : 0.35);
  let depFit = 0.8;
  if (depMinutes < 7 * 60) depFit = 0.55;
  else if (depMinutes <= 11 * 60) depFit = 0.95;
  else if (depMinutes <= 18 * 60) depFit = 0.85;
  else depFit = 0.65;
  return clamp01(0.7 * depFit + 0.3 * preferredCabinFit);
}

function comfortFitForFlight(flight: Flight): number {
  const cabinFit = flight.cabin === 'first' ? 1 : flight.cabin === 'premium' ? 0.85 : 0.65;
  const durationFit = flight.durationMin <= 200 ? 0.95 : flight.durationMin <= 260 ? 0.72 : 0.45;
  const nonRedEyeFit = timeToMinutes(flight.departureTime) >= 7 * 60 && timeToMinutes(flight.departureTime) <= 20 * 60 ? 0.9 : 0.55;
  return clamp01(0.5 * cabinFit + 0.3 * durationFit + 0.2 * nonRedEyeFit);
}

function zoneToDistrict(zone: string): string {
  return ({ A: '南山区', B: '福田区', C: '罗湖区', D: '龙岗区', E: '盐田区', F: '宝安区' } as Record<string, string>)[zone] || zone;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function deriveTravelModeProfile(prefs: PreferenceState): TravelModeProfile {
  if (prefs.elderlyMode || prefs.transportRule.fatigueLevel === 'relaxed' || prefs.transportRule.walkMaxKm <= 1 || prefs.transportRule.defaultMode === 'driving') {
    return 'elderly_relaxed';
  }
  if (prefs.budgetPref === 'low' || prefs.hotelLevelPref === 'budget') {
    return 'young_budget';
  }
  return 'comfort_quality';
}

function deriveWeightBiases(prefs: PreferenceState): string[] {
  const biases: string[] = [];
  if (prefs.budgetPref === 'low' || prefs.transportRule.timeCostPreference === 'save_money') biases.push('save_money');
  if (prefs.hotelLevelPref === 'luxury' || prefs.budgetPref === 'high') biases.push('comfort');
  if (prefs.transportRule.walkMaxKm <= 1 || prefs.elderlyMode || prefs.transportRule.fatigueLevel === 'relaxed') biases.push('less_walk');
  if (prefs.transportRule.defaultMode === 'driving' || prefs.transportPref === 'driving' || prefs.transportRule.timeCostPreference === 'save_time') biases.push('convenience');
  if (prefs.hotelStayMode === 'fixed') biases.push('quiet');
  return biases;
}

export function getEffectiveWeights(
  entity: RecommendationEntity,
  prefs: PreferenceState,
  customOverrides?: Partial<WeightMap>
): WeightMap {
  const mode = deriveTravelModeProfile(prefs);
  const base = { ...MODE_WEIGHTS[mode][entity] };
  for (const bias of deriveWeightBiases(prefs)) {
    const delta = BIAS_DELTAS[bias]?.[entity];
    if (!delta) continue;
    for (const [key, value] of Object.entries(delta)) {
      base[key] = (base[key] ?? 0) + value;
    }
  }
  let adjusted = normalizeWeights(base);
  if (customOverrides && Object.keys(customOverrides).length > 0) {
    const overrideTotal = Object.values(customOverrides).reduce<number>((sum, value) => sum + Math.max(0, value ?? 0), 0);
    const safeOverrideTotal = Math.min(0.85, overrideTotal);
    const remainingKeys = Object.keys(adjusted).filter(key => !(key in customOverrides));
    const remainingWeight = remainingKeys.reduce<number>((sum, key) => sum + (adjusted[key] ?? 0), 0);
    const scaled: WeightMap = {};
    for (const [key, value] of Object.entries(adjusted)) {
      if (key in customOverrides) scaled[key] = Math.max(0, customOverrides[key] ?? 0);
      else scaled[key] = remainingWeight > 0 ? value * ((1 - safeOverrideTotal) / remainingWeight) : 0;
    }
    adjusted = normalizeWeights(scaled);
  }
  return adjusted;
}

export function filterHotelCandidates(hotels: Hotel[], prefs: PreferenceState, preferredZones: string[] = []): Hotel[] {
  return hotels.filter(hotel => {
    if (hotel.pricePerNight < prefs.hotelPriceRange.min || hotel.pricePerNight > prefs.hotelPriceRange.max) return false;
    if (prefs.hotelLevelPref !== 'any' && prefs.hotelLevelPref !== hotel.level && prefs.budgetPref !== 'any') return false;
    if (prefs.hotelAmenityPrefs.length > 0 && !prefs.hotelAmenityPrefs.every(item => hotel.amenities.includes(item))) return false;
    if (prefs.transportRule.walkMaxKm <= 1 && preferredZones.length > 0 && !preferredZones.includes(hotel.zone)) return false;
    return true;
  });
}

export function scoreHotels(hotels: Hotel[], prefs: PreferenceState, preferredZones: string[] = []): ScoredItem<Hotel>[] {
  const targetPrice = targetBudgetValue(prefs.budgetPref, Math.max(350, (prefs.hotelPriceRange.min + prefs.hotelPriceRange.max) / 2 || 500));
  const weights = getEffectiveWeights('hotel', prefs);
  return hotels
    .map(hotel => {
      const mismatchReasons: string[] = [];
      const inBudget = hotel.pricePerNight >= prefs.hotelPriceRange.min && hotel.pricePerNight <= prefs.hotelPriceRange.max;
      const levelMatched = prefs.hotelLevelPref === 'any' || prefs.hotelLevelPref === hotel.level;
      const amenityMatchCount = prefs.hotelAmenityPrefs.filter(item => hotel.amenities.includes(item)).length;
      const allAmenitiesMatched = prefs.hotelAmenityPrefs.length === 0 || amenityMatchCount === prefs.hotelAmenityPrefs.length;
      const zoneMatched = preferredZones.length === 0 || preferredZones.includes(hotel.zone);

      if (!inBudget) {
        mismatchReasons.push(
          hotel.pricePerNight > prefs.hotelPriceRange.max
            ? '价格高于预算'
            : '价格低于预算区间'
        );
      }
      if (!levelMatched) mismatchReasons.push('酒店档次不完全匹配');
      if (!zoneMatched) mismatchReasons.push('距离当天主路线稍远');
      if (!allAmenitiesMatched && prefs.hotelAmenityPrefs.length > 0) mismatchReasons.push('部分设施需求未完全满足');

      const features = {
        price_fit: priceFit(hotel.pricePerNight, targetPrice),
        location_fit: hotelZoneMatch(prefs, hotel, preferredZones),
        comfort_fit: comfortFitForHotel(prefs, hotel),
        elderly_fit: elderlyFitForHotel(prefs, hotel),
        transport_fit: transportFitForHotel(prefs, hotel, preferredZones),
        rating_fit: normalizedRating(hotel.rating),
      };
      const score = computeWeightedScore(features, weights);
      return {
        item: hotel,
        features,
        score,
        matchLevel: (mismatchReasons.length === 0 ? 'exact' : 'relaxed') as 'exact' | 'relaxed',
        mismatchReasons,
      };
    })
    .sort((a, b) => b.score - a.score);
}

export function filterRestaurantCandidates(restaurants: Restaurant[], prefs: PreferenceState, dayZones: string[], mealType?: 'breakfast' | 'lunch' | 'dinner'): Restaurant[] {
  return restaurants.filter(restaurant => {
    if (mealType && !restaurant.mealTypes.includes(mealType)) return false;
    if (dayZones.length > 0 && !dayZones.includes(restaurant.zone) && !restaurant.nearbyAttractions.some(() => false)) {
      // allow outside-zone restaurants only if no zone match elsewhere; filtering here stays conservative
    }
    if (prefs.cuisinePrefs.includes('素食') && restaurant.cuisineType !== '素食' && !includesAny([restaurant.description, ...restaurant.tags], LIGHT_DIET_TAGS)) return false;
    if (prefs.elderlyMode && includesAny([restaurant.description, ...restaurant.tags], SPICY_TAGS) && !prefs.cuisinePrefs.includes(restaurant.cuisineType)) return false;
    return true;
  });
}

export function scoreRestaurants(
  restaurants: Restaurant[],
  prefs: PreferenceState,
  options: {
    dayZones?: string[];
    mealType?: 'breakfast' | 'lunch' | 'dinner';
    nearbyAttractionIds?: string[];
    targetPrice?: number;
  } = {}
): ScoredItem<Restaurant>[] {
  const dayZones = options.dayZones ?? [];
  const nearbyIds = options.nearbyAttractionIds ?? [];
  const targetPrice = options.targetPrice ?? targetBudgetValue(prefs.budgetPref, 80);
  const weights = getEffectiveWeights('restaurant', prefs);
  return filterRestaurantCandidates(restaurants, prefs, dayZones, options.mealType)
    .map(restaurant => {
      const cuisineTags = [restaurant.cuisineType, ...restaurant.tags];
      const tasteFit = prefs.cuisinePrefs.length > 0
        ? clamp01(0.7 * overlapScore(prefs.cuisinePrefs, cuisineTags) + 0.3 * (includesAny(cuisineTags, LIGHT_DIET_TAGS) && prefs.elderlyMode ? 1 : 0.6))
        : (prefs.elderlyMode && includesAny(cuisineTags, LIGHT_DIET_TAGS) ? 0.9 : 0.75);
      const directNearby = nearbyIds.length > 0 && restaurant.nearbyAttractions.some(id => nearbyIds.includes(id));
      const sameZone = dayZones.includes(restaurant.zone);
      const detourPenalty = directNearby ? 0 : sameZone ? 0.5 : 1.2;
      const features = {
        taste_fit: tasteFit,
        price_fit: priceFit(restaurant.pricePerPerson, targetPrice),
        distance_fit: expDecay(detourPenalty, 1),
        elderly_fit: elderlyFitForRestaurant(prefs, restaurant),
        environment_fit: environmentFitForRestaurant(prefs, restaurant),
        rating_fit: normalizedRating(restaurant.rating),
      };
      return { item: restaurant, features, score: computeWeightedScore(features, weights) };
    })
    .sort((a, b) => b.score - a.score);
}

export function filterAttractionCandidates(attractions: Attraction[], prefs: PreferenceState): Attraction[] {
  return attractions.filter(attraction => {
    if (prefs.elderlyMode && physicalFitForAttraction(prefs, attraction) < 0.45) return false;
    if ((prefs.transportRule.walkMaxKm <= 1 || prefs.transportRule.fatigueLevel === 'relaxed') && includesAny(attraction.tags, ['hard', '登山', '徒步'])) return false;
    return true;
  });
}

export function scoreAttractions(
  attractions: Attraction[],
  prefs: PreferenceState,
  options: {
    preferredZones?: string[];
    targetDurationHours?: number;
    targetTicketPrice?: number;
  } = {}
): ScoredItem<Attraction>[] {
  const weights = getEffectiveWeights('attraction', prefs);
  const interestTags = prefs.selectedCategories;
  const preferredZones = options.preferredZones ?? [];
  const targetDuration = options.targetDurationHours ?? (prefs.elderlyMode ? 2 : 3);
  const targetTicketPrice = options.targetTicketPrice ?? targetBudgetValue(prefs.budgetPref, 120);
  return filterAttractionCandidates(attractions, prefs)
    .map(attraction => {
      const interestFit = interestTags.length > 0
        ? overlapScore(interestTags, [...attraction.category, ...attraction.tags])
        : normalizedRating(attraction.rating);
      const routeDistancePenalty = preferredZones.length === 0 ? 0.35 : (preferredZones.includes(attraction.zone) ? 0.05 : 0.85);
      const features = {
        interest_fit: interestFit,
        physical_fit: physicalFitForAttraction(prefs, attraction),
        time_fit: priceFit(attraction.estimatedDuration, targetDuration),
        cost_fit: priceFit(attraction.ticketPrice, targetTicketPrice),
        route_fit: expDecay(routeDistancePenalty, 0.8),
        popularity_fit: popularityFit(prefs, attraction),
      };
      return { item: attraction, features, score: computeWeightedScore(features, weights) };
    })
    .sort((a, b) => b.score - a.score);
}

export function filterGuideCandidates(guides: GuideWithRoutes[], prefs: PreferenceState, travelDates: string[] = []): GuideWithRoutes[] {
  return guides.filter(guide => {
    if (!guide.isAvailableForHire) return false;
    if (travelDates.length > 0 && guide.busyDates?.some(date => travelDates.includes(date))) return false;
    if (prefs.elderlyMode && elderlyCareFitForGuide(prefs, guide) < 0.5) return false;
    return true;
  });
}

export function scoreGuides(
  guides: GuideWithRoutes[],
  prefs: PreferenceState,
  options: {
    travelDates?: string[];
    preferredZones?: string[];
    targetPrice?: number;
  } = {}
): ScoredItem<GuideWithRoutes>[] {
  const weights = getEffectiveWeights('guide', prefs);
  const targetPrice = options.targetPrice ?? targetBudgetValue(prefs.budgetPref, 420);
  const travelDates = options.travelDates ?? [];
  const preferredZones = options.preferredZones ?? [];
  return filterGuideCandidates(guides, prefs, travelDates)
    .map(guide => {
      const scheduleFit = guide.busyDates?.some(date => travelDates.includes(date)) ? 0 : 1;
      const features = {
        route_match: routeMatchForGuide(preferredZones, guide),
        experience_fit: clamp01(guide.yearsOfExperience / 10),
        communication_fit: communicationFitForGuide(guide, prefs),
        elderly_care_fit: elderlyCareFitForGuide(prefs, guide),
        price_fit: priceFit(guide.perDayPrice, targetPrice),
        schedule_fit: scheduleFit,
      };
      return { item: guide, features, score: computeWeightedScore(features, weights) };
    })
    .sort((a, b) => b.score - a.score);
}

export function filterFlightCandidates(flights: Flight[], prefs: PreferenceState): Flight[] {
  return flights.filter(flight => {
    if (prefs.flightPreference.preferredCabin !== 'any' && flight.cabin !== prefs.flightPreference.preferredCabin) return false;
    if (prefs.flightPreference.preferredAirlineType !== 'any' && flight.airlineType !== prefs.flightPreference.preferredAirlineType) return false;
    if (prefs.flightPreference.preferDirectFlight && !flight.isDirect) return false;
    if (prefs.flightPreference.luggagePreference !== 'any' && flight.luggageOption !== prefs.flightPreference.luggagePreference) return false;
    return true;
  });
}

export function scoreFlights(flights: Flight[], prefs: PreferenceState, targetPrice?: number): ScoredItem<Flight>[] {
  const weights = getEffectiveWeights('flight', prefs);
  const budgetTarget = targetPrice ?? targetBudgetValue(prefs.budgetPref, 900);
  return filterFlightCandidates(flights, prefs)
    .map(flight => {
      const features = {
        price_fit: priceFit(flight.totalPrice, budgetTarget),
        time_fit: flightTimeFit(flight, prefs.flightPreference),
        direct_fit: flight.isDirect ? 1 : flight.stopDurationMin ? 0.45 : 0.25,
        comfort_fit: comfortFitForFlight(flight),
        airline_fit: prefs.flightPreference.preferredAirlineType === 'any'
          ? (flight.airlineType === 'standard' ? 0.82 : 0.72)
          : (prefs.flightPreference.preferredAirlineType === flight.airlineType ? 1 : 0.25),
        luggage_fit: prefs.flightPreference.luggagePreference === 'any'
          ? (flight.luggageOption === 'checked' ? 0.85 : 0.7)
          : (prefs.flightPreference.luggagePreference === flight.luggageOption ? 1 : 0.3),
      };
      return { item: flight, features, score: computeWeightedScore(features, weights) };
    })
    .sort((a, b) => b.score - a.score);
}

export function computeRouteEfficiency(input: RouteEfficiencyInput, mode?: TravelModeProfile): number {
  const walkEfficiency = clamp01(1 - input.totalWalkKm / Math.max(input.maxAcceptableWalkKm, 1));
  const transferEfficiency = clamp01(1 - input.transferCount / Math.max(input.maxAcceptableTransfers, 1));
  const detourEfficiency = expDecay(input.detourDistanceKm, 6);
  const paceEfficiency = clamp01(1 - input.overloadMinutes / Math.max(input.maxDailyActiveMinutes, 1));
  if (mode === 'elderly_relaxed') {
    return clamp01(0.35 * walkEfficiency + 0.3 * transferEfficiency + 0.15 * detourEfficiency + 0.2 * paceEfficiency);
  }
  return clamp01(0.3 * walkEfficiency + 0.25 * transferEfficiency + 0.25 * detourEfficiency + 0.2 * paceEfficiency);
}

export function scorePlan(components: PlanComponentScores, prefs: PreferenceState): number {
  const mode = deriveTravelModeProfile(prefs);
  const weights = PLAN_WEIGHTS[mode];
  return clamp01(
    (components.hotelScore ?? 0) * weights.hotel +
    (components.attractionScore ?? 0) * weights.attraction +
    (components.restaurantScore ?? 0) * weights.restaurant +
    (components.guideScore ?? 0) * weights.guide +
    (components.flightScore ?? 0) * weights.flight +
    (components.routeEfficiency ?? 0) * weights.routeEfficiency
  );
}

export function getTravelModeProfile(prefs: PreferenceState): TravelModeProfile {
  return deriveTravelModeProfile(prefs);
}

// ===== 顺路评分：计算餐厅是否在当前路线方向上 =====
// 返回 0-1，1=完全顺路，0=严重绕路
export function calculateRouteConvenience(
  restaurantId: string,
  fromLocationId: string,
  toLocationIds: string[],
): number {
  // 延迟导入避免循环引用
  const { getUniversalRoute } = require('./universalRoute');

  if (!toLocationIds.length) return 0.5; // 无后续目标，取中值

  // 计算：从 from 经过 restaurant 到 to 的绕路程度
  let bestScore = 0;
  for (const toId of toLocationIds) {
    // 直达时间
    const directRoute = getUniversalRoute(fromLocationId, toId);
    const directTime = directRoute?.transit.time ?? 60;

    // 绕路时间 = from→restaurant + restaurant→to
    const leg1 = getUniversalRoute(fromLocationId, restaurantId);
    const leg2 = getUniversalRoute(restaurantId, toId);
    const detourTime = (leg1?.transit.time ?? 60) + (leg2?.transit.time ?? 60);

    // 偏离比：绕路增加的时间 / 直达时间
    const extraTime = Math.max(0, detourTime - directTime);
    const deviationRatio = directTime > 0 ? extraTime / directTime : 1;

    // 转为 0-1 分数：偏离0=1分，偏离>=1=接近0分
    const score = Math.max(0, 1 - deviationRatio);
    if (score > bestScore) bestScore = score;
  }

  return clamp01(bestScore);
}
