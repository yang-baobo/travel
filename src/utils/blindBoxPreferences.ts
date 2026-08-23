const CATEGORY_ALIASES: Record<string, string[]> = {
  cat01: ['主题乐园'],
  cat02: ['自然风景', '公园', '生态'],
  cat03: ['历史文化', '博物馆', '古迹'],
  cat04: ['滨水风景', '度假'],
  cat05: ['本地美食', '餐饮'],
  cat06: ['购物', '科技'],
  cat07: ['拍照', '摄影'],
  cat08: ['亲子体验'],
  cat09: ['户外体验'],
  cat10: ['艺术', '设计', '展览'],
};

export function buildBlindBoxPreferences(input: {
  selectedCategories: string[];
  cuisinePrefs: string[];
  hotelAmenityPrefs: string[];
  fatigueLevel: 'relaxed' | 'standard' | 'intensive';
}): string[] {
  const categoryPreferences = input.selectedCategories.flatMap(id => CATEGORY_ALIASES[id] || []);
  const pace = input.fatigueLevel === 'relaxed'
    ? ['轻松', '低强度']
    : input.fatigueLevel === 'intensive'
      ? ['紧凑', '丰富']
      : [];
  return [...new Set([
    ...categoryPreferences,
    ...input.cuisinePrefs,
    ...input.hotelAmenityPrefs,
    ...pace,
  ])];
}
