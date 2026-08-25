import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { CommittedTrip, TripPlanDraft } from '../types/planning';

interface TripState {
  currentTrip: CommittedTrip | null;
  commitFromDraft: (draft: TripPlanDraft) => CommittedTrip;
  applyDraftPatch: (draft: TripPlanDraft) => CommittedTrip;
  removePlace: (placeId: string) => void;
  movePlace: (placeId: string, direction: -1 | 1) => void;
  setPlaceDay: (placeId: string, day: number) => void;
  setPlaceDuration: (placeId: string, durationMinutes: number) => void;
  setTripSchedule: (startDate: string, days: number) => void;
  clearTrip: () => void;
}

function touch(trip: CommittedTrip): CommittedTrip {
  return { ...trip, updatedAt: new Date().toISOString() };
}

function addDays(date: string, amount: number): string {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + amount);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

export const useTripStore = create<TripState>()(persist((set, get) => ({
  currentTrip: null,

  commitFromDraft: draft => {
    const timestamp = new Date().toISOString();
    const trip: CommittedTrip = {
      id: `trip-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      sourceDraftId: draft.id,
      title: draft.title,
      city: draft.city,
      request: draft.request,
      hotel: draft.hotel,
      days: draft.days,
      warnings: draft.warnings,
      knownCostTotal: draft.knownCostTotal,
      costCoverage: draft.costCoverage,
      committedAt: timestamp,
      updatedAt: timestamp,
    };
    set({ currentTrip: trip });
    return trip;
  },

  applyDraftPatch: draft => {
    const current = get().currentTrip;
    if (!current) throw new Error('没有可修改的正式行程。');
    const trip: CommittedTrip = {
      ...current,
      sourceDraftId: draft.id,
      title: draft.title,
      city: draft.city,
      request: draft.request,
      hotel: draft.hotel,
      days: draft.days,
      warnings: draft.warnings,
      knownCostTotal: draft.knownCostTotal,
      costCoverage: draft.costCoverage,
      updatedAt: new Date().toISOString(),
    };
    set({ currentTrip: trip });
    return trip;
  },

  removePlace: placeId => set(state => state.currentTrip ? ({
    currentTrip: touch({
      ...state.currentTrip,
      days: state.currentTrip.days.map(day => ({
        ...day,
        stops: day.stops.filter(stop => stop.place.id !== placeId),
      })),
    }),
  }) : state),

  movePlace: (placeId, direction) => set(state => {
    if (!state.currentTrip) return state;
    const days = state.currentTrip.days.map(day => ({ ...day, stops: [...day.stops] }));
    const day = days.find(item => item.stops.some(stop => stop.place.id === placeId));
    if (!day) return state;
    const index = day.stops.findIndex(stop => stop.place.id === placeId);
    const target = index + direction;
    if (target < 0 || target >= day.stops.length) return state;
    [day.stops[index], day.stops[target]] = [day.stops[target], day.stops[index]];
    return { currentTrip: touch({ ...state.currentTrip, days }) };
  }),

  setPlaceDay: (placeId, targetDay) => set(state => {
    if (!state.currentTrip || targetDay < 1 || targetDay > state.currentTrip.days.length) return state;
    const sourceDay = state.currentTrip.days.find(day => day.stops.some(stop => stop.place.id === placeId));
    const stop = sourceDay?.stops.find(item => item.place.id === placeId);
    if (!sourceDay || !stop || sourceDay.day === targetDay) return state;
    const days = state.currentTrip.days.map(day => ({
      ...day,
      stops: day.day === sourceDay.day
        ? day.stops.filter(item => item.place.id !== placeId)
        : day.day === targetDay
          ? [...day.stops, { ...stop, day: targetDay }]
          : [...day.stops],
    }));
    return { currentTrip: touch({ ...state.currentTrip, days }) };
  }),

  setPlaceDuration: (placeId, durationMinutes) => set(state => {
    if (!state.currentTrip || durationMinutes < 15) return state;
    return {
      currentTrip: touch({
        ...state.currentTrip,
        days: state.currentTrip.days.map(day => ({
          ...day,
          stops: day.stops.map(stop => stop.place.id === placeId
            ? { ...stop, durationMinutes }
            : stop),
        })),
      }),
    };
  }),

  setTripSchedule: (startDate, dayCount) => set(state => {
    if (!state.currentTrip || dayCount < 1 || dayCount > 15) return state;
    const overflowStops = state.currentTrip.days
      .filter(day => day.day > dayCount)
      .flatMap(day => day.stops.map(stop => ({ ...stop, day: dayCount })));
    const days = Array.from({ length: dayCount }, (_, index) => {
      const day = index + 1;
      const existing = state.currentTrip!.days.find(item => item.day === day);
      return {
        day,
        date: addDays(startDate, index),
        travelMinutes: existing?.travelMinutes || 0,
        stops: [
          ...(existing?.stops || []).map(stop => ({ ...stop, day })),
          ...(day === dayCount ? overflowStops : []),
        ],
      };
    });
    return {
      currentTrip: touch({
        ...state.currentTrip,
        request: {
          ...state.currentTrip.request,
          days: dayCount,
          preferenceSnapshot: {
            ...state.currentTrip.request.preferenceSnapshot,
            travelStartDate: startDate,
            travelReturnDate: addDays(startDate, dayCount - 1),
          },
        },
        days,
      }),
    };
  }),

  clearTrip: () => set({ currentTrip: null }),
}), {
  name: 'beijing-current-trip-v1',
  storage: createJSONStorage(() => AsyncStorage),
  partialize: state => ({ currentTrip: state.currentTrip }),
}));
