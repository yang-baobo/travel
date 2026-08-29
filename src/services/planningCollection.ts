import { categories } from '../data/categories';
import type {
  PlanningEntryMode,
  PlanningInputMethod,
  PlanningPace,
  PlanningRequest,
  PlanningRequirementKey,
  PlanningRequirementProgress,
  PlanningSession,
} from '../types/planning';
import { applyPlanningPatch, buildLocalPlanningPatch, emptyPlanningPatch, validatePlanningPatch } from './planningPatch';

export { applyPlanningPatch, buildLocalPlanningPatch, emptyPlanningPatch, validatePlanningPatch } from './planningPatch';

type RequirementDefinition = Pick<PlanningRequirementProgress, 'key' | 'label' | 'required'>;

export const PLANNING_REQUIREMENTS: RequirementDefinition[] = [
  { key: 'city', label: '目的地', required: true },
  { key: 'travel_time', label: '出发日期与天数', required: true },
  { key: 'people', label: '出行人数', required: true },
  { key: 'budget', label: '总预算', required: true },
  { key: 'pace', label: '游玩节奏', required: true },
  { key: 'preferences', label: '旅行偏好', required: true },
  { key: 'transport', label: '交通方式', required: true },
  { key: 'stay_meals', label: '住宿与用餐', required: true },
  { key: 'constraints', label: '过敏与行动限制', required: true },
  { key: 'attractions', label: '想去的景点', required: false },
];

const paceLabel: Record<PlanningPace, string> = { relaxed: '轻松游', standard: '标准游', packed: '紧凑游' };
const transportLabel = { transit: '公交地铁', driving: '驾车/打车', walking: '步行为主', any: '交通方式灵活' } as const;

export function requirementSummary(key: PlanningRequirementKey, request: PlanningRequest): string {
  switch (key) {
    case 'city': return '北京';
    case 'travel_time': return `${request.preferenceSnapshot.travelStartDate} 出发 · ${request.days}天`;
    case 'people': return `${request.people}人`;
    case 'budget': return request.totalBudget ? `总预算 ¥${request.totalBudget}` : '预算灵活';
    case 'pace': return paceLabel[request.pace];
    case 'preferences': {
      const categoryNames = request.preferenceSnapshot.selectedCategories.map(id => categories.find(item => item.id === id)?.name || id);
      const values = [...categoryNames, ...request.preferenceSnapshot.cuisines];
      return values.length ? values.join('、') : request.preferenceSnapshot.hasSetPreferences ? '已保存个人偏好' : '等待设置或告诉 AI';
    }
    case 'transport': return transportLabel[request.preferenceSnapshot.transportPreference];
    case 'stay_meals': {
      const items = [request.preferenceSnapshot.needHotel ? '需要酒店' : '不需要酒店'];
      if (request.preferenceSnapshot.needLunch) items.push('午餐');
      if (request.preferenceSnapshot.needDinner) items.push('晚餐');
      return items.join(' · ');
    }
    case 'constraints': {
      const items = [
        ...request.hardConstraints.dietaryAllergies.map(item => `${item}过敏`),
        ...request.hardConstraints.mobilityLimitations,
        request.hardConstraints.noNightActivity ? '不安排夜间活动' : '',
      ].filter(Boolean);
      return items.length ? items.join(' · ') : '无特殊限制';
    }
    case 'attractions': return request.candidates.length ? request.candidates.map(item => item.name).join('、') : '由 AI 推荐真实景点';
  }
}

function inferredKeys(request: PlanningRequest, entryMode: PlanningEntryMode): Set<PlanningRequirementKey> {
  const text = request.userInput;
  const keys = new Set<PlanningRequirementKey>(['city']);
  if (/\d+\s*天|出发|返程|到北京/.test(text)) keys.add('travel_time');
  if (/\d+\s*(人|位)|一个人|独自|家庭|亲子|父母/.test(text)) keys.add('people');
  if (/[¥￥]\s*\d+|\d+\s*(元|块)|预算|不限预算/.test(text)) keys.add('budget');
  if (/轻松|慢慢|松弛|标准|紧凑|特种兵|节奏/.test(text)) keys.add('pace');
  if (/喜欢|偏好|想看|想逛|想吃|建筑|历史|文化|自然|咖啡|美食|亲子|艺术|购物/.test(text)) keys.add('preferences');
  if (/地铁|公交|打车|出租|自驾|步行|交通/.test(text)) keys.add('transport');
  if (/酒店|住宿|住店|不住|当天往返|午餐|晚餐|吃饭/.test(text)) keys.add('stay_meals');
  if (/过敏|忌口|轮椅|膝盖|行动|老人|父母|夜间|没有.{0,3}(限制|忌口)/.test(text)) keys.add('constraints');
  if (request.preferenceSnapshot.hasSetPreferences) {
    ['preferences', 'transport', 'stay_meals', 'constraints'].forEach(key => keys.add(key as PlanningRequirementKey));
  }
  if (entryMode === 'selected_places' && request.candidates.length) keys.add('attractions');
  return keys;
}

export function buildPlanningRequirements(
  request: PlanningRequest,
  entryMode: PlanningEntryMode,
  additionallyConfirmed: PlanningRequirementKey[] = [],
): PlanningRequirementProgress[] {
  const confirmed = inferredKeys(request, entryMode);
  additionallyConfirmed.forEach(key => confirmed.add(key));
  return PLANNING_REQUIREMENTS.map(definition => ({
    ...definition,
    status: confirmed.has(definition.key) ? 'confirmed' : 'missing',
    summary: requirementSummary(definition.key, request),
    source: confirmed.has(definition.key)
      ? definition.key === 'attractions' ? 'home_selection'
        : request.preferenceSnapshot.hasSetPreferences && ['preferences', 'transport', 'stay_meals', 'constraints'].includes(definition.key)
          ? 'preference_settings'
          : request.inputMethod
      : null,
  }));
}

export function missingRequiredRequirements(session: PlanningSession): PlanningRequirementProgress[] {
  return session.requirements.filter(item => item.required && item.status !== 'confirmed');
}

export function nextRequirement(session: PlanningSession): PlanningRequirementProgress | null {
  return missingRequiredRequirements(session)[0] || null;
}

export function planningQuestion(key: PlanningRequirementKey, request: PlanningRequest): string {
  switch (key) {
    case 'travel_time': return `计划暂定 ${request.preferenceSnapshot.travelStartDate} 出发、玩 ${request.days} 天，可以吗？也可以直接告诉我新的日期和天数。`;
    case 'people': return `这次一共几个人出行？目前暂记为 ${request.people} 人。`;
    case 'budget': return `整趟旅行的总预算大约是多少？目前暂记为 ${request.totalBudget ? `¥${request.totalBudget}` : '预算灵活'}。`;
    case 'pace': return `你希望轻松一点、标准节奏，还是尽量多看几个地方？目前是${paceLabel[request.pace]}。`;
    case 'preferences': return '你最喜欢什么体验？例如历史建筑、自然公园、亲子、咖啡或北京美食；也可以进入偏好设置一次选完整。';
    case 'transport': return `主要想坐公交地铁、打车/自驾、步行，还是让 AI 混合安排？目前是${transportLabel[request.preferenceSnapshot.transportPreference]}。`;
    case 'stay_meals': return '这趟需要酒店吗？午餐和晚餐是否都要安排进路线？';
    case 'constraints': return '最后确认一下：有没有过敏、忌口、行动不便、长辈同行、少走路或不安排夜间活动等硬性限制？没有也请告诉我。';
    case 'attractions': return '有没有一定想去的景点？这是可选项，不选的话我会根据偏好查询高德真实景点。';
    case 'city': return '目的地已设为北京。';
  }
}

function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + Math.max(1, days - 1));
  return date.toISOString().slice(0, 10);
}

export function applyPlanningAnswer(
  request: PlanningRequest,
  activeKey: PlanningRequirementKey,
  text: string,
  inputMethod: PlanningInputMethod = 'text',
): { request: PlanningRequest; confirmedKeys: PlanningRequirementKey[] } {
  // Keep this synchronous API for existing callers, but use the same strict
  // patch parser as the asynchronous GLM path. This fixes colloquial inputs
  // such as “6000吧” and preserves place/constraint intent for later resolve.
  const parsedPatch = buildLocalPlanningPatch(text, request, inputMethod, activeKey);
  const patchedRequest = applyPlanningPatch(
    { ...request, userInput: [request.userInput.trim(), `补充：${text.trim()}`].filter(Boolean).join('\n') },
    parsedPatch,
    text,
  );
  const parsedConfirmed = new Set<PlanningRequirementKey>(parsedPatch.confirmedRequirements);
  if (/按当前|就这样|可以|没问题|确认|默认/.test(text)) parsedConfirmed.add(activeKey);
  return { request: patchedRequest, confirmedKeys: [...parsedConfirmed] };

  /*
     Legacy parser retained below for source compatibility; all execution now
     returns through the strict patch path above.
  const answer = text.trim();
  let next: PlanningRequest = {
    ...request,
    userInput: [request.userInput.trim(), `补充：${answer}`].filter(Boolean).join('\n'),
    preferenceSnapshot: { ...request.preferenceSnapshot },
    hardConstraints: JSON.parse(JSON.stringify(request.hardConstraints)),
  };
  const confirmed = new Set<PlanningRequirementKey>();
  const acceptsCurrent = /按当前|就这样|可以|没问题|确认|默认/.test(answer);
  const days = answer.match(/(\d+)\s*天/);
  const isoDates = answer.match(/(20\d{2}-\d{1,2}-\d{1,2})/g);
  if (days) next.days = Math.max(1, Math.min(15, Number(days[1])));
  if (isoDates?.[0]) next.preferenceSnapshot.travelStartDate = isoDates[0].split('-').map((part, index) => index ? part.padStart(2, '0') : part).join('-');
  if (days || isoDates?.[0] || (activeKey === 'travel_time' && acceptsCurrent)) {
    next.preferenceSnapshot.travelReturnDate = addDays(next.preferenceSnapshot.travelStartDate, next.days);
    confirmed.add('travel_time');
  }

  const people = answer.match(/(\d+)\s*(?:人|位)/);
  if (people) next.people = Math.max(1, Math.min(20, Number(people[1])));
  else if (/一个人|独自/.test(answer)) next.people = 1;
  else if (/家庭/.test(answer)) next.people = Math.max(3, next.people);
  if (people || /一个人|独自|家庭/.test(answer) || (activeKey === 'people' && acceptsCurrent)) confirmed.add('people');

  if (/预算.{0,4}(不限|灵活)|不限预算/.test(answer)) {
    next.totalBudget = null;
    confirmed.add('budget');
  } else if (/[¥￥]|\d+\s*(?:元|块)|预算/.test(answer)) {
    const normalizedAnswer = answer.replace(/[,，]/g, '');
    const budgetMatch = normalizedAnswer.match(/[¥￥]\s*(\d+(?:\.\d+)?)/)
      || normalizedAnswer.match(/(?:总预算|预算)[^\d]{0,6}(\d+(?:\.\d+)?)/)
      || normalizedAnswer.match(/(\d+(?:\.\d+)?)\s*(?:元|块)/);
    const amount = budgetMatch ? Number(budgetMatch[1]) : null;
    if (amount && amount > 0) {
      next.totalBudget = amount;
      confirmed.add('budget');
    }
  } else if (activeKey === 'budget' && acceptsCurrent) confirmed.add('budget');

  if (/轻松|慢慢|松弛/.test(answer)) next.pace = 'relaxed';
  else if (/紧凑|特种兵|多看/.test(answer)) next.pace = 'packed';
  else if (/标准|正常/.test(answer)) next.pace = 'standard';
  if (/轻松|慢慢|松弛|紧凑|特种兵|多看|标准|正常/.test(answer) || (activeKey === 'pace' && acceptsCurrent)) confirmed.add('pace');

  if (/地铁|公交/.test(answer)) next.preferenceSnapshot.transportPreference = 'transit';
  else if (/打车|出租|自驾|开车/.test(answer)) next.preferenceSnapshot.transportPreference = 'driving';
  else if (/步行|走路/.test(answer)) next.preferenceSnapshot.transportPreference = 'walking';
  else if (/混合|都可以|AI.{0,3}安排/.test(answer)) next.preferenceSnapshot.transportPreference = 'any';
  if (/地铁|公交|打车|出租|自驾|开车|步行|走路|混合|都可以|AI.{0,3}安排/.test(answer) || (activeKey === 'transport' && acceptsCurrent)) confirmed.add('transport');

  if (/不住|不要酒店|无需酒店|当天往返/.test(answer)) next.preferenceSnapshot.needHotel = false;
  else if (/酒店|住宿|住店/.test(answer)) next.preferenceSnapshot.needHotel = true;
  if (/不要午餐|不吃午餐/.test(answer)) next.preferenceSnapshot.needLunch = false;
  else if (/午餐|中午.{0,3}吃/.test(answer)) next.preferenceSnapshot.needLunch = true;
  if (/不要晚餐|不吃晚餐/.test(answer)) next.preferenceSnapshot.needDinner = false;
  else if (/晚餐|晚上.{0,3}吃/.test(answer)) next.preferenceSnapshot.needDinner = true;
  if (/酒店|住宿|住店|不住|当天往返|午餐|晚餐|两餐|三餐/.test(answer) || (activeKey === 'stay_meals' && acceptsCurrent)) confirmed.add('stay_meals');

  const categoryMatches = categories.filter(category => answer.includes(category.name) || (category.name === '文化历史' && /历史|建筑|文化/.test(answer)) || (category.name === '自然生态' && /自然|公园/.test(answer)));
  if (categoryMatches.length) {
    next.preferenceSnapshot.selectedCategories = Array.from(new Set([...next.preferenceSnapshot.selectedCategories, ...categoryMatches.map(item => item.id)]));
  }
  const cuisineMatches = ['粤菜', '湘菜', '川菜', '海鲜', '日料', '西餐', '火锅', '小吃', '茶餐厅', '素食'].filter(item => answer.includes(item));
  if (cuisineMatches.length) next.preferenceSnapshot.cuisines = Array.from(new Set([...next.preferenceSnapshot.cuisines, ...cuisineMatches]));
  if (/经济型|便宜酒店/.test(answer)) next.preferenceSnapshot.hotelLevel = 'budget';
  else if (/舒适型|中档酒店/.test(answer)) next.preferenceSnapshot.hotelLevel = 'mid';
  else if (/豪华|五星/.test(answer)) next.preferenceSnapshot.hotelLevel = 'luxury';
  if (/喜欢|偏好|想看|想逛|想吃|历史|建筑|文化|自然|公园|亲子|咖啡|美食|艺术|购物|经济型|舒适型|豪华|五星/.test(answer) || (activeKey === 'preferences' && (answer.length >= 2 || acceptsCurrent))) confirmed.add('preferences');

  if (/不安排夜间|不要夜间|晚上不出门/.test(answer)) next.hardConstraints.noNightActivity = true;
  const allergy = answer.match(/([\u4e00-\u9fa5A-Za-z]{1,8})过敏/);
  if (allergy) next.hardConstraints.dietaryAllergies = Array.from(new Set([...next.hardConstraints.dietaryAllergies, allergy[1]]));
  if (/膝盖|轮椅|行动不便|腿脚/.test(answer)) next.hardConstraints.mobilityLimitations = Array.from(new Set([...next.hardConstraints.mobilityLimitations, answer]));
  if (/没有|无特殊|过敏|忌口|轮椅|膝盖|行动|腿脚|长辈|老人|父母|夜间|少走路/.test(answer) || (activeKey === 'constraints' && acceptsCurrent)) confirmed.add('constraints');

  if (activeKey === 'preferences' && answer.length >= 2) confirmed.add('preferences');
  if (activeKey === 'constraints' && answer.length >= 2) confirmed.add('constraints');
  return { request: next, confirmedKeys: [...confirmed] };
  */
}

export function quickAnswersFor(key: PlanningRequirementKey, request: PlanningRequest): string[] {
  switch (key) {
    case 'travel_time': return [`按当前日期玩${request.days}天`, '3天', '5天'];
    case 'people': return ['1人', '2人', '家庭4人'];
    case 'budget': return ['总预算¥3000', '总预算¥5000', '预算灵活'];
    case 'pace': return ['轻松游', '标准游', '紧凑多看'];
    case 'preferences': return ['历史建筑和北京美食', '自然公园和咖啡', '亲子体验'];
    case 'transport': return ['公交地铁为主', '打车为主', 'AI混合安排'];
    case 'stay_meals': return ['需要酒店，安排午餐晚餐', '不住酒店，安排两餐', '按当前设置'];
    case 'constraints': return ['没有特殊限制', '带长辈，少走路', '不安排夜间活动'];
    default: return [];
  }
}

export function collectionProgress(session: PlanningSession): { confirmed: number; total: number } {
  const required = session.requirements.filter(item => item.required);
  return { confirmed: required.filter(item => item.status === 'confirmed').length, total: required.length };
}
