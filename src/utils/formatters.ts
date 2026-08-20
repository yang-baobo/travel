import { CostCategory } from '../types';

// 格式化价格（人民币）
export const formatPrice = (price: number): string => {
  return `${price.toFixed(0)}元`;
};

// 格式化价格（带小数，人民币）
export const formatPriceDecimal = (price: number): string => {
  return `${price.toFixed(2)}元`;
};

// 格式化时间（分钟）
export const formatDuration = (minutes: number): string => {
  if (minutes < 60) return `${minutes}分钟`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}小时${mins}分钟` : `${hours}小时`;
};

// 格式化距离
export const formatDistance = (km: number): string => {
  if (km < 1) return `${(km * 1000).toFixed(0)}米`;
  return `${km.toFixed(1)}公里`;
};

// 格式化评分
export const formatRating = (rating: number): string => {
  return rating.toFixed(1);
};

// 获取费用分类名称
export const getCategoryName = (category: CostCategory): string => {
  const map: Record<CostCategory, string> = {
    ticket: '门票',
    transport: '交通',
    food: '餐饮',
    hotel: '住宿',
    guide: '导游',
    flight: '机票',
    other: '其他',
  };
  return map[category];
};

// 获取费用分类图标
export const getCategoryIcon = (category: CostCategory): string => {
  const map: Record<CostCategory, string> = {
    ticket: 'ticket',
    transport: 'car',
    food: 'restaurant',
    hotel: 'bed',
    guide: 'people',
    flight: 'airplane',
    other: 'ellipsis-horizontal',
  };
  return map[category];
};

// 格式化日期
export const formatDate = (date: Date): string => {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}月${day}日`;
};

// 格式化天数
export const formatDays = (days: number): string => {
  if (days === 1) return '一日游';
  if (days === 2) return '两日游';
  if (days === 3) return '三日游';
  return `${days}日游`;
};

// 获取酒店等级名称
export const getHotelLevelName = (level: string): string => {
  const map: Record<string, string> = {
    budget: '经济型',
    mid: '舒适型',
    luxury: '豪华型',
  };
  return map[level] || level;
};

// 获取区域名称
export const getZoneName = (zone: string): string => {
  const map: Record<string, string> = {
    city_center: '市中心',
    near_attraction: '靠近景区',
    near_shopping: '靠近购物区',
    near_food_street: '靠近美食街',
    quiet_area: '安静休息区',
    near_metro: '靠近地铁',
    // 兼容旧的物理区域
    A: '南山区',
    B: '福田区',
    C: '罗湖区',
    D: '龙岗区',
    E: '盐田/大鹏',
    F: '宝安区',
  };
  return map[zone] || zone;
};

// 截断文本
export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
};
