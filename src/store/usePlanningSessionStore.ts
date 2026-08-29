import { create } from 'zustand';
import type {
  DraftPatchPreview,
  PlanIntent,
  PlanningMessage,
  PlanningEntryMode,
  PlanningRequest,
  PlanningRequirementKey,
  PlanningRequirementProgress,
  PlanningSession,
  PlanningSessionStatus,
  TripPlanDraft,
} from '../types/planning';
import { buildPlanningRequirements, requirementSummary } from '../services/planningCollection';

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function now(): string {
  return new Date().toISOString();
}

interface PlanningSessionState {
  session: PlanningSession | null;
  beginSession: (request: PlanningRequest, options?: { entryMode?: PlanningEntryMode; confirmedRequirements?: PlanningRequirementKey[] }) => string;
  updateRequest: (patch: Partial<PlanningRequest>) => void;
  updateRequirement: (key: PlanningRequirementKey, summary: string, source: Exclude<PlanningRequirementProgress['source'], null>) => void;
  markRequirementMissing: (key: PlanningRequirementKey, summary?: string) => void;
  setEntryMode: (entryMode: PlanningEntryMode) => void;
  setStatus: (status: PlanningSessionStatus) => void;
  addMessage: (message: Omit<PlanningMessage, 'id' | 'createdAt'> & Partial<Pick<PlanningMessage, 'id' | 'createdAt'>>) => void;
  setPlanIntent: (intent: PlanIntent | null) => void;
  setDraft: (draft: TripPlanDraft | null) => void;
  setPatchPreview: (preview: DraftPatchPreview | null) => void;
  setCommittedTripId: (tripId: string | null) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const usePlanningSessionStore = create<PlanningSessionState>((set, get) => ({
  session: null,

  beginSession: (request, options) => {
    const id = makeId('planning');
    const timestamp = now();
    const entryMode = options?.entryMode || (request.inputMethod === 'realtime' ? 'realtime' : request.candidates.length ? 'selected_places' : 'chat');
    set({
      session: {
        id,
        entryMode,
        status: 'collecting',
        request,
        requirements: buildPlanningRequirements(request, entryMode, options?.confirmedRequirements),
        messages: request.userInput.trim()
          ? [{
              id: makeId('message'),
              role: 'user',
              text: request.userInput.trim(),
              inputMethod: request.inputMethod,
              createdAt: timestamp,
            }]
          : [],
        planIntent: null,
        draft: null,
        patchPreview: null,
        committedTripId: null,
        error: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });
    return id;
  },

  updateRequest: patch => set(state => state.session ? ({
    session: {
      ...state.session,
      request: { ...state.session.request, ...patch },
      requirements: state.session.requirements.map(item => ({
        ...item,
        summary: requirementSummary(item.key, { ...state.session!.request, ...patch }),
      })),
      updatedAt: now(),
    },
  }) : state),

  updateRequirement: (key, summary, source) => set(state => state.session ? ({
    session: {
      ...state.session,
      requirements: state.session.requirements.map(item => item.key === key ? ({ ...item, status: 'confirmed', summary, source }) : item),
      updatedAt: now(),
    },
  }) : state),

  markRequirementMissing: (key, summary) => set(state => state.session ? ({
    session: {
      ...state.session,
      requirements: state.session.requirements.map(item => item.key === key ? ({
        ...item,
        status: 'missing',
        source: null,
        summary: summary || item.summary,
      }) : item),
      updatedAt: now(),
    },
  }) : state),

  setEntryMode: entryMode => set(state => state.session ? ({
    session: { ...state.session, entryMode, updatedAt: now() },
  }) : state),

  setStatus: status => set(state => state.session ? ({
    session: { ...state.session, status, updatedAt: now() },
  }) : state),

  addMessage: message => set(state => state.session ? ({
    session: {
      ...state.session,
      messages: [...state.session.messages, {
        ...message,
        id: message.id || makeId('message'),
        createdAt: message.createdAt || now(),
      }],
      updatedAt: now(),
    },
  }) : state),

  setPlanIntent: planIntent => set(state => state.session ? ({
    session: { ...state.session, planIntent, updatedAt: now() },
  }) : state),

  setDraft: draft => set(state => state.session ? ({
    session: { ...state.session, draft, updatedAt: now() },
  }) : state),

  setPatchPreview: patchPreview => set(state => state.session ? ({
    session: { ...state.session, patchPreview, updatedAt: now() },
  }) : state),

  setCommittedTripId: committedTripId => set(state => state.session ? ({
    session: {
      ...state.session,
      committedTripId,
      status: committedTripId ? 'committed' : state.session.status,
      updatedAt: now(),
    },
  }) : state),

  setError: error => set(state => state.session ? ({
    session: {
      ...state.session,
      error,
      status: error ? 'error' : state.session.status,
      updatedAt: now(),
    },
  }) : state),

  reset: () => set({ session: null }),
}));

export function getActivePlanningSession(): PlanningSession | null {
  return usePlanningSessionStore.getState().session;
}
