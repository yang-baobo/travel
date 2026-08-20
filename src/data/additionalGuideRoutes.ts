import { GuideRoute } from '../types';

export const additionalGuideRoutes: GuideRoute[] = [
  {
    id: 'GR13',
    guideId: 'g11',
    title: '南山海边轻松陪伴一日游',
    description: '从人才公园到深圳湾公园，再到海上世界，整体步行压力较小，适合慢慢看海和休息。',
    durationDays: 1,
    totalFlatPrice: 520,
    dailyPlan: [
      {
        day: 1,
        attractionIds: ['a17', 'a04', 'a05'],
        description: '上午人才公园散步看湖景；午后深圳湾公园轻松走一段；傍晚海上世界坐着看夜景。',
        meals: [
          { type: 'lunch', description: '深圳湾商圈清淡午餐', included: true, price: 68 },
          { type: 'dinner', description: '海上世界自由晚餐', included: false, price: 120 },
        ],
      },
    ],
    mandatoryCosts: [
      { id: 'GR13-M01', name: '午餐', category: 'food', unitPrice: 68, quantity: 1, isPerPerson: true },
      { id: 'GR13-M02', name: '全程交通', category: 'transport', unitPrice: 60, quantity: 1, isPerPerson: false },
    ],
    optionalCosts: [
      { id: 'GR13-O01', name: '海上世界晚餐', category: 'food', unitPrice: 120, quantity: 1, description: '海边商圈晚餐', isPerPerson: true },
    ],
    coverImage: 'https://picsum.photos/seed/gr13/600/400',
    tags: ['一日游', '轻松', 'elderly', 'slow_travel', 'light_walk', 'convenient'],
    maxGroupSize: 6,
    rating: 4.8,
    reviewCount: 72,
  },
  {
    id: 'GR14',
    guideId: 'g12',
    title: '福田公园文化慢游一日线',
    description: '市民中心、博物馆和香蜜公园串联在一起，适合想看城市文化又不想赶行程的游客。',
    durationDays: 1,
    totalFlatPrice: 560,
    dailyPlan: [
      {
        day: 1,
        attractionIds: ['a25', 'a21', 'a24'],
        description: '上午市民中心和博物馆，下午香蜜公园休闲散步，路线清楚且可随时休息。',
        meals: [
          { type: 'lunch', description: '商圈粤式午餐', included: true, price: 72 },
        ],
      },
    ],
    mandatoryCosts: [
      { id: 'GR14-M01', name: '午餐', category: 'food', unitPrice: 72, quantity: 1, isPerPerson: true },
      { id: 'GR14-M02', name: '全程交通', category: 'transport', unitPrice: 50, quantity: 1, isPerPerson: false },
    ],
    optionalCosts: [
      { id: 'GR14-O01', name: '观景咖啡休息', category: 'food', unitPrice: 38, quantity: 1, description: '下午茶或咖啡休息', isPerPerson: true },
    ],
    coverImage: 'https://picsum.photos/seed/gr14/600/400',
    tags: ['文化', '一日游', 'elderly', 'assist', 'slow_travel', 'convenient'],
    maxGroupSize: 8,
    rating: 4.7,
    reviewCount: 66,
  },
  {
    id: 'GR15',
    guideId: 'g13',
    title: '罗湖花园与老城轻步行一日游',
    description: '东门老街、洪湖公园和地王观景搭配，适合用一天感受罗湖的老城和城市景观。',
    durationDays: 1,
    totalFlatPrice: 480,
    dailyPlan: [
      {
        day: 1,
        attractionIds: ['a26', 'a27', 'a29'],
        description: '上午东门老街短时逛街；午后洪湖公园休闲；傍晚登高看城市景色。',
        meals: [
          { type: 'lunch', description: '罗湖家常午餐', included: true, price: 58 },
        ],
      },
    ],
    mandatoryCosts: [
      { id: 'GR15-M01', name: '深港之窗门票', category: 'ticket', unitPrice: 80, quantity: 1, isPerPerson: true },
      { id: 'GR15-M02', name: '午餐', category: 'food', unitPrice: 58, quantity: 1, isPerPerson: true },
      { id: 'GR15-M03', name: '全程交通', category: 'transport', unitPrice: 55, quantity: 1, isPerPerson: false },
    ],
    optionalCosts: [
      { id: 'GR15-O01', name: '东门茶点加餐', category: 'food', unitPrice: 30, quantity: 1, description: '老街特色茶点', isPerPerson: true },
    ],
    coverImage: 'https://picsum.photos/seed/gr15/600/400',
    tags: ['城市', '一日游', 'elderly', 'light_walk', 'convenient', 'assist'],
    maxGroupSize: 6,
    rating: 4.5,
    reviewCount: 48,
  },
  {
    id: 'GR16',
    guideId: 'g14',
    title: '盐田海滨慢享一日游',
    description: '海滨栈道和中英街搭配，适合边走边休息，也适合老人看海放松。',
    durationDays: 1,
    totalFlatPrice: 530,
    dailyPlan: [
      {
        day: 1,
        attractionIds: ['a37', 'a34', 'a13'],
        description: '上午海滨栈道慢走；中午中英街周边休息用餐；下午到大梅沙看海。',
        meals: [
          { type: 'lunch', description: '盐田粤式午餐', included: true, price: 70 },
        ],
      },
    ],
    mandatoryCosts: [
      { id: 'GR16-M01', name: '午餐', category: 'food', unitPrice: 70, quantity: 1, isPerPerson: true },
      { id: 'GR16-M02', name: '全程交通', category: 'transport', unitPrice: 70, quantity: 1, isPerPerson: false },
    ],
    optionalCosts: [
      { id: 'GR16-O01', name: '海边下午茶', category: 'food', unitPrice: 45, quantity: 1, description: '大梅沙海边饮品休息', isPerPerson: true },
    ],
    coverImage: 'https://picsum.photos/seed/gr16/600/400',
    tags: ['海滨', '一日游', 'elderly', 'slow_travel', 'light_walk', 'convenient'],
    maxGroupSize: 6,
    rating: 4.8,
    reviewCount: 59,
  },
  {
    id: 'GR17',
    guideId: 'g15',
    title: '宝安滨海休闲一日游',
    description: '欢乐港湾为核心的商圈海边路线，吃饭、休息、看景都集中在一起，特别适合轻松出游。',
    durationDays: 1,
    totalFlatPrice: 500,
    dailyPlan: [
      {
        day: 1,
        attractionIds: ['a38'],
        description: '白天在欢乐港湾和滨水步道放松逛逛，晚上看摩天轮和海边灯光。',
        meals: [
          { type: 'lunch', description: '商圈简餐', included: true, price: 62 },
          { type: 'dinner', description: '自由晚餐', included: false, price: 100 },
        ],
      },
    ],
    mandatoryCosts: [
      { id: 'GR17-M01', name: '午餐', category: 'food', unitPrice: 62, quantity: 1, isPerPerson: true },
      { id: 'GR17-M02', name: '全程交通', category: 'transport', unitPrice: 45, quantity: 1, isPerPerson: false },
    ],
    optionalCosts: [
      { id: 'GR17-O01', name: '摩天轮观景', category: 'other', unitPrice: 100, quantity: 1, description: '欢乐港湾摩天轮观景', isPerPerson: true },
    ],
    coverImage: 'https://picsum.photos/seed/gr17/600/400',
    tags: ['海岸', '休闲', '一日游', 'elderly', 'slow_travel', 'convenient'],
    maxGroupSize: 8,
    rating: 4.6,
    reviewCount: 41,
  },
  {
    id: 'GR18',
    guideId: 'g16',
    title: '龙岗客家慢生活一日游',
    description: '甘坑客家小镇和鹤湖新居串联，整体以文化体验和轻松散步为主。',
    durationDays: 1,
    totalFlatPrice: 450,
    dailyPlan: [
      {
        day: 1,
        attractionIds: ['a12', 'a30'],
        description: '上午甘坑客家小镇体验街巷和小吃；下午鹤湖新居看围屋建筑与客家文化。',
        meals: [
          { type: 'lunch', description: '客家家常午餐', included: true, price: 66 },
        ],
      },
    ],
    mandatoryCosts: [
      { id: 'GR18-M01', name: '午餐', category: 'food', unitPrice: 66, quantity: 1, isPerPerson: true },
      { id: 'GR18-M02', name: '全程交通', category: 'transport', unitPrice: 60, quantity: 1, isPerPerson: false },
    ],
    optionalCosts: [
      { id: 'GR18-O01', name: '客家手作体验', category: 'other', unitPrice: 45, quantity: 1, description: '小镇非遗体验课', isPerPerson: true },
    ],
    coverImage: 'https://picsum.photos/seed/gr18/600/400',
    tags: ['文化', '客家', '一日游', 'elderly', 'light_walk', 'assist'],
    maxGroupSize: 10,
    rating: 4.6,
    reviewCount: 37,
  },
  {
    id: 'GR19',
    guideId: 'g17',
    title: '深圳城市地标舒适两日游',
    description: '适合第一次来深圳又不想太赶的人，两天慢慢看福田和南山的城市精华。',
    durationDays: 2,
    totalFlatPrice: 1320,
    dailyPlan: [
      {
        day: 1,
        attractionIds: ['a25', 'a21', 'a22'],
        description: '第一天以福田市民中心片区为主，行程集中，休息也方便。',
        meals: [
          { type: 'lunch', description: 'CBD商圈午餐', included: true, price: 78 },
        ],
        hotel: { name: '深圳会展中心亚朵酒店', included: false, price: 560 },
      },
      {
        day: 2,
        attractionIds: ['a17', 'a05'],
        description: '第二天去人才公园和海上世界，海边散步配合商圈休息更从容。',
        meals: [
          { type: 'lunch', description: '海边简餐', included: true, price: 68 },
        ],
      },
    ],
    mandatoryCosts: [
      { id: 'GR19-M01', name: '云际观光层门票', category: 'ticket', unitPrice: 200, quantity: 1, isPerPerson: true },
      { id: 'GR19-M02', name: '两日午餐', category: 'food', unitPrice: 146, quantity: 1, isPerPerson: true },
      { id: 'GR19-M03', name: '两日交通', category: 'transport', unitPrice: 120, quantity: 1, isPerPerson: false },
    ],
    optionalCosts: [
      { id: 'GR19-O01', name: '海上世界晚餐', category: 'food', unitPrice: 120, quantity: 1, description: '海边商圈晚餐', isPerPerson: true },
    ],
    coverImage: 'https://picsum.photos/seed/gr19/600/400',
    tags: ['城市', '两日游', 'elderly', 'convenient', 'assist', 'slow_travel'],
    maxGroupSize: 6,
    rating: 4.7,
    reviewCount: 54,
  },
  {
    id: 'GR20',
    guideId: 'g18',
    title: '东部山海轻步行两日游',
    description: '以较场尾、大鹏所城和盐田海滨栈道为主，整体节奏偏放松，适合边走边歇。',
    durationDays: 2,
    totalFlatPrice: 1260,
    dailyPlan: [
      {
        day: 1,
        attractionIds: ['a35', 'a15'],
        description: '第一天较场尾看海，再到大鹏所城逛古城，适合慢节奏安排。',
        meals: [
          { type: 'lunch', description: '海边午餐', included: true, price: 72 },
        ],
        hotel: { name: '维也纳国际酒店(深圳盐田港店)', included: false, price: 330 },
      },
      {
        day: 2,
        attractionIds: ['a37', 'a13'],
        description: '第二天盐田海滨栈道轻松慢走，最后去大梅沙看海。',
        meals: [
          { type: 'lunch', description: '盐田简餐', included: true, price: 68 },
        ],
      },
    ],
    mandatoryCosts: [
      { id: 'GR20-M01', name: '两日午餐', category: 'food', unitPrice: 140, quantity: 1, isPerPerson: true },
      { id: 'GR20-M02', name: '两日交通', category: 'transport', unitPrice: 160, quantity: 1, isPerPerson: false },
    ],
    optionalCosts: [
      { id: 'GR20-O01', name: '海边下午茶', category: 'food', unitPrice: 42, quantity: 1, description: '海边饮品休息', isPerPerson: true },
    ],
    coverImage: 'https://picsum.photos/seed/gr20/600/400',
    tags: ['海滨', '两日游', 'elderly', 'slow_travel', 'light_walk', 'assist'],
    maxGroupSize: 6,
    rating: 4.7,
    reviewCount: 43,
  },
];
