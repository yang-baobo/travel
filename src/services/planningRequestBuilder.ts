import type { PlannerMode, PlannerParams } from '../data/beijingHomeUi';
import { useBlindBoxStore } from '../store/useBlindBoxStore';
import { usePreferenceStore } from '../store/usePreferenceStore';
import type {
  PlanningCandidatePlace,
  PlanningInputMethod,
  PlanningPace,
  PlanningRequest,
} from '../types/planning';
import type { TravelPlace } from '../types/travel';

const EMPTY_HARD_CONSTRAINTS = {
  forbidden: [] as string[],
  dietaryAllergies: [] as string[],
  noNightActivity: false,
  maxWalkingMinutesPerDay: 120,
  maxWalkingMinutesPerSegment: 30,
  mobilityLimitations: [] as string[],
};

function firstNumber(value: string): number | null {
  const match = value.replace(/[,，]/g, '').match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export function parsePlannerDays(value: string): number {
  return Math.max(1, Math.min(15, Math.round(firstNumber(value) || 1)));
}

export function parsePlannerPeople(value: string): number {
  if (value.includes('家庭')) return 3;
  const values = [...value.matchAll(/\d+/g)].map(match => Number(match[0]));
  if (values.length > 1) return Math.max(1, Math.min(20, Math.round((values[0] + values[1]) / 2)));
  return Math.max(1, Math.min(20, Math.round(values[0] || 1)));
}

export function parsePlannerBudget(value: string): number | null {
  if (value.includes('自定义')) return null;
  const amount = firstNumber(value);
  return amount && amount > 0 ? amount : null;
}

export function parsePlannerPace(value: string): PlanningPace {
  if (/轻松|慢|松弛/.test(value)) return 'relaxed';
  if (/紧凑|特种兵|密集/.test(value)) return 'packed';
  return 'standard';
}

export function toPlanningCandidate(place: TravelPlace): PlanningCandidatePlace {
  return {
    source: place.source,
    sourceId: place.id,
    name: place.name,
    category: place.category,
    latitude: place.location.latitude,
    longitude: place.location.longitude,
    originalPlace: place,
  };
}

export function buildPlanningRequest(input: {
  userInput: string;
  inputMethod: PlanningInputMethod;
  mode: PlannerMode;
  params: PlannerParams;
  candidates: TravelPlace[];
}): PlanningRequest {
  const preference = usePreferenceStore.getState();
  const blindBox = useBlindBoxStore.getState();
  const hardConstraints = blindBox.confirmedProfile?.hardConstraints
    || blindBox.draftProfile?.hardConstraints
    || EMPTY_HARD_CONSTRAINTS;
  return {
    userInput: input.userInput.trim(),
    inputMethod: input.inputMethod,
    mode: input.mode,
    city: '北京',
    days: parsePlannerDays(input.params.days),
    people: parsePlannerPeople(input.params.people),
    totalBudget: parsePlannerBudget(input.params.budget),
    pace: parsePlannerPace(input.params.pace),
    candidates: input.candidates.map(toPlanningCandidate),
    preferenceSnapshot: {
      selectedCategories: [...preference.selectedCategories],
      cuisines: [...preference.cuisinePrefs],
      needHotel: preference.needHotel,
      hotelLevel: preference.hotelLevelPref,
      hotelZone: preference.hotelZonePref,
      hotelPriceRange: { ...preference.hotelPriceRange },
      hotelAmenities: [...preference.hotelAmenityPrefs],
      needLunch: preference.needLunch,
      needDinner: preference.needDinner,
      lunchLatestEndTime: preference.lunchLatestEndTime,
      dinnerLatestEndTime: preference.dinnerLatestEndTime,
      transportPreference: preference.transportPref,
      transportRule: {
        walkMaxKm: preference.transportRule.walkMaxKm,
        defaultMode: preference.transportRule.defaultMode,
        maxTransitMinutes: preference.transportRule.maxTransitMinutes,
        maxWalkToStationKm: preference.transportRule.maxWalkToStationKm,
      },
      travelStartDate: preference.travelStartDate,
      travelReturnDate: preference.travelReturnDate,
      dailyStartTime: preference.dailyStartTime,
      dailyEndTime: preference.dailyEndTime,
      elderlyMode: preference.elderlyMode,
    },
    hardConstraints: JSON.parse(JSON.stringify(hardConstraints)),
  };
}
