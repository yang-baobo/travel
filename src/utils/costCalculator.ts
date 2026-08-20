import { CostItem, RouteCostItem, CostCategory } from '../types';
import { getRouteOption } from '../data/travelTimeMatrix';

// 将导游路线的费用项转换为购物车费用项
export const convertRouteCostToCartItem = (
  cost: RouteCostItem,
  mandatory: boolean,
): CostItem => ({
  id: cost.id,
  name: cost.name,
  category: cost.category,
  unitPrice: cost.unitPrice,
  quantity: cost.quantity,
  selected: mandatory,
  mandatory,
});

// 根据景点门票生成费用项
export const createTicketCostItem = (
  attractionId: string,
  name: string,
  price: number,
): CostItem => ({
  id: `ticket-${attractionId}`,
  name: `${name}门票`,
  category: 'ticket',
  unitPrice: price,
  quantity: 1,
  attractionId,
  selected: price > 0,
  mandatory: false,
});

// 根据两点间交通生成费用项
export const createTransportCostItem = (
  fromId: string,
  toId: string,
  fromName: string,
  toName: string,
  mode: 'transit' | 'driving' = 'transit',
): CostItem | null => {
  const option = getRouteOption(fromId, toId);
  if (!option) return null;

  const info = mode === 'driving' ? option.driving : option.transit;
  return {
    id: `transport-${fromId}-${toId}`,
    name: `${fromName} → ${toName} (${mode === 'driving' ? '打车' : '地铁'})`,
    category: 'transport',
    unitPrice: info.price,
    quantity: 1,
    selected: true,
    mandatory: false,
  };
};

// 创建导游日雇费用项
export const createGuideDayCostItem = (
  guideName: string,
  perDayPrice: number,
  day: number,
): CostItem => ({
  id: `guide-day-${day}`,
  name: `${guideName} - 第${day}天导游服务`,
  category: 'guide',
  unitPrice: perDayPrice,
  quantity: 1,
  selected: true,
  mandatory: false,
});

// 创建住宿费用项
export const createHotelCostItem = (
  hotelId: string,
  name: string,
  pricePerNight: number,
  nights: number,
): CostItem => ({
  id: `hotel-${hotelId}`,
  name: `${name} (${nights}晚)`,
  category: 'hotel',
  unitPrice: pricePerNight,
  quantity: nights,
  selected: true,
  mandatory: false,
});

// 计算总费用（按人）
export const calculateTotalPerPerson = (
  items: CostItem[],
  groupSize: number,
): number => {
  const total = items
    .filter(i => i.selected)
    .reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  return groupSize > 0 ? Math.ceil(total / groupSize) : total;
};

// 按分类汇总费用
export const summarizeByCategoryCost = (
  items: CostItem[],
): Record<CostCategory, number> => {
  const result: Record<CostCategory, number> = {
    ticket: 0,
    transport: 0,
    food: 0,
    hotel: 0,
    guide: 0,
    flight: 0,
    other: 0,
  };
  for (const item of items) {
    if (!item.selected) continue;
    result[item.category] += item.unitPrice * item.quantity;
  }
  return result;
};
