import { PremiumCarType, RouteOption } from '../types';
import { getUniversalRoute } from './universalRoute';

export const AIRPORT_ID = 'airport-szx';

export const PREMIUM_CAR_TYPES: PremiumCarType[] = [
  { id: 'comfort', name: '舒适型', description: '帕萨特/凯美瑞等，宽敞舒适', multiplier: 1.5, serviceFee: 30 },
  { id: 'business', name: '商务型', description: '别克GL8/奔驰V级，适合多人', multiplier: 2.0, serviceFee: 50 },
  { id: 'luxury', name: '豪华型', description: '奔驰E级/宝马5系，尊贵体验', multiplier: 2.8, serviceFee: 80 },
];

export interface AirportRouteInfo {
  route: RouteOption;
  transitInfo: { time: number; distance: number; price: number; detail: string };
  drivingInfo: { time: number; distance: number; price: number };
}

export function getAirportRouteOptions(targetId: string): AirportRouteInfo | null {
  const route = getUniversalRoute(AIRPORT_ID, targetId);
  if (!route) return null;
  return {
    route,
    transitInfo: { time: route.transit.time, distance: route.transit.distance, price: route.transit.price, detail: route.transit.detail },
    drivingInfo: { time: route.driving.time, distance: route.driving.distance, price: route.driving.price },
  };
}

export function calcPremiumPrice(baseTaxiPrice: number, carTypeId: string): number {
  const carType = PREMIUM_CAR_TYPES.find(c => c.id === carTypeId);
  if (!carType) return baseTaxiPrice;
  return Math.round(baseTaxiPrice * carType.multiplier + carType.serviceFee);
}

export function calcCarCount(groupSize: number): number {
  return Math.ceil(groupSize / 4);
}
