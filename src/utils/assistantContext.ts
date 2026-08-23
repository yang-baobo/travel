import { useAssistantActionStore } from '../store/useAssistantActionStore';
import { useBlindBoxStore } from '../store/useBlindBoxStore';
import { useLiveTravelStore } from '../store/useLiveTravelStore';
import { usePreferenceStore } from '../store/usePreferenceStore';
import { useRouteStore } from '../store/useRouteStore';

export function buildAssistantContext(): Record<string, unknown> {
  const preference = usePreferenceStore.getState();
  const liveTravel = useLiveTravelStore.getState();
  const route = useRouteStore.getState();
  const assistant = useAssistantActionStore.getState();
  const blindBox = useBlindBoxStore.getState();

  return {
    city: preference.selectedCity,
    preferences_set: preference.hasSetPreferences,
    trip: {
      travel_days: preference.travelDays,
      group_size: preference.groupSize,
      budget_range: preference.budgetRange,
      daily_time: [preference.dailyStartTime, preference.dailyEndTime],
      categories: preference.selectedCategories,
      cuisines: preference.cuisinePrefs,
      hotel: {
        needed: preference.needHotel,
        level: preference.hotelLevelPref,
        zone: preference.hotelZonePref,
        price_range: preference.hotelPriceRange,
        amenities: preference.hotelAmenityPrefs,
      },
      transport: {
        preference: preference.transportPref,
        rule: preference.transportRule,
      },
    },
    blind_box_safety: blindBox.confirmedProfile
      ? {
          allergies: blindBox.confirmedProfile.hardConstraints.dietaryAllergies,
          forbidden: blindBox.confirmedProfile.hardConstraints.forbidden,
          accept_night_activities: !blindBox.confirmedProfile.hardConstraints.noNightActivity,
          max_daily_walking_minutes: blindBox.confirmedProfile.hardConstraints.maxWalkingMinutesPerDay,
          max_single_walk_minutes: blindBox.confirmedProfile.hardConstraints.maxWalkingMinutesPerSegment,
          mobility_constraints: blindBox.confirmedProfile.hardConstraints.mobilityLimitations,
        }
      : null,
    current_page: assistant.currentPage,
    page_data: assistant.pageData,
    live_itinerary: liveTravel.itinerary.map(item => ({
      id: item.id,
      name: item.name,
      category: item.category,
      address: item.address,
      location: item.location,
    })),
    route: {
      source: route.routeSource,
      days: route.travelDays,
      stops: route.routeStops.map(stop => ({
        attraction_id: stop.attractionId,
        day: stop.day,
        arrival_time: stop.arrivalTime,
        stay_duration_minutes: stop.stayDuration,
      })),
    },
  };
}
