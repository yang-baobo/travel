import type {
  PlanningDayConstraint,
  PlanningInputMethod,
  PlanningPatch,
  PlanningPatchRecord,
  PlanningPlaceMention,
  PlanningRequest,
  PlanningRequirementKey,
  DerivedTravelConstraint,
} from '../types/planning';
import { categories } from '../data/categories';

const MAX_LIST = 30;
const MAX_TEXT = 80;
const REQUIREMENT_KEYS: PlanningRequirementKey[] = ['city', 'travel_time', 'people', 'budget', 'pace', 'preferences', 'transport', 'stay_meals', 'constraints', 'attractions'];

export const LIMITED_MOBILITY_POLICY = {
  pace: 'relaxed' as const,
  maxWalkingMinutesPerSegment: 10,
  maxWalkingMinutesPerDay: 60,
  minimumRestMinutes: 20,
  transportPrimary: 'driving' as const,
  transportFallback: 'transit' as const,
};

export function emptyPlanningPatch(source: PlanningInputMethod = 'text'): PlanningPatch {
  return {
    set: {},
    addPreferences: [], removePreferences: [], addCuisines: [], removeCuisines: [],
    addDietaryAllergies: [], removeDietaryAllergies: [], addForbiddenItems: [], removeForbiddenItems: [],
    addMobilityLimitations: [], removeMobilityLimitations: [], derivedConstraints: [], placeMentions: [], dayConstraints: [],
    confirmedRequirements: [], needsClarification: false, clarificationQuestions: [], reply: '', source,
  };
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.normalize('NFKC').trim().slice(0, MAX_TEXT) : '';
}

function list(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(clean).filter(Boolean))).slice(0, MAX_LIST);
}

function bounded(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : undefined;
}

function validClock(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(value.trim());
}

/** Runtime validation for the strict, fact-free patch returned by GLM. */
export function validatePlanningPatch(value: unknown, source: PlanningInputMethod = 'text'): PlanningPatch {
  const base = emptyPlanningPatch(source);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('PlanningPatch 必须是对象');
  const raw = value as Record<string, unknown>;
  const allowed = new Set(['set', 'addPreferences', 'removePreferences', 'addCuisines', 'removeCuisines', 'addDietaryAllergies', 'removeDietaryAllergies', 'addForbiddenItems', 'removeForbiddenItems', 'addMobilityLimitations', 'removeMobilityLimitations', 'derivedConstraints', 'placeMentions', 'dayConstraints', 'confirmedRequirements', 'needsClarification', 'clarificationQuestions', 'reply', 'transportPlan', 'source']);
  if (Object.keys(raw).some(key => !allowed.has(key))) throw new Error('PlanningPatch 包含协议外字段');
  const setRaw = raw.set && typeof raw.set === 'object' && !Array.isArray(raw.set) ? raw.set as Record<string, unknown> : {};
  const allowedSet = new Set(['travelStartDate', 'days', 'people', 'totalBudget', 'pace', 'mode', 'transportPreference', 'needHotel', 'hotelLevel', 'hotelZone', 'hotelPriceMin', 'hotelPriceMax', 'needLunch', 'needDinner', 'dailyStartTime', 'dailyEndTime', 'noNightActivity', 'maxWalkingMinutesPerDay', 'maxWalkingMinutesPerSegment', 'elderlyMode']);
  if (Object.keys(setRaw).some(key => !allowedSet.has(key))) throw new Error('PlanningPatch.set 包含协议外字段');
  const set: PlanningPatch['set'] = {};
  if (typeof setRaw.travelStartDate === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(setRaw.travelStartDate)) set.travelStartDate = setRaw.travelStartDate;
  const days = bounded(setRaw.days, 1, 15); if (days !== undefined) set.days = days;
  const people = bounded(setRaw.people, 1, 20); if (people !== undefined) set.people = people;
  if (setRaw.totalBudget === null) set.totalBudget = null; else if (typeof setRaw.totalBudget === 'number' && Number.isFinite(setRaw.totalBudget) && setRaw.totalBudget > 0) set.totalBudget = Math.min(10_000_000, setRaw.totalBudget);
  if (setRaw.pace === 'relaxed' || setRaw.pace === 'standard' || setRaw.pace === 'packed') set.pace = setRaw.pace;
  if (setRaw.mode === 'self' || setRaw.mode === 'complete' || setRaw.mode === 'auto') set.mode = setRaw.mode;
  if (setRaw.transportPreference === 'transit' || setRaw.transportPreference === 'driving' || setRaw.transportPreference === 'walking' || setRaw.transportPreference === 'any') set.transportPreference = setRaw.transportPreference;
  for (const key of ['needHotel', 'needLunch', 'needDinner', 'noNightActivity'] as const) if (typeof setRaw[key] === 'boolean') set[key] = setRaw[key];
  for (const key of ['hotelLevel', 'hotelZone'] as const) if (typeof setRaw[key] === 'string') set[key] = clean(setRaw[key]);
  for (const key of ['hotelPriceMin', 'hotelPriceMax'] as const) { const n = bounded(setRaw[key], 0, 100_000); if (n !== undefined) set[key] = n; }
  for (const key of ['maxWalkingMinutesPerDay', 'maxWalkingMinutesPerSegment'] as const) { const n = bounded(setRaw[key], 1, 1_440); if (n !== undefined) set[key] = n; }
  if (typeof setRaw.elderlyMode === 'boolean') set.elderlyMode = setRaw.elderlyMode;
  for (const key of ['dailyStartTime', 'dailyEndTime'] as const) if (validClock(setRaw[key])) set[key] = String(setRaw[key]).trim();

  const mentions: PlanningPlaceMention[] = Array.isArray(raw.placeMentions) ? raw.placeMentions.slice(0, MAX_LIST).flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const entry = item as Record<string, unknown>;
    const name = clean(entry.name);
    if (!name || !['must_visit', 'prefer', 'avoid', 'remove', 'replace'].includes(String(entry.intent))) return [];
    const lockedDay = entry.lockedDay === null || entry.lockedDay === undefined ? null : bounded(entry.lockedDay, 1, 15) ?? null;
    return [{ name, intent: entry.intent as PlanningPlaceMention['intent'], lockedDay, source }];
  }) : [];
  const constraints: PlanningDayConstraint[] = Array.isArray(raw.dayConstraints) ? raw.dayConstraints.slice(0, 15).flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const entry = item as Record<string, unknown>; const day = bounded(entry.day, 1, 15);
    if (day === undefined) return [];
    const result: PlanningDayConstraint = { day };
    if (entry.pace === 'relaxed' || entry.pace === 'standard' || entry.pace === 'packed') result.pace = entry.pace;
    const walk = bounded(entry.maxWalkingMinutes, 1, 1_440); if (walk !== undefined) result.maxWalkingMinutes = walk;
    if (validClock(entry.startTime)) result.startTime = String(entry.startTime).trim();
    if (validClock(entry.endTime)) result.endTime = String(entry.endTime).trim();
    if (typeof entry.areaPreference === 'string') result.areaPreference = clean(entry.areaPreference);
    if (typeof entry.note === 'string') result.note = clean(entry.note);
    return [result];
  }) : [];
  const derivedTypes = new Set(['limited_mobility', 'elderly_companions', 'low_walking', 'avoid_stairs', 'rest_breaks', 'door_to_door_transport', 'accessible_hotel', 'accessible_attraction']);
  const derivedConstraints: DerivedTravelConstraint[] = Array.isArray(raw.derivedConstraints) ? raw.derivedConstraints.slice(0, MAX_LIST).flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const entry = item as Record<string, unknown>;
    const id = clean(entry.id);
    const type = String(entry.type);
    const sourceText = clean(entry.sourceText);
    const explanation = clean(entry.explanation);
    if (!id || !derivedTypes.has(type) || !sourceText || !explanation) return [];
    const derivedSource = entry.source === 'asr' || entry.source === 'realtime' || entry.source === 'preference_settings' ? entry.source : 'text';
    const severity = entry.severity === 'hard' ? 'hard' : 'soft';
    const confidence = typeof entry.confidence === 'number' && Number.isFinite(entry.confidence) ? Math.max(0, Math.min(1, entry.confidence)) : 0.7;
    return [{
      id, type: type as DerivedTravelConstraint['type'], sourceText, source: derivedSource as DerivedTravelConstraint['source'], confidence, severity,
      explanation, assumptions: list(entry.assumptions), requiresConfirmation: entry.requiresConfirmation !== false,
    }];
  }) : [];
  const confirmed = list(raw.confirmedRequirements).filter(item => REQUIREMENT_KEYS.includes(item as PlanningRequirementKey)) as PlanningRequirementKey[];
  let transportPlan: PlanningPatch['transportPlan'];
  if (raw.transportPlan && typeof raw.transportPlan === 'object' && !Array.isArray(raw.transportPlan)) {
    const value = raw.transportPlan as Record<string, unknown>;
    if (value.primary === 'transit' || value.primary === 'driving' || value.primary === 'walking') {
      const fallback = value.fallback === null || value.fallback === undefined || value.fallback === 'transit' || value.fallback === 'driving' || value.fallback === 'walking' ? (value.fallback ?? null) : null;
      transportPlan = { primary: value.primary, fallback, maxTransitMinutes: bounded(value.maxTransitMinutes, 1, 1_440), maxWalkingMinutesPerSegment: bounded(value.maxWalkingMinutesPerSegment, 1, 1_440), reason: clean(value.reason) };
    }
  }
  return {
    ...base, set, addPreferences: list(raw.addPreferences), removePreferences: list(raw.removePreferences),
    addCuisines: list(raw.addCuisines), removeCuisines: list(raw.removeCuisines), addDietaryAllergies: list(raw.addDietaryAllergies),
    removeDietaryAllergies: list(raw.removeDietaryAllergies), addForbiddenItems: list(raw.addForbiddenItems), removeForbiddenItems: list(raw.removeForbiddenItems),
    addMobilityLimitations: list(raw.addMobilityLimitations), removeMobilityLimitations: list(raw.removeMobilityLimitations), derivedConstraints,
    placeMentions: mentions, dayConstraints: constraints, confirmedRequirements: confirmed,
    needsClarification: raw.needsClarification === true,
    clarificationQuestions: list(raw.clarificationQuestions).slice(0, 3),
    reply: clean(raw.reply) || '我已经记下这次修改。', transportPlan, source,
  };
}

function chineseNumber(value: string): number | null {
  const normalized = value.normalize('NFKC');
  if (/^\d+(?:\.\d+)?$/.test(normalized)) return Number(normalized);
  const map: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  if (normalized === '十') return 10;
  if (normalized.startsWith('十') && map[normalized.slice(1)]) return 10 + map[normalized.slice(1)];
  if (normalized.length === 2 && normalized[1] === '十' && map[normalized[0]]) return map[normalized[0]] * 10;
  if (normalized.length === 3 && normalized[1] === '十' && map[normalized[0]] && map[normalized[2]]) return map[normalized[0]] * 10 + map[normalized[2]];
  return map[normalized] ?? null;
}

function parseAmount(text: string, activeKey?: PlanningRequirementKey): number | null {
  const compact = text.replace(/[,，\s]/g, '');
  const bare = compact.match(/^([0-9]+(?:\.[0-9]+)?)$/);
  if (activeKey === 'budget' && bare) return Number(bare[1]);
  const arabic = compact.match(/(?:总预算|预算|花费|费用)[^0-9]{0,8}[¥￥]?([0-9]+(?:\.[0-9]+)?)/)
    || compact.match(/[¥￥]\s*([0-9]+(?:\.[0-9]+)?)/)
    || compact.match(/([0-9]+(?:\.[0-9]+)?)(?:元|块|块钱|吧|左右)/);
  if (arabic) return Number(arabic[1]);
  const wan = compact.match(/([0-9]+(?:\.[0-9]+)?|[一二两三四五六七八九十]+)万(?:元|块|左右|吧)?/);
  if (wan) {
    const value = /^\d/.test(wan[1]) ? Number(wan[1]) : chineseNumber(wan[1]);
    if (value !== null) return value * 10_000;
  }
  const han = compact.match(/(?:预算|总预算|花费|费用)?(?:约|大约|大概|最多|最高)?([一二两三四五六七八九十]+)千?(?:元|块|左右|吧)?/);
  if (han) { const n = chineseNumber(han[1]); return n === null ? null : /千/.test(han[0]) ? n * 1000 : n; }
  return null;
}

function parseDate(text: string, current: string): string | undefined {
  const iso = text.match(/20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}/)?.[0];
  if (iso) { const [y, m, d] = iso.split(/[-/.]/); return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`; }
  const chinese = text.match(/(\d{1,2})月(\d{1,2})[日号]?/);
  if (chinese) return `${current.slice(0, 4)}-${chinese[1].padStart(2, '0')}-${chinese[2].padStart(2, '0')}`;
  return undefined;
}

function numberFromPhrase(value: string): number | null {
  const arabic = value.match(/\d+/)?.[0]; if (arabic) return Number(arabic);
  const han = value.match(/[一二两三四五六七八九十]+/)?.[0]; return han ? chineseNumber(han) : null;
}

function mention(text: string, patterns: Array<[RegExp, PlanningPlaceMention['intent']]>, source: PlanningInputMethod): PlanningPlaceMention[] {
  const result: PlanningPlaceMention[] = [];
  for (const [pattern, intent] of patterns) { const match = text.match(pattern); if (match?.[1]) result.push({ name: match[1].replace(/[“”"「」]/g, '').trim(), intent, lockedDay: null, source }); }
  return result;
}

/** Deterministic fallback used when GLM is unavailable or returns an invalid patch. */
export function buildLocalPlanningPatch(text: string, request: PlanningRequest, source: PlanningInputMethod = 'text', activeKey?: PlanningRequirementKey): PlanningPatch {
  const answer = text.normalize('NFKC').trim();
  const patch = emptyPlanningPatch(source);
  const set = patch.set;
  const days = answer.match(/(?:玩|游|旅行)?\s*(\d+|[一二两三四五六七八九十]+)\s*天/); if (days) set.days = Math.max(1, Math.min(15, numberFromPhrase(days[1]) || 1));
  const date = parseDate(answer, request.preferenceSnapshot.travelStartDate); if (date) set.travelStartDate = date;
  if (/下周|下个星期/.test(answer)) { const base = new Date(`${request.preferenceSnapshot.travelStartDate}T12:00:00`); base.setDate(base.getDate() + 7); set.travelStartDate = base.toISOString().slice(0, 10); }
  const family = answer.match(/一家\s*([一二两三四五六七八九十\d]+)口/); const adults = answer.match(/([一二两三四五六七八九十\d]+)个?大人/); const children = answer.match(/([一二两三四五六七八九十\d]+)个?小?孩/);
  const count = family ? numberFromPhrase(family[1]) : (adults || children ? (numberFromPhrase(adults?.[1] || '') || 0) + (numberFromPhrase(children?.[1] || '') || 0) : numberFromPhrase(answer.match(/(\d+|[一二两三四五六七八九十]+)\s*(?:人|位)/)?.[1] || ''));
  if (count) set.people = Math.max(1, Math.min(20, count));
  if (!count && activeKey === 'people' && /^\d{1,2}$/.test(answer)) set.people = Math.max(1, Math.min(20, Number(answer)));
  if (!count && /(?:我|我们).*(?:父母|爸妈|爸爸妈妈)/.test(answer)) set.people = 3;
  if (/预算\s*(?:灵活|不限)|不限预算|预算随意/.test(answer)) set.totalBudget = null; else { const amount = parseAmount(answer, activeKey); if (amount && (activeKey === 'budget' || /[¥￥]|预算|花费|费用|\d+\s*(?:元|块|吧|左右)|[一二两三四五六七八九十]+千|\d+(?:\.\d+)?万/.test(answer))) set.totalBudget = amount; }
  if (/轻松|慢慢|松弛/.test(answer)) set.pace = 'relaxed'; else if (/紧凑|特种兵|密集/.test(answer)) set.pace = 'packed'; else if (/标准|正常节奏/.test(answer)) set.pace = 'standard';
  const categoryNames = categories.filter(category => answer.includes(category.name) || (category.id === 'cat03' && /历史|建筑|文化/.test(answer)) || (category.id === 'cat02' && /自然|生态|公园/.test(answer)) || (category.id === 'cat05' && /美食|餐厅|吃/.test(answer))).map(category => category.name);
  patch.addPreferences.push(...categoryNames);
  const cuisines = ['粤菜', '湘菜', '川菜', '海鲜', '日料', '西餐', '火锅', '小吃', '茶餐厅', '素食'].filter(item => answer.includes(item));
  patch.addCuisines.push(...cuisines);
  if (/经济型|便宜酒店/.test(answer)) set.hotelLevel = 'budget'; else if (/舒适型|中档酒店/.test(answer)) set.hotelLevel = 'mid'; else if (/豪华|五星/.test(answer)) set.hotelLevel = 'luxury';
  if (/地铁为主|公交为主|公交地铁/.test(answer)) { set.transportPreference = 'transit'; patch.transportPlan = undefined; }
  else if (/地铁|公交/.test(answer)) set.transportPreference = 'transit';
  else if (/打车|出租|自驾|开车/.test(answer)) set.transportPreference = 'driving';
  else if (/步行|走路/.test(answer)) set.transportPreference = 'walking';
  if (/地铁为主.*(?:打车|出租)|太远.*(?:打车|出租)|混合交通|AI.*混合/.test(answer)) {
    set.transportPreference = 'any';
    patch.transportPlan = { primary: 'transit', fallback: 'driving', maxTransitMinutes: request.preferenceSnapshot.transportRule.maxTransitMinutes, reason: '用户要求地铁优先，过远时打车' };
  }
  if (/不要住酒店|不住酒店|无需酒店|当天往返/.test(answer)) set.needHotel = false; else if (/需要酒店|住酒店|安排住宿/.test(answer)) set.needHotel = true;
  if (/不要午餐|不安排午餐|不吃午餐/.test(answer)) set.needLunch = false; else if (/午餐|中午吃/.test(answer)) set.needLunch = true;
  if (/不要晚餐|不安排晚餐|不吃晚餐/.test(answer)) set.needDinner = false; else if (/晚餐|晚上吃/.test(answer)) set.needDinner = true;
  if (/不安排夜间|不要夜间|晚上不出门|不玩夜景/.test(answer)) set.noNightActivity = true;
  const walking = answer.match(/(?:每天|每日)(?:最多|不超过|不要超过)\s*(\d+)\s*分钟/); if (walking) set.maxWalkingMinutesPerDay = Number(walking[1]);
  const segmentWalk = answer.match(/(?:单段|一段|每段)(?:最多|不超过|不要超过)\s*(\d+)\s*分钟/); if (segmentWalk) set.maxWalkingMinutesPerSegment = Number(segmentWalk[1]);
  const dayWalk = answer.match(/第\s*(\d+|[一二两三四五六七八九十]+)\s*天.*?(?:少走|少步行|走路少)/); if (dayWalk) patch.dayConstraints.push({ day: numberFromPhrase(dayWalk[1]) || 1, maxWalkingMinutes: Math.min(request.hardConstraints.maxWalkingMinutesPerDay, 60), note: '用户要求该天少走路', source } as PlanningDayConstraint);
  const dayTime = answer.match(/第\s*(\d+|[一二两三四五六七八九十]+)\s*天.*?(\d{1,2}[:：]\d{2})/); if (dayTime) patch.dayConstraints.push({ day: numberFromPhrase(dayTime[1]) || 1, note: answer.slice(0, MAX_TEXT), source } as PlanningDayConstraint);
  if (/花生过敏/.test(answer)) patch.addDietaryAllergies.push('花生');
  const allergy = answer.match(/([\u4e00-\u9fa5A-Za-z]{1,12})过敏/); if (allergy && !patch.addDietaryAllergies.includes(allergy[1])) patch.addDietaryAllergies.push(allergy[1]);
  const mobilitySignal = /膝盖|轮椅|行动不便|腿脚(?:不太好|不好|不便)?|走路不便|带父母|带老人|老人同行|长辈/.test(answer);
  if (mobilitySignal) {
    const mobilityText = /父母|爸妈|爸爸妈妈/.test(answer) ? '两位同行父母腿脚不便' : answer.slice(0, MAX_TEXT);
    patch.addMobilityLimitations.push(mobilityText);
    set.elderlyMode = true;
    set.pace = 'relaxed';
    set.transportPreference = 'any';
    set.maxWalkingMinutesPerDay = Math.min(request.hardConstraints.maxWalkingMinutesPerDay, LIMITED_MOBILITY_POLICY.maxWalkingMinutesPerDay);
    set.maxWalkingMinutesPerSegment = Math.min(request.hardConstraints.maxWalkingMinutesPerSegment, LIMITED_MOBILITY_POLICY.maxWalkingMinutesPerSegment);
    patch.transportPlan = { primary: LIMITED_MOBILITY_POLICY.transportPrimary, fallback: LIMITED_MOBILITY_POLICY.transportFallback, maxWalkingMinutesPerSegment: LIMITED_MOBILITY_POLICY.maxWalkingMinutesPerSegment, reason: '行动能力受限，优先门到门交通并减少步行换乘' };
    const derived = (type: DerivedTravelConstraint['type'], explanation: string, severity: DerivedTravelConstraint['severity'] = 'soft'): DerivedTravelConstraint => ({
      id: `mobility-${type}`,
      type,
      sourceText: answer.slice(0, MAX_TEXT),
      source,
      confidence: 0.92,
      severity,
      explanation,
      assumptions: ['未推断具体疾病或是否使用轮椅', '景区内部步行信息仍需真实数据核验'],
      requiresConfirmation: true,
    });
    patch.derivedConstraints.push(
      derived('limited_mobility', '同行者行动能力受限，路线需要降低步行和体力负担', 'hard'),
      derived('elderly_companions', '同行包含需要更多休息的父母或长辈'),
      derived('low_walking', `单段步行收紧至 ${LIMITED_MOBILITY_POLICY.maxWalkingMinutesPerSegment} 分钟、每天最多 ${LIMITED_MOBILITY_POLICY.maxWalkingMinutesPerDay} 分钟`, 'hard'),
      derived('avoid_stairs', '优先避开长阶梯、陡坡和高体力项目'),
      derived('rest_breaks', `每连续活动后预留至少 ${LIMITED_MOBILITY_POLICY.minimumRestMinutes} 分钟缓冲`),
      derived('door_to_door_transport', '优先打车或少换乘交通，减少站点与景区入口之间的步行'),
      derived('accessible_hotel', '酒店优先选择电梯和行动便利信息可验证的结果'),
      derived('accessible_attraction', '景点优先选择入口、观光车或无障碍信息更明确的结果'),
    );
  }
  const mentions = [
    ...mention(answer, [[/(?:一定要去|一定去|必须去|想去|要去)\s*[“"]?([^，,。；、\s“”"]+)/, 'must_visit'], [/([^，,。；、\s“”"]+?)(?:一定要去|一定去|必须去)/, 'must_visit'], [/(?:不要|不用去|不去|排除)\s*[“"]?([^，,。；、\s“”"]+)/, 'avoid'], [/([^，,。；、\s“”"]+?)(?:不要去|不用去|不去|排除)/, 'avoid'], [/(?:换掉|替换)\s*[“"]?([^，,。；、\s“”"]+)/, 'replace']], source),
  ];
  patch.placeMentions.push(...mentions);
  const dayLock = answer.match(/把\s*[“"]?([^，,。；、“”"]+)[”"]?\s*放到第\s*(\d+)\s*天/); if (dayLock) patch.placeMentions.push({ name: dayLock[1].trim(), intent: 'must_visit', lockedDay: Number(dayLock[2]), source });
  if (set.travelStartDate || set.days) patch.confirmedRequirements.push('travel_time');
  if (set.people) patch.confirmedRequirements.push('people'); if (set.totalBudget !== undefined) patch.confirmedRequirements.push('budget');
  if (set.pace) patch.confirmedRequirements.push('pace'); if (set.transportPreference) patch.confirmedRequirements.push('transport');
  if (set.needHotel !== undefined || set.needLunch !== undefined || set.needDinner !== undefined) patch.confirmedRequirements.push('stay_meals');
  if (set.noNightActivity !== undefined || patch.addDietaryAllergies.length || patch.addMobilityLimitations.length || set.maxWalkingMinutesPerDay || set.maxWalkingMinutesPerSegment || /没有特殊|无特殊|无.*限制|无.*忌口/.test(answer)) patch.confirmedRequirements.push('constraints');
  if (patch.placeMentions.length) patch.confirmedRequirements.push('attractions');
  if (patch.addPreferences.length || patch.addCuisines.length || set.hotelLevel) patch.confirmedRequirements.push('preferences');
  patch.reply = patch.confirmedRequirements.length
    ? `已记下：${Array.from(new Set(patch.confirmedRequirements)).map(key => key === 'budget' ? ('总预算 ¥' + (set.totalBudget ?? '灵活')) : key).join('、')}。`
    : '我已保留这句话，正在继续理解你的路线要求。';
  patch.needsClarification = !patch.confirmedRequirements.length;
  patch.clarificationQuestions = patch.needsClarification ? ['请告诉我出发日期、天数、人数或预算中的任一项，我就能继续规划。'] : [];
  return patch;
}

function unique<T>(items: T[]): T[] { return Array.from(new Set(items)); }
function normalizedName(value: string): string { return value.normalize('NFKC').replace(/^北京市/, '').replace(/[\s（）()·•—\-]/g, '').toLowerCase(); }
function mergeConstraint(current: PlanningDayConstraint[], incoming: PlanningDayConstraint[]): PlanningDayConstraint[] {
  const byDay = new Map(current.map(item => [item.day, { ...item }]));
  incoming.forEach(item => { const old = byDay.get(item.day) || { day: item.day }; byDay.set(item.day, { ...old, ...item, maxWalkingMinutes: old.maxWalkingMinutes === undefined ? item.maxWalkingMinutes : item.maxWalkingMinutes === undefined ? old.maxWalkingMinutes : Math.min(old.maxWalkingMinutes, item.maxWalkingMinutes) }); });
  return [...byDay.values()].sort((a, b) => a.day - b.day);
}

export function applyPlanningPatch(request: PlanningRequest, patch: PlanningPatch, sourceText = ''): PlanningRequest {
  const now = new Date().toISOString();
  const next: PlanningRequest = {
    ...request,
    preferenceSnapshot: { ...request.preferenceSnapshot, hotelPriceRange: { ...request.preferenceSnapshot.hotelPriceRange }, transportRule: { ...request.preferenceSnapshot.transportRule } },
    hardConstraints: JSON.parse(JSON.stringify(request.hardConstraints)),
    revision: (request.revision || 0) + 1,
    excludedPlaceIds: unique(request.excludedPlaceIds || []),
    unresolvedPlaceMentions: [...(request.unresolvedPlaceMentions || [])],
    dayConstraints: [...(request.dayConstraints || [])],
  };
  const set = patch.set;
  if (set.travelStartDate) next.preferenceSnapshot.travelStartDate = set.travelStartDate;
  if (set.days !== undefined) next.days = set.days; if (set.people !== undefined) next.people = set.people; if (set.totalBudget !== undefined) next.totalBudget = set.totalBudget; if (set.pace) next.pace = set.pace; if (set.mode) next.mode = set.mode;
  if (set.transportPreference) next.preferenceSnapshot.transportPreference = set.transportPreference;
  if (set.needHotel !== undefined) next.preferenceSnapshot.needHotel = set.needHotel; if (set.needLunch !== undefined) next.preferenceSnapshot.needLunch = set.needLunch; if (set.needDinner !== undefined) next.preferenceSnapshot.needDinner = set.needDinner;
  if (set.hotelLevel) next.preferenceSnapshot.hotelLevel = set.hotelLevel; if (set.hotelZone) next.preferenceSnapshot.hotelZone = set.hotelZone;
  if (set.hotelPriceMin !== undefined || set.hotelPriceMax !== undefined) next.preferenceSnapshot.hotelPriceRange = { min: set.hotelPriceMin ?? next.preferenceSnapshot.hotelPriceRange.min, max: set.hotelPriceMax ?? next.preferenceSnapshot.hotelPriceRange.max };
  if (set.dailyStartTime) next.preferenceSnapshot.dailyStartTime = set.dailyStartTime; if (set.dailyEndTime) next.preferenceSnapshot.dailyEndTime = set.dailyEndTime;
  if (set.elderlyMode === true) next.preferenceSnapshot.elderlyMode = true;
  // Safety rules only tighten. Removing one requires an explicit, separately-confirmed UI action.
  if (set.noNightActivity === true) next.hardConstraints.noNightActivity = true;
  if (set.maxWalkingMinutesPerDay !== undefined) next.hardConstraints.maxWalkingMinutesPerDay = Math.min(next.hardConstraints.maxWalkingMinutesPerDay, set.maxWalkingMinutesPerDay);
  if (set.maxWalkingMinutesPerSegment !== undefined) next.hardConstraints.maxWalkingMinutesPerSegment = Math.min(next.hardConstraints.maxWalkingMinutesPerSegment, set.maxWalkingMinutesPerSegment);
  const merge = (old: string[], add: string[], remove: string[]) => unique([...old.filter(item => !remove.includes(item)), ...add]).slice(0, MAX_LIST);
  next.preferenceSnapshot.selectedCategories = merge(next.preferenceSnapshot.selectedCategories, patch.addPreferences.map(item => categories.find(category => category.name === item)?.id || item), patch.removePreferences);
  next.preferenceSnapshot.cuisines = merge(next.preferenceSnapshot.cuisines, patch.addCuisines, patch.removeCuisines) as typeof next.preferenceSnapshot.cuisines;
  next.hardConstraints.dietaryAllergies = merge(next.hardConstraints.dietaryAllergies, patch.addDietaryAllergies, patch.removeDietaryAllergies);
  next.hardConstraints.forbidden = merge(next.hardConstraints.forbidden, patch.addForbiddenItems, patch.removeForbiddenItems);
  next.hardConstraints.mobilityLimitations = merge(next.hardConstraints.mobilityLimitations, patch.addMobilityLimitations, patch.removeMobilityLimitations);
  const existingDerived = next.derivedConstraints || [];
  const derivedById = new Map(existingDerived.map(item => [item.id, item]));
  for (const item of patch.derivedConstraints || []) derivedById.set(item.id, item);
  next.derivedConstraints = [...derivedById.values()].slice(-MAX_LIST);
  const byName = new Map((next.unresolvedPlaceMentions || []).map(item => [normalizedName(item.name), item]));
  for (const item of patch.placeMentions) {
    byName.set(normalizedName(item.name), item);
    const candidate = (next.candidates || []).find(value => normalizedName(value.name) === normalizedName(item.name));
    if (candidate && (item.intent === 'must_visit' || item.intent === 'prefer')) {
      next.mustVisitCandidates = item.intent === 'must_visit' ? unique([...(next.mustVisitCandidates || []), candidate]) : next.mustVisitCandidates;
      next.preferredCandidates = item.intent === 'prefer' ? unique([...(next.preferredCandidates || []), candidate]) : next.preferredCandidates;
    }
    if (candidate && (item.intent === 'avoid' || item.intent === 'remove' || item.intent === 'replace')) next.excludedPlaceIds = unique([...(next.excludedPlaceIds || []), candidate.sourceId]);
  }
  next.unresolvedPlaceMentions = [...byName.values()].slice(0, MAX_LIST);
  next.dayConstraints = mergeConstraint(next.dayConstraints || [], patch.dayConstraints);
  if (patch.transportPlan) next.transportPlan = patch.transportPlan;
  const nextRevision = next.revision || 0;
  const record: PlanningPatchRecord = { patch: { ...patch, appliedAt: now, sessionRevision: nextRevision }, sourceText: sourceText.slice(0, 8000), appliedAt: now, revision: nextRevision };
  next.patchHistory = [...(request.patchHistory || []), record].slice(-50);
  next.preferenceSnapshot.travelReturnDate = (() => { const d = new Date(`${next.preferenceSnapshot.travelStartDate}T12:00:00`); d.setDate(d.getDate() + Math.max(1, next.days - 1)); return d.toISOString().slice(0, 10); })();
  return next;
}
