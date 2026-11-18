process.env.TZ = 'America/Sao_Paulo';

import test from 'node:test';
import assert from 'node:assert/strict';
import { todayISO, monthKey, dateInMonth, addMonthsClamped, daysBetween } from '../src/lib/dates.js';

test('todayISO usa o dia local, não UTC', () => {
  assert.equal(todayISO(new Date(2026, 11, 10, 0, 30)), '2026-12-10');
  assert.equal(todayISO(new Date(2026, 11, 10, 23, 30)), '2026-12-10');
});

test('fim de mês', () => {
  assert.equal(dateInMonth('2027-02', 31), '2027-02-28');
  assert.equal(dateInMonth('2028-02', 31), '2028-02-29');
  assert.equal(addMonthsClamped('2026-12-31', 2), '2027-02-28');
  assert.equal(addMonthsClamped('2026-12-31', 3), '2027-03-31');
  assert.equal(addMonthsClamped('2026-12-10', 1), '2027-01-10');
});

test('monthKey e daysBetween', () => {
  assert.equal(monthKey('2026-11-18'), '2026-11');
  assert.equal(daysBetween('2026-11-18', '2026-12-18'), 30);
});
