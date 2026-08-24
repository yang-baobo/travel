export type PlannerMode = 'self' | 'complete' | 'auto';
export type CandidateCategory = 'attraction' | 'hotel' | 'food' | 'experience';
export type PlannerCandidate = {
  id: string; name: string; category: CandidateCategory; categoryLabel: string; detail: string; reason: string;
  imageUrl: string; fallbackColors: [string, string]; address?: string; latitude?: number; longitude?: number;
  price?: number; durationMinutes?: number; startTime?: string; endTime?: string;
};
export type PlannerParams = { days: string; people: string; budget: string; pace: string };
export type BeijingExploreCard = { id: string; name: string; englishName: string; tag: string; detail: string; imageUrl: string; fallbackColors: [string, string] };
export type ItineraryPreviewDay = { day: string; title: string; items: string[] };
export const MOCK_TRIP_START_DATE = '2026-10-01';
export const CANDIDATE_CATEGORY_COPY: Record<CandidateCategory, string> = { attraction: '\u666f\u70b9', hotel: '\u9152\u5e97', food: '\u9910\u5385', experience: '\u4f53\u9a8c' };
export const DEFAULT_PLANNER_PARAMS: PlannerParams = { days: '4\u5929', people: '2\u4eba', budget: '\u00a55000', pace: '\u8f7b\u677e\u6e38' };
export const PLANNER_MODE_COPY: Record<PlannerMode, { label: string; description: string; icon: string }> = {
  self: { label: '\u81ea\u5df1\u9009\u62e9', description: '\u6211\u6765\u6311\u9009\u60f3\u53bb\u7684\u5730\u65b9', icon: 'hand-left-outline' },
  complete: { label: 'AI\u5e2e\u6211\u8865\u5168', description: '\u6211\u9009\u4e00\u90e8\u5206\uff0cAI\u8865\u9f50\u8def\u7ebf', icon: 'construct-outline' },
  auto: { label: 'AI\u5168\u7a0b\u89c4\u5212', description: '\u8bf4\u51fa\u60f3\u6cd5\uff0cAI\u5b89\u6392\u5168\u90e8', icon: 'sparkles-outline' },
};
export const PARAMETER_OPTIONS: Record<keyof PlannerParams, string[]> = {
  days: ['3\u5929', '4\u5929', '5\u5929', '7\u5929'], people: ['1\u4eba', '2\u4eba', '3\u20135\u4eba', '\u5bb6\u5ead'],
  budget: ['\u00a53000', '\u00a55000', '\u00a58000', '\u81ea\u5b9a\u4e49'], pace: ['\u8f7b\u677e\u6e38', '\u6807\u51c6\u6e38', '\u7d27\u51d1\u6e38'],
};
const image = 'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?auto=format&fit=crop&w=900&q=80';
export const BEIJING_EXPLORE_CARDS: BeijingExploreCard[] = [
  { id: 'forbidden-city', name: '\u6545\u5bab\u535a\u7269\u9662', englishName: 'THE FORBIDDEN CITY', tag: '\u53e4\u90fd\u5fc5\u770b', detail: '\u8d70\u8fdb\u767e\u5e74\u65f6\u95f4', imageUrl: image, fallbackColors: ['#9A5B3C','#3A1F1A'] },
  { id: 'summer-palace', name: '\u9880\u548c\u56ed', englishName: 'SUMMER PALACE', tag: '\u6e56\u5c71\u6162\u6e38', detail: '\u628a\u4e0b\u5348\u4ea4\u7ed9\u6606\u660e\u6e56', imageUrl: image, fallbackColors: ['#478A76','#193A35'] },
  { id: 'temple-of-heaven', name: '\u5929\u575b', englishName: 'TEMPLE OF HEAVEN', tag: '\u57ce\u5e02\u7559\u767d', detail: '\u5728\u53e4\u6811\u4e0e\u56de\u58f0\u91cc\u653e\u6162', imageUrl: image, fallbackColors: ['#466E88','#1A2E40'] },
  { id: 'mutianyu', name: '\u6155\u7530\u5cea\u957f\u57ce', englishName: 'MUTIANYU GREAT WALL', tag: '\u5c71\u91ce\u8fdc\u65b9', detail: '\u628a\u89c6\u7ebf\u4ea4\u7ed9\u5c71\u810a', imageUrl: image, fallbackColors: ['#738A62','#26382A'] },
  { id: 'shichahai', name: '\u4ec0\u5239\u6d77\u80e1\u540c', englishName: 'SHICHAHAI', tag: '\u80e1\u540c\u591c\u8272', detail: '\u4ece\u4e00\u676f\u5496\u5561\u8ba4\u8bc6\u5317\u4eac', imageUrl: image, fallbackColors: ['#806143','#2B211B'] },
];
const details: Record<string, Omit<Required<Pick<PlannerCandidate, 'address'|'latitude'|'longitude'|'price'|'durationMinutes'|'startTime'|'endTime'>>, never>> = {
  'candidate-forbidden-city': { address: 'Beijing Dongcheng Jingshan Qianjie 4', latitude: 39.9163, longitude: 116.3972, price: 60, durationMinutes: 150, startTime: '09:00', endTime: '11:30' },
  'candidate-summer-palace': { address: 'Beijing Haidian Xinjiangongmen Road 19', latitude: 39.9999, longitude: 116.2755, price: 30, durationMinutes: 180, startTime: '14:00', endTime: '17:00' },
  'candidate-shichahai': { address: 'Beijing Xicheng Shichahai Scenic Area', latitude: 39.9404, longitude: 116.3853, price: 58, durationMinutes: 120, startTime: '15:00', endTime: '17:00' },
  'candidate-temple-heaven': { address: 'Beijing Dongcheng Tiantan East Road 1', latitude: 39.8822, longitude: 116.4066, price: 34, durationMinutes: 120, startTime: '09:30', endTime: '11:30' },
  'candidate-hotel': { address: 'Beijing Dongcheng Qianmen Street', latitude: 39.8955, longitude: 116.3970, price: 680, durationMinutes: 30, startTime: '18:00', endTime: '18:30' },
  'candidate-food': { address: 'Beijing Dongcheng Donghuamen Street', latitude: 39.9152, longitude: 116.3974, price: 120, durationMinutes: 60, startTime: '12:30', endTime: '13:30' },
  'candidate-great-wall': { address: 'Beijing Huairou Mutianyu Great Wall', latitude: 40.4319, longitude: 116.5704, price: 80, durationMinutes: 240, startTime: '08:00', endTime: '12:00' },
  'candidate-coffee': { address: 'Beijing Xicheng Bell and Drum Towers', latitude: 39.9470, longitude: 116.3930, price: 58, durationMinutes: 60, startTime: '16:00', endTime: '17:00' },
};
const candidate = (id: string, name: string, category: CandidateCategory, label: string, reason: string): PlannerCandidate => ({ id, name, category, categoryLabel: label, detail: 'Beijing · mock candidate', reason, imageUrl: image, fallbackColors: ['#478A76','#193A35'], ...details[id] });
export const BEIJING_CANDIDATES: PlannerCandidate[] = [
  candidate('candidate-forbidden-city','\u6545\u5bab\u535a\u7269\u9662','attraction','\u666f\u70b9','\u9996\u6b21\u6765\u5317\u4eac\u5fc5\u770b'),
  candidate('candidate-summer-palace','\u9880\u548c\u56ed','attraction','\u666f\u70b9','\u8282\u594f\u8212\u7f13'),
  candidate('candidate-shichahai','\u4ec0\u5239\u6d77\u80e1\u540c','experience','\u4f53\u9a8c','\u628a\u57ce\u5e02\u751f\u6d3b\u653e\u8fdb\u884c\u7a0b'),
  candidate('candidate-temple-heaven','\u5929\u575b\u516c\u56ed','attraction','\u666f\u70b9','\u4e0e\u6545\u5bab\u9519\u5f00'),
  candidate('candidate-hotel','\u524d\u95e8\u80e1\u540c\u8bbe\u8ba1\u9152\u5e97','hotel','\u9152\u5e97','\u51cf\u5c11\u6bcf\u5929\u6298\u8fd4'),
  candidate('candidate-food','\u56db\u5b63\u6c11\u798f\u70e4\u9e2d','food','\u9910\u5385','\u63a5\u5728\u6545\u5bab\u4e4b\u540e'),
  candidate('candidate-great-wall','\u6155\u7530\u5cea\u957f\u57ce','experience','\u4f53\u9a8c','\u7ed9\u57ce\u5e02\u884c\u7a0b\u6362\u98ce'),
  candidate('candidate-coffee','\u949f\u9f13\u697c\u5496\u5561\u7559\u767d','food','\u9910\u5385','\u5348\u540e\u8865\u5145\u80fd\u91cf'),
];
export const DISCOVERY_GRID_IMAGES = BEIJING_EXPLORE_CARDS;
export const AUTO_PLAN_VARIANTS: Record<string, string[]> = {
  '3\u5929': ['\u6545\u5bab\u535a\u7269\u9662','\u4ec0\u5239\u6d77\u80e1\u540c','\u56db\u5b63\u6c11\u798f\u70e4\u9e2d'],
  '4\u5929': ['\u6545\u5bab\u535a\u7269\u9662','\u9880\u548c\u56ed','\u56db\u5b63\u6c11\u798f\u70e4\u9e2d','\u4ec0\u5239\u6d77\u80e1\u540c'],
  '5\u5929': ['\u6545\u5bab\u535a\u7269\u9662','\u9880\u548c\u56ed','\u5929\u575b\u516c\u56ed','\u6155\u7530\u5cea\u957f\u57ce','\u949f\u9f13\u697c\u5496\u5561\u7559\u767d'],
  '7\u5929': ['\u6545\u5bab\u535a\u7269\u9662','\u9880\u548c\u56ed','\u5929\u575b\u516c\u56ed','\u6155\u7530\u5cea\u957f\u57ce','\u4ec0\u5239\u6d77\u80e1\u540c','\u56db\u5b63\u6c11\u798f\u70e4\u9e2d','\u524d\u95e8\u80e1\u540c\u8bbe\u8ba1\u9152\u5e97'],
};
export const BEIJING_TRIP_MOCK = {
  title: '\u5317\u4eac · 4\u59293\u665a', day: 'DAY 2', nextStop: '\u6545\u5bab\u535a\u7269\u9662', departure: '09:30 \u51fa\u53d1',
  stats: [{ label: '\u4eca\u65e5\u6b65\u884c', value: '6.8 km', icon: 'walk-outline' }, { label: '\u4ea4\u901a\u65f6\u95f4', value: '42 min', icon: 'bus-outline' }, { label: '\u4eca\u65e5\u9884\u7b97', value: '\u00a5680', icon: 'wallet-outline' }, { label: '\u4e0b\u4e00\u9879\u7528\u9910', value: '12:30', icon: 'restaurant-outline' }],
  timeline: [{ time: '09:30', title: '\u524d\u5f80\u6545\u5bab\u535a\u7269\u9662', detail: '\u5730\u94c1 1 \u53f7\u7ebf · \u7ea624\u5206\u949f' }, { time: '12:30', title: '\u56db\u5b63\u6c11\u798f\u70e4\u9e2d', detail: '\u6b65\u884c 8 \u5206\u949f' }],
};
export const ITINERARY_PREVIEW: ItineraryPreviewDay[] = [
  { day: 'DAY 1', title: '\u521d\u89c1\u5317\u4eac', items: ['\u6545\u5bab\u535a\u7269\u9662'] },
  { day: 'DAY 2', title: '\u80e1\u540c\u4e0e\u70df\u706b', items: ['\u4ec0\u5239\u6d77'] },
  { day: 'DAY 3', title: '\u6e56\u5c71\u4e4b\u95f4', items: ['\u9880\u548c\u56ed'] },
  { day: 'DAY 4', title: '\u5e26\u5317\u4eac\u56de\u5bb6', items: ['\u5929\u575b'] },
];
export const QUICK_SERVICES = [
  { id: 'hotel', title: '\u4f4f\u5f97\u8212\u670d', subtitle: '\u9152\u5e97\u7075\u611f', icon: 'bed-outline', color: '#0E9F93' },
  { id: 'food', title: '\u5403\u70b9\u597d\u7684', subtitle: '\u5317\u4eac\u5473\u9053', icon: 'restaurant-outline', color: '#C9853E' },
  { id: 'blind-box', title: '\u7559\u4e2a\u76f2\u76d2', subtitle: 'AI \u60ca\u559c\u8def\u7ebf', icon: 'gift-outline', color: '#6E58A5' },
  { id: 'nearby', title: '\u9644\u8fd1\u8d70\u8d70', subtitle: '\u6b64\u523b\u51fa\u53d1', icon: 'navigate-outline', color: '#467B9D' },
];
