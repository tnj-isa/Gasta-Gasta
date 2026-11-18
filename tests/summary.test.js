import test from 'node:test';
import assert from 'node:assert/strict';
import { monthlySummary } from '../src/domain/summary.js';

const e = (cents, categoryId, scope, date = '2026-11-08') =>
  ({ id: categoryId + scope + cents, kind: 'expense', amountCents: cents, date, scope, categoryId });
const txs = [
  { id: 'i1', kind: 'income', amountCents: 420000, date: '2026-11-05', scope: 'personal' },
  e(90000, 'mercado', 'personal'), e(65000, 'dia-a-dia', 'personal'), e(50000, 'casa', 'personal'),
  e(20000, 'lazer', 'personal'), e(20000, 'lazer', 'work'), e(40000, 'outros', 'work'),
  e(99999, 'mercado', 'personal', '2026-10-30'),
];

test('resumo de novembro', () => {
  const r = monthlySummary(txs, '2026-11');
  assert.equal(r.inCents, 420000);
  assert.equal(r.outPersonalCents, 225000);
  assert.equal(r.outWorkCents, 60000);
  assert.equal(r.outTotalCents, 285000);
  assert.equal(r.leftCents, 135000);
  assert.equal(r.netAfterWorkCents, 360000);
  assert.deepEqual(r.byCategory, [
    { categoryId: 'mercado', cents: 90000 }, { categoryId: 'dia-a-dia', cents: 65000 },
    { categoryId: 'casa', cents: 50000 }, { categoryId: 'lazer', cents: 40000 },
    { categoryId: 'outros', cents: 40000 }]);
});

test('compra no cartão conta na data da compra, não na da fatura', () => {
  const r = monthlySummary([{ ...e(30000, 'lazer', 'personal', '2026-11-20'), method: 'card', cardId: 'c1' }], '2026-11');
  assert.equal(r.outTotalCents, 30000);
});

test('mês sem nada devolve zeros e lista vazia', () => {
  assert.deepEqual(monthlySummary(txs, '2027-03'), {
    inCents: 0, outPersonalCents: 0, outWorkCents: 0, outTotalCents: 0,
    leftCents: 0, netAfterWorkCents: 0, byCategory: [],
  });
});

test('primeiro e último dia do mês entram, dia 1 do mês seguinte não', () => {
  const r = monthlySummary([
    e(100, 'casa', 'personal', '2026-11-01'),
    e(200, 'casa', 'personal', '2026-11-30'),
    e(400, 'casa', 'personal', '2026-12-01'),
  ], '2026-11');
  assert.equal(r.outTotalCents, 300);
});

test('gasto sem categoria entra em outros', () => {
  const semCategoria = { id: 'x', kind: 'expense', amountCents: 700, date: '2026-11-02', scope: 'personal' };
  const r = monthlySummary([semCategoria, e(300, 'outros', 'personal')], '2026-11');
  assert.deepEqual(r.byCategory, [{ categoryId: 'outros', cents: 1000 }]);
});

test('entrada não aparece nas categorias, mesmo com categoryId', () => {
  const entrada = { id: 'i', kind: 'income', amountCents: 5000, date: '2026-11-02', scope: 'personal', categoryId: 'lazer' };
  assert.deepEqual(monthlySummary([entrada], '2026-11').byCategory, []);
});

test('gastando mais do que entrou, sobrou fica negativo', () => {
  const r = monthlySummary([
    { id: 'i', kind: 'income', amountCents: 10000, date: '2026-11-02', scope: 'personal' },
    e(25000, 'casa', 'personal'),
  ], '2026-11');
  assert.equal(r.leftCents, -15000);
});

test('não muda a lista recebida', () => {
  const copia = JSON.stringify(txs);
  monthlySummary(txs, '2026-11');
  assert.equal(JSON.stringify(txs), copia);
});
