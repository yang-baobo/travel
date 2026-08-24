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
  days: string;
  people: string;
  budget: string;
  pace: string;
};

export type BeijingExploreCard = {
  id: string;
  name: string;
  englishName: string;
  tag: string;
  detail: string;
  imageUrl: string;
  fallbackColors: [string, string];
};

export type ItineraryPreviewDay = {
  day: string;
  title: string;
  items: string[];
};

export const CANDIDATE_CATEGORY_COPY: Record<CandidateCategory, string> = {
  attraction: '景点',
  hotel: '酒店',
  food: '餐厅',
  experience: '体验',
};

export const DEFAULT_PLANNER_PARAMS: PlannerParams = {
  days: '4天',
  people: '2人',
  budget: '¥5000',
  pace: '轻松游',
};

export const PLANNER_MODE_COPY: Record<PlannerMode, { label: string; description: string; icon: string }> = {
  self: { label: '自己选择', description: '我来挑选想去的地方', icon: 'hand-left-outline' },
  complete: { label: 'AI帮我补全', description: '我选一部分，AI补齐路线', icon: 'construct-outline' },
  auto: { label: 'AI全程规划', description: '说出想法，AI安排全部', icon: 'sparkles-outline' },
};

export const PARAMETER_OPTIONS: Record<keyof PlannerParams, string[]> = {
  days: ['3天', '4天', '5天', '7天'],
  people: ['1人', '2人', '3–5人', '家庭'],
  budget: ['¥3000', '¥5000', '¥8000', '自定义'],
  pace: ['轻松游', '标准游', '紧凑游'],
};

export const BEIJING_EXPLORE_CARDS: BeijingExploreCard[] = [
  {
    id: 'forbidden-city',
    name: '故宫博物院',
    englishName: 'THE FORBIDDEN CITY',
    tag: '古都必看',
    detail: '红墙与晨光，走进六百年的时间轴',
    imageUrl: 'https://images.unsplash.com/photo-1558981403-c5f9891f7c3d?auto=format&fit=crop&w=900&q=80',
    fallbackColors: ['#9A5B3C', '#3A1F1A'],
  },
  {
    id: 'summer-palace',
    name: '颐和园',
    englishName: 'SUMMER PALACE',
    tag: '湖山慢游',
    detail: '把下午交给昆明湖和一段长廊',
    imageUrl: 'https://images.unsplash.com/photo-1548919973-5cef591cdbc9?auto=format&fit=crop&w=900&q=80',
    fallbackColors: ['#478A76', '#193A35'],
  },
  {
    id: 'temple-of-heaven',
    name: '天坛',
    englishName: 'TEMPLE OF HEAVEN',
    tag: '城市留白',
    detail: '在古树与回声里，留一点安静时间',
    imageUrl: 'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?auto=format&fit=crop&w=900&q=80',
    fallbackColors: ['#466E88', '#1A2E40'],
  },
  {
    id: 'mutianyu',
    name: '慕田峪长城',
    englishName: 'MUTIANYU GREAT WALL',
    tag: '山野远眺',
    detail: '把视线交给山脊和风',
    imageUrl: 'https://images.unsplash.com/photo-1508804052814-cd3ba865a116?auto=format&fit=crop&w=900&q=80',
    fallbackColors: ['#738A62', '#26382A'],
  },
  {
    id: 'shichahai',
    name: '什刹海',
    englishName: 'SHICHAHAI',
    tag: '胡同夜色',
    detail: '从一杯咖啡开始认识北京的夜晚',
    imageUrl: 'https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=900&q=80',
    fallbackColors: ['#806143', '#2B211B'],
  },
];

export const BEIJING_CANDIDATES: PlannerCandidate[] = [
  {
    id: 'candidate-forbidden-city', name: '故宫博物院', category: 'attraction', categoryLabel: '景点',
    detail: '中轴线 · 约 2.5 小时', reason: '第一次来北京，适合放在上午慢慢看',
    imageUrl: BEIJING_EXPLORE_CARDS[0].imageUrl, fallbackColors: ['#9A5B3C', '#3A1F1A'],
  },
  {
    id: 'candidate-summer-palace', name: '颐和园', category: 'attraction', categoryLabel: '景点',
    detail: '昆明湖 · 约 3 小时', reason: '节奏舒缓，给行程留出呼吸感',
    imageUrl: BEIJING_EXPLORE_CARDS[1].imageUrl, fallbackColors: ['#478A76', '#193A35'],
  },
  {
    id: 'candidate-shichahai', name: '什刹海胡同', category: 'experience', categoryLabel: '体验',
    detail: '胡同漫步 · 约 2 小时', reason: '把城市生活感放进行程，不赶景点',
    imageUrl: BEIJING_EXPLORE_CARDS[4].imageUrl, fallbackColors: ['#806143', '#2B211B'],
  },
  {
    id: 'candidate-temple-heaven', name: '天坛公园', category: 'attraction', categoryLabel: '景点',
    detail: '古树与回声 · 约 2 小时', reason: '适合和故宫错开，保持内容多样',
    imageUrl: BEIJING_EXPLORE_CARDS[2].imageUrl, fallbackColors: ['#466E88', '#1A2E40'],
  },
  {
    id: 'candidate-hotel', name: '前门胡同设计酒店', category: 'hotel', categoryLabel: '酒店',
    detail: '前门 · 交通方便 · ¥680/晚起', reason: '离中轴线近，减少每天折返时间',
    imageUrl: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=900&q=80', fallbackColors: ['#6B817A', '#1C3935'],
  },
  {
    id: 'candidate-food', name: '四季民福烤鸭', category: 'food', categoryLabel: '餐厅',
    detail: '故宫东门 · 午餐 · 需预约', reason: '接在故宫之后，动线自然又不绕路',
    imageUrl: 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=80', fallbackColors: ['#B46D42', '#41251D'],
  },
  {
    id: 'candidate-great-wall', name: '慕田峪长城', category: 'experience', categoryLabel: '体验',
    detail: '山野远眺 · 半日', reason: '给城市行程换一口山风，适合标准节奏',
    imageUrl: BEIJING_EXPLORE_CARDS[3].imageUrl, fallbackColors: ['#738A62', '#26382A'],
  },
  {
    id: 'candidate-coffee', name: '钟鼓楼咖啡留白', category: 'food', categoryLabel: '餐厅',
    detail: '什刹海 · 下午茶 · 人均 ¥58', reason: '午后补充能量，避免连续步行',
    imageUrl: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=80', fallbackColors: ['#9B765B', '#35251D'],
  },
];

export const DISCOVERY_GRID_IMAGES = [
  BEIJING_EXPLORE_CARDS[0], BEIJING_EXPLORE_CARDS[1], BEIJING_EXPLORE_CARDS[2],
  BEIJING_EXPLORE_CARDS[3], BEIJING_EXPLORE_CARDS[4],
];

export const AUTO_PLAN_VARIANTS: Record<string, string[]> = {
  '3天': ['故宫博物院', '什刹海胡同', '四季民福烤鸭', '前门胡同设计酒店'],
  '4天': ['故宫博物院', '颐和园', '四季民福烤鸭', '什刹海胡同', '前门胡同设计酒店'],
  '5天': ['故宫博物院', '颐和园', '天坛公园', '慕田峪长城', '钟鼓楼咖啡留白', '前门胡同设计酒店'],
  '7天': ['故宫博物院', '颐和园', '天坛公园', '慕田峪长城', '什刹海胡同', '四季民福烤鸭', '前门胡同设计酒店'],
};

export const BEIJING_TRIP_MOCK = {
  title: '北京 · 4天3晚',
  day: 'DAY 2',
  nextStop: '故宫博物院',
  departure: '09:30 出发',
  stats: [
    { label: '今日步行', value: '6.8 km', icon: 'walk-outline' },
    { label: '交通时间', value: '42 min', icon: 'bus-outline' },
    { label: '今日预算', value: '¥680', icon: 'wallet-outline' },
    { label: '下一顿用餐', value: '12:30', icon: 'restaurant-outline' },
  ],
  timeline: [
    { time: '09:30', title: '前往故宫博物院', detail: '地铁 1 号线 · 约 24 分钟' },
    { time: '10:00', title: '午门集合', detail: '提前预约，沿中轴线慢慢走' },
    { time: '12:30', title: '四季民福烤鸭', detail: '步行 8 分钟 · 已加入备选' },
  ],
};

export const ITINERARY_PREVIEW: ItineraryPreviewDay[] = [
  { day: 'DAY 1', title: '初见北京', items: ['天安门广场', '故宫博物院', '景山看日落'] },
  { day: 'DAY 2', title: '胡同与烟火', items: ['什刹海', '南锣鼓巷', '四季民福烤鸭'] },
  { day: 'DAY 3', title: '湖山之间', items: ['颐和园', '圆明园', '咖啡馆留白'] },
  { day: 'DAY 4', title: '把北京带回家', items: ['天坛', '前门大街', '返程'] },
];

export const QUICK_SERVICES = [
  { id: 'hotel', title: '住得舒服', subtitle: '酒店灵感', icon: 'bed-outline', color: '#0E9F93' },
  { id: 'food', title: '吃点好的', subtitle: '北京味道', icon: 'restaurant-outline', color: '#C9853E' },
  { id: 'blind-box', title: '留个盲盒', subtitle: 'AI 惊喜路线', icon: 'gift-outline', color: '#6E58A5' },
  { id: 'nearby', title: '附近走走', subtitle: '此刻出发', icon: 'navigate-outline', color: '#467B9D' },
];
