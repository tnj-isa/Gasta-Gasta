import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBRL, formatBRL, centavosParaCampo } from '../src/lib/money.js';

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

test('centavosParaCampo: o texto que vai dentro do campo de valor, e que parseBRL lê de volta', () => {
  assert.equal(centavosParaCampo(3540), '35,40');
  assert.equal(centavosParaCampo(5), '0,05');
  assert.equal(centavosParaCampo(100), '1,00');
  assert.equal(centavosParaCampo(123456789), '1234567,89');
  for (const cents of [1, 9, 10, 99, 100, 101, 99999, 123456, 987654321]) {
    assert.equal(parseBRL(centavosParaCampo(cents)), cents, String(cents));
  }
});
