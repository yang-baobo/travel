/**
 * 小猫助手全局状态 Store
 * 管理助手的生命周期阶段、显示模式、对话消息、路线修改请求
 */

import { create } from 'zustand';
import { RouteSummary } from '../utils/routeGenerator';

export type AssistantPhase =
  | 'idle'        // 待机，显示FAB
  | 'collecting'  // 信息收集（全面板）
  | 'generating'  // 生成路线中（全面板loading）
  | 'presenting'  // 路线介绍（悬浮窗TTS）
  | 'adjusting'   // 路线调整（悬浮窗对话）
  | 'done';       // 完成

export type DisplayMode = 'hidden' | 'full_panel' | 'floating_mini';

export interface ChatBubble {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

export interface RouteModification {
  type: string;
  payload: any;
}

export type AssistantSessionSlot =
  | 'selectedCity'
  | 'travelDays'
  | 'groupSize'
  | 'selectedCategories'
  | 'budgetPref'
  | 'travelPace'
  | 'elderlyMode'
  | 'hotelPref'
  | 'transportPref'
  | 'cuisinePrefs'
  | 'departureCity';

export interface AssistantSessionDraft {
  selectedCity?: string;
  travelDays?: number;
  groupSize?: number;
  selectedCategories?: string[];
  budgetPref?: string;
  travelPace?: 'slow' | 'balanced' | 'packed';
  elderlyMode?: boolean;
  needHotel?: boolean;
  hotelLevelPref?: string;
  hotelZonePref?: string;
  hotelPriceRange?: { min: number; max: number };
  hotelAmenityPrefs?: string[];
  transportPref?: string;
  walkMaxKm?: number;
  defaultTransportMode?: 'transit' | 'driving';
  maxTransitMinutes?: number;
  maxWalkToStationKm?: number;
  cuisinePrefs?: string[];
  needBreakfast?: boolean;
  needLunch?: boolean;
  needDinner?: boolean;
  departureCity?: string;
  isInDestCity?: boolean;
}

export interface AssistantSessionState {
  extractedPreferences: AssistantSessionDraft;
  confirmedSlots: AssistantSessionSlot[];
  missingSlots: AssistantSessionSlot[];
  lowConfidenceSlots: AssistantSessionSlot[];
  summary: string[];
  readyToGenerate: boolean;
  routeDraftGenerated: boolean;
  lastQuestionSlot: AssistantSessionSlot | null;
  askedSlots: AssistantSessionSlot[];
}

export interface AssistantReviewSection {
  id: string;
  kind: 'overview' | 'day' | 'payment';
  title: string;
  spokenText: string;
  confirmationPrompt: string;
  day?: number;
}

interface AssistantState {
  // 阶段与显示
  phase: AssistantPhase;
  displayMode: DisplayMode;
  isMiniExpanded: boolean;

  // 对话
  messages: ChatBubble[];
  isProcessing: boolean;
  pendingPrompt: string | null;

  // 路线
  routeSummary: RouteSummary | null;
  routePresentationText: string;

  // 路线修改请求（RoutePlanScreen 消费）
  pendingModification: RouteModification | null;

  // Actions
  openAssistant: () => void;
  openAssistantWithPrompt: (prompt: string) => void;
  consumePendingPrompt: () => string | null;
  closeAssistant: () => void;
  setPhase: (phase: AssistantPhase) => void;
  addMessage: (bubble: ChatBubble) => void;
  setMessages: (messages: ChatBubble[]) => void;
  setIsProcessing: (v: boolean) => void;
  setRouteSummary: (summary: RouteSummary | null) => void;
  setRoutePresentationText: (text: string) => void;
  expandMini: () => void;
  collapseMini: () => void;
  requestRouteModification: (type: string, payload: any) => void;
  clearRouteModification: () => void;
  reset: () => void;
}

function phaseToDisplayMode(phase: AssistantPhase): DisplayMode {
  switch (phase) {
    case 'idle':
    case 'done':
      return 'hidden';
    case 'collecting':
    case 'generating':
      return 'full_panel';
    case 'presenting':
    case 'adjusting':
      return 'floating_mini';
  }
}

export const useAssistantStore = create<AssistantState>((set, get) => ({
  phase: 'idle',
  displayMode: 'hidden',
  isMiniExpanded: false,

  messages: [],
  isProcessing: false,
  pendingPrompt: null,

  routeSummary: null,
  routePresentationText: '',

  pendingModification: null,

  openAssistant: () => {
    set({
      phase: 'collecting',
      displayMode: 'full_panel',
      isMiniExpanded: false,
    });
  },

  openAssistantWithPrompt: (prompt) => {
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt) return;
    set({
      phase: 'collecting',
      displayMode: 'full_panel',
      isMiniExpanded: false,
      pendingPrompt: normalizedPrompt,
    });
  },

  consumePendingPrompt: () => {
    const prompt = get().pendingPrompt;
    if (prompt) set({ pendingPrompt: null });
    return prompt;
  },

  closeAssistant: () => {
    set({
      phase: 'idle',
      displayMode: 'hidden',
      isMiniExpanded: false,
      isProcessing: false,
      pendingPrompt: null,
    });
  },

  setPhase: (phase) => {
    set({
      phase,
      displayMode: phaseToDisplayMode(phase),
    });
  },

  addMessage: (bubble) => {
    set((state) => ({
      messages: [...state.messages, bubble],
    }));
  },

  setMessages: (messages) => {
    set({ messages });
  },

  setIsProcessing: (v) => {
    set({ isProcessing: v });
  },

  setRouteSummary: (summary) => {
    set({ routeSummary: summary });
  },

  setRoutePresentationText: (text) => {
    set({ routePresentationText: text });
  },

  expandMini: () => {
    set({ isMiniExpanded: true });
  },

  collapseMini: () => {
    set({ isMiniExpanded: false });
  },

  requestRouteModification: (type, payload) => {
    set({ pendingModification: { type, payload } });
  },

  clearRouteModification: () => {
    set({ pendingModification: null });
  },

  reset: () => {
    set({
      phase: 'idle',
      displayMode: 'hidden',
      isMiniExpanded: false,
      messages: [],
      isProcessing: false,
      pendingPrompt: null,
      routeSummary: null,
      routePresentationText: '',
      pendingModification: null,
    });
  },
}));
