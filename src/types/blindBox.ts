import type { TravelPlace } from './travel';

export type BlindBoxContentCategory = 'attraction' | 'food' | 'shopping' | 'experience' | 'rest';
export type BlindBoxPriority = 'none' | 'low' | 'normal' | 'priority';
export type BlindBoxType = 'preference' | 'detour';

export interface TripHardConstraints {
  forbidden: string[];
  dietaryAllergies: string[];
  noNightActivity: boolean;
  maxWalkingMinutesPerDay: number;
  maxWalkingMinutesPerSegment: number;
  mobilityLimitations: string[];
}

export interface BlindBoxTripProfile {
  destination: '北京';
  preferences: string[];
  notPreferred: string[];
  contentPriorities: Record<BlindBoxContentCategory, BlindBoxPriority>;
  hardConstraints: TripHardConstraints;
  totalTripBudget: number;
  otherRequirements: string;
}

export interface BlindBoxControls {
  timeSlot: { start: string; end: string };
  type: BlindBoxType;
  budgetTotal: number;
  maxDetourMinutes: number;
  revealImmediately: boolean;
}

export interface BlindBoxCandidate {
  id: string;
  name: string;
  category: BlindBoxContentCategory;
  subcategory: string;
  address: string;
  district: string;
  lat: number;
  lng: number;
  price: number | null;
  currency: 'CNY';
  opening_hours_text: string;
  rating: number | null;
  photo_urls: string[];
  source_url: string;
  checked_at: string;
  verification_status: 'verified' | 'estimated' | 'unverified';
  source: 'amap';
}

export interface BlindBoxPublicCard {
  reveal_now: boolean;
  title: string;
  time: string;
  area_hint: string;
  budget: string;
  effort: string;
  walking: string;
  detour: string;
  reason: string;
  safety_notes: string[];
  data_warnings: string[];
  reservation_required: boolean;
  name?: string;
  address?: string;
  photo_urls?: string[];
}

export interface BlindBoxSuccessResult {
  status: 'success';
  public_card: BlindBoxPublicCard;
  system_payload: {
    selected_candidate_id: string;
    selected_candidate: BlindBoxCandidate;
    content_priority_applied: string;
    budget_used: number;
    budget_after_box: number;
    group_constraints_applied: true;
    day_variety_reason: string;
    added_detour_minutes: number;
    insertion_after_item_id: string | null;
    needs_verification: boolean;
    verification: { source_url: string; checked_at: string; route_verified: boolean };
    constraint_audit: Record<string, string>;
  };
}

export interface BlindBoxNoOptionResult {
  status: 'no_feasible_option';
  rejection_counts: Record<string, number>;
  failure_reasons: string[];
  minimal_adjustments: string[];
}

export interface BlindBoxMissingContextResult {
  status: 'missing_upstream_context';
  missing_fields: string[];
  message: string;
}

export type BlindBoxResult = BlindBoxSuccessResult | BlindBoxNoOptionResult | BlindBoxMissingContextResult;

export function blindBoxCandidateToTravelPlace(candidate: BlindBoxCandidate): TravelPlace {
  const category = candidate.category === 'food' ? 'restaurant' : 'attraction';
  return {
    id: candidate.id,
    source: 'amap',
    category,
    city: '北京',
    name: candidate.name,
    address: candidate.address,
    district: candidate.district,
    location: { latitude: candidate.lat, longitude: candidate.lng },
    typeName: candidate.subcategory || '旅行盲盒',
    typeCode: '',
    rating: candidate.rating,
    cost: candidate.price,
    phone: '',
    openHours: candidate.opening_hours_text,
    businessArea: candidate.district,
    tags: ['旅行盲盒'],
    photoUrls: candidate.photo_urls,
    booking: {
      enabled: false,
      provider: category === 'restaurant' ? 'meituan' : 'ctrip',
      label: category === 'restaurant' ? '去美团查看' : '查看预订',
      url: null,
    },
  };
}
