export interface TravelDateRangeInput {
  startDate: string;
  endDate: string;
  days?: number;
  now?: Date;
}

export type TravelDateValidationCode =
  | 'invalid_start_date'
  | 'invalid_end_date'
  | 'start_date_in_past'
  | 'end_date_not_after_start'
  | 'days_mismatch';

export interface TravelDateValidation {
  valid: boolean;
  code: TravelDateValidationCode | null;
  message: string | null;
  today: string;
}

function partsForShanghai(now: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}

export function localTodayISO(now: Date = new Date()): string {
  const parts = partsForShanghai(now);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function parseISODate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day, 12));
  // Date constructors normalise values such as 2026-02-31. Reject those
  // rather than silently sending a different date to a supplier.
  if (Number.isNaN(parsed.getTime())
      || parsed.getUTCFullYear() !== year
      || parsed.getUTCMonth() !== month - 1
      || parsed.getUTCDate() !== day) return null;
  return parsed;
}

export function addPlanningDays(startDate: string, days: number): string {
  const date = parseISODate(startDate);
  if (!date) return startDate;
  date.setUTCDate(date.getUTCDate() + Math.max(1, Math.floor(days) - 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function validateTravelDateRange(input: TravelDateRangeInput): TravelDateValidation {
  const today = localTodayISO(input.now);
  const start = parseISODate(input.startDate);
  const end = parseISODate(input.endDate);
  if (!start) return { valid: false, code: 'invalid_start_date', message: '出发日期格式无效，请选择有效日期。', today };
  if (!end) return { valid: false, code: 'invalid_end_date', message: '返程日期格式无效，请选择有效日期。', today };
  if (input.startDate < today) {
    return { valid: false, code: 'start_date_in_past', message: `出发日期 ${input.startDate} 已经过期，请重新选择日期。`, today };
  }
  if (input.endDate <= input.startDate) {
    return { valid: false, code: 'end_date_not_after_start', message: '返程日期必须晚于出发日期。', today };
  }
  if (input.days !== undefined && input.days >= 1 && input.endDate !== addPlanningDays(input.startDate, input.days)) {
    return { valid: false, code: 'days_mismatch', message: '行程天数与返程日期不一致，请重新确认日期和天数。', today };
  }
  return { valid: true, code: null, message: null, today };
}
