process.env.TZ = 'America/Sao_Paulo';

import test from 'node:test';
import assert from 'node:assert/strict';
import { todayISO, monthKey, dateInMonth, addMonthsClamped, daysBetween, shiftMonth, monthLabel, shortDate } from '../src/lib/dates.js';

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

test('shiftMonth anda de mês em mês, virando o ano', () => {
  assert.equal(shiftMonth('2026-11', 1), '2026-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2027-01', -1), '2026-12');
  assert.equal(shiftMonth('2026-03', -14), '2025-01');
  assert.equal(shiftMonth('2026-03', 0), '2026-03');
});

test('monthLabel escreve o mês em português com inicial maiúscula', () => {
  assert.equal(monthLabel('2026-11'), 'Novembro de 2026');
  assert.equal(monthLabel('2027-03'), 'Março de 2027');
});

test('shortDate mostra dia e mês abreviado', () => {
  assert.equal(shortDate('2026-11-08'), '8/nov');
  assert.equal(shortDate('2027-02-28'), '28/fev');
  assert.equal(shortDate('2026-12-01'), '1/dez');
});
