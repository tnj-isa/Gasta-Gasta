import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyState, newId, addTransaction, removeTransaction, upsertBills, upsertCard,
  upsertRule, removeRule, setSettings, upsertCategory, removeCategory,
} from '../src/domain/model.js';

const bill = { id: 'b1', title: 'Água', kind: 'boleto', scope: 'personal', amountCents: 8000, dueDate: '2026-12-05', paidDate: null };

test('categorias iniciais', () => {
  assert.deepEqual(emptyState().categories.map(c => c.name),
    ['Mercado', 'Dia a dia', 'Lazer', 'Comer fora', 'Transporte', 'Casa', 'Saúde', 'Outros']);
});

test('estado vazio tem os valores padrão', () => {
  const s = emptyState();
  assert.equal(s.version, 1);
  assert.equal(s.settings.autoLockMs, 180000);
  assert.equal(s.settings.lastBackup, null);
  assert.equal(s.settings.recurringThrough, null);
  assert.deepEqual([s.transactions, s.bills, s.cards, s.recurring], [[], [], [], []]);
});

test('cada estado vazio tem as suas próprias categorias', () => {
  const a = emptyState();
  a.categories.pop();
  assert.equal(emptyState().categories.length, 8);
});

test('newId gera ids diferentes', () => {
  assert.notEqual(newId(), newId());
});

test('reducers não mudam o estado original', () => {
  const s = emptyState();
  const t = { id: newId(), kind: 'expense', amountCents: 1250, date: '2026-11-18', scope: 'personal', categoryId: 'mercado' };
  const s2 = addTransaction(s, t);
  assert.equal(s.transactions.length, 0);
  assert.equal(s2.transactions.length, 1);
});

test('removeTransaction tira só o lançamento pedido', () => {
  const t = (id) => ({ id, kind: 'expense', amountCents: 100, date: '2026-11-18', scope: 'personal' });
  const s = addTransaction(addTransaction(emptyState(), t('t1')), t('t2'));
  assert.deepEqual(removeTransaction(s, 't1').transactions.map(x => x.id), ['t2']);
  assert.equal(s.transactions.length, 2);
});

test('upsertBills substitui pelo id e acrescenta o que é novo', () => {
  const s1 = upsertBills(emptyState(), [bill]);
  const s2 = upsertBills(s1, [{ ...bill, amountCents: 9000 }, { ...bill, id: 'b2' }]);
  assert.deepEqual(s2.bills.map(x => [x.id, x.amountCents]), [['b1', 9000], ['b2', 8000]]);
  assert.equal(s1.bills[0].amountCents, 8000);
});

test('upsertCard e upsertRule substituem pelo id', () => {
  const c = { id: 'c1', name: 'Nubank', closingDay: 10, dueDay: 17 };
  const s1 = upsertCard(upsertCard(emptyState(), c), { ...c, dueDay: 20 });
  assert.deepEqual(s1.cards, [{ ...c, dueDay: 20 }]);
  const r = { id: 'r1', title: 'Aluguel', kind: 'bill', amountCents: 100000, dayOfMonth: 5, scope: 'personal' };
  const s2 = upsertRule(upsertRule(emptyState(), r), { ...r, amountCents: 110000 });
  assert.deepEqual(s2.recurring.map(x => x.amountCents), [110000]);
});

test('setSettings mistura só o que foi pedido', () => {
  const s = setSettings(emptyState(), { autoLockMs: 60000 });
  assert.equal(s.settings.autoLockMs, 60000);
  assert.equal(s.settings.lastBackup, null);
  assert.equal(emptyState().settings.autoLockMs, 180000);
});

test('upsertCategory renomeia ou acrescenta', () => {
  const s1 = upsertCategory(emptyState(), { id: 'lazer', name: 'Diversão' });
  assert.equal(s1.categories.find(c => c.id === 'lazer').name, 'Diversão');
  assert.equal(s1.categories.length, 8);
  const s2 = upsertCategory(s1, { id: 'pets', name: 'Pets' });
  assert.equal(s2.categories.length, 9);
  assert.equal(s2.categories.at(-1).name, 'Pets');
});

test('removeCategory move os lançamentos para outros e protege outros', () => {
  const s = addTransaction(emptyState(), { id: 't1', kind: 'expense', amountCents: 500, date: '2026-11-18', scope: 'personal', categoryId: 'lazer' });
  const s2 = removeCategory(s, 'lazer');
  assert.equal(s2.categories.some(c => c.id === 'lazer'), false);
  assert.equal(s2.transactions[0].categoryId, 'outros');
  assert.equal(removeCategory(s2, 'outros').categories.some(c => c.id === 'outros'), true);
});

test('removeCategory também reaponta contas e regras para outros', () => {
  let s = upsertBills(emptyState(), [{ ...bill, categoryId: 'casa' }, { ...bill, id: 'b2', categoryId: 'lazer' }]);
  s = upsertRule(s, { id: 'r1', title: 'Luz', kind: 'bill', amountCents: 9000, dayOfMonth: 10, scope: 'personal', categoryId: 'casa' });
  const s2 = removeCategory(s, 'casa');
  assert.deepEqual(s2.bills.map(b => b.categoryId), ['outros', 'lazer']);
  assert.equal(s2.recurring[0].categoryId, 'outros');
});

test('removeRule tira só a regra de mesmo id e deixa o que ela já criou', () => {
  const r1 = { id: 'r1', title: 'Internet', kind: 'bill', amountCents: 12000, dayOfMonth: 25, scope: 'personal' };
  const r2 = { ...r1, id: 'r2', title: 'Aluguel' };
  const s = upsertBills(upsertRule(upsertRule(emptyState(), r1), r2), [{ ...bill, id: 'r1:2026-11' }]);
  const depois = removeRule(s, 'r1');
  assert.deepEqual(depois.recurring.map((r) => r.id), ['r2']);
  assert.deepEqual(depois.bills.map((b) => b.id), ['r1:2026-11']);
  assert.equal(removeRule(s, 'nao-existe').recurring.length, 2);
  assert.equal(s.recurring.length, 2, 'não altera o estado recebido');
});
