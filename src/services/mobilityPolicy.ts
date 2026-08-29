import type { PlanningRequest } from '../types/planning';
import type { TravelPlace } from '../types/travel';

export const LIMITED_MOBILITY_DEFAULTS = {
  maxWalkingMinutesPerDay: 60,
  maxWalkingMinutesPerSegment: 10,
  minimumRestMinutes: 20,
} as const;

export interface PlaceAccessibilityAssessment {
  status: 'verified' | 'limited' | 'unknown';
  walkingEvidence: 'low' | 'high' | 'unknown';
  likelyStairs: boolean;
  reasons: string[];
}

function searchable(place: TravelPlace): string {
  return [place.name, place.typeName, place.address, place.businessArea, ...place.tags].filter(Boolean).join(' ');
}

function hasLimitedMobility(request: PlanningRequest): boolean {
  return request.hardConstraints.mobilityLimitations.length > 0
    || request.preferenceSnapshot.elderlyMode
    || (request.derivedConstraints || []).some(item => ['limited_mobility', 'elderly_companions', 'low_walking'].includes(item.type));
}

export function assessPlaceAccessibility(place: TravelPlace): PlaceAccessibilityAssessment {
  const text = searchable(place);
  const accessible = /无障碍|无障碍入口|电梯|观光车|接驳车|摆渡车|平缓|少台阶|无台阶/.test(text);
  const highEffort = /长城|登山|爬山|徒步|山顶|陡坡|长阶梯|大量台阶|香山|八达岭/.test(text);
  const likelyStairs = /阶梯|台阶|登山|山顶|宫殿|城墙/.test(text);
  if (accessible && !highEffort) return { status: 'verified', walkingEvidence: 'low', likelyStairs, reasons: ['公开地点字段包含无障碍、接驳或少台阶信息'] };
  if (highEffort && !accessible) return { status: 'limited', walkingEvidence: 'high', likelyStairs, reasons: ['公开地点名称或标签提示可能存在长距离步行、坡道或台阶'] };
  return { status: 'unknown', walkingEvidence: 'unknown', likelyStairs, reasons: ['高德当前地点字段不足以确认景区内部步行与无障碍条件'] };
}

export function isMobilityConflict(place: TravelPlace, request: PlanningRequest): boolean {
  return hasLimitedMobility(request) && assessPlaceAccessibility(place).status === 'limited';
}

export function mobilityExplanation(request: PlanningRequest): string[] {
  if (!hasLimitedMobility(request)) return [];
  const derived = request.derivedConstraints || [];
  return Array.from(new Set([
    '已启用行动便利优先：减少长距离步行、长阶梯和连续高体力活动。',
    `单段步行上限 ${request.hardConstraints.maxWalkingMinutesPerSegment || LIMITED_MOBILITY_DEFAULTS.maxWalkingMinutesPerSegment} 分钟，每天步行上限 ${request.hardConstraints.maxWalkingMinutesPerDay || LIMITED_MOBILITY_DEFAULTS.maxWalkingMinutesPerDay} 分钟。`,
    derived.some(item => item.type === 'door_to_door_transport') ? '优先门到门交通，减少车站与入口之间的步行。' : '',
    derived.some(item => item.type === 'rest_breaks') ? `连续活动后预留至少 ${LIMITED_MOBILITY_DEFAULTS.minimumRestMinutes} 分钟缓冲。` : '',
  ].filter(Boolean)));
}
