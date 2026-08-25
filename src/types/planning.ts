import type { PlannerMode } from '../data/beijingHomeUi';
import type { TripHardConstraints } from './blindBox';
import type { TravelHotel } from './hotel';
import type { TravelPlace, TravelRouteSegment } from './travel';

export type PlanningInputMethod = 'text' | 'asr' | 'realtime';
export type PlanningPace = 'relaxed' | 'standard' | 'packed';
export type PlanIntentProvider = 'remote_glm' | 'local_fallback' | 'unavailable';

export interface PlanningCandidatePlace {
  source: TravelPlace['source'];
  sourceId: string;
  name: string;
  category: TravelPlace['category'];
  latitude: number;
  longitude: number;
  originalPlace: TravelPlace;
}

export interface PlanningPreferenceSnapshot {
  selectedCategories: string[];
  cuisines: string[];
  needHotel: boolean;
  hotelLevel: string;
  hotelZone: string;
  hotelPriceRange: { min: number; max: number };
  hotelAmenities: string[];
  needLunch: boolean;
  needDinner: boolean;
  lunchLatestEndTime: string;
  dinnerLatestEndTime: string;
  transportPreference: 'transit' | 'driving' | 'walking' | 'any';
  transportRule: {
    walkMaxKm: number;
    defaultMode: 'transit' | 'driving';
    maxTransitMinutes: number;
    maxWalkToStationKm: number;
  };
  travelStartDate: string;
  travelReturnDate: string;
  dailyStartTime: string;
  dailyEndTime: string;
  elderlyMode: boolean;
}

export interface PlanningRequest {
  userInput: string;
  inputMethod: PlanningInputMethod;
  mode: PlannerMode;
  city: '北京';
  days: number;
  people: number;
  totalBudget: number | null;
  pace: PlanningPace;
  candidates: PlanningCandidatePlace[];
  preferenceSnapshot: PlanningPreferenceSnapshot;
  hardConstraints: TripHardConstraints;
}

export interface PlanIntentNormalizedRequest {
  userInput: string;
  city: '北京';
  days: number;
  people: number;
  totalBudget: number | null;
  pace: PlanningPace;
  mode: PlannerMode;
}

export interface PlanIntent {
  needsClarification: boolean;
  clarificationQuestions: string[];
  normalizedRequest: PlanIntentNormalizedRequest;
  requestPatch: Partial<Pick<PlanningRequest, 'days' | 'people' | 'totalBudget' | 'pace' | 'mode'>>;
  explanation: string;
  provider: PlanIntentProvider;
  model: string | null;
}

export type DraftFactProvider = 'amap' | 'flyai' | 'google-or-tools';

export interface TripPlanDraftStop {
  id: string;
  day: number;
  arrivalTime: string;
  endTime: string;
  durationMinutes: number;
  place: TravelPlace;
  transportToNext: TravelRouteSegment | null;
}

export interface TripPlanDraftDay {
  day: number;
  date: string;
  stops: TripPlanDraftStop[];
  travelMinutes: number;
}

export interface UnassignedPlace {
  sourceId: string;
  name: string;
  category: TravelPlace['category'] | 'hotel';
  reasonCode:
    | 'forbidden'
    | 'allergy_risk'
    | 'hours_unverified'
    | 'closed_on_date'
    | 'budget_exceeded'
    | 'route_unavailable'
    | 'optimizer_unassigned'
    | 'hotel_unavailable'
    | 'hotel_location_unverified';
  reason: string;
}

export interface TripPlanDraft {
  id: string;
  sessionId: string;
  title: string;
  city: '北京';
  request: PlanningRequest;
  intent: PlanIntent;
  hotel: TravelHotel | null;
  days: TripPlanDraftDay[];
  unassignedPlaces: UnassignedPlace[];
  warnings: string[];
  uncertainties: string[];
  blockingIssues: string[];
  knownCostTotal: number;
  costCoverage: 'complete' | 'partial';
  providers: DraftFactProvider[];
  createdAt: string;
}

export interface PlanningMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  inputMethod?: PlanningInputMethod;
  createdAt: string;
}

export type PlanningSessionStatus =
  | 'idle'
  | 'understanding'
  | 'needs_clarification'
  | 'querying_places'
  | 'calculating_transport'
  | 'draft_ready'
  | 'committing'
  | 'committed'
  | 'error';

export interface DraftPatchPreview {
  id: string;
  baseTripId: string;
  explanation: string;
  proposedDraft: TripPlanDraft;
  createdAt: string;
}

export interface PlanningSession {
  id: string;
  status: PlanningSessionStatus;
  request: PlanningRequest;
  messages: PlanningMessage[];
  planIntent: PlanIntent | null;
  draft: TripPlanDraft | null;
  patchPreview: DraftPatchPreview | null;
  committedTripId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommittedTrip {
  id: string;
  sourceDraftId: string;
  title: string;
  city: '北京';
  request: PlanningRequest;
  hotel: TravelHotel | null;
  days: TripPlanDraftDay[];
  warnings: string[];
  knownCostTotal: number;
  costCoverage: 'complete' | 'partial';
  committedAt: string;
  updatedAt: string;
}
