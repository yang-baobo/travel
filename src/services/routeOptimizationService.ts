import { apiRequest } from './apiClient';

export interface RouteOptimizationAttraction {
  id: string;
  duration_minutes: number;
  opening_windows: [number, number][];
  opening_windows_by_day?: Record<number, [number, number][]>;
  priority: number;
}

export interface RouteOptimizationDay {
  day: number;
  start_minute: number;
  end_minute: number;
  start_anchor_id: string | null;
  end_anchor_id: string | null;
  reserved_minutes: number;
}

export interface RouteOptimizationRequest {
  attractions: RouteOptimizationAttraction[];
  days: RouteOptimizationDay[];
  matrix: {
    node_ids: string[];
    durations: number[][];
  };
  max_solve_seconds?: number;
}

export interface RouteOptimizationStop {
  attraction_id: string;
  arrival_minute: number;
  end_minute: number;
}

export interface RouteOptimizationResponse {
  solver: 'google-or-tools';
  status: 'optimized' | 'partial' | 'infeasible';
  days: Array<{
    day: number;
    attraction_ids: string[];
    stops: RouteOptimizationStop[];
    travel_minutes: number;
  }>;
  unassigned_attraction_ids: string[];
  total_travel_minutes: number;
  solve_time_ms: number;
}

const ROUTE_API_URL = '/api/travel/optimize-route';

function parseClock(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

/** Convert display strings such as `09:00-18:00 (周一闭馆)` into solver windows. */
export function parseOpeningWindows(openingHours: string): [number, number][] {
  if (openingHours.includes('全天') || openingHours.includes('24小时')) {
    return [[0, 1440]];
  }

  const windows: [number, number][] = [];
  const matches = openingHours.matchAll(/(\d{1,2}:\d{2})\s*[-–—至]\s*(\d{1,2}:\d{2})/g);
  for (const match of matches) {
    const start = parseClock(match[1]);
    const end = parseClock(match[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (end >= start) {
      windows.push([start, end]);
    } else {
      windows.push([start, 1440], [0, end]);
    }
  }
  return windows.length > 0 ? windows : [[0, 1440]];
}

const CLOSED_WEEKDAY_PATTERNS: Array<[number, RegExp]> = [
  [1, /周一闭馆/],
  [2, /周二闭馆/],
  [3, /周三闭馆/],
  [4, /周四闭馆/],
  [5, /周五闭馆/],
  [6, /周六闭馆/],
  [0, /周日闭馆|周天闭馆/],
];

export function isAttractionClosedOnDate(openingHours: string, date: string): boolean {
  const weekday = new Date(`${date}T12:00:00`).getDay();
  return CLOSED_WEEKDAY_PATTERNS.some(([closedWeekday, pattern]) => (
    closedWeekday === weekday && pattern.test(openingHours)
  ));
}

function isOptimizationResponse(value: unknown): value is RouteOptimizationResponse {
  if (!value || typeof value !== 'object') return false;
  const response = value as Partial<RouteOptimizationResponse>;
  return response.solver === 'google-or-tools'
    && ['optimized', 'partial', 'infeasible'].includes(response.status || '')
    && Array.isArray(response.days)
    && Array.isArray(response.unassigned_attraction_ids);
}

export async function optimizeTravelRoute(
  payload: RouteOptimizationRequest,
  timeoutMs = 10_000,
): Promise<RouteOptimizationResponse> {
  const result: unknown = await apiRequest(ROUTE_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, timeoutMs);
  if (!isOptimizationResponse(result)) {
    throw new Error('Route optimization returned an invalid response');
  }
  return result;
}
