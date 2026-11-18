import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBRL, formatBRL } from '../src/lib/money.js';

test('parseBRL aceita formatos brasileiros', () => {
  assert.equal(parseBRL('1.234,56'), 123456);
  assert.equal(parseBRL('12,5'), 1250);
  assert.equal(parseBRL('R$ 0,99'), 99);
  assert.equal(parseBRL('50'), 5000);
});

test('parseBRL recusa vazio, zero, negativo e texto', () => {
  for (const bad of ['', '0', '0,00', '-5', 'abc']) assert.throws(() => parseBRL(bad), RangeError);
});

test('formatBRL', () => {
  assert.equal(formatBRL(123456).replace(/\s/g, ' '), 'R$ 1.234,56');
});
