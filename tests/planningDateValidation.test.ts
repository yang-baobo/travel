import './setupNode';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addPlanningDays, localTodayISO, validateTravelDateRange } from '../src/services/planningDateValidation';

test('date validation uses the Asia/Shanghai calendar and rejects past stays', () => {
  const now = new Date('2026-08-29T16:30:00.000Z'); // 00:30 on Aug 30 in Shanghai
  assert.equal(localTodayISO(now), '2026-08-30');
  assert.equal(validateTravelDateRange({ startDate: '2026-08-29', endDate: '2026-09-01', now }).code, 'start_date_in_past');
  assert.equal(validateTravelDateRange({ startDate: '2026-08-30', endDate: '2026-08-31', days: 2, now }).valid, true);
});

test('date validation rejects impossible and inconsistent dates', () => {
  const now = new Date('2026-08-30T00:00:00+08:00');
  assert.equal(validateTravelDateRange({ startDate: '2026-02-31', endDate: '2026-03-03', now }).code, 'invalid_start_date');
  assert.equal(validateTravelDateRange({ startDate: '2026-09-10', endDate: '2026-09-10', now }).code, 'end_date_not_after_start');
  assert.equal(validateTravelDateRange({ startDate: '2026-09-10', endDate: '2026-09-14', days: 3, now }).code, 'days_mismatch');
  assert.equal(addPlanningDays('2026-12-31', 3), '2027-01-02');
});

test('one-day sightseeing returns on the same day without relaxing hotel date checks', () => {
  const now = new Date('2026-10-23T12:00:00+08:00');
  assert.equal(addPlanningDays('2026-10-24', 1), '2026-10-24');
  assert.equal(validateTravelDateRange({ startDate: '2026-10-24', endDate: '2026-10-24', days: 1, now }).valid, true);
  assert.equal(validateTravelDateRange({ startDate: '2026-10-24', endDate: '2026-10-24', days: 2, now }).valid, false);
  assert.equal(validateTravelDateRange({ startDate: '2026-10-24', endDate: '2026-10-25', days: 1, now }).code, 'days_mismatch');
});
