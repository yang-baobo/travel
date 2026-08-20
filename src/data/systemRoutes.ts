import { SystemRoute } from '../types';

export const systemRoutes: SystemRoute[] = [
  {
    id: 'SR01',
    title: '深圳经典一日游',
    description: '浓缩深圳精华的一日行程，从主题乐园到城市地标再到海岸夕阳，适合首次来深的旅客。',
    durationDays: 1,
    dailyPlan: [
      {
        day: 1,
        attractionIds: ['a01', 'a06', 'a04'],
        description: '上午世界之窗环球之旅；午后莲花山登顶看CBD全景；傍晚深圳湾公园海岸日落。',
        meals: [
          { type: 'lunch', description: '世界之窗园内午餐', included: false, price: 60 },
          { type: 'dinner', description: '深圳湾附近餐厅', included: false, price: 100 },
        ],
      },
    ],
    estimatedCosts: [
      { id: 'SR01-C01', name: '世界之窗门票', category: 'ticket', unitPrice: 220, quantity: 1, isPerPerson: true },
      { id: 'SR01-C02', name: '预估交通费', category: 'transport', unitPrice: 50, quantity: 1, isPerPerson: false },
      { id: 'SR01-C03', name: '预估餐费', category: 'food', unitPrice: 160, quantity: 1, isPerPerson: true },
    ],
    coverImage: 'https://picsum.photos/seed/sr01/600/400',
    tags: ['经典', '一日游', '首选'],
    difficulty: 'easy',
    suitableFor: ['情侣', '朋友', '首次来深'],
  },
  {
    id: 'SR02',
    title: '亲子欢乐两日游',
    description: '专为家庭设计的两日行程，主题乐园+自然探索+科技体验，大人小孩都开心。',
    durationDays: 2,
    dailyPlan: [
      {
        day: 1,
        attractionIds: ['a02', 'a01'],
        description: '全天畅玩欢乐谷和世界之窗两大乐园。',
        meals: [
          { type: 'lunch', description: '园内午餐', included: false, price: 55 },
          { type: 'dinner', description: '南山美食街', included: false, price: 100 },
        ],
        hotel: { name: '南山科技园如家精选', included: false, price: 380 },
      },
      {
        day: 2,
        attractionIds: ['a06', 'a08', 'a10'],
        description: '莲花山亲子登山→华强北科技体验→中心公园户外活动。',
        meals: [
          { type: 'lunch', description: '华强北附近餐厅', included: false, price: 60 },
          { type: 'dinner', description: '福田美食', included: false, price: 90 },
        ],
      },
    ],
    estimatedCosts: [
      { id: 'SR02-C01', name: '欢乐谷门票', category: 'ticket', unitPrice: 230, quantity: 1, isPerPerson: true },
      { id: 'SR02-C02', name: '世界之窗门票', category: 'ticket', unitPrice: 220, quantity: 1, isPerPerson: true },
      { id: 'SR02-C03', name: '预估交通费', category: 'transport', unitPrice: 100, quantity: 1, isPerPerson: false },
      { id: 'SR02-C04', name: '预估餐费(两日)', category: 'food', unitPrice: 305, quantity: 1, isPerPerson: true },
    ],
    coverImage: 'https://picsum.photos/seed/sr02/600/400',
    tags: ['亲子', '两日游', '乐园'],
    difficulty: 'easy',
    suitableFor: ['家庭', '亲子', '儿童'],
  },
  {
    id: 'SR03',
    title: '自然生态深度两日游',
    description: '远离喧嚣，两天走遍深圳最美的自然景观，适合热爱自然的旅客。',
    durationDays: 2,
    dailyPlan: [
      {
        day: 1,
        attractionIds: ['a09', 'a04', 'a11'],
        description: '上午红树林观鸟→午后深圳湾海岸→傍晚仙湖植物园。',
        meals: [
          { type: 'lunch', description: '滨海简餐', included: false, price: 50 },
          { type: 'dinner', description: '罗湖美食', included: false, price: 80 },
        ],
        hotel: { name: '罗湖万象城智选假日酒店', included: false, price: 420 },
      },
      {
        day: 2,
        attractionIds: ['a14', 'a13'],
        description: '东部华侨城茶溪谷一日游→大梅沙海滩日落。',
        meals: [
          { type: 'lunch', description: '茶溪谷餐厅', included: false, price: 70 },
          { type: 'dinner', description: '大梅沙海鲜', included: false, price: 120 },
        ],
      },
    ],
    estimatedCosts: [
      { id: 'SR03-C01', name: '仙湖植物园门票', category: 'ticket', unitPrice: 15, quantity: 1, isPerPerson: true },
      { id: 'SR03-C02', name: '东部华侨城门票', category: 'ticket', unitPrice: 180, quantity: 1, isPerPerson: true },
      { id: 'SR03-C03', name: '预估交通费', category: 'transport', unitPrice: 150, quantity: 1, isPerPerson: false },
      { id: 'SR03-C04', name: '预估餐费(两日)', category: 'food', unitPrice: 320, quantity: 1, isPerPerson: true },
    ],
    coverImage: 'https://picsum.photos/seed/sr03/600/400',
    tags: ['自然', '生态', '两日游'],
    difficulty: 'medium',
    suitableFor: ['自然爱好者', '情侣', '摄影'],
  },
  {
    id: 'SR04',
    title: '文化历史三日深度游',
    description: '三天时间深度体验深圳从古至今的文化积淀，从客家古镇到现代艺术，从古城到科技城。',
    durationDays: 3,
    dailyPlan: [
      {
        day: 1,
        attractionIds: ['a12', 'a11'],
        description: '甘坑客家小镇非遗体验→仙湖植物园+弘法寺。',
        meals: [
          { type: 'lunch', description: '客家围屋午餐', included: false, price: 70 },
          { type: 'dinner', description: '罗湖老街美食', included: false, price: 80 },
        ],
        hotel: { name: '罗湖瑞吉酒店', included: false, price: 450 },
      },
      {
        day: 2,
        attractionIds: ['a07', 'a06', 'a03'],
        description: '当代艺术馆→莲花山→锦绣中华。',
        meals: [
          { type: 'lunch', description: 'CBD商务午餐', included: false, price: 80 },
          { type: 'dinner', description: '南山晚餐', included: false, price: 100 },
        ],
        hotel: { name: '南山前海全季酒店', included: false, price: 400 },
      },
      {
        day: 3,
        attractionIds: ['a15', 'a13'],
        description: '大鹏所城古城历史→大梅沙海滩放松。',
        meals: [
          { type: 'lunch', description: '古城午餐', included: false, price: 60 },
          { type: 'dinner', description: '盐田海鲜晚餐', included: false, price: 130 },
        ],
      },
    ],
    estimatedCosts: [
      { id: 'SR04-C01', name: '仙湖植物园门票', category: 'ticket', unitPrice: 15, quantity: 1, isPerPerson: true },
      { id: 'SR04-C02', name: '锦绣中华门票', category: 'ticket', unitPrice: 200, quantity: 1, isPerPerson: true },
      { id: 'SR04-C03', name: '预估交通费(三日)', category: 'transport', unitPrice: 250, quantity: 1, isPerPerson: false },
      { id: 'SR04-C04', name: '预估餐费(三日)', category: 'food', unitPrice: 520, quantity: 1, isPerPerson: true },
    ],
    coverImage: 'https://picsum.photos/seed/sr04/600/400',
    tags: ['文化', '历史', '三日游', '深度'],
    difficulty: 'medium',
    suitableFor: ['文化爱好者', '历史迷', '摄影'],
  },
  {
    id: 'SR05',
    title: '深圳全景五日慢游',
    description: '不赶路的深度五日行程，覆盖深圳五大区域所有经典景点，享受悠闲假期。',
    durationDays: 5,
    dailyPlan: [
      {
        day: 1,
        attractionIds: ['a01', 'a03', 'a05'],
        description: 'Day1 南山文化日：世界之窗→锦绣中华→海上世界夜景。',
        meals: [
          { type: 'lunch', description: '园内午餐', included: false, price: 60 },
          { type: 'dinner', description: '海上世界晚餐', included: false, price: 130 },
        ],
        hotel: { name: '南山蛇口CitiGO酒店', included: false, price: 350 },
      },
      {
        day: 2,
        attractionIds: ['a02', 'a04'],
        description: 'Day2 南山活力日：欢乐谷→深圳湾日落。',
        meals: [
          { type: 'lunch', description: '园内午餐', included: false, price: 55 },
          { type: 'dinner', description: '蛇口美食', included: false, price: 100 },
        ],
        hotel: { name: '南山科技园亚朵酒店', included: false, price: 380 },
      },
      {
        day: 3,
        attractionIds: ['a06', 'a07', 'a08', 'a09'],
        description: 'Day3 福田都市日：莲花山→艺术馆→华强北→红树林。',
        meals: [
          { type: 'lunch', description: '华强北小吃', included: false, price: 50 },
          { type: 'dinner', description: '福田CBD晚餐', included: false, price: 100 },
        ],
        hotel: { name: '福田CBD维也纳酒店', included: false, price: 400 },
      },
      {
        day: 4,
        attractionIds: ['a11', 'a12', 'a10'],
        description: 'Day4 文化体验日：仙湖植物园→甘坑客家小镇→中心公园。',
        meals: [
          { type: 'lunch', description: '客家午餐', included: false, price: 70 },
          { type: 'dinner', description: '深圳本地菜', included: false, price: 80 },
        ],
        hotel: { name: '龙岗万科广场全季酒店', included: false, price: 320 },
      },
      {
        day: 5,
        attractionIds: ['a14', 'a13', 'a15'],
        description: 'Day5 海滨探索日：东部华侨城→大梅沙→大鹏所城。',
        meals: [
          { type: 'lunch', description: '茶溪谷午餐', included: false, price: 70 },
          { type: 'dinner', description: '大鹏海鲜', included: false, price: 130 },
        ],
      },
    ],
    estimatedCosts: [
      { id: 'SR05-C01', name: '世界之窗门票', category: 'ticket', unitPrice: 220, quantity: 1, isPerPerson: true },
      { id: 'SR05-C02', name: '欢乐谷门票', category: 'ticket', unitPrice: 230, quantity: 1, isPerPerson: true },
      { id: 'SR05-C03', name: '锦绣中华门票', category: 'ticket', unitPrice: 200, quantity: 1, isPerPerson: true },
      { id: 'SR05-C04', name: '仙湖植物园门票', category: 'ticket', unitPrice: 15, quantity: 1, isPerPerson: true },
      { id: 'SR05-C05', name: '东部华侨城门票', category: 'ticket', unitPrice: 180, quantity: 1, isPerPerson: true },
      { id: 'SR05-C06', name: '预估交通费(五日)', category: 'transport', unitPrice: 400, quantity: 1, isPerPerson: false },
      { id: 'SR05-C07', name: '预估餐费(五日)', category: 'food', unitPrice: 895, quantity: 1, isPerPerson: true },
    ],
    coverImage: 'https://picsum.photos/seed/sr05/600/400',
    tags: ['全景', '五日游', '悠闲', '推荐'],
    difficulty: 'easy',
    suitableFor: ['所有人群', '长假', '深度游'],
  },
];

// 按ID查找
export const getSystemRouteById = (id: string): SystemRoute | undefined =>
  systemRoutes.find(r => r.id === id);

// 按天数筛选
export const getSystemRoutesByDays = (days: number): SystemRoute[] =>
  systemRoutes.filter(r => r.durationDays === days);
