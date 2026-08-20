import { GuideRoute } from '../types';
import { additionalGuideRoutes } from './additionalGuideRoutes';

// 12条导游路线，其中部分路线存在景点重叠，允许用户通过路线发现导游
export const guideRoutes: GuideRoute[] = [
  // ===== 陈志明 (g01) 的路线 =====
  {
    id: 'GR01',
    guideId: 'g01',
    title: '南山主题乐园双日精华游',
    description: '畅游世界之窗和欢乐谷两大主题乐园，搭配锦绣中华的文化体验，享受最纯粹的乐园欢乐。',
    durationDays: 2,
    totalFlatPrice: 1680,
    dailyPlan: [
      {
        day: 1,
        attractionIds: ['a01', 'a03'],
        description: '上午游览世界之窗，体验全球微缩景观；下午前往锦绣中华，感受五千年文化精粹。',
        meals: [
          { type: 'breakfast', description: '酒店自助早餐', included: true },
          { type: 'lunch', description: '世界之窗园内午餐', included: true, price: 60 },
          { type: 'dinner', description: '南山海鲜街晚餐', included: false, price: 120 },
        ],
        hotel: { name: '南山科技园亚朵酒店', included: true, price: 480 },
      },
      {
        day: 2,
        attractionIds: ['a02', 'a04'],
        description: '上午畅玩欢乐谷刺激项目；下午到深圳湾公园骑行赏海景日落。',
        meals: [
          { type: 'breakfast', description: '酒店自助早餐', included: true },
          { type: 'lunch', description: '欢乐谷园内午餐', included: true, price: 55 },
          { type: 'dinner', description: '自由晚餐', included: false },
        ],
      },
    ],
    mandatoryCosts: [
      { id: 'GR01-M01', name: '世界之窗门票', category: 'ticket', unitPrice: 220, quantity: 1, isPerPerson: true },
      { id: 'GR01-M02', name: '欢乐谷门票', category: 'ticket', unitPrice: 230, quantity: 1, isPerPerson: true },
      { id: 'GR01-M03', name: '锦绣中华门票', category: 'ticket', unitPrice: 200, quantity: 1, isPerPerson: true },
      { id: 'GR01-M04', name: '两日午餐', category: 'food', unitPrice: 115, quantity: 1, isPerPerson: true },
      { id: 'GR01-M05', name: '景点间交通', category: 'transport', unitPrice: 80, quantity: 1, isPerPerson: false },
    ],
    optionalCosts: [
      { id: 'GR01-O01', name: '深圳湾骑行租车', category: 'other', unitPrice: 40, quantity: 1, description: '2小时自行车租赁', isPerPerson: true },
      { id: 'GR01-O02', name: '南山海鲜晚餐', category: 'food', unitPrice: 120, quantity: 1, description: '第一天海鲜大餐', isPerPerson: true },
    ],
    coverImage: 'https://picsum.photos/seed/gr01/600/400',
    tags: ['主题乐园', '亲子', '两日游'],
    maxGroupSize: 8,
    rating: 4.8,
    reviewCount: 156,
    busTransport: { perPersonPerDay: 50 },
  },
  {
    id: 'GR02',
    guideId: 'g01',
    title: '南山文化与海岸一日游',
    description: '一天之内感受深圳南山的文化底蕴和海岸风情，从锦绣中华到海上世界的完美日程。',
    durationDays: 1,
    totalFlatPrice: 580,
    dailyPlan: [
      {
        day: 1,
        attractionIds: ['a03', 'a04', 'a05'],
        description: '上午锦绣中华览千年古迹；午后深圳湾公园海边漫步；傍晚海上世界享受晚餐与夜景。',
        meals: [
          { type: 'lunch', description: '公园附近简餐', included: true, price: 45 },
          { type: 'dinner', description: '海上世界西餐', included: false, price: 150 },
        ],
      },
    ],
    mandatoryCosts: [
      { id: 'GR02-M01', name: '锦绣中华门票', category: 'ticket', unitPrice: 200, quantity: 1, isPerPerson: true },
      { id: 'GR02-M02', name: '午餐', category: 'food', unitPrice: 45, quantity: 1, isPerPerson: true },
      { id: 'GR02-M03', name: '全程交通', category: 'transport', unitPrice: 60, quantity: 1, isPerPerson: false },
    ],
    optionalCosts: [
      { id: 'GR02-O01', name: '海上世界西餐', category: 'food', unitPrice: 150, quantity: 1, description: '海景西餐厅晚餐', isPerPerson: true },
    ],
    coverImage: 'https://picsum.photos/seed/gr02/600/400',
    tags: ['文化', '海岸', '一日游', '轻松'],
    maxGroupSize: 10,
    rating: 4.7,
    reviewCount: 89,
  },

  // ===== 林小燕 (g02) 的路线 =====
  {
    id: 'GR03',
    guideId: 'g02',
    title: '福田都市绿意亲子一日游',
    description: '在城市中心发现自然之美，莲花山登顶、艺术馆打卡、中心公园亲子时光。',
    durationDays: 1,
    totalFlatPrice: 420,
    dailyPlan: [
      {
        day: 1,
        attractionIds: ['a06', 'a07', 'a10'],
        description: '上午莲花山公园登顶看CBD全景；中午参观艺术馆；下午中心公园亲子活动。',
        meals: [
          { type: 'lunch', description: '市民中心附近粤式茶点', included: true, price: 65 },
          { type: 'dinner', description: '自由晚餐', included: false },
        ],
      },
    ],
    mandatoryCosts: [
      { id: 'GR03-M01', name: '粤式茶点午餐', category: 'food', unitPrice: 65, quantity: 1, isPerPerson: true },
      { id: 'GR03-M02', name: '全程交通', category: 'transport', unitPrice: 50, quantity: 1, isPerPerson: false },
    ],
    optionalCosts: [
      { id: 'GR03-O01', name: '亲子DIY手作体验', category: 'other', unitPrice: 80, quantity: 1, description: '中心公园手工坊', isPerPerson: true },
    ],
    coverImage: 'https://picsum.photos/seed/gr03/600/400',
    tags: ['亲子', '免费景点', '一日游', '城市'],
    maxGroupSize: 6,
    rating: 4.9,
    reviewCount: 203,
  },
  {
    id: 'GR04',
    guideId: 'g02',
    title: '福田生态观鸟深度游',
    description: '红树林观鸟+深圳湾海岸线徒步，近距离感受深圳的生态之美。',
    durationDays: 1,
    totalFlatPrice: 380,
    dailyPlan: [
      {
        day: 1,
        // 注意：与GR02路线重叠景点 a04(深圳湾公园)
        attractionIds: ['a09', 'a04'],
        description: '上午红树林保护区专业观鸟(导游提供望远镜)；下午深圳湾公园海岸线徒步。',
        meals: [
          { type: 'lunch', description: '滨海路简餐', included: true, price: 50 },
        ],
      },
    ],
    mandatoryCosts: [
      { id: 'GR04-M01', name: '简餐午餐', category: 'food', unitPrice: 50, quantity: 1, isPerPerson: true },
      { id: 'GR04-M02', name: '全程交通', category: 'transport', unitPrice: 40, quantity: 1, isPerPerson: false },
    ],
    optionalCosts: [
      { id: 'GR04-O01', name: '专业观鸟望远镜租赁', category: 'other', unitPrice: 30, quantity: 1, description: '高倍望远镜一日租赁', isPerPerson: true },
      { id: 'GR04-O02', name: '观鸟图鉴手册', category: 'other', unitPrice: 25, quantity: 1, description: '深圳常见鸟类图鉴', isPerPerson: true },
    ],
    coverImage: 'https://picsum.photos/seed/gr04/600/400',
    tags: ['生态', '观鸟', '一日游', '自然'],
    maxGroupSize: 8,
    rating: 4.8,
    reviewCount: 67,
  },
  {
    id: 'GR05',
    guideId: 'g02',
    title: '深圳亲子三日全景游',
    description: '涵盖南山乐园、福田都市、盐田海滨的三日亲子行程，让孩子的假期充实又快乐。',
    durationDays: 3,
    totalFlatPrice: 2980,
    dailyPlan: [
      {
        day: 1,
        // 与GR01重叠：a01, a02
        attractionIds: ['a01', 'a02'],
        description: '第一天主题乐园日：上午世界之窗，下午欢乐谷。',
        meals: [
          { type: 'breakfast', description: '酒店自助', included: true },
          { type: 'lunch', description: '园内午餐', included: true, price: 60 },
          { type: 'dinner', description: '科技园美食街', included: true, price: 80 },
        ],
        hotel: { name: '福田CBD希尔顿花园酒店', included: true, price: 580 },
      },
      {
        day: 2,
        // 与GR03重叠：a06, a07
        attractionIds: ['a06', 'a07', 'a08'],
        description: '第二天都市探索日：莲花山、艺术馆、华强北科技体验。',
        meals: [
          { type: 'breakfast', description: '酒店自助', included: true },
          { type: 'lunch', description: '华强北附近餐厅', included: true, price: 55 },
          { type: 'dinner', description: '福田CBD晚餐', included: true, price: 90 },
        ],
        hotel: { name: '盐田海景华美达酒店', included: true, price: 520 },
      },
      {
        day: 3,
        // 与GR06重叠：a13, a14
        attractionIds: ['a13', 'a14'],
        description: '第三天海滨度假日：大梅沙海滩戏水、东部华侨城茶溪谷。',
        meals: [
          { type: 'breakfast', description: '酒店自助', included: true },
          { type: 'lunch', description: '大梅沙海鲜午餐', included: true, price: 80 },
          { type: 'dinner', description: '自由晚餐', included: false },
        ],
      },
    ],
    mandatoryCosts: [
      { id: 'GR05-M01', name: '世界之窗门票', category: 'ticket', unitPrice: 220, quantity: 1, isPerPerson: true },
      { id: 'GR05-M02', name: '欢乐谷门票', category: 'ticket', unitPrice: 230, quantity: 1, isPerPerson: true },
      { id: 'GR05-M03', name: '东部华侨城门票', category: 'ticket', unitPrice: 180, quantity: 1, isPerPerson: true },
      { id: 'GR05-M04', name: '三日用餐(含6正餐)', category: 'food', unitPrice: 425, quantity: 1, isPerPerson: true },
      { id: 'GR05-M05', name: '三日交通', category: 'transport', unitPrice: 280, quantity: 1, isPerPerson: false },
    ],
    optionalCosts: [
      { id: 'GR05-O01', name: '大梅沙冲浪体验', category: 'other', unitPrice: 200, quantity: 1, description: '专业教练1小时冲浪课', isPerPerson: true },
      { id: 'GR05-O02', name: '华强北电子DIY体验', category: 'other', unitPrice: 60, quantity: 1, description: '亲手组装迷你电路', isPerPerson: true },
      { id: 'GR05-O03', name: '茶溪谷缆车', category: 'transport', unitPrice: 50, quantity: 1, description: '东部华侨城观光缆车', isPerPerson: true },
    ],
    coverImage: 'https://picsum.photos/seed/gr05/600/400',
    tags: ['亲子', '三日游', '全景', '推荐'],
    maxGroupSize: 6,
    rating: 4.9,
    reviewCount: 312,
    busTransport: { perPersonPerDay: 60 },
  },

  // ===== 张伟强 (g03) 的路线 =====
  {
    id: 'GR06',
    guideId: 'g03',
    title: '东部海滨探险两日游',
    description: '深入盐田大鹏半岛，大梅沙戏水、东部华侨城探险、大鹏古城寻古，一次满足。',
    durationDays: 2,
    totalFlatPrice: 1580,
    dailyPlan: [
      {
        day: 1,
        attractionIds: ['a13', 'a14'],
        description: '上午大梅沙海滩冲浪戏水；下午东部华侨城大峡谷探险。',
        meals: [
          { type: 'breakfast', description: '酒店自助', included: true },
          { type: 'lunch', description: '海边烧烤午餐', included: true, price: 75 },
          { type: 'dinner', description: '盐田海鲜大餐', included: true, price: 130 },
        ],
        hotel: { name: '大梅沙京基海湾酒店', included: true, price: 620 },
      },
      {
        day: 2,
        attractionIds: ['a15'],
        description: '上午前往大鹏所城探索明代古城；下午沿海自驾返程，沿途赏景。',
        meals: [
          { type: 'breakfast', description: '酒店自助', included: true },
          { type: 'lunch', description: '大鹏古城客家菜', included: true, price: 60 },
        ],
      },
    ],
    mandatoryCosts: [
      { id: 'GR06-M01', name: '东部华侨城门票', category: 'ticket', unitPrice: 180, quantity: 1, isPerPerson: true },
      { id: 'GR06-M02', name: '三正餐', category: 'food', unitPrice: 265, quantity: 1, isPerPerson: true },
      { id: 'GR06-M03', name: '两日交通(含高速费)', category: 'transport', unitPrice: 200, quantity: 1, isPerPerson: false },
    ],
    optionalCosts: [
      { id: 'GR06-O01', name: '冲浪教学体验', category: 'other', unitPrice: 180, quantity: 1, description: '专业冲浪教练1.5小时', isPerPerson: true },
      { id: 'GR06-O02', name: '大鹏古城讲解', category: 'guide', unitPrice: 50, quantity: 1, description: '古城历史深度讲解', isPerPerson: false },
    ],
    coverImage: 'https://picsum.photos/seed/gr06/600/400',
    tags: ['海滨', '探险', '两日游', '户外'],
    maxGroupSize: 8,
    rating: 4.7,
    reviewCount: 134,
    busTransport: { perPersonPerDay: 80 },
  },

  // ===== 王丽华 (g04) 的路线 =====
  {
    id: 'GR07',
    guideId: 'g04',
    title: '深圳吃货一日暴走',
    description: '从早茶到宵夜，一天吃遍深圳最地道的美食，景点只是配角，美食才是主角！',
    durationDays: 1,
    totalFlatPrice: 520,
    dailyPlan: [
      {
        day: 1,
        // 与GR03重叠：a06；与其他路线重叠：a08, a05
        attractionIds: ['a06', 'a08', 'a05'],
        description: '早茶后莲花山消食；午间华强北科技+小吃；傍晚海上世界异国美食。',
        meals: [
          { type: 'breakfast', description: '点都德经典早茶', included: true, price: 85 },
          { type: 'lunch', description: '华强北地道小吃集合', included: true, price: 60 },
          { type: 'dinner', description: '海上世界异国餐厅', included: true, price: 150 },
        ],
      },
    ],
    mandatoryCosts: [
      { id: 'GR07-M01', name: '三餐美食全包', category: 'food', unitPrice: 295, quantity: 1, isPerPerson: true },
      { id: 'GR07-M02', name: '全程交通', category: 'transport', unitPrice: 60, quantity: 1, isPerPerson: false },
    ],
    optionalCosts: [
      { id: 'GR07-O01', name: '宵夜加餐(烧烤)', category: 'food', unitPrice: 80, quantity: 1, description: '南山烧烤一条街', isPerPerson: true },
      { id: 'GR07-O02', name: '奶茶打卡5杯', category: 'food', unitPrice: 100, quantity: 1, description: '深圳网红奶茶5连击', isPerPerson: true },
    ],
    coverImage: 'https://picsum.photos/seed/gr07/600/400',
    tags: ['美食', '一日游', '吃货', '网红'],
    maxGroupSize: 6,
    rating: 4.8,
    reviewCount: 278,
  },
  {
    id: 'GR08',
    guideId: 'g04',
    title: '南山美食与海岸两日游',
    description: '美食路线升级版，两天深入南山的美食与海岸线风光。',
    durationDays: 2,
    totalFlatPrice: 1280,
    dailyPlan: [
      {
        day: 1,
        // 与GR02重叠：a03, a05
        attractionIds: ['a03', 'a05'],
        description: '上午锦绣中华文化游；下午傍晚海上世界美食探索。',
        meals: [
          { type: 'breakfast', description: '酒店自助', included: true },
          { type: 'lunch', description: '景区附近湘菜馆', included: true, price: 55 },
          { type: 'dinner', description: '海上世界日料', included: true, price: 160 },
        ],
        hotel: { name: '南山蛇口希尔顿南海酒店', included: true, price: 550 },
      },
      {
        day: 2,
        // 与GR04重叠：a09, a04
        attractionIds: ['a09', 'a04'],
        description: '上午红树林观鸟漫步；下午深圳湾公园骑行+落日野餐。',
        meals: [
          { type: 'breakfast', description: '酒店自助', included: true },
          { type: 'lunch', description: '蛇口市场海鲜', included: true, price: 100 },
          { type: 'dinner', description: '深圳湾落日野餐', included: true, price: 80 },
        ],
      },
    ],
    mandatoryCosts: [
      { id: 'GR08-M01', name: '锦绣中华门票', category: 'ticket', unitPrice: 200, quantity: 1, isPerPerson: true },
      { id: 'GR08-M02', name: '四正餐', category: 'food', unitPrice: 395, quantity: 1, isPerPerson: true },
      { id: 'GR08-M03', name: '两日交通', category: 'transport', unitPrice: 90, quantity: 1, isPerPerson: false },
    ],
    optionalCosts: [
      { id: 'GR08-O01', name: '蛇口渔港海鲜加餐', category: 'food', unitPrice: 120, quantity: 1, description: '蛇口渔港新鲜海鲜', isPerPerson: true },
      { id: 'GR08-O02', name: '深圳湾骑行租车', category: 'other', unitPrice: 40, quantity: 1, description: '2小时骑行', isPerPerson: true },
    ],
    coverImage: 'https://picsum.photos/seed/gr08/600/400',
    tags: ['美食', '海岸', '两日游', '休闲'],
    maxGroupSize: 8,
    rating: 4.6,
    reviewCount: 95,
  },

  // ===== 刘建国 (g05) 的路线 =====
  {
    id: 'GR09',
    guideId: 'g05',
    title: '深圳最佳摄影点两日游',
    description: '摄影师精心策划的最佳拍摄路线，包含城市天际线、海岸日落、古城人文等多种主题。',
    durationDays: 2,
    totalFlatPrice: 1380,
    dailyPlan: [
      {
        day: 1,
        // 与GR03重叠：a06；与GR04重叠：a04
        attractionIds: ['a06', 'a04', 'a05'],
        description: '莲花山日出天际线→深圳湾黄金时刻→海上世界蓝调夜景。',
        meals: [
          { type: 'lunch', description: '轻食简餐', included: true, price: 45 },
          { type: 'dinner', description: '海上世界晚餐', included: false, price: 130 },
        ],
        hotel: { name: '南山前海华侨城洲际酒店', included: false, price: 680 },
      },
      {
        day: 2,
        attractionIds: ['a11', 'a15'],
        description: '仙湖植物园晨雾→大鹏古城人文纪实摄影。',
        meals: [
          { type: 'lunch', description: '大鹏古城午餐', included: true, price: 50 },
        ],
      },
    ],
    mandatoryCosts: [
      { id: 'GR09-M01', name: '仙湖植物园门票', category: 'ticket', unitPrice: 15, quantity: 1, isPerPerson: true },
      { id: 'GR09-M02', name: '两日简餐', category: 'food', unitPrice: 95, quantity: 1, isPerPerson: true },
      { id: 'GR09-M03', name: '两日交通', category: 'transport', unitPrice: 220, quantity: 1, isPerPerson: false },
    ],
    optionalCosts: [
      { id: 'GR09-O01', name: '摄影指导服务', category: 'guide', unitPrice: 200, quantity: 1, description: '全程一对一摄影教学', isPerPerson: true },
      { id: 'GR09-O02', name: '无人机航拍', category: 'other', unitPrice: 300, quantity: 1, description: '专业航拍10张精修照片', isPerPerson: false },
      { id: 'GR09-O03', name: '海上世界晚餐', category: 'food', unitPrice: 130, quantity: 1, description: '海景晚餐', isPerPerson: true },
    ],
    coverImage: 'https://picsum.photos/seed/gr09/600/400',
    tags: ['摄影', '两日游', '日落', '网红'],
    maxGroupSize: 5,
    rating: 4.7,
    reviewCount: 88,
  },

  // ===== 赵雪梅 (g06) 的路线 =====
  {
    id: 'GR10',
    guideId: 'g06',
    title: '文艺深圳一日漫游',
    description: '艺术馆、植物园、明华轮，用文艺的眼光重新发现深圳之美。',
    durationDays: 1,
    totalFlatPrice: 450,
    dailyPlan: [
      {
        day: 1,
        // 与GR03重叠：a07；与GR02重叠：a05
        attractionIds: ['a07', 'a11', 'a05'],
        description: '上午艺术馆品鉴当代艺术；午后仙湖植物园禅意漫步；傍晚海上世界文艺酒吧。',
        meals: [
          { type: 'lunch', description: '植物园素食餐厅', included: true, price: 50 },
          { type: 'dinner', description: '海上世界小酒馆', included: false, price: 120 },
        ],
      },
    ],
    mandatoryCosts: [
      { id: 'GR10-M01', name: '仙湖植物园门票', category: 'ticket', unitPrice: 15, quantity: 1, isPerPerson: true },
      { id: 'GR10-M02', name: '素食午餐', category: 'food', unitPrice: 50, quantity: 1, isPerPerson: true },
      { id: 'GR10-M03', name: '全程交通', category: 'transport', unitPrice: 70, quantity: 1, isPerPerson: false },
    ],
    optionalCosts: [
      { id: 'GR10-O01', name: '海上世界小酒馆', category: 'food', unitPrice: 120, quantity: 1, description: '文艺小酒馆晚餐+饮品', isPerPerson: true },
      { id: 'GR10-O02', name: '手作明信片DIY', category: 'other', unitPrice: 35, quantity: 1, description: '定制旅行明信片', isPerPerson: true },
    ],
    coverImage: 'https://picsum.photos/seed/gr10/600/400',
    tags: ['文艺', '一日游', '艺术', '小清新'],
    maxGroupSize: 6,
    rating: 4.8,
    reviewCount: 167,
  },
  {
    id: 'GR11',
    guideId: 'g06',
    title: '山海之间两日文艺游',
    description: '从城市绿洲到海滨古城，用两天时间品味深圳的山海诗意。',
    durationDays: 2,
    totalFlatPrice: 1250,
    dailyPlan: [
      {
        day: 1,
        // 与GR09重叠：a06；与GR10重叠：a07
        attractionIds: ['a06', 'a07', 'a10'],
        description: '莲花山→艺术馆→中心公园，在城市绿洲中寻找灵感。',
        meals: [
          { type: 'lunch', description: 'CBD创意餐厅', included: true, price: 80 },
          { type: 'dinner', description: '自由晚餐', included: false },
        ],
        hotel: { name: '福田卓越维港皇冠假日酒店', included: false, price: 520 },
      },
      {
        day: 2,
        // 与GR06重叠：a15
        attractionIds: ['a13', 'a15'],
        description: '大梅沙海滩晨读→大鹏古城写生或拍照。',
        meals: [
          { type: 'lunch', description: '大鹏古城文艺餐厅', included: true, price: 65 },
        ],
      },
    ],
    mandatoryCosts: [
      { id: 'GR11-M01', name: '两日简餐', category: 'food', unitPrice: 145, quantity: 1, isPerPerson: true },
      { id: 'GR11-M02', name: '两日交通', category: 'transport', unitPrice: 180, quantity: 1, isPerPerson: false },
    ],
    optionalCosts: [
      { id: 'GR11-O01', name: '水彩写生体验', category: 'other', unitPrice: 120, quantity: 1, description: '含画具+导师指导', isPerPerson: true },
      { id: 'GR11-O02', name: '古城咖啡下午茶', category: 'food', unitPrice: 60, quantity: 1, description: '大鹏古城特色咖啡店', isPerPerson: true },
    ],
    coverImage: 'https://picsum.photos/seed/gr11/600/400',
    tags: ['文艺', '两日游', '山海', '写生'],
    maxGroupSize: 6,
    rating: 4.7,
    reviewCount: 73,
  },

  // ===== 吴大鹏 (g07) 的路线 =====
  {
    id: 'GR12',
    guideId: 'g07',
    title: '客家文化深度一日游',
    description: '深入龙岗客家小镇，体验做客家豆腐、看非遗表演、品客家美食的沉浸式文化之旅。',
    durationDays: 1,
    totalFlatPrice: 360,
    dailyPlan: [
      {
        day: 1,
        attractionIds: ['a12', 'a11'],
        description: '上午甘坑客家小镇沉浸式文化体验；下午仙湖植物园+弘法寺祈福。',
        meals: [
          { type: 'lunch', description: '客家围屋盆菜', included: true, price: 70 },
          { type: 'dinner', description: '自由晚餐', included: false },
        ],
      },
    ],
    mandatoryCosts: [
      { id: 'GR12-M01', name: '仙湖植物园门票', category: 'ticket', unitPrice: 15, quantity: 1, isPerPerson: true },
      { id: 'GR12-M02', name: '客家盆菜午餐', category: 'food', unitPrice: 70, quantity: 1, isPerPerson: true },
      { id: 'GR12-M03', name: '全程交通', category: 'transport', unitPrice: 80, quantity: 1, isPerPerson: false },
    ],
    optionalCosts: [
      { id: 'GR12-O01', name: '客家豆腐DIY', category: 'other', unitPrice: 50, quantity: 1, description: '跟着师傅学做客家豆腐', isPerPerson: true },
      { id: 'GR12-O02', name: '非遗体验课', category: 'other', unitPrice: 80, quantity: 1, description: '客家扎染/剪纸体验', isPerPerson: true },
    ],
    coverImage: 'https://picsum.photos/seed/gr12/600/400',
    tags: ['客家', '文化', '一日游', '美食', '非遗'],
    maxGroupSize: 10,
    rating: 4.5,
    reviewCount: 56,
    busTransport: { perPersonPerDay: 60 },
  },
  ...additionalGuideRoutes,
];

// 按导游ID查找路线
export const getRoutesByGuideId = (guideId: string): GuideRoute[] =>
  guideRoutes.filter(r => r.guideId === guideId);

// 按ID查找路线
export const getGuideRouteById = (id: string): GuideRoute | undefined =>
  guideRoutes.find(r => r.id === id);

// 查找包含某景点的所有导游路线（路线重叠发现功能）
export const getRoutesByAttractionId = (attractionId: string): GuideRoute[] =>
  guideRoutes.filter(r =>
    r.dailyPlan.some(day => day.attractionIds.includes(attractionId))
  );

// 获取所有路线涉及的景点ID（去重）
export const getAllRouteAttractionIds = (): string[] => {
  const ids = new Set<string>();
  guideRoutes.forEach(r =>
    r.dailyPlan.forEach(day =>
      day.attractionIds.forEach(id => ids.add(id))
    )
  );
  return Array.from(ids);
};
