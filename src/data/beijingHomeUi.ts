/**
 * 北京首页纯 UI 配置
 *
 * 此文件仅包含与真实业务无关的展示文案、类型定义和 UI 配置。
 * 所有业务数据（景点、酒店、餐厅、行程）必须通过真实 API 获取。
 */

// ============ 类型定义 ============

export type PlannerMode = 'self' | 'complete' | 'auto';

export type CandidateCategory = 'attraction' | 'hotel' | 'food' | 'experience';

export type PlannerCandidate = {
  id: string;
  name: string;
  category: CandidateCategory;
  categoryLabel: string;
  detail: string;
  reason: string;
  imageUrl: string;
  fallbackColors: [string, string];
};

export type PlannerParams = {
  startDate: string;
  endDate: string;
  days: string;
  people: string;
  budget: string;
  pace: string;
};

export type ItineraryPreviewDay = {
  day: string;
  title: string;
  items: string[];
};

// ============ UI 文案配置 ============

function getDefaultStartDate(): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getDefaultEndDate(): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + 4);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const CANDIDATE_CATEGORY_COPY: Record<CandidateCategory, string> = {
  attraction: '景点',
  hotel: '酒店',
  food: '餐厅',
  experience: '体验',
};

export const DEFAULT_PLANNER_PARAMS: PlannerParams = {
  startDate: '',
  endDate: '',
  days: '',
  people: '',
  budget: '',
  pace: '',
};

export const PLANNER_MODE_COPY: Record<PlannerMode, { label: string; description: string; icon: string }> = {
  self: { label: '自己选择', description: '我来挑选想去的地方', icon: 'hand-left-outline' },
  complete: { label: 'AI帮我补全', description: '我选一部分，AI补齐路线', icon: 'construct-outline' },
  auto: { label: 'AI全程规划', description: '说出想法，AI安排全部', icon: 'sparkles-outline' },
};

export const PARAMETER_OPTIONS: Record<keyof PlannerParams, string[]> = {
  days: [],
  startDate: [],
  endDate: [],
  people: ['1人', '2人', '3人', '自定义'],
  budget: ['¥3000', '¥5000', '¥8000', '自定义'],
  pace: ['轻松游', '标准游', '紧凑游'],
};

// ============ 快捷服务入口（纯 UI 配置） ============

export const QUICK_SERVICES = [
  { id: 'hotel', title: '住得舒服', subtitle: '酒店灵感', icon: 'bed-outline', color: '#0E9F93' },
  { id: 'food', title: '吃点好的', subtitle: '北京味道', icon: 'restaurant-outline', color: '#C9853E' },
  { id: 'blind-box', title: '留个盲盒', subtitle: 'AI 惊喜路线', icon: 'gift-outline', color: '#6E58A5' },
  { id: 'nearby', title: '附近走走', subtitle: '此刻出发', icon: 'navigate-outline', color: '#467B9D' },
];

// ============ 展示文案（与真实数据无关） ============

export const HERO_BADGE_TEXT = 'AI TRAVEL · BEIJING';
export const HERO_TITLE = '今天，想怎么玩北京？';
export const HERO_SUBTITLE = '告诉 AI 你的时间、预算和旅行偏好，剩下的路线交给我们。';
export const HERO_VOICE_TEXT = '也可以直接说给我听';

export const PLANNER_EYEBROW = 'AI TRAVEL PLANNER';
export const PLANNER_TITLE = '把想法交给 AI';
export const PLANNER_PLACEHOLDER = '告诉我你想怎么玩北京……';
export const PLAN_BUTTON_TEXT = '开始规划';
export const PLAN_BUTTON_LOADING = 'AI 正在整理路线…';

export const SECTION_MY_JOURNEY_EYEBROW = 'MY BEIJING JOURNEY';
export const SECTION_MY_JOURNEY_TITLE = '我的北京之旅';
export const SECTION_QUICK_SERVICES_EYEBROW = 'QUICK SERVICES';
export const SECTION_QUICK_SERVICES_TITLE = '为这趟旅行，再准备一点';

export const ELDERLY_CARD_TITLE = '和父母旅行，也可以很轻松';
export const ELDERLY_CARD_TEXT = 'AI 已自动为长辈优化：少步行、多休息、准点吃饭';

export const FOOTER_NOTE = '北京首页 Prototype · AI 规划结果可继续调整';

// ============ 规划候选（已移除真实业务数据） ============

/**
 * 注意：BEIJING_CANDIDATES 已从生产页面移除。
 * 实际候选地点应来自真实 API（searchTravelPlaces）或 AI 规划结果。
 * 以下仅为类型定义参考，不用于页面渲染。
 */
// export const BEIJING_CANDIDATES: PlannerCandidate[] = []; // 已移除

/**
 * 注意：BEIJING_EXPLORE_CARD_PLACEHOLDERS 已从生产页面移除。
 * 实际景点数据来自高德 API 的 searchTravelPlaces()。
 * 以下仅为类型定义参考，不用于页面渲染。
 */
// export const BEIJING_EXPLORE_CARD_PLACEHOLDERS = []; // 已移除

// ============ 颜色配置 ============

export const TEAL = '#0E9F93';
export const TEAL_DARK = '#0A7A70';
export const TEAL_SOFT = 'rgba(14,159,147,0.10)';
export const INK = '#0F2B27';
export const GOLD = '#F5C351';
export const BG = '#F6F9F8';
export const TEXT_SECONDARY = '#617571';
export const BORDER = '#E4EBE9';