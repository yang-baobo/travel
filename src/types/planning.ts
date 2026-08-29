import type { PlannerMode } from '../data/beijingHomeUi';
import type { TripHardConstraints } from './blindBox';
import type { TravelHotel } from './hotel';
import type { TravelPlace, TravelRouteSegment } from './travel';

export type PlanningInputMethod = 'text' | 'asr' | 'realtime';
export type PlanningPace = 'relaxed' | 'standard' | 'packed';
export type PlanIntentProvider = 'remote_glm' | 'local_fallback' | 'unavailable';
export type PlanningEntryMode = 'selected_places' | 'chat' | 'realtime';
export type PlanningPatchSource = PlanningInputMethod | 'preference_settings';
export type PlanningPlaceIntent = 'must_visit' | 'prefer' | 'avoid' | 'remove' | 'replace';
export type PlanningRequirementKey =
  | 'city'
  | 'travel_time'
  | 'people'
  | 'budget'
  | 'pace'
  | 'preferences'
  | 'transport'
  | 'stay_meals'
  | 'constraints'
  | 'attractions';

export interface PlanningRequirementProgress {
  key: PlanningRequirementKey;
  label: string;
  required: boolean;
  status: 'missing' | 'confirmed';
  summary: string;
  source: PlanningInputMethod | 'preference_settings' | 'home_selection' | null;
}

export interface PlanningCandidatePlace {
  source: TravelPlace['source'];
  sourceId: string;
  name: string;
  category: TravelPlace['category'];
  latitude: number;
  longitude: number;
  originalPlace: TravelPlace;
}

/** A place mentioned by the user before it has been resolved to a provider POI. */
export interface PlanningPlaceMention {
  name: string;
  intent: PlanningPlaceIntent;
  lockedDay: number | null;
  source?: PlanningPatchSource;
}

export interface PlanningDayConstraint {
  day: number;
  pace?: PlanningPace;
  maxWalkingMinutes?: number;
  startTime?: string;
  endTime?: string;
  areaPreference?: string;
  note?: string;
}

export type DerivedTravelConstraintType =
  | 'limited_mobility'
  | 'elderly_companions'
  | 'low_walking'
  | 'avoid_stairs'
  | 'rest_breaks'
  | 'door_to_door_transport'
  | 'accessible_hotel'
  | 'accessible_attraction';

/** A transparent, reversible inference grounded in the user's own words. */
export interface DerivedTravelConstraint {
  id: string;
  type: DerivedTravelConstraintType;
  sourceText: string;
  source: PlanningPatchSource;
  confidence: number;
  severity: 'soft' | 'hard';
  explanation: string;
  assumptions: string[];
  requiresConfirmation: boolean;
}

export interface PlanningTransportPlan {
  primary: 'transit' | 'driving' | 'walking';
  fallback: 'transit' | 'driving' | 'walking' | null;
  maxTransitMinutes?: number;
  maxWalkingMinutesPerSegment?: number;
  reason?: string;
}

export interface PlanningPatchRecord {
  patch: PlanningPatch;
  sourceText: string;
  appliedAt: string;
  revision: number;
}

export interface PlanningPatch {
  set: {
    travelStartDate?: string;
    days?: number;
    people?: number;
    totalBudget?: number | null;
    pace?: PlanningPace;
    mode?: PlannerMode;
    transportPreference?: 'transit' | 'driving' | 'walking' | 'any';
    needHotel?: boolean;
    hotelLevel?: string;
    hotelZone?: string;
    hotelPriceMin?: number;
    hotelPriceMax?: number;
    needLunch?: boolean;
    needDinner?: boolean;
    dailyStartTime?: string;
    dailyEndTime?: string;
    noNightActivity?: boolean;
    maxWalkingMinutesPerDay?: number;
    maxWalkingMinutesPerSegment?: number;
    elderlyMode?: boolean;
  };
  addPreferences: string[];
  removePreferences: string[];
  addCuisines: string[];
  removeCuisines: string[];
  addDietaryAllergies: string[];
  removeDietaryAllergies: string[];
  addForbiddenItems: string[];
  removeForbiddenItems: string[];
  addMobilityLimitations: string[];
  removeMobilityLimitations: string[];
  derivedConstraints: DerivedTravelConstraint[];
  placeMentions: PlanningPlaceMention[];
  dayConstraints: PlanningDayConstraint[];
  confirmedRequirements: PlanningRequirementKey[];
  needsClarification: boolean;
  clarificationQuestions: string[];
  reply: string;
  transportPlan?: PlanningTransportPlan;
  source?: PlanningPatchSource;
  appliedAt?: string;
  sessionRevision?: number;
}

export interface PlanningPreferenceSnapshot {
  hasSetPreferences: boolean;
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
  /** User intent is kept separately from provider-resolved candidates. */
  mustVisitCandidates?: PlanningCandidatePlace[];
  preferredCandidates?: PlanningCandidatePlace[];
  excludedPlaceIds?: string[];
  unresolvedPlaceMentions?: PlanningPlaceMention[];
  dayConstraints?: PlanningDayConstraint[];
  derivedConstraints?: DerivedTravelConstraint[];
  excludedDraftPlaceIds?: string[];
  routeVariantSeed?: string;
  alternativeIndex?: number;
  revision?: number;
  transportPlan?: PlanningTransportPlan;
  patchHistory?: PlanningPatchRecord[];
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
  planningPatch?: PlanningPatch;
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
    | 'hotel_location_unverified'
    | 'mobility_conflict'
    | 'accessibility_unknown';
  reason: string;
}

export interface PlanningIssue {
  code: string;
  provider: 'amap' | 'flyai' | 'optimizer' | 'client' | 'unknown';
  message: string;
  retryable: boolean;
  blocking: boolean;
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
  /** Machine-readable diagnostics retained alongside the UI strings. */
  issues?: PlanningIssue[];
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
  | 'collecting'
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
  entryMode: PlanningEntryMode;
  status: PlanningSessionStatus;
  request: PlanningRequest;
  requirements: PlanningRequirementProgress[];
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
