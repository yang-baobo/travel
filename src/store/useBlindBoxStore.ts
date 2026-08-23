import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  BlindBoxContentCategory,
  BlindBoxPriority,
  BlindBoxResult,
  BlindBoxTripProfile,
} from '../types/blindBox';

const DEFAULT_PROFILE: BlindBoxTripProfile = {
  destination: '北京',
  preferences: ['拍照', '咖啡', '设计'],
  notPreferred: [],
  contentPriorities: {
    attraction: 'priority',
    food: 'priority',
    shopping: 'normal',
    experience: 'normal',
    rest: 'low',
  },
  hardConstraints: {
    forbidden: [],
    dietaryAllergies: [],
    noNightActivity: false,
    maxWalkingMinutesPerDay: 120,
    maxWalkingMinutesPerSegment: 30,
    mobilityLimitations: [],
  },
  totalTripBudget: 3000,
  otherRequirements: '',
};

interface BlindBoxState {
  setupStatus: 'draft' | 'confirmed';
  profileVersion: number;
  confirmedAt: string | null;
  draftProfile: BlindBoxTripProfile;
  confirmedProfile: BlindBoxTripProfile | null;
  result: BlindBoxResult | null;
  revealed: boolean;
  updateDraft: (updates: Partial<BlindBoxTripProfile>) => void;
  updateHardConstraints: (updates: Partial<BlindBoxTripProfile['hardConstraints']>) => void;
  setContentPriority: (category: BlindBoxContentCategory, priority: BlindBoxPriority) => void;
  togglePreference: (preference: string) => void;
  confirmProfile: () => void;
  setResult: (result: BlindBoxResult) => void;
  reveal: () => void;
  clearResult: () => void;
}

export const useBlindBoxStore = create<BlindBoxState>()(persist((set, get) => ({
  setupStatus: 'draft',
  profileVersion: 0,
  confirmedAt: null,
  draftProfile: DEFAULT_PROFILE,
  confirmedProfile: null,
  result: null,
  revealed: false,

  updateDraft: updates => set(state => ({
    draftProfile: { ...state.draftProfile, ...updates },
    setupStatus: 'draft',
    result: null,
    revealed: false,
  })),
  updateHardConstraints: updates => set(state => ({
    draftProfile: {
      ...state.draftProfile,
      hardConstraints: { ...state.draftProfile.hardConstraints, ...updates },
    },
    setupStatus: 'draft',
    result: null,
    revealed: false,
  })),
  setContentPriority: (category, priority) => set(state => ({
    draftProfile: {
      ...state.draftProfile,
      contentPriorities: { ...state.draftProfile.contentPriorities, [category]: priority },
    },
    setupStatus: 'draft',
    result: null,
    revealed: false,
  })),
  togglePreference: preference => set(state => {
    const selected = state.draftProfile.preferences.includes(preference);
    return {
      draftProfile: {
        ...state.draftProfile,
        preferences: selected
          ? state.draftProfile.preferences.filter(item => item !== preference)
          : [...state.draftProfile.preferences, preference],
      },
      setupStatus: 'draft',
      result: null,
      revealed: false,
    };
  }),
  confirmProfile: () => {
    const state = get();
    const nextProfile: BlindBoxTripProfile = JSON.parse(JSON.stringify(state.draftProfile));
    set({
      setupStatus: 'confirmed',
      profileVersion: state.profileVersion + 1,
      confirmedAt: new Date().toISOString(),
      confirmedProfile: nextProfile,
      result: null,
      revealed: false,
    });
  },
  setResult: result => set({ result, revealed: result.status === 'success' && result.public_card.reveal_now }),
  reveal: () => set({ revealed: true }),
  clearResult: () => set({ result: null, revealed: false }),
}), {
  name: 'travel-blind-box-profile-v1',
  storage: createJSONStorage(() => AsyncStorage),
  partialize: state => ({
    setupStatus: state.setupStatus,
    profileVersion: state.profileVersion,
    confirmedAt: state.confirmedAt,
    draftProfile: state.draftProfile,
    confirmedProfile: state.confirmedProfile,
  }),
}));
