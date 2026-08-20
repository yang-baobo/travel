import { Flight, ScheduleItem } from '../types';
import { getUniversalRoute } from './universalRoute';
import { getAirportHandlingTime } from './routeGenerator';

export type PlannerPace = 'intense' | 'comfort' | 'leisure';

export interface PlannerAttractionInput {
  attractionId: string;
  durationHours: number;
}

export interface PlannerCustomBlockInput {
  day: number;
  startTime: string;
  endTime: string;
}

export interface CalculateRequiredDaysInput {
  attractions: PlannerAttractionInput[];
  mealMinutesTotal?: number;
  customBlocks?: PlannerCustomBlockInput[];
  departureFlight?: Flight | null;
  returnFlight?: Flight | null;
  dailyStartTime: string;
  dailyEndTime: string;
  pace: PlannerPace;
  transportMode: 'driving' | 'transit';
  selectedHotelIds?: Record<number, string>;
  dropOffAtHotel?: boolean;
  dailyBufferMinutes?: number;
}

export interface RouteValidationIssue {
  code:
    | 'day_end_exceeded'
    | 'overnight_item'
    | 'flight_day_misplaced'
    | 'missing_arrival_transport'
    | 'missing_departure_transport'
    | 'airport_buffer_missed'
    | 'local_item_before_arrival'
    | 'missing_daily_window';
  day: number;
  message: string;
}

export interface RouteValidationResult {
  isFeasible: boolean;
  issues: RouteValidationIssue[];
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function normalizeMinutes(minutes: number): number {
  return ((minutes % 1440) + 1440) % 1440;
}

function getDurationMinutes(start: string, end: string): number {
  return Math.max(0, timeToMinutes(end) - timeToMinutes(start));
}

function sumSequentialTransportMinutes(
  attractions: PlannerAttractionInput[],
  transportMode: 'driving' | 'transit',
): number {
  let total = 0;
  for (let index = 0; index < attractions.length - 1; index += 1) {
    const current = attractions[index];
    const next = attractions[index + 1];
    const route = getUniversalRoute(current.attractionId, next.attractionId);
    if (!route) {
      total += 20;
      continue;
    }
    total += transportMode === 'driving' ? route.driving.time : route.transit.time;
  }
  return total;
}

export function getDefaultDailyWindowForPace(pace: PlannerPace): { start: string; end: string } {
  if (pace === 'intense') return { start: '08:30', end: '21:30' };
  if (pace === 'leisure') return { start: '10:00', end: '18:00' };
  return { start: '09:30', end: '20:00' };
}

function buildDayCapacities(
  days: number,
  input: CalculateRequiredDaysInput,
): number[] {
  const startMinutes = timeToMinutes(input.dailyStartTime);
  const endMinutes = timeToMinutes(input.dailyEndTime);
  const baseAvailable = Math.max(0, endMinutes - startMinutes - (input.dailyBufferMinutes ?? 0));
  const capacities = Array.from({ length: days }, () => baseAvailable);

  (input.customBlocks ?? []).forEach((block) => {
    if (block.day < 1 || block.day > days) return;
    capacities[block.day - 1] = Math.max(0, capacities[block.day - 1] - getDurationMinutes(block.startTime, block.endTime));
  });

  if (input.departureFlight) {
    const arrivalMinutes = timeToMinutes(input.departureFlight.arrivalTime) + 30 + (input.dropOffAtHotel ? 60 : 45);
    const firstDayStart = Math.max(startMinutes, arrivalMinutes);
    capacities[0] = Math.max(0, endMinutes - firstDayStart - (input.dailyBufferMinutes ?? 0));
  }

  if (input.returnFlight) {
    const airportBuffer = 120;
    const finalTransfer = 60;
    const latestEnd = Math.min(endMinutes, timeToMinutes(input.returnFlight.departureTime) - airportBuffer - finalTransfer);
    capacities[days - 1] = Math.max(0, latestEnd - startMinutes - (input.dailyBufferMinutes ?? 0));
  }

  return capacities;
}

export function calculateRequiredDays(input: CalculateRequiredDaysInput): number {
  const attractionMinutes = input.attractions.reduce((sum, attraction) => sum + Math.round(attraction.durationHours * 60), 0);
  const transportMinutes = sumSequentialTransportMinutes(input.attractions, input.transportMode);
  const mealMinutes = input.mealMinutesTotal ?? 0;
  const totalRequiredMinutes = attractionMinutes + transportMinutes + mealMinutes;

  let days = 1;
  while (days <= 30) {
    const capacities = buildDayCapacities(days, input);
    const available = capacities.reduce((sum, minutes) => sum + minutes, 0);
    if (available >= totalRequiredMinutes) {
      return days;
    }
    days += 1;
  }

  return 30;
}

export function validateRoutePlan(params: {
  schedule: ScheduleItem[][];
  dailyStartTime: string;
  dailyEndTime: string;
  departureFlight?: Flight | null;
  returnFlight?: Flight | null;
}): RouteValidationResult {
  const issues: RouteValidationIssue[] = [];
  const dailyEndMinutes = timeToMinutes(params.dailyEndTime);

  params.schedule.forEach((dayItems, index) => {
    const day = index + 1;
    const dayFlights = dayItems.filter((item) => item.type === 'flight');

    dayItems.forEach((item) => {
      const startMinutes = timeToMinutes(item.startTime);
      const endMinutes = timeToMinutes(item.endTime);

      if (endMinutes < startMinutes) {
        issues.push({
          code: 'overnight_item',
          day,
          message: `${item.title} 被排到了跨天时间段，这条路线需要重排。`,
        });
      }

      if (item.type !== 'hotel' && item.type !== 'flight' && endMinutes > dailyEndMinutes) {
        issues.push({
          code: 'day_end_exceeded',
          day,
          message: `${item.title} 已经超过当天结束时间 ${params.dailyEndTime}。`,
        });
      }
    });

    if (dayFlights.length > 0 && day !== 1 && day !== params.schedule.length) {
      issues.push({
        code: 'flight_day_misplaced',
        day,
        message: '航班被排在了中间天数，不应该和普通景点混排。',
      });
    }
  });

  if (params.departureFlight) {
    const dayOne = params.schedule[0] ?? [];
    const departureMinutes = timeToMinutes(params.departureFlight.departureTime);
    const rawArrivalMinutes = timeToMinutes(params.departureFlight.arrivalTime);
    const arrivalMinutes = rawArrivalMinutes < departureMinutes
      ? rawArrivalMinutes + 1440
      : rawArrivalMinutes;
    const arrivalBoundary = arrivalMinutes + getAirportHandlingTime('SZX');
    const hasArrivalTransport = dayOne.some(
      (item) =>
        item.type === 'transport' &&
        ((item as ScheduleItem & { absoluteStartMinutes?: number }).absoluteStartMinutes ?? timeToMinutes(item.startTime)) >= arrivalBoundary - 5
    );
    const localBeforeArrival = dayOne.find((item) => {
      if (item.type === 'flight') return false;
      if (item.id.includes('airport-arrival')) return false;
      if (item.id.includes('no-flight')) return false;
      const absoluteStart = (item as ScheduleItem & { absoluteStartMinutes?: number }).absoluteStartMinutes ?? timeToMinutes(item.startTime);
      return absoluteStart < arrivalBoundary;
    });
    if (localBeforeArrival) {
      issues.push({
        code: 'local_item_before_arrival',
        day: 1,
        message: `${localBeforeArrival.title} 被排在到达航班完成取行李之前，首日路线必须重排。`,
      });
    }
    if (!hasArrivalTransport) {
      issues.push({
        code: 'missing_arrival_transport',
        day: 1,
        message: '到达航班后没有找到从机场出发的交通段。',
      });
    }
  }

  if (params.returnFlight) {
    const lastDayIndex = Math.max(0, params.schedule.length - 1);
    const lastDay = params.schedule[lastDayIndex] ?? [];
    const latestAirportArrival = timeToMinutes(params.returnFlight.departureTime) - 120;
    const airportTransport = lastDay
      .filter((item) => item.type === 'transport' && item.title.includes('机场'))
      .sort((a, b) => timeToMinutes(b.endTime) - timeToMinutes(a.endTime))[0];

    if (!airportTransport) {
      issues.push({
        code: 'missing_departure_transport',
        day: lastDayIndex + 1,
        message: '返程当天没有找到去机场的交通段。',
      });
    } else if (timeToMinutes(airportTransport.endTime) > latestAirportArrival) {
      issues.push({
        code: 'airport_buffer_missed',
        day: lastDayIndex + 1,
        message: `返程当天去机场过晚，未满足起飞前至少 120 分钟到机场。`,
      });
    }
  }

  return {
    isFeasible: issues.length === 0,
    issues,
  };
}
