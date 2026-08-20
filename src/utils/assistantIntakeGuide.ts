import type { AIAction } from './chatService';
import { categories } from '../data/categories';
import { usePreferenceStore } from '../store/usePreferenceStore';
import {
  AssistantSessionDraft,
  AssistantSessionSlot,
  AssistantSessionState,
  ChatBubble,
} from '../store/useAssistantStore';

interface IntakeGuideOptions {
  latestUserText: string;
  actions: AIAction[];
  messages: ChatBubble[];
  previousSession?: AssistantSessionState | null;
}

export interface IntakeReplyResult {
  reply: string;
  session: AssistantSessionState;
  questionSlot: AssistantSessionSlot | null;
}

const minimumRequiredSlots: AssistantSessionSlot[] = [
  'selectedCity',
  'travelDays',
  'groupSize',
  'selectedCategories',
  'budgetPref',
];

const slotPriority: AssistantSessionSlot[] = [
  'travelDays',
  'selectedCity',
  'selectedCategories',
  'budgetPref',
  'travelPace',
  'elderlyMode',
  'groupSize',
  'hotelPref',
  'transportPref',
  'cuisinePrefs',
  'departureCity',
];

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function buildUserTranscript(messages: ChatBubble[], latestUserText: string): string {
  const history = messages
    .filter((message) => message.role === 'user')
    .map((message) => message.text)
    .join(' ');
  return `${history} ${latestUserText}`.trim();
}

function hasAction(actions: AIAction[], type: string): boolean {
  return actions.some((action) => action.type === type);
}

function inferTravelPace(transcript: string): 'slow' | 'balanced' | 'packed' | undefined {
  if (/(轻松一点|别太赶|慢一点|慢节奏|悠闲|散心|少走路|不累)/.test(transcript)) {
    return 'slow';
  }
  if (/(紧凑一点|多玩几个|安排满一点|高效一点)/.test(transcript)) {
    return 'packed';
  }
  if (/(正常节奏|适中节奏|别太松也别太赶|均衡一点)/.test(transcript)) {
    return 'balanced';
  }
  return undefined;
}

function inferElderlyScenario(transcript: string): boolean | undefined {
  if (/(和老伴|跟老伴|爸妈|老人|长辈|老年|年纪大了)/.test(transcript)) {
    return true;
  }
  return undefined;
}

function extractDraftFromPreferenceStore(transcript: string): AssistantSessionDraft {
  const prefs = usePreferenceStore.getState();
  const inferredPace = inferTravelPace(transcript);
  const inferredElderly = inferElderlyScenario(transcript);

  return {
    selectedCity: prefs.selectedCity,
    travelDays: prefs.travelDays,
    groupSize: prefs.groupSize,
    selectedCategories: prefs.selectedCategories,
    budgetPref: prefs.budgetPref,
    travelPace:
      inferredPace ??
      (prefs.elderlyMode ? 'slow' : undefined),
    elderlyMode: inferredElderly ?? prefs.elderlyMode,
    needHotel: prefs.needHotel,
    hotelLevelPref: prefs.hotelLevelPref,
    hotelZonePref: prefs.hotelZonePref,
    hotelPriceRange: prefs.hotelPriceRange,
    hotelAmenityPrefs: prefs.hotelAmenityPrefs,
    transportPref: prefs.transportPref,
    walkMaxKm: prefs.transportRule.walkMaxKm,
    defaultTransportMode: prefs.transportRule.defaultMode,
    maxTransitMinutes: prefs.transportRule.maxTransitMinutes,
    maxWalkToStationKm: prefs.transportRule.maxWalkToStationKm,
    cuisinePrefs: prefs.cuisinePrefs,
    needBreakfast: prefs.needBreakfast,
    needLunch: prefs.needLunch,
    needDinner: prefs.needDinner,
    departureCity: prefs.departureCity,
    isInDestCity: prefs.isInDestCity,
  };
}

function buildConfirmedSlots(
  draft: AssistantSessionDraft,
  transcript: string,
  actions: AIAction[],
  previousConfirmedSlots: AssistantSessionSlot[]
): AssistantSessionSlot[] {
  const confirmed = new Set<AssistantSessionSlot>(previousConfirmedSlots);

  if (draft.selectedCity) confirmed.add('selectedCity');
  if (
    previousConfirmedSlots.includes('travelDays') ||
    hasAction(actions, 'set_travel_days') ||
    /([1-7一二两三四五六七])\s*天/.test(transcript)
  ) {
    confirmed.add('travelDays');
  }
  if ((draft.groupSize ?? 0) > 0) confirmed.add('groupSize');
  if (
    previousConfirmedSlots.includes('selectedCategories') ||
    hasAction(actions, 'set_categories') ||
    (draft.selectedCategories?.length ?? 0) > 0 && /(海边|散心|吃喝|文化|历史|轻松|拍照|美食|购物|自然|艺术)/.test(transcript)
  ) {
    confirmed.add('selectedCategories');
  }
  if (
    previousConfirmedSlots.includes('budgetPref') ||
    hasAction(actions, 'set_budget_pref') ||
    (draft.budgetPref && draft.budgetPref !== 'any')
  ) {
    confirmed.add('budgetPref');
  }
  if (previousConfirmedSlots.includes('travelPace') || draft.travelPace) confirmed.add('travelPace');
  if (previousConfirmedSlots.includes('elderlyMode') || draft.elderlyMode) confirmed.add('elderlyMode');
  if (
    draft.needHotel === false ||
    draft.hotelLevelPref && draft.hotelLevelPref !== 'any' ||
    draft.hotelZonePref && draft.hotelZonePref !== 'any' ||
    (draft.hotelAmenityPrefs?.length ?? 0) > 0 ||
    (draft.hotelPriceRange && (draft.hotelPriceRange.min > 0 || draft.hotelPriceRange.max < 2000))
  ) {
    confirmed.add('hotelPref');
  }
  if (
    draft.transportPref && draft.transportPref !== 'any' ||
    (draft.walkMaxKm ?? 0) > 0 ||
    /(少走路|优先打车|少换乘|地铁方便|路线简单)/.test(transcript)
  ) {
    confirmed.add('transportPref');
  }
  if (
    (draft.cuisinePrefs?.length ?? 0) > 0 ||
    hasAction(actions, 'set_need_breakfast') ||
    hasAction(actions, 'set_need_lunch') ||
    hasAction(actions, 'set_need_dinner')
  ) {
    confirmed.add('cuisinePrefs');
  }
  if (draft.departureCity || hasAction(actions, 'set_is_in_dest_city')) {
    confirmed.add('departureCity');
  }

  return [...confirmed];
}

function buildMissingSlots(confirmedSlots: AssistantSessionSlot[]): AssistantSessionSlot[] {
  return slotPriority.filter((slot) => !confirmedSlots.includes(slot));
}

function buildLowConfidenceSlots(
  transcript: string,
  draft: AssistantSessionDraft,
  confirmedSlots: AssistantSessionSlot[]
): AssistantSessionSlot[] {
  const lowConfidence = new Set<AssistantSessionSlot>();

  if (confirmedSlots.includes('budgetPref') && /(高品质|舒适一点|品质一点)/.test(transcript) && draft.budgetPref === 'any') {
    lowConfidence.add('budgetPref');
  }

  if (confirmedSlots.includes('travelPace') && /(散心|不累|慢一点)/.test(transcript) && !draft.travelPace) {
    lowConfidence.add('travelPace');
  }

  return [...lowConfidence];
}

function buildSummary(draft: AssistantSessionDraft, confirmedSlots: AssistantSessionSlot[]): string[] {
  const parts: string[] = [];
  const hasCity = confirmedSlots.includes('selectedCity');
  const hasDays = confirmedSlots.includes('travelDays');
  const hasGroup = confirmedSlots.includes('groupSize');
  const hasCategories = confirmedSlots.includes('selectedCategories');
  const hasBudget = confirmedSlots.includes('budgetPref');
  const hasPace = confirmedSlots.includes('travelPace');
  const hasElderly = confirmedSlots.includes('elderlyMode');
  const hasHotel = confirmedSlots.includes('hotelPref');
  const hasCuisine = confirmedSlots.includes('cuisinePrefs');
  const hasDeparture = confirmedSlots.includes('departureCity');

  if (hasCity && hasDays && draft.selectedCity && draft.travelDays) {
    parts.push(`${draft.selectedCity}${draft.travelDays}天`);
  } else if (hasCity && draft.selectedCity) {
    parts.push(`目的地是${draft.selectedCity}`);
  }

  if (hasGroup && draft.groupSize) {
    parts.push(draft.groupSize === 2 ? '2人同行' : `${draft.groupSize}人同行`);
  }

  if (hasCategories && (draft.selectedCategories?.length ?? 0) > 0) {
    const labels = categories
      .filter((category) => draft.selectedCategories?.includes(category.id))
      .map((category) => category.name);
    if (labels.length > 0) {
      parts.push(`偏${labels.join(' + ')}`);
    }
  }

  if (hasBudget && draft.budgetPref === 'low') parts.push('预算偏节省');
  if (hasBudget && draft.budgetPref === 'medium') parts.push('预算适中');
  if (hasBudget && draft.budgetPref === 'high') parts.push('偏高品质');

  if (hasPace && draft.travelPace === 'slow') parts.push('偏轻松慢节奏');
  if (hasPace && draft.travelPace === 'balanced') parts.push('偏适中节奏');
  if (hasPace && draft.travelPace === 'packed') parts.push('偏高效充实行程');

  if (hasElderly && (draft.elderlyMode || (draft.walkMaxKm ?? 99) <= 1)) {
    parts.push('老人友好 / 少走路优先');
  }

  if (hasHotel && draft.hotelLevelPref && draft.hotelLevelPref !== 'any') {
    const hotelTextMap: Record<string, string> = {
      budget: '酒店偏经济型',
      mid: '酒店偏舒适型',
      luxury: '酒店偏高品质',
    };
    if (hotelTextMap[draft.hotelLevelPref]) parts.push(hotelTextMap[draft.hotelLevelPref]);
  }

  if (hasCuisine && (draft.cuisinePrefs?.length ?? 0) > 0) {
    parts.push(`吃的偏${draft.cuisinePrefs?.join('、')}`);
  }

  if (hasDeparture && draft.departureCity && !draft.isInDestCity) {
    parts.push(`从${draft.departureCity}出发`);
  }

  return unique(parts);
}

function buildReadyToGenerate(
  confirmedSlots: AssistantSessionSlot[],
  draft: AssistantSessionDraft
): boolean {
  const minimumSatisfied = minimumRequiredSlots.every((slot) => confirmedSlots.includes(slot));
  const paceSatisfied = confirmedSlots.includes('travelPace') || confirmedSlots.includes('elderlyMode');
  const destinationSatisfied = !!draft.selectedCity;

  return minimumSatisfied && paceSatisfied && destinationSatisfied;
}

function pickNextQuestionSlot(session: AssistantSessionState): AssistantSessionSlot | null {
  for (const slot of slotPriority) {
    if (session.confirmedSlots.includes(slot)) continue;
    if (session.askedSlots.includes(slot) && !session.lowConfidenceSlots.includes(slot)) continue;
    return slot;
  }
  return null;
}

function buildQuestion(slot: AssistantSessionSlot | null): string {
  switch (slot) {
    case 'selectedCity':
      return '第一版城市是北京。您可以告诉我旅行天数、人数和交通偏好。';
    case 'travelDays':
      return '这次大概想玩几天呀？我好把节奏先安排合适。';
    case 'groupSize':
      return '这次一共几位一起去呢？我会按人数安排更合适的路线。';
    case 'selectedCategories':
      return '您更想怎么玩呀？比如海边散心、城市逛逛、文化景点，或者轻松吃吃喝喝。';
    case 'budgetPref':
      return '预算上您更想省一点、适中舒适，还是偏高品质一些呢？';
    case 'travelPace':
      return '行程上您想轻松慢一点，还是正常节奏就好呀？';
    case 'elderlyMode':
      return '这次我需要优先按老人友好、少走路、少折腾的方式给您安排吗？';
    case 'hotelPref':
      return '住宿这边您更偏向什么样的呢？比如舒适型、安静一点，或者靠近景点、靠近地铁。';
    case 'transportPref':
      return '交通上您更倾向地铁公交、打车，还是尽量少走路、少换乘呢？';
    case 'cuisinePrefs':
      return '吃的方面您有什么偏好或者忌口吗？像海鲜、粤菜、清淡一点这些都可以告诉我。';
    case 'departureCity':
      return '您是已经在目的地了，还是需要从别的城市过去呀？我可以一起考虑出发衔接。';
    default:
      return '您还可以继续补充一点需求，我会边听边帮您调整。';
  }
}

function buildReplyText(session: AssistantSessionState, questionSlot: AssistantSessionSlot | null): string {
  const summaryText =
    session.summary.length > 0
      ? `我目前理解的是：${session.summary.join('，')}。`
      : '我先边听边帮您梳理这次出行。';

  if (session.readyToGenerate && !session.routeDraftGenerated) {
    return `${summaryText}我已经可以先为您生成一版路线了，后面我们还能继续按您的新想法慢慢调整。`;
  }

  return `${summaryText}${buildQuestion(questionSlot)}`;
}

export function buildAssistantSessionState(options: IntakeGuideOptions): AssistantSessionState {
  const transcript = buildUserTranscript(options.messages, options.latestUserText);
  const previousSession = options.previousSession;
  const extractedPreferences = extractDraftFromPreferenceStore(transcript);
  const confirmedSlots = buildConfirmedSlots(
    extractedPreferences,
    transcript,
    options.actions,
    previousSession?.confirmedSlots ?? []
  );
  const missingSlots = buildMissingSlots(confirmedSlots);
  const lowConfidenceSlots = buildLowConfidenceSlots(transcript, extractedPreferences, confirmedSlots);
  const summary = buildSummary(extractedPreferences, confirmedSlots);
  const readyToGenerate = buildReadyToGenerate(confirmedSlots, extractedPreferences);

  return {
    extractedPreferences,
    confirmedSlots,
    missingSlots,
    lowConfidenceSlots,
    summary,
    readyToGenerate,
    routeDraftGenerated: previousSession?.routeDraftGenerated ?? false,
    lastQuestionSlot: previousSession?.lastQuestionSlot ?? null,
    askedSlots: previousSession?.askedSlots ?? [],
  };
}

export function buildAssistantIntakeReply(options: IntakeGuideOptions): IntakeReplyResult {
  const session = buildAssistantSessionState(options);
  const questionSlot = session.readyToGenerate && !session.routeDraftGenerated
    ? null
    : pickNextQuestionSlot(session);

  return {
    reply: buildReplyText(session, questionSlot),
    session,
    questionSlot,
  };
}
