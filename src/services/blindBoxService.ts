import { apiRequest } from './apiClient';
import type { TravelPlace } from '../types/travel';
import type { BlindBoxControls, BlindBoxGenerationContext, BlindBoxResult, BlindBoxTripProfile } from '../types/blindBox';

function itineraryType(place: TravelPlace): string {
  if (place.category === 'restaurant') return 'food';
  if (place.category === 'hotel') return 'rest';
  return 'attraction';
}

export function generateBlindBox(
  profile: BlindBoxTripProfile,
  controls: BlindBoxControls,
  itinerary: TravelPlace[],
  excludeCandidateIds: string[] = [],
  context?: BlindBoxGenerationContext,
): Promise<BlindBoxResult> {
  const effectiveLimit = Math.min(profile.totalTripBudget, controls.budgetTotal);
  const payload = {
    trip_id: context?.tripId,
    city: profile.destination,
    selected_day_id: context?.selectedDayId,
    visit_date: context?.visitDate,
    time_slot: controls.timeSlot,
    previous_stop: context?.previousStop,
    next_stop: context?.nextStop,
    mode: controls.type,
    budget_total: controls.budgetTotal,
    max_detour_minutes: controls.maxDetourMinutes,
    reveal_now: controls.revealImmediately,
    candidate_places: context?.candidatePlaces ?? [],
    trip_profile: {
      destination: profile.destination,
      preferences: profile.preferences,
      not_preferred: profile.notPreferred,
      content_priorities: profile.contentPriorities,
      hard_constraints: {
        forbidden: profile.hardConstraints.forbidden,
        dietary_allergies: profile.hardConstraints.dietaryAllergies,
        no_night_activity: profile.hardConstraints.noNightActivity,
        max_walking_minutes_per_day: profile.hardConstraints.maxWalkingMinutesPerDay,
        max_walking_minutes_per_segment: profile.hardConstraints.maxWalkingMinutesPerSegment,
        mobility_limitations: profile.hardConstraints.mobilityLimitations,
      },
      total_trip_budget: profile.totalTripBudget,
      other_requirements: profile.otherRequirements,
    },
    blind_box_request: {
      time_slot: controls.timeSlot,
      type: controls.type,
      budget_total: controls.budgetTotal,
      max_detour_minutes: controls.maxDetourMinutes,
      reveal_now: controls.revealImmediately,
      request_id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      exclude_candidate_ids: excludeCandidateIds,
      trip_id: context?.tripId,
      selected_day_id: context?.selectedDayId,
      visit_date: context?.visitDate,
      previous_stop: context?.previousStop,
      next_stop: context?.nextStop,
    },
    day_itinerary: itinerary.map(place => ({
      item_id: place.id,
      type: itineraryType(place),
      name: place.name,
      lat: place.location.latitude,
      lng: place.location.longitude,
    })),
    budget_context: {
      remaining_trip_budget: profile.totalTripBudget,
      blind_box_user_limit: controls.budgetTotal,
      effective_blind_box_limit: effectiveLimit,
      currency: 'CNY',
    },
    group_constraints: {
      source: 'main_platform',
      forbidden: profile.hardConstraints.forbidden,
      dietary_allergies: profile.hardConstraints.dietaryAllergies,
      max_walking_minutes_per_segment: profile.hardConstraints.maxWalkingMinutesPerSegment,
      accessibility_requirements: profile.hardConstraints.mobilityLimitations,
    },
  };

  return apiRequest<BlindBoxResult>('/api/travel/blind-box', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, 45_000);
}
