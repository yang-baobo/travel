import type {
  PlanIntent,
  PlanIntentNormalizedRequest,
  PlanningPace,
  PlanningRequest,
} from '../types/planning';

const MODES = ['self', 'complete', 'auto'] as const;
const PACES = ['relaxed', 'standard', 'packed'] as const;
const PROVIDERS = ['remote_glm', 'local_fallback', 'unavailable'] as const;
const TOP_LEVEL_KEYS = new Set(['needsClarification', 'clarificationQuestions', 'normalizedRequest', 'requestPatch', 'explanation', 'provider', 'model']);
const NORMALIZED_KEYS = new Set(['userInput', 'city', 'days', 'people', 'totalBudget', 'pace', 'mode']);
const PATCH_KEYS = new Set(['days', 'people', 'totalBudget', 'pace', 'mode']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteInt(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function isNullableBudget(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value > 0);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string' && item.trim().length > 0);
}

function parseNormalizedRequest(value: unknown): PlanIntentNormalizedRequest | null {
  if (!isRecord(value)) return null;
  if (Object.keys(value).some(key => !NORMALIZED_KEYS.has(key))) return null;
  if (typeof value.userInput !== 'string' || value.userInput.trim().length === 0) return null;
  if (value.city !== '北京') return null;
  if (!isFiniteInt(value.days, 1, 15) || !isFiniteInt(value.people, 1, 20)) return null;
  if (!isNullableBudget(value.totalBudget)) return null;
  if (!PACES.includes(value.pace as PlanningPace)) return null;
  if (!MODES.includes(value.mode as typeof MODES[number])) return null;
  return {
    userInput: value.userInput.trim(),
    city: '北京',
    days: value.days,
    people: value.people,
    totalBudget: value.totalBudget,
    pace: value.pace as PlanningPace,
    mode: value.mode as typeof MODES[number],
  };
}

export function validatePlanIntent(value: unknown): PlanIntent {
  if (!isRecord(value)) throw new Error('PlanIntent 必须是对象');
  if (Object.keys(value).some(key => !TOP_LEVEL_KEYS.has(key))) throw new Error('PlanIntent 包含协议外字段');
  if (typeof value.needsClarification !== 'boolean') throw new Error('PlanIntent.needsClarification 无效');
  if (!isStringArray(value.clarificationQuestions)) throw new Error('PlanIntent.clarificationQuestions 无效');
  const normalizedRequest = parseNormalizedRequest(value.normalizedRequest);
  if (!normalizedRequest) throw new Error('PlanIntent.normalizedRequest 无效');
  if (!isRecord(value.requestPatch)) throw new Error('PlanIntent.requestPatch 无效');
  if (Object.keys(value.requestPatch).some(key => !PATCH_KEYS.has(key))) {
    throw new Error('PlanIntent.requestPatch 包含不允许修改的事实字段');
  }
  if (typeof value.explanation !== 'string' || value.explanation.trim().length === 0) {
    throw new Error('PlanIntent.explanation 无效');
  }
  if (!PROVIDERS.includes(value.provider as typeof PROVIDERS[number])) throw new Error('PlanIntent.provider 无效');
  if (value.model !== null && typeof value.model !== 'string') throw new Error('PlanIntent.model 无效');

  const requestPatch: PlanIntent['requestPatch'] = {};
  if ('days' in value.requestPatch) {
    if (!isFiniteInt(value.requestPatch.days, 1, 15)) throw new Error('PlanIntent.requestPatch.days 无效');
    requestPatch.days = value.requestPatch.days;
  }
  if ('people' in value.requestPatch) {
    if (!isFiniteInt(value.requestPatch.people, 1, 20)) throw new Error('PlanIntent.requestPatch.people 无效');
    requestPatch.people = value.requestPatch.people;
  }
  if ('totalBudget' in value.requestPatch) {
    if (!isNullableBudget(value.requestPatch.totalBudget)) throw new Error('PlanIntent.requestPatch.totalBudget 无效');
    requestPatch.totalBudget = value.requestPatch.totalBudget;
  }
  if ('pace' in value.requestPatch) {
    if (!PACES.includes(value.requestPatch.pace as PlanningPace)) throw new Error('PlanIntent.requestPatch.pace 无效');
    requestPatch.pace = value.requestPatch.pace as PlanningPace;
  }
  if ('mode' in value.requestPatch) {
    if (!MODES.includes(value.requestPatch.mode as typeof MODES[number])) throw new Error('PlanIntent.requestPatch.mode 无效');
    requestPatch.mode = value.requestPatch.mode as typeof MODES[number];
  }

  const questions = value.clarificationQuestions.map(item => item.trim()).slice(0, 3);
  if (value.needsClarification && questions.length === 0) {
    throw new Error('需要澄清时必须提供问题');
  }
  return {
    needsClarification: value.needsClarification,
    clarificationQuestions: questions,
    normalizedRequest,
    requestPatch,
    explanation: value.explanation.trim(),
    provider: value.provider as PlanIntent['provider'],
    model: value.model as string | null,
  };
}

export function buildLocalPlanIntent(request: PlanningRequest, reason: string): PlanIntent {
  const needsClarification = request.userInput.trim().length === 0
    || (request.mode === 'self' && request.candidates.length === 0);
  return {
    needsClarification,
    clarificationQuestions: request.userInput.trim().length === 0
      ? ['这次北京旅行最想获得什么体验？']
      : request.mode === 'self' && request.candidates.length === 0
        ? ['自己选择模式下，请至少选择一个真实地点。']
        : [],
    normalizedRequest: {
      userInput: request.userInput.trim() || '规划北京旅行',
      city: '北京',
      days: request.days,
      people: request.people,
      totalBudget: request.totalBudget,
      pace: request.pace,
      mode: request.mode,
    },
    requestPatch: {},
    explanation: `GLM 当前不可用，已使用本地规则仅规范化现有输入；不会生成地点或价格。${reason ? `（${reason}）` : ''}`,
    provider: 'local_fallback',
    model: null,
  };
}
