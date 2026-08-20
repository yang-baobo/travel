import { attractions } from '../data/attractions';
import { categories } from '../data/categories';
import { hotels } from '../data/hotels';
import { restaurants } from '../data/restaurants';
import type { AIAction, AIResponse } from './chatService';

type AssistantStage = AIResponse['stage'] | 'confirming';

const cuisineKeywords = ['粤菜', '湘菜', '川菜', '海鲜', '日料', '西餐', '火锅', '小吃', '茶餐厅', '素食'] as const;

const amenityAliasMap: Record<string, string> = {
  wifi: 'WiFi',
  WiFi: 'WiFi',
  无线网: 'WiFi',
  无线网络: 'WiFi',
  停车: '停车场',
  停车场: '停车场',
  泳池: '泳池',
  游泳池: '泳池',
  健身房: '健身房',
  spa: 'SPA',
  SPA: 'SPA',
  早餐: '自助早餐',
  自助早餐: '自助早餐',
  海景房: '海景房',
  亲子乐园: '亲子乐园',
  商务中心: '商务中心',
};

const zoneAliasMap: Record<string, string> = {
  市中心: 'city_center',
  靠近景区: 'near_attraction',
  景区附近: 'near_attraction',
  靠近购物区: 'near_shopping',
  购物区附近: 'near_shopping',
  靠近美食街: 'near_food_street',
  美食街附近: 'near_food_street',
  安静休息区: 'quiet_area',
  安静一点: 'quiet_area',
  偏安静: 'quiet_area',
  靠近地铁: 'near_metro',
  地铁附近: 'near_metro',
  地铁方便: 'near_metro',
};

const categoryAliasMap: Record<string, string[]> = {
  主题乐园: ['cat01'],
  乐园: ['cat01'],
  自然生态: ['cat02'],
  自然风光: ['cat02'],
  自然: ['cat02'],
  文化历史: ['cat03'],
  文化: ['cat03'],
  历史: ['cat03'],
  海滨度假: ['cat04'],
  海边: ['cat04'],
  海滩: ['cat04'],
  美食探店: ['cat05'],
  美食: ['cat05'],
  购物科技: ['cat06'],
  购物: ['cat06'],
  科技: ['cat06'],
  摄影打卡: ['cat07'],
  摄影: ['cat07'],
  拍照: ['cat07'],
  亲子活动: ['cat08'],
  亲子: ['cat08'],
  户外探险: ['cat09'],
  户外: ['cat09'],
  探险: ['cat09'],
  艺术展览: ['cat10'],
  艺术: ['cat10'],
  展览: ['cat10'],
};

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function parseChineseNumber(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const direct = Number(text);
    return Number.isFinite(direct) ? direct : null;
  }

  const digitMap: Record<string, number> = {
    零: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };

  if (text === '十') return 10;
  if (text.includes('十')) {
    const [tensRaw, onesRaw] = text.split('十');
    const tens = tensRaw ? (digitMap[tensRaw] ?? 0) : 1;
    const ones = onesRaw ? (digitMap[onesRaw] ?? 0) : 0;
    return tens * 10 + ones;
  }

  return digitMap[text] ?? null;
}

function extractNumber(text: string, regexp: RegExp): number | null {
  const match = text.match(regexp);
  if (!match) return null;
  const value = parseChineseNumber(String(match[1]));
  return Number.isFinite(value) ? value : null;
}

function inferCompanionGroupSize(text: string): number | null {
  if (/(和老伴|跟老伴|夫妻|两口子|我和爱人|我跟爱人|我和老婆|我和老公|我和先生|我和太太)/.test(text)) {
    return 2;
  }

  if (/(自己一个人|一个人去|独自出行|我自己去)/.test(text)) {
    return 1;
  }

  if (/一家三口/.test(text)) return 3;
  if (/一家四口/.test(text)) return 4;
  if (/一家五口/.test(text)) return 5;

  return null;
}

function findNames(text: string, source: { id: string; name: string }[]): string[] {
  return source.filter(item => text.includes(item.name)).map(item => item.id);
}

function parseDay(text: string): number | undefined {
  const match = text.match(/第\s*([1-7])\s*天/);
  if (match) return Number(match[1]);
  const todayMatch = text.match(/(今天|明天|后天)/);
  if (todayMatch) {
    if (todayMatch[1] === '今天') return 1;
    if (todayMatch[1] === '明天') return 2;
    return 3;
  }
  return undefined;
}

function parseMeal(text: string): 'breakfast' | 'lunch' | 'dinner' | undefined {
  if (text.includes('早餐') || text.includes('早饭')) return 'breakfast';
  if (text.includes('午餐') || text.includes('中饭') || text.includes('午饭')) return 'lunch';
  if (text.includes('晚餐') || text.includes('晚饭')) return 'dinner';
  return undefined;
}

function buildReply(parts: string[], fallback = '好的，已经帮您记下了。'): string {
  return parts.length > 0 ? `好的，${parts.join('，')}。` : fallback;
}

function normalizeResponseStage(stage: AssistantStage): AIResponse['stage'] {
  if (stage === 'confirming') return 'adjusting';
  return stage;
}

export function tryParseLocalAssistantCommand(
  rawText: string,
  currentStage: AssistantStage = 'collecting'
): AIResponse | null {
  const text = rawText.trim();
  if (!text) return null;

  const actions: AIAction[] = [];
  const replyParts: string[] = [];

  const travelDays = extractNumber(text, /([一二两三四五六七八九十0-9]+)\s*天/);
  if (travelDays) {
    actions.push({ type: 'set_travel_days', value: travelDays });
    replyParts.push(`已把行程改成${travelDays}天`);
  }

  const groupSize = extractNumber(text, /([一二两三四五六七八九十0-9]+)\s*(人|位)/);
  if (groupSize) {
    actions.push({ type: 'set_group_size', value: groupSize });
    replyParts.push(`人数设为${groupSize}人`);
  }

  const inferredGroupSize = inferCompanionGroupSize(text);
  if (!groupSize && inferredGroupSize) {
    actions.push({ type: 'set_group_size', value: inferredGroupSize });
    replyParts.push(`人数设为${inferredGroupSize}人`);
  }

  if (/(省钱|经济一点|便宜一点|预算低)/.test(text)) {
    actions.push({ type: 'set_budget_pref', value: 'low' });
    replyParts.push('预算偏好改成节省');
  } else if (/(适中|中等预算|正常预算)/.test(text)) {
    actions.push({ type: 'set_budget_pref', value: 'medium' });
    replyParts.push('预算偏好改成适中');
  } else if (/(高端|住好一点|预算宽裕|贵一点也行|豪华一点)/.test(text)) {
    actions.push({ type: 'set_budget_pref', value: 'high' });
    replyParts.push('预算偏好改成宽裕');
  }

  if (/(地铁|公交|公共交通)/.test(text)) {
    actions.push({ type: 'set_transport_pref', value: 'transit' });
    replyParts.push('交通方式改成公交地铁优先');
  } else if (/(打车|自驾|开车|驾车)/.test(text)) {
    actions.push({ type: 'set_transport_pref', value: 'driving' });
    replyParts.push('交通方式改成驾车优先');
  } else if (/(步行|走路)/.test(text)) {
    actions.push({ type: 'set_transport_pref', value: 'walking' });
    replyParts.push('交通方式改成步行优先');
  }

  const walkMaxKm = extractNumber(text, /(?:最多|不超过|控制在)?\s*([一二两三四五六七八九十0-9]+(?:\.\d+)?)\s*公?里/);
  if (walkMaxKm && /(步行|走路)/.test(text)) {
    actions.push({ type: 'set_walk_max_km', value: walkMaxKm });
    replyParts.push(`步行距离上限设为${walkMaxKm}公里`);
  }

  if (/(豪华酒店|五星|高档酒店)/.test(text)) {
    actions.push({ type: 'set_hotel_level', value: 'luxury' });
    replyParts.push('酒店档次改成豪华型');
  } else if (/(舒适型|中档酒店|中端酒店)/.test(text)) {
    actions.push({ type: 'set_hotel_level', value: 'mid' });
    replyParts.push('酒店档次改成舒适型');
  } else if (/(经济型|便宜酒店|快捷酒店)/.test(text)) {
    actions.push({ type: 'set_hotel_level', value: 'budget' });
    replyParts.push('酒店档次改成经济型');
  }

  if (/(不要酒店|不住酒店|不需要酒店)/.test(text)) {
    actions.push({ type: 'set_need_hotel', value: false });
    replyParts.push('已经取消住宿需求');
  } else if (/(要住酒店|需要酒店|订酒店)/.test(text)) {
    actions.push({ type: 'set_need_hotel', value: true });
    replyParts.push('已经开启住宿需求');
  }

  for (const [alias, zone] of Object.entries(zoneAliasMap)) {
    if (text.includes(alias)) {
      actions.push({ type: 'set_hotel_zone_pref', value: zone });
      replyParts.push(`酒店区域偏好改成${alias}`);
      break;
    }
  }

  const priceRangeMatch = text.match(/(?:酒店|住宿).{0,8}?(\d{2,4})\s*(?:到|至|-|~)\s*(\d{2,4})\s*元/);
  if (priceRangeMatch) {
    const min = Number(priceRangeMatch[1]);
    const max = Number(priceRangeMatch[2]);
    actions.push({ type: 'set_hotel_price_range', value: { min, max } });
    replyParts.push(`酒店价格范围设为${min}到${max}元`);
  }

  const amenityHits = unique(
    Object.entries(amenityAliasMap)
      .filter(([alias]) => text.includes(alias))
      .map(([, value]) => value)
  );
  if (amenityHits.length > 0 && /(酒店|住宿|房间)/.test(text)) {
    amenityHits.forEach(value => actions.push({ type: 'toggle_hotel_amenity', value }));
    replyParts.push(`已加入${amenityHits.join('、')}等酒店设施要求`);
  }

  const cuisineHits = unique(cuisineKeywords.filter(cuisine => text.includes(cuisine)));
  if (cuisineHits.length > 0) {
    actions.push({ type: 'set_cuisine_prefs', value: cuisineHits });
    replyParts.push(`饮食偏好改成${cuisineHits.join('、')}`);
  }

  if (/(不要早餐|不吃早餐)/.test(text)) actions.push({ type: 'set_need_breakfast', value: false });
  if (/(要早餐|吃早餐|含早餐)/.test(text)) actions.push({ type: 'set_need_breakfast', value: true });
  if (/(不要午餐|不吃午餐)/.test(text)) actions.push({ type: 'set_need_lunch', value: false });
  if (/(要午餐|吃午餐)/.test(text)) actions.push({ type: 'set_need_lunch', value: true });
  if (/(不要晚餐|不吃晚餐)/.test(text)) actions.push({ type: 'set_need_dinner', value: false });
  if (/(要晚餐|吃晚餐)/.test(text)) actions.push({ type: 'set_need_dinner', value: true });

  const categoryIds = unique(
    [
      ...categories.filter(category => text.includes(category.name)).map(category => category.id),
      ...Object.entries(categoryAliasMap)
        .filter(([alias]) => text.includes(alias))
        .flatMap(([, ids]) => ids),
    ]
  );
  if (categoryIds.length > 0) {
    actions.push({ type: 'set_categories', value: categoryIds });
    const labels = categories.filter(category => categoryIds.includes(category.id)).map(category => category.name);
    replyParts.push(`景点偏好改成${labels.join('、')}`);
  }

  if (/(我在北京|已经到北京|已经在北京)/.test(text)) {
    actions.push({ type: 'set_is_in_dest_city', value: true });
    replyParts.push('已记为您现在就在北京');
  } else if (/(还没到北京|不在北京|从外地过去)/.test(text)) {
    actions.push({ type: 'set_is_in_dest_city', value: false });
    replyParts.push('已记为您需要从外地出发');
  }

  const departureCityMatch = text.match(/(?:从|出发城市(?:是|改成)?)(北京|上海|广州|深圳|杭州|南京|成都|重庆|武汉|西安|大连|长沙|青岛|厦门|苏州|天津|郑州|昆明|哈尔滨)/);
  if (departureCityMatch) {
    actions.push({ type: 'set_departure_city', value: departureCityMatch[1] });
    replyParts.push(`出发城市改成${departureCityMatch[1]}`);
  }

  if (/(长辈模式|大字模式|老人模式)/.test(text)) {
    const enable = !/(关闭|取消|不要)/.test(text);
    actions.push({ type: 'set_elderly_mode', value: enable });
    replyParts.push(enable ? '已开启长辈模式' : '已关闭长辈模式');
  }

  const wantsGenerateRoute = /(生成路线|生成行程|安排路线|安排个行程|规划路线|规划行程|开始规划)/.test(text);
  if (wantsGenerateRoute) {
    actions.push({ type: 'generate_route' }, { type: 'navigate_to_route_plan' });
    return {
      reply: buildReply(replyParts, '好的，正在帮您规划路线。'),
      actions,
      stage: 'generating',
    };
  }

  const mentionedRestaurantIds = findNames(text, restaurants);
  const mentionedHotelIds = findNames(text, hotels);
  const mentionedAttractionIds = findNames(text, attractions);
  const day = parseDay(text);
  const meal = parseMeal(text);

  if (/(换餐厅|换个餐厅|改餐厅|换午餐|换晚餐|换早餐)/.test(text)) {
    actions.push({
      type: mentionedRestaurantIds[0] ? 'change_restaurant' : 'open_restaurant_picker',
      value: mentionedRestaurantIds[0]
        ? { day: day ?? 1, meal: meal ?? 'lunch', restaurantId: mentionedRestaurantIds[0] }
        : undefined,
    });
    return {
      reply: mentionedRestaurantIds[0]
        ? `好的，已经准备把第${day ?? 1}天的餐厅改成您说的。`
        : '好的，我帮您打开餐厅选择。',
      actions,
      stage: 'adjusting',
    };
  }

  if (/(换酒店|改酒店|换住处)/.test(text)) {
    actions.push({
      type: mentionedHotelIds[0] ? 'change_hotel' : 'open_hotel_picker',
      value: mentionedHotelIds[0] ? { day: day ?? 1, hotelId: mentionedHotelIds[0] } : undefined,
    });
    return {
      reply: mentionedHotelIds[0]
        ? `好的，已经准备把第${day ?? 1}天的酒店换掉。`
        : '好的，我帮您打开酒店选择。',
      actions,
      stage: 'adjusting',
    };
  }

  if (/(加上|添加|加入).*(景点|地方)|想去/.test(text) && mentionedAttractionIds[0]) {
    actions.push({ type: 'add_attraction', value: { attractionId: mentionedAttractionIds[0] } });
    return {
      reply: '好的，已经把这个景点加入待安排列表。',
      actions,
      stage: currentStage === 'collecting' ? 'adjusting' : normalizeResponseStage(currentStage),
    };
  }

  if (/(删掉|删除|不要|去掉).*(景点|地方)/.test(text) && mentionedAttractionIds[0]) {
    actions.push({ type: 'remove_attraction', value: { attractionId: mentionedAttractionIds[0] } });
    return {
      reply: '好的，已经把这个景点从行程里移除。',
      actions,
      stage: 'adjusting',
    };
  }

  if (/(确认路线|就这样吧|可以了|确认行程)/.test(text) && currentStage !== 'collecting') {
    actions.push({ type: 'confirm_route' });
    return {
      reply: '好的，已经为您确认这份行程。',
      actions,
      stage: 'done',
    };
  }

  if (actions.length === 0) return null;

  return {
    reply: buildReply(replyParts),
    actions,
    stage: currentStage === 'adjusting' ? 'adjusting' : 'collecting',
  };
}
