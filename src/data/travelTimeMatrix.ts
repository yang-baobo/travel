import { RouteOption } from '../types';

// ======================================================================
// 深圳交通时间矩阵
// 覆盖 15 景点 (a01-a15) + 10 酒店 (h01-h10) + 30 餐厅 (r01-r30) = 55 个节点
// 景点/酒店间精确路线 + 餐厅↔近邻景点/酒店精确路线
// 未覆盖的远距离组合由 universalRoute.ts 基于经纬度自动估算
// 按区域真实距离和深圳交通规则估算:
// - 地铁: 票价 2-14元, 基本每站 2-3 分钟
// - 出租车/网约车: 起步 10元/2公里, 2.6元/公里 + 0.8元/分钟(拥堵)
// - 公交: 2元/次, 时间约为地铁1.3-1.8倍
// - 步行: 5km/h, 仅限 <3km 距离
// ======================================================================

type TravelTimeMatrix = Record<string, Record<string, RouteOption>>;

// 辅助函数：生成对称矩阵条目
function sym(
  from: string, to: string,
  transit: { time: number; distance: number; price: number; detail: string; transfers: number },
  driving: { time: number; distance: number; price: number },
  walking: { time: number; distance: number } | null,
  bus?: { line: string; stops: number; time: number; price: number },
): [string, string, RouteOption] {
  return [from, to, { transit, driving, walking, bus }];
}

// 生成所有点对的交通数据
const pairs: [string, string, RouteOption][] = [
  // ===================================================================
  // Zone A 内部 (a01-a05, h01-h03)
  // ===================================================================
  sym('a01', 'a02', { time: 8, distance: 1.2, price: 2, detail: '步行可达(世界之窗↔欢乐谷)', transfers: 0 }, { time: 5, distance: 1.2, price: 12 }, { time: 15, distance: 1.2 }),
  sym('a01', 'a03', { time: 5, distance: 0.5, price: 2, detail: '步行可达(紧邻)', transfers: 0 }, { time: 3, distance: 0.5, price: 10 }, { time: 6, distance: 0.5 }),
  sym('a01', 'a04', { time: 22, distance: 5.8, price: 4, detail: '1号线世界之窗→深圳湾公园', transfers: 0 }, { time: 15, distance: 6.0, price: 22 }, null, { line: 'M370', stops: 5, time: 25, price: 2 }),
  sym('a01', 'a05', { time: 35, distance: 10.5, price: 5, detail: '1号线→2号线→蛇口', transfers: 1 }, { time: 25, distance: 11, price: 35 }, null),
  sym('a02', 'a03', { time: 6, distance: 0.8, price: 2, detail: '步行可达', transfers: 0 }, { time: 4, distance: 0.8, price: 10 }, { time: 10, distance: 0.8 }),
  sym('a02', 'a04', { time: 25, distance: 6.0, price: 4, detail: '1号线→步行', transfers: 0 }, { time: 16, distance: 6.2, price: 23 }, null),
  sym('a02', 'a05', { time: 38, distance: 11, price: 5, detail: '1号线→2号线→蛇口', transfers: 1 }, { time: 28, distance: 11.5, price: 37 }, null),
  sym('a03', 'a04', { time: 20, distance: 5.5, price: 4, detail: '1号线→步行', transfers: 0 }, { time: 14, distance: 5.5, price: 21 }, null),
  sym('a03', 'a05', { time: 33, distance: 10.2, price: 5, detail: '1号线→2号线', transfers: 1 }, { time: 24, distance: 10.5, price: 34 }, null),
  sym('a04', 'a05', { time: 28, distance: 7.5, price: 4, detail: '2号线→蛇口线', transfers: 0 }, { time: 18, distance: 8, price: 27 }, null),

  // Zone A 酒店连接
  sym('h01', 'a05', { time: 8, distance: 1.5, price: 2, detail: '步行可达(蛇口)', transfers: 0 }, { time: 5, distance: 1.5, price: 12 }, { time: 18, distance: 1.5 }),
  sym('h01', 'a04', { time: 25, distance: 7, price: 4, detail: '2号线', transfers: 0 }, { time: 18, distance: 7.5, price: 26 }, null),
  sym('h01', 'a01', { time: 35, distance: 11, price: 5, detail: '2号线→1号线', transfers: 1 }, { time: 25, distance: 11, price: 35 }, null),
  sym('h01', 'a02', { time: 38, distance: 11.5, price: 5, detail: '2号线→1号线', transfers: 1 }, { time: 27, distance: 11.5, price: 37 }, null),
  sym('h01', 'a03', { time: 33, distance: 10.8, price: 5, detail: '2号线→1号线', transfers: 1 }, { time: 24, distance: 10.8, price: 34 }, null),
  sym('h02', 'a01', { time: 5, distance: 0.5, price: 2, detail: '步行可达', transfers: 0 }, { time: 3, distance: 0.5, price: 10 }, { time: 6, distance: 0.5 }),
  sym('h02', 'a02', { time: 8, distance: 1.0, price: 2, detail: '步行可达', transfers: 0 }, { time: 5, distance: 1.0, price: 11 }, { time: 12, distance: 1.0 }),
  sym('h02', 'a03', { time: 4, distance: 0.3, price: 2, detail: '步行可达', transfers: 0 }, { time: 3, distance: 0.3, price: 10 }, { time: 4, distance: 0.3 }),
  sym('h02', 'a04', { time: 22, distance: 5.8, price: 4, detail: '1号线', transfers: 0 }, { time: 15, distance: 6.0, price: 22 }, null),
  sym('h02', 'a05', { time: 35, distance: 10.5, price: 5, detail: '1号线→2号线', transfers: 1 }, { time: 25, distance: 10.5, price: 34 }, null),
  sym('h03', 'a01', { time: 15, distance: 3.5, price: 3, detail: '1号线', transfers: 0 }, { time: 10, distance: 3.5, price: 16 }, null),
  sym('h03', 'a04', { time: 18, distance: 4.0, price: 3, detail: '2号线', transfers: 0 }, { time: 12, distance: 4.0, price: 18 }, null),
  sym('h03', 'a05', { time: 22, distance: 5.0, price: 4, detail: '2号线→步行', transfers: 0 }, { time: 15, distance: 5.0, price: 20 }, null),

  // ===================================================================
  // Zone B 内部 (a06-a10, h04-h06)
  // ===================================================================
  sym('a06', 'a07', { time: 10, distance: 1.8, price: 2, detail: '步行或少年宫站', transfers: 0 }, { time: 6, distance: 2.0, price: 13 }, { time: 22, distance: 1.8 }),
  sym('a06', 'a08', { time: 18, distance: 4.5, price: 3, detail: '4号线→转7号线', transfers: 1 }, { time: 12, distance: 4.5, price: 19 }, null),
  sym('a06', 'a09', { time: 30, distance: 8.0, price: 4, detail: '4号线→1号线→步行', transfers: 1 }, { time: 22, distance: 8.5, price: 29 }, null),
  sym('a06', 'a10', { time: 12, distance: 2.5, price: 3, detail: '4号线→步行', transfers: 0 }, { time: 8, distance: 2.5, price: 14 }, { time: 30, distance: 2.5 }),
  sym('a07', 'a08', { time: 16, distance: 4.0, price: 3, detail: '7号线或步行', transfers: 0 }, { time: 10, distance: 4.0, price: 18 }, null),
  sym('a07', 'a09', { time: 28, distance: 7.5, price: 4, detail: '1号线→步行', transfers: 0 }, { time: 20, distance: 8.0, price: 28 }, null),
  sym('a07', 'a10', { time: 14, distance: 3.0, price: 3, detail: '步行或7号线', transfers: 0 }, { time: 8, distance: 3.0, price: 15 }, null),
  sym('a08', 'a09', { time: 35, distance: 10, price: 5, detail: '7号线→1号线', transfers: 1 }, { time: 25, distance: 10.5, price: 33 }, null),
  sym('a08', 'a10', { time: 10, distance: 2.0, price: 2, detail: '步行可达', transfers: 0 }, { time: 6, distance: 2.0, price: 13 }, { time: 24, distance: 2.0 }),
  sym('a09', 'a10', { time: 30, distance: 9.0, price: 5, detail: '公交或打车', transfers: 0 }, { time: 22, distance: 9.0, price: 30 }, null),

  // Zone B 酒店连接
  sym('h04', 'a06', { time: 8, distance: 1.5, price: 2, detail: '步行可达(CBD核心)', transfers: 0 }, { time: 5, distance: 1.5, price: 12 }, { time: 18, distance: 1.5 }),
  sym('h04', 'a07', { time: 6, distance: 1.0, price: 2, detail: '步行可达', transfers: 0 }, { time: 4, distance: 1.0, price: 11 }, { time: 12, distance: 1.0 }),
  sym('h04', 'a08', { time: 16, distance: 4.0, price: 3, detail: '7号线', transfers: 0 }, { time: 10, distance: 4.0, price: 18 }, null),
  sym('h04', 'a10', { time: 12, distance: 2.5, price: 2, detail: '步行或公交', transfers: 0 }, { time: 7, distance: 2.5, price: 14 }, { time: 30, distance: 2.5 }),
  sym('h05', 'a08', { time: 5, distance: 0.5, price: 2, detail: '步行可达', transfers: 0 }, { time: 3, distance: 0.5, price: 10 }, { time: 6, distance: 0.5 }),
  sym('h05', 'a06', { time: 18, distance: 4.5, price: 3, detail: '7号线→4号线', transfers: 1 }, { time: 12, distance: 4.5, price: 19 }, null),
  sym('h05', 'a10', { time: 10, distance: 2.0, price: 2, detail: '步行可达', transfers: 0 }, { time: 6, distance: 2.0, price: 13 }, { time: 24, distance: 2.0 }),
  sym('h06', 'a06', { time: 12, distance: 2.5, price: 2, detail: '4号线', transfers: 0 }, { time: 8, distance: 2.5, price: 14 }, null),
  sym('h06', 'a07', { time: 10, distance: 2.0, price: 2, detail: '步行或公交', transfers: 0 }, { time: 7, distance: 2.0, price: 13 }, { time: 24, distance: 2.0 }),
  sym('h06', 'a08', { time: 14, distance: 3.0, price: 3, detail: '7号线', transfers: 0 }, { time: 9, distance: 3.0, price: 15 }, null),
  sym('h06', 'a10', { time: 8, distance: 1.5, price: 2, detail: '步行可达', transfers: 0 }, { time: 5, distance: 1.5, price: 12 }, { time: 18, distance: 1.5 }),

  // ===================================================================
  // Zone A ↔ Zone B 跨区 (核心通勤线)
  // ===================================================================
  sym('a01', 'a06', { time: 35, distance: 13, price: 6, detail: '1号线世界之窗→会展中心→4号线', transfers: 1 }, { time: 25, distance: 13, price: 40 }, null),
  sym('a01', 'a07', { time: 38, distance: 14, price: 6, detail: '1号线→少年宫', transfers: 0 }, { time: 28, distance: 14, price: 42 }, null),
  sym('a01', 'a08', { time: 42, distance: 16, price: 7, detail: '1号线→华强北', transfers: 0 }, { time: 30, distance: 16, price: 48 }, null),
  sym('a01', 'a09', { time: 35, distance: 8.5, price: 5, detail: '1号线→公交', transfers: 1 }, { time: 25, distance: 9.0, price: 30 }, null),
  sym('a01', 'a10', { time: 40, distance: 14.5, price: 6, detail: '1号线→步行', transfers: 0 }, { time: 28, distance: 14.5, price: 43 }, null),
  sym('a04', 'a06', { time: 30, distance: 11, price: 5, detail: '2号线→换乘', transfers: 1 }, { time: 22, distance: 11, price: 35 }, null),
  sym('a04', 'a09', { time: 18, distance: 5.5, price: 3, detail: '滨海沿线公交', transfers: 0 }, { time: 15, distance: 5.5, price: 21 }, null, { line: 'M347', stops: 8, time: 22, price: 2 }),
  sym('a05', 'a06', { time: 42, distance: 17, price: 7, detail: '2号线→换乘→4号线', transfers: 1 }, { time: 30, distance: 17, price: 50 }, null),
  sym('a05', 'a07', { time: 45, distance: 18, price: 7, detail: '2号线→1号线→少年宫', transfers: 1 }, { time: 32, distance: 18, price: 52 }, null),

  // Zone A酒店 ↔ Zone B
  sym('h01', 'a06', { time: 45, distance: 18, price: 7, detail: '2号线→4号线', transfers: 1 }, { time: 32, distance: 18, price: 52 }, null),
  sym('h02', 'a06', { time: 35, distance: 13, price: 6, detail: '1号线→4号线', transfers: 1 }, { time: 25, distance: 13, price: 40 }, null),
  sym('h02', 'a08', { time: 42, distance: 16, price: 7, detail: '1号线', transfers: 0 }, { time: 30, distance: 16, price: 48 }, null),

  // Zone B酒店 ↔ Zone A
  sym('h04', 'a01', { time: 35, distance: 13, price: 6, detail: '4号线→1号线', transfers: 1 }, { time: 25, distance: 13, price: 40 }, null),
  sym('h04', 'a04', { time: 30, distance: 11, price: 5, detail: '4号线→2号线→步行', transfers: 1 }, { time: 22, distance: 11, price: 35 }, null),
  sym('h04', 'a05', { time: 42, distance: 17, price: 7, detail: '4号线→2号线', transfers: 1 }, { time: 30, distance: 17, price: 50 }, null),

  // ===================================================================
  // Zone C (a11, h07) 连接
  // ===================================================================
  sym('a11', 'a06', { time: 40, distance: 14, price: 6, detail: '公交→5号线→4号线', transfers: 1 }, { time: 28, distance: 14, price: 42 }, null),
  sym('a11', 'a07', { time: 38, distance: 13.5, price: 6, detail: '公交→5号线', transfers: 1 }, { time: 26, distance: 13.5, price: 41 }, null),
  sym('a11', 'a08', { time: 30, distance: 10, price: 5, detail: '公交→5号线→7号线', transfers: 1 }, { time: 22, distance: 10, price: 33 }, null),
  sym('a11', 'a01', { time: 55, distance: 25, price: 8, detail: '公交→5号线→1号线', transfers: 2 }, { time: 40, distance: 25, price: 70 }, null),
  sym('a11', 'a04', { time: 50, distance: 22, price: 7, detail: '公交→5号线→2号线', transfers: 2 }, { time: 35, distance: 22, price: 63 }, null),
  sym('a11', 'a09', { time: 35, distance: 18, price: 6, detail: '公交→5号线→步行', transfers: 1 }, { time: 30, distance: 18, price: 52 }, null),
  sym('h07', 'a11', { time: 25, distance: 7, price: 4, detail: '公交直达', transfers: 0 }, { time: 18, distance: 7, price: 25 }, null, { line: '220', stops: 10, time: 30, price: 2 }),
  sym('h07', 'a06', { time: 30, distance: 8, price: 4, detail: '1号线→4号线', transfers: 1 }, { time: 20, distance: 8, price: 27 }, null),
  sym('h07', 'a08', { time: 18, distance: 4.5, price: 3, detail: '1号线', transfers: 0 }, { time: 12, distance: 4.5, price: 19 }, null),
  sym('h07', 'a01', { time: 45, distance: 20, price: 7, detail: '1号线', transfers: 0 }, { time: 32, distance: 20, price: 58 }, null),

  // ===================================================================
  // Zone D (a12, h08) 连接
  // ===================================================================
  sym('a12', 'a11', { time: 35, distance: 12, price: 5, detail: '10号线→5号线→公交', transfers: 2 }, { time: 28, distance: 12, price: 38 }, null),
  sym('a12', 'a06', { time: 50, distance: 20, price: 7, detail: '10号线→4号线', transfers: 1 }, { time: 35, distance: 20, price: 58 }, null),
  sym('a12', 'a07', { time: 48, distance: 19, price: 7, detail: '10号线→4号线', transfers: 1 }, { time: 33, distance: 19, price: 55 }, null),
  sym('a12', 'a08', { time: 45, distance: 16, price: 6, detail: '10号线→7号线', transfers: 1 }, { time: 30, distance: 16, price: 48 }, null),
  sym('a12', 'a01', { time: 65, distance: 30, price: 9, detail: '10号线→1号线', transfers: 1 }, { time: 45, distance: 30, price: 84 }, null),
  sym('a12', 'a04', { time: 60, distance: 28, price: 8, detail: '10号线→1号线→2号线', transfers: 2 }, { time: 42, distance: 28, price: 79 }, null),
  sym('h08', 'a12', { time: 12, distance: 3.5, price: 3, detail: '公交直达', transfers: 0 }, { time: 8, distance: 3.5, price: 16 }, null, { line: 'M268', stops: 4, time: 15, price: 2 }),
  sym('h08', 'a06', { time: 48, distance: 19, price: 7, detail: '10号线→4号线', transfers: 1 }, { time: 33, distance: 19, price: 55 }, null),
  sym('h08', 'a11', { time: 35, distance: 12, price: 5, detail: '10号线→公交', transfers: 1 }, { time: 25, distance: 12, price: 38 }, null),

  // ===================================================================
  // Zone E (a13-a15, h09-h10) 连接
  // ===================================================================
  sym('a13', 'a14', { time: 15, distance: 4, price: 2, detail: '公交直达', transfers: 0 }, { time: 10, distance: 4, price: 18 }, null, { line: 'J1', stops: 3, time: 18, price: 2 }),
  sym('a13', 'a15', { time: 45, distance: 20, price: 6, detail: '公交(无地铁)', transfers: 0 }, { time: 35, distance: 20, price: 58 }, null, { line: 'E11', stops: 12, time: 50, price: 6 }),
  sym('a14', 'a15', { time: 50, distance: 22, price: 6, detail: '公交转乘(无直达地铁)', transfers: 1 }, { time: 38, distance: 22, price: 63 }, null),
  sym('h09', 'a13', { time: 5, distance: 0.8, price: 2, detail: '步行可达', transfers: 0 }, { time: 3, distance: 0.8, price: 10 }, { time: 10, distance: 0.8 }),
  sym('h09', 'a14', { time: 12, distance: 3.5, price: 2, detail: '公交', transfers: 0 }, { time: 8, distance: 3.5, price: 16 }, null),
  sym('h09', 'a15', { time: 45, distance: 20, price: 6, detail: '公交', transfers: 0 }, { time: 35, distance: 20, price: 58 }, null),
  sym('h10', 'a15', { time: 10, distance: 3, price: 2, detail: '公交/步行', transfers: 0 }, { time: 8, distance: 3, price: 15 }, { time: 36, distance: 3.0 }),
  sym('h10', 'a13', { time: 40, distance: 18, price: 5, detail: '公交', transfers: 0 }, { time: 30, distance: 18, price: 52 }, null),
  sym('h10', 'a14', { time: 45, distance: 19, price: 6, detail: '公交', transfers: 1 }, { time: 33, distance: 19, price: 55 }, null),

  // ===================================================================
  // Zone E ↔ 其他区域 (长途连接)
  // ===================================================================
  // a13(大梅沙) 到其他区域
  sym('a13', 'a06', { time: 65, distance: 28, price: 9, detail: '公交→8号线→2号线→4号线', transfers: 2 }, { time: 40, distance: 28, price: 79 }, null),
  sym('a13', 'a08', { time: 60, distance: 25, price: 8, detail: '8号线→2号线→7号线', transfers: 2 }, { time: 38, distance: 25, price: 70 }, null),
  sym('a13', 'a01', { time: 80, distance: 38, price: 10, detail: '8号线→2号线→1号线', transfers: 2 }, { time: 55, distance: 38, price: 104 }, null),
  sym('a13', 'a11', { time: 40, distance: 16, price: 5, detail: '8号线→公交', transfers: 1 }, { time: 28, distance: 16, price: 48 }, null),
  sym('a13', 'a12', { time: 55, distance: 22, price: 7, detail: '公交→10号线', transfers: 1 }, { time: 40, distance: 22, price: 63 }, null),

  // a14(东部华侨城)
  sym('a14', 'a06', { time: 70, distance: 30, price: 9, detail: '公交→8号线→2号线', transfers: 2 }, { time: 45, distance: 30, price: 84 }, null),
  sym('a14', 'a01', { time: 85, distance: 40, price: 11, detail: '公交→8号线→2号线→1号线', transfers: 3 }, { time: 58, distance: 40, price: 110 }, null),
  sym('a14', 'a11', { time: 45, distance: 18, price: 6, detail: '公交→8号线→步行', transfers: 1 }, { time: 30, distance: 18, price: 52 }, null),

  // a15(大鹏所城)
  sym('a15', 'a06', { time: 90, distance: 45, price: 12, detail: '公交→地铁(需较长车程)', transfers: 2 }, { time: 65, distance: 45, price: 123 }, null),
  sym('a15', 'a01', { time: 100, distance: 52, price: 14, detail: '公交→地铁长途', transfers: 2 }, { time: 75, distance: 52, price: 141 }, null),
  sym('a15', 'a11', { time: 60, distance: 32, price: 8, detail: '公交→8号线', transfers: 1 }, { time: 45, distance: 32, price: 89 }, null),
  sym('a15', 'a12', { time: 70, distance: 38, price: 10, detail: '公交长途', transfers: 1 }, { time: 55, distance: 38, price: 104 }, null),

  // Zone E酒店 ↔ 其他区域
  sym('h09', 'a06', { time: 65, distance: 28, price: 9, detail: '8号线→2号线→4号线', transfers: 2 }, { time: 40, distance: 28, price: 79 }, null),
  sym('h09', 'a01', { time: 80, distance: 38, price: 10, detail: '8号线→2号线→1号线', transfers: 2 }, { time: 55, distance: 38, price: 104 }, null),
  sym('h09', 'a11', { time: 40, distance: 16, price: 5, detail: '8号线→公交', transfers: 1 }, { time: 28, distance: 16, price: 48 }, null),
  sym('h10', 'a06', { time: 90, distance: 45, price: 12, detail: '公交→地铁', transfers: 2 }, { time: 65, distance: 45, price: 123 }, null),
  sym('h10', 'a01', { time: 100, distance: 52, price: 14, detail: '公交→地铁', transfers: 2 }, { time: 75, distance: 52, price: 141 }, null),
  sym('h10', 'a11', { time: 60, distance: 32, price: 8, detail: '公交→8号线', transfers: 1 }, { time: 45, distance: 32, price: 89 }, null),

  // ===================================================================
  // 跨Zone酒店补充连接 (确保酒店覆盖所有主要景点)
  // ===================================================================
  // h01(蛇口) → Zone B/C/D/E
  sym('h01', 'a06', { time: 45, distance: 18, price: 7, detail: '2号线→4号线', transfers: 1 }, { time: 32, distance: 18, price: 52 }, null),
  sym('h01', 'a08', { time: 50, distance: 20, price: 7, detail: '2号线→1号线→7号线', transfers: 2 }, { time: 35, distance: 20, price: 58 }, null),
  sym('h01', 'a11', { time: 60, distance: 28, price: 8, detail: '2号线→5号线→公交', transfers: 2 }, { time: 42, distance: 28, price: 79 }, null),
  sym('h01', 'a13', { time: 90, distance: 42, price: 11, detail: '2号线→8号线→公交', transfers: 2 }, { time: 60, distance: 42, price: 115 }, null),

  // h04(香格里拉) → Zone C/D/E
  sym('h04', 'a11', { time: 35, distance: 13, price: 6, detail: '4号线→5号线→公交', transfers: 1 }, { time: 25, distance: 13, price: 40 }, null),
  sym('h04', 'a12', { time: 48, distance: 19, price: 7, detail: '4号线→10号线', transfers: 1 }, { time: 33, distance: 19, price: 55 }, null),
  sym('h04', 'a13', { time: 62, distance: 27, price: 9, detail: '4号线→2号线→8号线', transfers: 2 }, { time: 40, distance: 27, price: 76 }, null),
  sym('h04', 'a14', { time: 68, distance: 29, price: 9, detail: '4号线→2号线→8号线→公交', transfers: 2 }, { time: 45, distance: 29, price: 81 }, null),
  sym('h04', 'a15', { time: 88, distance: 44, price: 12, detail: '长途公交+地铁', transfers: 2 }, { time: 63, distance: 44, price: 120 }, null),

  // h07(彭年万丽) → Zone A/D/E
  sym('h07', 'a02', { time: 48, distance: 21, price: 7, detail: '1号线', transfers: 0 }, { time: 34, distance: 21, price: 60 }, null),
  sym('h07', 'a04', { time: 42, distance: 18, price: 6, detail: '1号线→2号线', transfers: 1 }, { time: 30, distance: 18, price: 52 }, null),
  sym('h07', 'a05', { time: 50, distance: 23, price: 8, detail: '1号线→2号线', transfers: 1 }, { time: 35, distance: 23, price: 65 }, null),
  sym('h07', 'a12', { time: 40, distance: 14, price: 5, detail: '5号线→10号线', transfers: 1 }, { time: 28, distance: 14, price: 42 }, null),
  sym('h07', 'a13', { time: 50, distance: 22, price: 7, detail: '1号线→8号线', transfers: 1 }, { time: 35, distance: 22, price: 63 }, null),

  // h08(龙岗) → Zone A/E
  sym('h08', 'a01', { time: 65, distance: 30, price: 9, detail: '10号线→1号线', transfers: 1 }, { time: 45, distance: 30, price: 84 }, null),
  sym('h08', 'a04', { time: 58, distance: 27, price: 8, detail: '10号线→1号线→2号线', transfers: 2 }, { time: 40, distance: 27, price: 76 }, null),
  sym('h08', 'a08', { time: 42, distance: 16, price: 6, detail: '10号线→7号线', transfers: 1 }, { time: 28, distance: 16, price: 48 }, null),
  sym('h08', 'a13', { time: 50, distance: 20, price: 7, detail: '公交→8号线', transfers: 1 }, { time: 35, distance: 20, price: 58 }, null),

  // ===================================================================
  // 酒店之间的连接 (方便换酒店场景)
  // ===================================================================
  sym('h01', 'h02', { time: 35, distance: 11, price: 5, detail: '2号线→1号线', transfers: 1 }, { time: 25, distance: 11, price: 35 }, null),
  sym('h01', 'h04', { time: 45, distance: 18, price: 7, detail: '2号线→4号线', transfers: 1 }, { time: 32, distance: 18, price: 52 }, null),
  sym('h02', 'h04', { time: 35, distance: 13, price: 6, detail: '1号线→4号线', transfers: 1 }, { time: 25, distance: 13, price: 40 }, null),
  sym('h04', 'h07', { time: 25, distance: 7, price: 4, detail: '1号线', transfers: 0 }, { time: 18, distance: 7, price: 25 }, null),
  sym('h04', 'h09', { time: 62, distance: 27, price: 9, detail: '4号线→2号线→8号线', transfers: 2 }, { time: 40, distance: 27, price: 76 }, null),
  sym('h07', 'h09', { time: 50, distance: 22, price: 7, detail: '1号线→8号线', transfers: 1 }, { time: 35, distance: 22, price: 63 }, null),
  sym('h07', 'h08', { time: 40, distance: 14, price: 5, detail: '5号线→10号线', transfers: 1 }, { time: 28, distance: 14, price: 42 }, null),
  sym('h09', 'h10', { time: 45, distance: 20, price: 6, detail: '公交', transfers: 0 }, { time: 35, distance: 20, price: 58 }, null),
  sym('h03', 'h04', { time: 30, distance: 12, price: 5, detail: '2号线→4号线', transfers: 1 }, { time: 22, distance: 12, price: 38 }, null),
  sym('h05', 'h07', { time: 18, distance: 4.5, price: 3, detail: '7号线→1号线', transfers: 1 }, { time: 12, distance: 4.5, price: 19 }, null),

  // ===================================================================
  // 餐厅连接 (r01-r30 ↔ 近邻景点/酒店)
  // 基于餐厅 nearbyAttractions 和实际位置
  // ===================================================================

  // Zone A 餐厅
  sym('r01', 'a01', { time: 5, distance: 0.5, price: 2, detail: '步行可达(春满园↔世界之窗)', transfers: 0 }, { time: 3, distance: 0.5, price: 10 }, { time: 6, distance: 0.5 }),
  sym('r01', 'a03', { time: 4, distance: 0.4, price: 2, detail: '步行可达', transfers: 0 }, { time: 3, distance: 0.4, price: 10 }, { time: 5, distance: 0.4 }),
  sym('r01', 'h02', { time: 3, distance: 0.3, price: 2, detail: '步行可达', transfers: 0 }, { time: 2, distance: 0.3, price: 10 }, { time: 4, distance: 0.3 }),
  sym('r02', 'a04', { time: 8, distance: 1.5, price: 2, detail: '步行/短途公交', transfers: 0 }, { time: 5, distance: 1.5, price: 12 }, { time: 18, distance: 1.5 }),
  sym('r02', 'a05', { time: 12, distance: 3.0, price: 3, detail: '公交/打车', transfers: 0 }, { time: 8, distance: 3.0, price: 15 }, null),
  sym('r03', 'a05', { time: 6, distance: 1.0, price: 2, detail: '步行可达(蛇口渔港)', transfers: 0 }, { time: 4, distance: 1.0, price: 11 }, { time: 12, distance: 1.0 }),
  sym('r03', 'h01', { time: 5, distance: 0.8, price: 2, detail: '步行可达(希尔顿)', transfers: 0 }, { time: 3, distance: 0.8, price: 10 }, { time: 10, distance: 0.8 }),
  sym('r04', 'a01', { time: 3, distance: 0.2, price: 2, detail: '步行(世界之窗旁)', transfers: 0 }, { time: 2, distance: 0.2, price: 10 }, { time: 3, distance: 0.2 }),
  sym('r04', 'a02', { time: 5, distance: 0.6, price: 2, detail: '步行可达(欢乐谷)', transfers: 0 }, { time: 3, distance: 0.6, price: 10 }, { time: 8, distance: 0.6 }),
  sym('r04', 'h02', { time: 4, distance: 0.3, price: 2, detail: '步行可达', transfers: 0 }, { time: 3, distance: 0.3, price: 10 }, { time: 4, distance: 0.3 }),
  sym('r05', 'a04', { time: 6, distance: 1.2, price: 2, detail: '步行/短途(深圳湾)', transfers: 0 }, { time: 4, distance: 1.2, price: 11 }, { time: 15, distance: 1.2 }),
  sym('r06', 'a01', { time: 8, distance: 1.5, price: 2, detail: '步行(欢乐海岸→世界之窗)', transfers: 0 }, { time: 5, distance: 1.5, price: 12 }, { time: 18, distance: 1.5 }),
  sym('r06', 'a04', { time: 10, distance: 2.5, price: 3, detail: '步行/公交', transfers: 0 }, { time: 7, distance: 2.5, price: 14 }, { time: 30, distance: 2.5 }),
  sym('r07', 'a01', { time: 8, distance: 1.8, price: 2, detail: '步行/公交', transfers: 0 }, { time: 5, distance: 1.8, price: 13 }, { time: 22, distance: 1.8 }),
  sym('r07', 'a03', { time: 6, distance: 1.2, price: 2, detail: '步行可达', transfers: 0 }, { time: 4, distance: 1.2, price: 11 }, { time: 15, distance: 1.2 }),
  sym('r08', 'a05', { time: 5, distance: 0.8, price: 2, detail: '步行(海上世界)', transfers: 0 }, { time: 3, distance: 0.8, price: 10 }, { time: 10, distance: 0.8 }),
  sym('r08', 'h01', { time: 4, distance: 0.5, price: 2, detail: '步行(希尔顿附近)', transfers: 0 }, { time: 3, distance: 0.5, price: 10 }, { time: 6, distance: 0.5 }),

  // Zone B 餐厅
  sym('r09', 'a06', { time: 6, distance: 1.0, price: 2, detail: '步行(莲花山旁)', transfers: 0 }, { time: 4, distance: 1.0, price: 11 }, { time: 12, distance: 1.0 }),
  sym('r09', 'a07', { time: 8, distance: 1.5, price: 2, detail: '步行/公交', transfers: 0 }, { time: 5, distance: 1.5, price: 12 }, { time: 18, distance: 1.5 }),
  sym('r09', 'h04', { time: 8, distance: 1.5, price: 2, detail: '步行/公交', transfers: 0 }, { time: 5, distance: 1.5, price: 12 }, { time: 18, distance: 1.5 }),
  sym('r10', 'a08', { time: 5, distance: 0.8, price: 2, detail: '步行(华强北)', transfers: 0 }, { time: 3, distance: 0.8, price: 10 }, { time: 10, distance: 0.8 }),
  sym('r10', 'h05', { time: 6, distance: 1.0, price: 2, detail: '步行可达', transfers: 0 }, { time: 4, distance: 1.0, price: 11 }, { time: 12, distance: 1.0 }),
  sym('r11', 'a06', { time: 5, distance: 0.8, price: 2, detail: '步行(皇庭广场)', transfers: 0 }, { time: 3, distance: 0.8, price: 10 }, { time: 10, distance: 0.8 }),
  sym('r11', 'a07', { time: 8, distance: 1.5, price: 2, detail: '步行/公交', transfers: 0 }, { time: 5, distance: 1.5, price: 12 }, { time: 18, distance: 1.5 }),
  sym('r12', 'a06', { time: 6, distance: 1.0, price: 2, detail: '步行(COCO Park)', transfers: 0 }, { time: 4, distance: 1.0, price: 11 }, { time: 12, distance: 1.0 }),
  sym('r12', 'h04', { time: 5, distance: 0.8, price: 2, detail: '步行可达', transfers: 0 }, { time: 3, distance: 0.8, price: 10 }, { time: 10, distance: 0.8 }),
  sym('r13', 'a09', { time: 8, distance: 2.0, price: 2, detail: '步行/公交(红树林)', transfers: 0 }, { time: 6, distance: 2.0, price: 13 }, { time: 24, distance: 2.0 }),
  sym('r14', 'a10', { time: 6, distance: 1.2, price: 2, detail: '步行(中心城)', transfers: 0 }, { time: 4, distance: 1.2, price: 11 }, { time: 15, distance: 1.2 }),
  sym('r14', 'a06', { time: 8, distance: 1.8, price: 2, detail: '步行/公交', transfers: 0 }, { time: 5, distance: 1.8, price: 13 }, { time: 22, distance: 1.8 }),
  sym('r14', 'h06', { time: 5, distance: 0.8, price: 2, detail: '步行可达', transfers: 0 }, { time: 3, distance: 0.8, price: 10 }, { time: 10, distance: 0.8 }),
  sym('r15', 'a06', { time: 5, distance: 0.6, price: 2, detail: '步行(金田路)', transfers: 0 }, { time: 3, distance: 0.6, price: 10 }, { time: 8, distance: 0.6 }),
  sym('r15', 'a07', { time: 6, distance: 1.0, price: 2, detail: '步行可达', transfers: 0 }, { time: 4, distance: 1.0, price: 11 }, { time: 12, distance: 1.0 }),
  sym('r16', 'a08', { time: 8, distance: 1.8, price: 2, detail: '步行/公交', transfers: 0 }, { time: 5, distance: 1.8, price: 13 }, { time: 22, distance: 1.8 }),
  sym('r16', 'a10', { time: 6, distance: 1.2, price: 2, detail: '步行(深纺大厦)', transfers: 0 }, { time: 4, distance: 1.2, price: 11 }, { time: 15, distance: 1.2 }),
  sym('r17', 'a10', { time: 5, distance: 0.8, price: 2, detail: '步行(中心公园)', transfers: 0 }, { time: 3, distance: 0.8, price: 10 }, { time: 10, distance: 0.8 }),
  sym('r18', 'a06', { time: 5, distance: 0.8, price: 2, detail: '步行(购物公园)', transfers: 0 }, { time: 3, distance: 0.8, price: 10 }, { time: 10, distance: 0.8 }),
  sym('r18', 'a07', { time: 8, distance: 1.5, price: 2, detail: '步行/公交', transfers: 0 }, { time: 5, distance: 1.5, price: 12 }, { time: 18, distance: 1.5 }),

  // Zone C 餐厅
  sym('r19', 'a11', { time: 10, distance: 2.5, price: 3, detail: '公交/打车(东门老街)', transfers: 0 }, { time: 7, distance: 2.5, price: 14 }, { time: 30, distance: 2.5 }),
  sym('r19', 'h07', { time: 8, distance: 2.0, price: 2, detail: '公交', transfers: 0 }, { time: 6, distance: 2.0, price: 13 }, { time: 24, distance: 2.0 }),
  sym('r20', 'a11', { time: 5, distance: 0.5, price: 2, detail: '步行(仙湖园内)', transfers: 0 }, { time: 3, distance: 0.5, price: 10 }, { time: 6, distance: 0.5 }),
  sym('r21', 'a11', { time: 8, distance: 2.0, price: 2, detail: '步行/公交', transfers: 0 }, { time: 6, distance: 2.0, price: 13 }, { time: 24, distance: 2.0 }),
  sym('r22', 'a11', { time: 10, distance: 2.5, price: 3, detail: '公交(国贸)', transfers: 0 }, { time: 7, distance: 2.5, price: 14 }, { time: 30, distance: 2.5 }),
  sym('r22', 'h07', { time: 6, distance: 1.2, price: 2, detail: '步行/公交', transfers: 0 }, { time: 4, distance: 1.2, price: 11 }, { time: 15, distance: 1.2 }),

  // Zone D 餐厅
  sym('r23', 'a12', { time: 3, distance: 0.3, price: 2, detail: '步行(甘坑小镇内)', transfers: 0 }, { time: 2, distance: 0.3, price: 10 }, { time: 4, distance: 0.3 }),
  sym('r23', 'h08', { time: 10, distance: 3.0, price: 3, detail: '公交', transfers: 0 }, { time: 7, distance: 3.0, price: 15 }, null),
  sym('r24', 'a12', { time: 2, distance: 0.2, price: 2, detail: '步行(甘坑小镇内)', transfers: 0 }, { time: 2, distance: 0.2, price: 10 }, { time: 3, distance: 0.2 }),
  sym('r25', 'a12', { time: 8, distance: 2.0, price: 2, detail: '公交/打车', transfers: 0 }, { time: 5, distance: 2.0, price: 13 }, { time: 24, distance: 2.0 }),
  sym('r26', 'a12', { time: 6, distance: 1.5, price: 2, detail: '公交', transfers: 0 }, { time: 4, distance: 1.5, price: 12 }, { time: 18, distance: 1.5 }),

  // Zone E 餐厅
  sym('r27', 'a13', { time: 5, distance: 0.8, price: 2, detail: '步行(大梅沙海滨)', transfers: 0 }, { time: 3, distance: 0.8, price: 10 }, { time: 10, distance: 0.8 }),
  sym('r27', 'a14', { time: 12, distance: 3.5, price: 3, detail: '公交(→华侨城)', transfers: 0 }, { time: 8, distance: 3.5, price: 16 }, null),
  sym('r27', 'h09', { time: 6, distance: 1.0, price: 2, detail: '步行可达', transfers: 0 }, { time: 4, distance: 1.0, price: 11 }, { time: 12, distance: 1.0 }),
  sym('r28', 'a14', { time: 3, distance: 0.3, price: 2, detail: '步行(茶溪谷内)', transfers: 0 }, { time: 2, distance: 0.3, price: 10 }, { time: 4, distance: 0.3 }),
  sym('r29', 'a15', { time: 5, distance: 0.8, price: 2, detail: '步行(较场尾)', transfers: 0 }, { time: 3, distance: 0.8, price: 10 }, { time: 10, distance: 0.8 }),
  sym('r29', 'h10', { time: 8, distance: 2.5, price: 2, detail: '步行/短途公交', transfers: 0 }, { time: 5, distance: 2.5, price: 14 }, { time: 30, distance: 2.5 }),
  sym('r30', 'a15', { time: 3, distance: 0.3, price: 2, detail: '步行(大鹏古城内)', transfers: 0 }, { time: 2, distance: 0.3, price: 10 }, { time: 4, distance: 0.3 }),
  sym('r30', 'h10', { time: 8, distance: 2.5, price: 2, detail: '步行/短途公交', transfers: 0 }, { time: 5, distance: 2.5, price: 14 }, { time: 30, distance: 2.5 }),
];

// 构建双向查找矩阵
function buildMatrix(data: [string, string, RouteOption][]): TravelTimeMatrix {
  const matrix: TravelTimeMatrix = {};
  for (const [from, to, option] of data) {
    if (!matrix[from]) matrix[from] = {};
    if (!matrix[to]) matrix[to] = {};
    matrix[from][to] = option;
    matrix[to][from] = option; // 对称
  }
  return matrix;
}

export const travelTimeMatrix: TravelTimeMatrix = buildMatrix(pairs);

// 查询两点之间交通信息
export const getRouteOption = (from: string, to: string): RouteOption | null => {
  if (from === to) return null;
  return travelTimeMatrix[from]?.[to] ?? null;
};

// 获取某个节点到所有其他节点的交通信息
export const getRoutesFrom = (from: string): Record<string, RouteOption> => {
  return travelTimeMatrix[from] ?? {};
};

// 获取矩阵中所有节点ID
export const getAllMatrixNodes = (): string[] => {
  return Object.keys(travelTimeMatrix);
};

// 统计矩阵覆盖数量
export const getMatrixPairCount = (): number => {
  let count = 0;
  const nodes = Object.keys(travelTimeMatrix);
  for (const from of nodes) {
    count += Object.keys(travelTimeMatrix[from]).length;
  }
  return count / 2; // 对称矩阵，除以2
};
