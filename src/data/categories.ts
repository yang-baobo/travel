import { InterestCategory } from '../types';
import { additionalAttractionCategoryMap } from './additionalAttractionCategoryMap';

export const categories: InterestCategory[] = [
  { id: 'cat01', name: '主题乐园', icon: 'game-controller', color: '#1A73E8' },
  { id: 'cat02', name: '自然生态', icon: 'leaf', color: '#00C853' },
  { id: 'cat03', name: '文化历史', icon: 'library', color: '#6C5CE7' },
  { id: 'cat04', name: '海滨度假', icon: 'sunny', color: '#FF9800' },
  { id: 'cat05', name: '美食探店', icon: 'restaurant', color: '#E53935' },
  { id: 'cat06', name: '购物科技', icon: 'cart', color: '#00ACC1' },
  { id: 'cat07', name: '摄影打卡', icon: 'camera', color: '#42A5F5' },
  { id: 'cat08', name: '亲子活动', icon: 'people', color: '#AB47BC' },
  { id: 'cat09', name: '户外探险', icon: 'compass', color: '#F57C00' },
  { id: 'cat10', name: '艺术展览', icon: 'color-palette', color: '#7E57C2' },
];

// 景点与分类的映射关系
export const attractionCategoryMap: Record<string, string[]> = {
  a01: ['cat01', 'cat03', 'cat07'],      // 世界之窗
  a02: ['cat01', 'cat08', 'cat09'],      // 欢乐谷
  a03: ['cat03', 'cat01', 'cat07'],      // 锦绣中华
  a04: ['cat02', 'cat07', 'cat09'],      // 深圳湾公园
  a05: ['cat05', 'cat10', 'cat07'],      // 海上世界
  a06: ['cat02', 'cat03', 'cat08'],      // 莲花山公园
  a07: ['cat10', 'cat03', 'cat07'],      // 艺术馆
  a08: ['cat06', 'cat07'],              // 华强北
  a09: ['cat02', 'cat07'],              // 红树林
  a10: ['cat02', 'cat08', 'cat09'],      // 中心公园
  a11: ['cat02', 'cat03', 'cat07'],      // 仙湖植物园
  a12: ['cat03', 'cat05', 'cat08'],      // 甘坑客家小镇
  a13: ['cat04', 'cat09', 'cat08'],      // 大梅沙
  a14: ['cat01', 'cat02', 'cat09'],      // 东部华侨城
  a15: ['cat03', 'cat07', 'cat04'],      // 大鹏所城
  ...additionalAttractionCategoryMap,
};

// 按分类获取景点ID
export const getAttractionIdsByCategory = (categoryId: string): string[] =>
  Object.entries(attractionCategoryMap)
    .filter(([, cats]) => cats.includes(categoryId))
    .map(([attrId]) => attrId);
