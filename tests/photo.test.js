import test from 'node:test';
import assert from 'node:assert/strict';
import { draftFromReceipt, toTransaction } from '../src/ui/photo.js';

test('rascunho usa hoje quando a nota não tem data', () => {
  assert.equal(draftFromReceipt({ totalCents: 3540 }, '2026-11-18').date, '2026-11-18');
});

test('sem total, o valor fica vazio para ela digitar', () => {
  assert.equal(draftFromReceipt({}, '2026-11-18').amountCents, null);
});

test('a transação guardada não carrega imagem', () => {
  const t = toTransaction({ ...draftFromReceipt({ totalCents: 3540 }, '2026-11-18'), amountCents: 3540 });
  const permitidas = ['id', 'kind', 'amountCents', 'date', 'scope', 'categoryId', 'method', 'merchant', 'note'];
  assert.ok(Object.keys(t).every((k) => permitidas.includes(k)));
});

test('o rascunho leva o que foi lido e começa como gasto pessoal, sem categoria escolhida', () => {
  assert.deepEqual(
    draftFromReceipt({ totalCents: 3540, date: '2026-11-11', merchant: 'PADARIA DO ZE' }, '2026-11-18'),
    { kind: 'expense', amountCents: 3540, date: '2026-11-11', merchant: 'PADARIA DO ZE', scope: 'personal', categoryId: null },
  );
});

test('sem local lido, o local fica vazio (texto), nunca undefined', () => {
  assert.equal(draftFromReceipt({ totalCents: 100 }, '2026-11-18').merchant, '');
});

test('a transação tem id novo a cada vez e só os campos do lançamento, mesmo que o rascunho traga mais coisa', () => {
  const rascunho = {
    ...draftFromReceipt({ totalCents: 3540, merchant: 'LOJA X' }, '2026-11-18'),
    amountCents: 3540,
    foto: new Blob(['x']),
    texto: 'texto inteiro da nota',
    imagem: 'data:image/png;base64,AAAA',
  };
  const a = toTransaction(rascunho);
  const b = toTransaction(rascunho);
  assert.notEqual(a.id, b.id);
  assert.ok(a.id);
  assert.deepEqual(Object.keys(a).sort(), ['amountCents', 'categoryId', 'date', 'id', 'kind', 'merchant', 'scope']);
  assert.equal(JSON.stringify(a).includes('texto inteiro'), false);
});

test('sem categoria escolhida vai para "outros", e local ou descrição vazios não entram', () => {
  const t = toTransaction({ ...draftFromReceipt({ totalCents: 500 }, '2026-11-18'), amountCents: 500, note: '   ' });
  assert.equal(t.categoryId, 'outros');
  assert.equal('merchant' in t, false);
  assert.equal('note' in t, false);
});

test('a categoria escolhida, o trabalho e a descrição acompanham a transação, com os espaços das pontas cortados', () => {
  const t = toTransaction({
    kind: 'expense', amountCents: 1200, date: '2026-11-18', merchant: '  Loja Y ', scope: 'work', categoryId: 'casa', note: ' tinta ',
  });
  assert.equal(t.categoryId, 'casa');
  assert.equal(t.scope, 'work');
  assert.equal(t.merchant, 'Loja Y');
  assert.equal(t.note, 'tinta');
});

test('valor que não é inteiro positivo é recusado, para nunca gravar nota sem valor', () => {
  const base = draftFromReceipt({}, '2026-11-18');
  for (const amountCents of [null, 0, -5, 12.5, '3540', Number.NaN]) {
    assert.throws(() => toTransaction({ ...base, amountCents }), RangeError, String(amountCents));
  }
});

test('compra no cartão leva o método, o cartão e as parcelas para o lançamento', () => {
  const base = { kind: 'expense', amountCents: 9000, date: '2026-11-18', scope: 'personal', categoryId: 'casa' };
  const t = toTransaction({ ...base, method: 'card', cardId: 'c1', installments: 3 });
  assert.deepEqual([t.method, t.cardId, t.installments], ['card', 'c1', 3]);
  const sem = toTransaction({ ...base, cardId: 'c1', installments: 3 });
  assert.equal('method' in sem || 'cardId' in sem || 'installments' in sem, false, 'sem escolher cartão, nada de cartão');
  assert.throws(() => toTransaction({ ...base, method: 'card' }), RangeError);
  assert.throws(() => toTransaction({ ...base, method: 'card', cardId: 'c1', installments: 0 }), RangeError);
});
