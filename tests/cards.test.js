import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addTransactionWithCards, buildCard, cardPurchaseFields, confirmStatement, faturasDosCartoes, MAX_PARCELAS, parseInstallments, predictedStatements,
  removeTransactionWithCards, statementFor, syncCardStatements, transactionFromFields, updateTransactionWithCards,
} from '../src/domain/cards.js';
import { payBill } from '../src/domain/bills.js';
import { addTransaction, emptyState, upsertBills, upsertCard } from '../src/domain/model.js';
import { monthlySummary } from '../src/domain/summary.js';

const c1 = { id: 'c1', name: 'Cartão roxo', closingDay: 5, dueDay: 12 };

test('compra até o fechamento entra na fatura do mês', () => {
  assert.deepEqual(statementFor(c1, '2026-11-05'), { closing: '2026-11-05', due: '2026-11-12' });
});

test('compra depois do fechamento vai para a fatura seguinte', () => {
  assert.deepEqual(statementFor(c1, '2026-11-06'), { closing: '2026-12-05', due: '2026-12-12' });
});

test('vencimento antes do fechamento cai no mês seguinte', () => {
  const c2 = { id: 'c2', name: 'Azul', closingDay: 28, dueDay: 5 };
  assert.deepEqual(statementFor(c2, '2026-11-10'), { closing: '2026-11-28', due: '2026-12-05' });
});

test('fechamento dia 31 em fevereiro', () => {
  const c3 = { id: 'c3', name: 'Verde', closingDay: 31, dueDay: 10 };
  assert.deepEqual(statementFor(c3, '2027-02-28'), { closing: '2027-02-28', due: '2027-03-10' });
});

test('virada de ano: compra de dezembro depois do fechamento vai para janeiro', () => {
  assert.deepEqual(statementFor(c1, '2026-12-20'), { closing: '2027-01-05', due: '2027-01-12' });
  assert.deepEqual(statementFor(c1, '2026-12-05'), { closing: '2026-12-05', due: '2026-12-12' });
});

test('vencimento no mesmo dia do fechamento cai no mês seguinte', () => {
  const c = { id: 'c', name: 'X', closingDay: 10, dueDay: 10 };
  assert.deepEqual(statementFor(c, '2026-11-10'), { closing: '2026-11-10', due: '2026-12-10' });
});

test('vencimento dia 31 em mês de 30 dias cai no dia 30', () => {
  const c = { id: 'c', name: 'X', closingDay: 5, dueDay: 31 };
  assert.deepEqual(statementFor(c, '2026-11-02'), { closing: '2026-11-05', due: '2026-11-30' });
});

test('fechamento dia 31: janeiro tem 31, fevereiro 28 (ou 29 em ano bissexto), abril 30', () => {
  const c = { id: 'c', name: 'X', closingDay: 31, dueDay: 10 };
  assert.deepEqual(statementFor(c, '2027-01-31'), { closing: '2027-01-31', due: '2027-02-10' });
  assert.deepEqual(statementFor(c, '2028-02-10'), { closing: '2028-02-29', due: '2028-03-10' });
  assert.deepEqual(statementFor(c, '2028-03-01'), { closing: '2028-03-31', due: '2028-04-10' });
  assert.deepEqual(statementFor(c, '2026-04-30'), { closing: '2026-04-30', due: '2026-05-10' });
});

test('fechamento dia 29 em fevereiro de ano comum: o dia 28 ainda fecha, o 1º de março vai para a fatura de março', () => {
  const c = { id: 'c', name: 'X', closingDay: 29, dueDay: 10 };
  assert.deepEqual(statementFor(c, '2027-02-28'), { closing: '2027-02-28', due: '2027-03-10' });
  assert.deepEqual(statementFor(c, '2027-03-01'), { closing: '2027-03-29', due: '2027-04-10' });
});

const compra = {
  id: 't1', kind: 'expense', amountCents: 10000, date: '2026-11-06', scope: 'personal',
  method: 'card', cardId: 'c1', installments: 3,
};

test('compra parcelada divide entre faturas consecutivas', () => {
  const r = predictedStatements(c1, [compra], []);
  assert.deepEqual(r.map((b) => [b.dueDate, b.amountCents]),
    [['2026-12-12', 3334], ['2027-01-12', 3333], ['2027-02-12', 3333]]);
});

test('fatura confirmada pela pessoa não é sobrescrita', () => {
  const feita = {
    id: 'b1', title: 'Cartão roxo', kind: 'card_statement', scope: 'personal', cardId: 'c1',
    dueDate: '2026-12-12', amountCents: 95000, paidDate: null, confirmed: true,
  };
  const r = predictedStatements(c1, [compra], [feita]);
  assert.equal(r.find((b) => b.dueDate === '2026-12-12').amountCents, 95000);
});

test('fatura prevista tem os campos de uma fatura de cartão, não paga e não confirmada', () => {
  const [b] = predictedStatements(c1, [{ ...compra, installments: undefined }], []);
  assert.equal(typeof b.id, 'string');
  assert.deepEqual({ ...b, id: 'x' }, {
    id: 'x', title: 'Cartão roxo', kind: 'card_statement', scope: 'personal', cardId: 'c1',
    dueDate: '2026-12-12', amountCents: 10000, paidDate: null, confirmed: false,
  });
});

test('o resto dos centavos fica na primeira parcela e a soma fecha com o total', () => {
  const r = predictedStatements(c1, [{ ...compra, amountCents: 10001 }], []);
  assert.deepEqual(r.map((b) => b.amountCents), [3335, 3333, 3333]);
  assert.equal(r.reduce((s, b) => s + b.amountCents, 0), 10001);
});

test('valor menor que o número de parcelas não gera fatura de zero centavo', () => {
  const r = predictedStatements(c1, [{ ...compra, amountCents: 2 }], []);
  assert.deepEqual(r.map((b) => [b.dueDate, b.amountCents]), [['2026-12-12', 2]]);
});

test('compras no mesmo ciclo somam numa fatura só, em ordem de vencimento', () => {
  const outra = { ...compra, id: 't2', amountCents: 2000, date: '2026-11-20', installments: 1 };
  const antes = { ...compra, id: 't3', amountCents: 500, date: '2026-11-01', installments: 1 };
  const r = predictedStatements(c1, [compra, outra, antes], []);
  assert.deepEqual(r.map((b) => [b.dueDate, b.amountCents]),
    [['2026-11-12', 500], ['2026-12-12', 3334 + 2000], ['2027-01-12', 3333], ['2027-02-12', 3333]]);
});

test('só entram compras no cartão desta fatura: outro cartão, outro método e entradas ficam de fora', () => {
  const lixo = [
    { ...compra, id: 'a', cardId: 'c2' },
    { ...compra, id: 'b', method: 'pix' },
    { ...compra, id: 'c', method: undefined },
    { ...compra, id: 'd', kind: 'income' },
  ];
  assert.deepEqual(predictedStatements(c1, lixo, []), []);
});

test('quantidade de parcelas inválida conta como compra à vista', () => {
  for (const installments of [0, -2, 2.5, null, 'x', 361]) {
    const r = predictedStatements(c1, [{ ...compra, installments }], []);
    assert.deepEqual(r.map((b) => b.amountCents), [10000], String(installments));
  }
});

test('12 parcelas atravessam o ano sem derivar', () => {
  const r = predictedStatements(c1, [{ ...compra, installments: 12, amountCents: 120000 }], []);
  assert.equal(r.length, 12);
  assert.equal(r[0].dueDate, '2026-12-12');
  assert.equal(r[1].dueDate, '2027-01-12');
  assert.equal(r[11].dueDate, '2027-11-12');
  assert.ok(r.every((b) => b.amountCents === 10000));
});

test('fechamento dia 31 e parcelas: cada fatura fecha no último dia do seu mês, sem derivar', () => {
  const c = { id: 'c3', name: 'Verde', closingDay: 31, dueDay: 10 };
  const r = predictedStatements(c, [{ ...compra, cardId: 'c3', date: '2026-12-31', installments: 4, amountCents: 4000 }], []);
  assert.deepEqual(r.map((b) => b.dueDate), ['2027-01-10', '2027-02-10', '2027-03-10', '2027-04-10']);
});

test('fatura prevista antiga é trocada pela nova e mantém o mesmo id (não duplica ao gravar)', () => {
  const antiga = {
    id: 'b-velha', title: 'Cartão roxo', kind: 'card_statement', scope: 'personal', cardId: 'c1',
    dueDate: '2026-12-12', amountCents: 1, paidDate: null, confirmed: false,
  };
  const r = predictedStatements(c1, [compra], [antiga]);
  const dez = r.find((b) => b.dueDate === '2026-12-12');
  assert.equal(dez.id, 'b-velha');
  assert.equal(dez.amountCents, 3334);
  assert.equal(dez.confirmed, false);
  assert.equal(new Set(r.map((b) => b.id)).size, 3);
});

test('fatura já paga é mantida exatamente como está', () => {
  const paga = {
    id: 'b2', title: 'Cartão roxo', kind: 'card_statement', scope: 'personal', cardId: 'c1',
    dueDate: '2026-12-12', amountCents: 777, paidDate: '2026-12-10', confirmed: false,
  };
  const r = predictedStatements(c1, [compra], [paga]);
  assert.deepEqual(r.find((b) => b.dueDate === '2026-12-12'), paga);
});

test('fatura de outro cartão (ou que não é de cartão) com o mesmo vencimento não é confundida', () => {
  const outroCartao = { id: 'x', title: 'Azul', kind: 'card_statement', scope: 'personal', cardId: 'c2', dueDate: '2026-12-12', amountCents: 5, paidDate: null, confirmed: true };
  const boleto = { id: 'y', title: 'Luz', kind: 'boleto', scope: 'personal', cardId: 'c1', dueDate: '2026-12-12', amountCents: 6, paidDate: null };
  const r = predictedStatements(c1, [compra], [outroCartao, boleto]);
  const dez = r.find((b) => b.dueDate === '2026-12-12');
  assert.equal(dez.amountCents, 3334);
  assert.notEqual(dez.id, 'x');
  assert.notEqual(dez.id, 'y');
});

test('não mexe nas listas que recebe', () => {
  const compras = [compra];
  const existentes = [];
  const copia = JSON.stringify([compras, existentes, c1]);
  predictedStatements(c1, compras, existentes);
  assert.equal(JSON.stringify([compras, existentes, c1]), copia);
});

test('sem compras, não há faturas previstas', () => {
  assert.deepEqual(predictedStatements(c1, [], []), []);
});

// --- cartão: cadastro, parcelas digitadas, faturas no estado --------------------------------------------------

test('cartão: nome, dia de fechamento e dia de vencimento, com id próprio', () => {
  const c = buildCard({ name: '  Cartão roxo ', closingDay: 5, dueDay: 12 });
  assert.equal(typeof c.id, 'string');
  assert.deepEqual({ ...c, id: 'x' }, { id: 'x', name: 'Cartão roxo', closingDay: 5, dueDay: 12 });
  assert.notEqual(buildCard({ name: 'A', closingDay: 1, dueDay: 1 }).id, buildCard({ name: 'A', closingDay: 1, dueDay: 1 }).id);
  assert.equal(buildCard({ id: 'c9', name: 'A', closingDay: 31, dueDay: 1 }).id, 'c9');
});

test('cartão inválido é recusado em português: nome vazio e dias fora de 1 a 31 ou não inteiros', () => {
  const ok = { name: 'A', closingDay: 5, dueDay: 12 };
  for (const ruim of [{ name: '  ' }, { name: undefined }, { closingDay: 0 }, { closingDay: 32 }, { closingDay: 2.5 }, { closingDay: '5' },
    { dueDay: 0 }, { dueDay: 32 }, { dueDay: -1 }, { dueDay: NaN }]) {
    assert.throws(() => buildCard({ ...ok, ...ruim }), RangeError, JSON.stringify(ruim));
  }
  assert.throws(() => buildCard({ ...ok, closingDay: 32 }), /fechamento/);
  assert.throws(() => buildCard({ ...ok, dueDay: 0 }), /vencimento/);
  assert.throws(() => buildCard({ ...ok, name: '' }), /nome/);
});

test('parcelas digitadas: vazio vale 1 (à vista); só números de 1 até o máximo', () => {
  assert.equal(parseInstallments('3'), 3);
  assert.equal(parseInstallments(' 12 '), 12);
  assert.equal(parseInstallments(''), 1);
  assert.equal(parseInstallments(String(MAX_PARCELAS)), MAX_PARCELAS);
  for (const ruim of ['0', '-1', '2,5', '2.5', 'abc', String(MAX_PARCELAS + 1), '1e2']) {
    assert.throws(() => parseInstallments(ruim), RangeError, ruim);
  }
});

const roxo = { id: 'c1', name: 'Cartão roxo', closingDay: 5, dueDay: 12 };
const comRoxo = () => upsertCard(emptyState(), roxo);
const compraNoRoxo = (extra = {}) => ({
  id: 't1', kind: 'expense', amountCents: 10000, date: '2026-11-06', scope: 'personal', categoryId: 'outros',
  method: 'card', cardId: 'c1', installments: 3, ...extra,
});
const faturasDo = (s, cardId = 'c1') => s.bills.filter((b) => b.kind === 'card_statement' && b.cardId === cardId)
  .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));

test('o roteiro do cartão: R$ 100 em 3 vezes depois do fechamento gera 3 faturas de 33,34 / 33,33 / 33,33', () => {
  const s = addTransactionWithCards(comRoxo(), compraNoRoxo());
  assert.deepEqual(faturasDo(s).map((b) => [b.dueDate, b.amountCents, b.confirmed]),
    [['2026-12-12', 3334, false], ['2027-01-12', 3333, false], ['2027-02-12', 3333, false]]);
  assert.equal(s.transactions.length, 1);
});

test('corrigir a fatura para R$ 950 marca como confirmada e ela mantém o valor ao registrar outra compra', () => {
  let s = addTransactionWithCards(comRoxo(), compraNoRoxo());
  const primeira = faturasDo(s)[0];
  s = confirmStatement(s, primeira.id, 95000);
  assert.deepEqual([faturasDo(s)[0].amountCents, faturasDo(s)[0].confirmed, faturasDo(s)[0].id], [95000, true, primeira.id]);
  s = addTransactionWithCards(s, compraNoRoxo({ id: 't2', amountCents: 2000, date: '2026-11-07', installments: 1 }));
  assert.deepEqual(faturasDo(s).map((b) => b.amountCents), [95000, 3333, 3333]);
  assert.equal(faturasDo(s).length, 3, 'sem fatura duplicada');
});

test('registrar outra compra atualiza as faturas previstas (ainda não confirmadas), sem duplicar', () => {
  let s = addTransactionWithCards(comRoxo(), compraNoRoxo());
  s = addTransactionWithCards(s, compraNoRoxo({ id: 't2', amountCents: 2000, date: '2026-11-07', installments: 1 }));
  assert.deepEqual(faturasDo(s).map((b) => b.amountCents), [3334 + 2000, 3333, 3333]);
  assert.equal(new Set(faturasDo(s).map((b) => b.id)).size, 3);
});

test('pagar a fatura não cria gasto: o resumo do mês não muda', () => {
  let s = addTransactionWithCards(comRoxo(), compraNoRoxo());
  const antes = monthlySummary(s.transactions, '2026-11');
  s = payBill(s, faturasDo(s)[0].id, '2026-12-12');
  assert.equal(s.transactions.length, 1);
  assert.equal(faturasDo(s)[0].paidDate, '2026-12-12');
  assert.deepEqual(monthlySummary(s.transactions, '2026-11'), antes);
  assert.equal(antes.outTotalCents, 10000, 'a compra conta no dia da compra, inteira');
});

test('apagar a compra tira as faturas previstas dela; as confirmadas e as pagas ficam', () => {
  let s = addTransactionWithCards(comRoxo(), compraNoRoxo());
  s = confirmStatement(s, faturasDo(s)[0].id, 95000);
  s = payBill(s, faturasDo(s)[1].id, '2027-01-12');
  s = removeTransactionWithCards(s, 't1');
  assert.equal(s.transactions.length, 0);
  assert.deepEqual(faturasDo(s).map((b) => [b.dueDate, b.amountCents]), [['2026-12-12', 95000], ['2027-01-12', 3333]]);
});

test('apagar a única compra remove todas as faturas previstas (nenhuma fantasma)', () => {
  let s = addTransactionWithCards(comRoxo(), compraNoRoxo());
  s = removeTransactionWithCards(s, 't1');
  assert.deepEqual(s.bills, []);
});

test('apagar uma compra que não é de cartão não mexe nas faturas', () => {
  let s = addTransactionWithCards(comRoxo(), compraNoRoxo());
  s = addTransactionWithCards(s, { id: 'p1', kind: 'expense', amountCents: 500, date: '2026-11-10', scope: 'personal', categoryId: 'mercado', method: 'pix' });
  const antes = JSON.stringify(s.bills);
  s = removeTransactionWithCards(s, 'p1');
  assert.equal(JSON.stringify(s.bills), antes);
  assert.deepEqual(s.transactions.map((t) => t.id), ['t1']);
});

test('compra sem cartão ou de cartão que não existe é guardada e não cria fatura', () => {
  let s = addTransactionWithCards(comRoxo(), { id: 'a', kind: 'expense', amountCents: 100, date: '2026-11-10', scope: 'personal', categoryId: 'outros' });
  s = addTransactionWithCards(s, compraNoRoxo({ id: 'b', cardId: 'sumiu' }));
  assert.equal(s.transactions.length, 2);
  assert.deepEqual(s.bills, []);
});

test('o mesmo cartão com outro cartão ao lado: cada um mantém as suas faturas', () => {
  const azul = { id: 'c2', name: 'Azul', closingDay: 28, dueDay: 5 };
  let s = upsertCard(comRoxo(), azul);
  s = addTransactionWithCards(s, compraNoRoxo());
  s = addTransactionWithCards(s, compraNoRoxo({ id: 't2', cardId: 'c2', amountCents: 6000, date: '2026-11-10', installments: 2 }));
  assert.equal(faturasDo(s, 'c1').length, 3);
  assert.deepEqual(faturasDo(s, 'c2').map((b) => [b.dueDate, b.amountCents]), [['2026-12-05', 3000], ['2027-01-05', 3000]]);
  s = removeTransactionWithCards(s, 't2');
  assert.equal(faturasDo(s, 'c1').length, 3);
  assert.equal(faturasDo(s, 'c2').length, 0);
});

test('mudar o dia de fechamento do cartão move as faturas previstas e mantém as confirmadas onde estavam', () => {
  let s = addTransactionWithCards(comRoxo(), compraNoRoxo());
  s = confirmStatement(s, faturasDo(s)[0].id, 95000);
  s = syncCardStatements(upsertCard(s, { ...roxo, closingDay: 10, dueDay: 20 }), 'c1');
  assert.deepEqual(faturasDo(s).map((b) => [b.dueDate, b.amountCents, b.confirmed]),
    [['2026-11-20', 3334, false], ['2026-12-12', 95000, true], ['2026-12-20', 3333, false], ['2027-01-20', 3333, false]]);
});

test('sincronizar um cartão que não existe não muda nada', () => {
  const s = comRoxo();
  assert.equal(syncCardStatements(s, 'sumiu'), s);
});

test('confirmar fatura: valor inválido é recusado; fatura paga, boleto e id desconhecido não mudam', () => {
  const s = addTransactionWithCards(comRoxo(), compraNoRoxo());
  const id = faturasDo(s)[0].id;
  for (const ruim of [0, -5, 1.5, NaN]) assert.throws(() => confirmStatement(s, id, ruim), RangeError, String(ruim));
  const paga = payBill(s, id, '2026-12-12');
  assert.equal(confirmStatement(paga, id, 1234), paga);
  assert.equal(confirmStatement(s, 'sumiu', 1234), s);
  const comBoleto = upsertBills(s, [{ id: 'bol', title: 'Luz', kind: 'boleto', scope: 'personal', amountCents: 100, dueDate: '2026-12-20', paidDate: null }]);
  assert.equal(confirmStatement(comBoleto, 'bol', 1234), comBoleto);
});

test('registrar e apagar não alteram o estado recebido', () => {
  const s0 = comRoxo();
  const copia = JSON.stringify(s0);
  const s1 = addTransactionWithCards(s0, compraNoRoxo());
  const copia1 = JSON.stringify(s1);
  removeTransactionWithCards(s1, 't1');
  assert.equal(JSON.stringify(s0), copia);
  assert.equal(JSON.stringify(s1), copia1);
});

test('uma compra que não é de cartão passa pelo mesmo caminho e vira só lançamento', () => {
  const s = addTransactionWithCards(comRoxo(), { id: 'p1', kind: 'expense', amountCents: 500, date: '2026-11-10', scope: 'personal', categoryId: 'mercado' });
  assert.deepEqual(s, addTransaction(comRoxo(), { id: 'p1', kind: 'expense', amountCents: 500, date: '2026-11-10', scope: 'personal', categoryId: 'mercado' }));
});

test('campos de compra no cartão: método, cartão e parcelas; sem cartão escolhido não entra nada', () => {
  assert.deepEqual(cardPurchaseFields({ method: 'card', cardId: 'c1', installments: 3 }), { method: 'card', cardId: 'c1', installments: 3 });
  assert.deepEqual(cardPurchaseFields({ method: 'card', cardId: 'c1' }), { method: 'card', cardId: 'c1', installments: 1 });
  assert.deepEqual(cardPurchaseFields({}), {});
  assert.deepEqual(cardPurchaseFields({ method: undefined, cardId: 'c1', installments: 3 }), {}, 'cartão sobrando de antes não vale se não é compra no cartão');
  assert.deepEqual(cardPurchaseFields({ method: 'pix', cardId: 'c1', installments: 3 }), {});
});

test('compra no cartão sem cartão ou com parcelas inválidas é recusada', () => {
  assert.throws(() => cardPurchaseFields({ method: 'card', installments: 2 }), /cartão/);
  assert.throws(() => cardPurchaseFields({ method: 'card', cardId: '', installments: 2 }), RangeError);
  for (const ruim of [0, -1, 2.5, MAX_PARCELAS + 1, '3', NaN]) {
    assert.throws(() => cardPurchaseFields({ method: 'card', cardId: 'c1', installments: ruim }), RangeError, String(ruim));
  }
});

test('renomear o cartão renomeia também as faturas dele, inclusive as confirmadas e as pagas, sem mudar valor nem data', () => {
  let s = addTransactionWithCards(comRoxo(), compraNoRoxo());
  s = confirmStatement(s, faturasDo(s)[0].id, 95000);
  s = payBill(s, faturasDo(s)[1].id, '2027-01-12');
  const antes = faturasDo(s).map((b) => [b.dueDate, b.amountCents, b.paidDate, b.confirmed]);
  s = syncCardStatements(upsertCard(s, { ...roxo, name: 'Roxinho' }), 'c1');
  assert.deepEqual(faturasDo(s).map((b) => b.title), ['Roxinho', 'Roxinho', 'Roxinho']);
  assert.deepEqual(faturasDo(s).map((b) => [b.dueDate, b.amountCents, b.paidDate, b.confirmed]), antes);
});

test('renomear um cartão não mexe nas faturas de outro cartão nem em contas que não são fatura', () => {
  const azul = { id: 'c2', name: 'Azul', closingDay: 28, dueDay: 5 };
  let s = upsertCard(comRoxo(), azul);
  s = addTransactionWithCards(s, compraNoRoxo({ cardId: 'c2', date: '2026-11-10' }));
  s = upsertBills(s, [{ id: 'bol', title: 'Luz', kind: 'boleto', scope: 'personal', cardId: 'c1', amountCents: 100, dueDate: '2026-12-20', paidDate: null }]);
  s = syncCardStatements(upsertCard(s, { ...roxo, name: 'Roxinho' }), 'c1');
  assert.ok(faturasDo(s, 'c2').every((b) => b.title === 'Azul'));
  assert.equal(s.bills.find((b) => b.id === 'bol').title, 'Luz');
});

// ---- faturasDosCartoes: o que a tela principal mostra dos cartões ----

const fat = (id, cardId, dueDate, amountCents, extra = {}) => ({
  id, title: cardId === 'c1' ? 'Cartão roxo' : 'Azul', kind: 'card_statement', scope: 'personal', cardId,
  dueDate, amountCents, paidDate: null, confirmed: false, ...extra,
});
const azulC2 = { id: 'c2', name: 'Azul', closingDay: 28, dueDay: 5 };
const comDoisCartoes = (...bills) => upsertBills(upsertCard(upsertCard(emptyState(), c1), azulC2), bills);

test('sem cartão nem fatura, a tela dos cartões não tem nada a mostrar', () => {
  assert.deepEqual(faturasDosCartoes(emptyState()), { items: [], totalCents: 0, restantes: 0, restantesCents: 0, porCartao: [] });
});

test('só entram faturas de cartão ainda não pagas, da mais próxima para a mais distante, de todos os cartões', () => {
  const s = comDoisCartoes(
    fat('f3', 'c1', '2027-01-12', 3333),
    fat('f1', 'c1', '2026-11-12', 3334),
    fat('f2', 'c2', '2026-12-05', 5000),
    fat('paga', 'c1', '2026-10-12', 9999, { paidDate: '2026-10-12', confirmed: true }),
    { id: 'bol', title: 'Luz', kind: 'boleto', scope: 'personal', cardId: null, dueDate: '2026-11-20', amountCents: 8000, paidDate: null },
  );
  const r = faturasDosCartoes(s);
  assert.deepEqual(r.items.map((b) => b.id), ['f1', 'f2', 'f3']);
  assert.equal(r.totalCents, 3334 + 5000 + 3333);
  assert.equal(r.restantes, 0);
});

test('fatura atrasada e ainda não paga continua na lista, no topo', () => {
  const s = comDoisCartoes(fat('nova', 'c1', '2026-12-12', 1000), fat('velha', 'c2', '2026-10-05', 2000));
  assert.deepEqual(faturasDosCartoes(s).items.map((b) => b.id), ['velha', 'nova']);
});

test('lista curta: mostra só as próximas e conta o que ficou de fora, sem perder nada do total', () => {
  const faturas = Array.from({ length: 8 }, (_, i) => fat(`f${i}`, 'c1', `2027-0${i + 1}-12`, 1000 + i));
  const s = comDoisCartoes(...faturas);
  const r = faturasDosCartoes(s);
  assert.equal(r.items.length, 6);
  assert.deepEqual(r.items.map((b) => b.id), ['f0', 'f1', 'f2', 'f3', 'f4', 'f5']);
  assert.equal(r.restantes, 2);
  assert.equal(r.restantesCents, 1006 + 1007);
  assert.equal(r.totalCents, faturas.reduce((soma, b) => soma + b.amountCents, 0));
  assert.equal(faturasDosCartoes(s, 3).items.length, 3);
  assert.equal(faturasDosCartoes(s, 3).restantes, 5);
});

test('total por cartão: só cartões com fatura a pagar, na ordem em que foram cadastrados', () => {
  const s = comDoisCartoes(fat('a', 'c2', '2026-12-05', 5000), fat('b', 'c2', '2027-01-05', 700), fat('c', 'c1', '2026-12-12', 100, { paidDate: '2026-12-12' }));
  assert.deepEqual(faturasDosCartoes(s).porCartao, [{ cardId: 'c2', name: 'Azul', totalCents: 5700 }]);
  const dois = comDoisCartoes(fat('x', 'c2', '2026-12-05', 5000), fat('y', 'c1', '2026-12-12', 100));
  assert.deepEqual(faturasDosCartoes(dois).porCartao.map((c) => [c.name, c.totalCents]), [['Cartão roxo', 100], ['Azul', 5000]]);
});

// ---------- apagar cartão, fatura e compra no cartão ----------
import { cardPurchases, cardUsage, removeCard, removeStatement } from '../src/domain/cards.js';

const azul = { id: 'c2', name: 'Azul', closingDay: 10, dueDay: 20 };
/** Dois cartões com compras (uma parcelada no roxo, uma à vista no azul), uma compra comum e uma conta qualquer. */
function doisCartoes() {
  let s = upsertCard(comRoxo(), azul);
  s = addTransactionWithCards(s, compraNoRoxo());
  s = addTransactionWithCards(s, compraNoRoxo({ id: 't2', amountCents: 4000, date: '2026-11-20', installments: 1 }));
  s = addTransactionWithCards(s, compraNoRoxo({ id: 't3', amountCents: 5000, date: '2026-11-08', cardId: 'c2', installments: 1 }));
  s = addTransaction(s, { id: 't4', kind: 'expense', amountCents: 700, date: '2026-11-09', scope: 'personal', categoryId: 'mercado' });
  return upsertBills(s, [{ id: 'b1', title: 'Internet', kind: 'boleto', scope: 'personal', amountCents: 12000, dueDate: '2026-12-25', paidDate: null }]);
}

test('apagar o cartão tira ele, as compras feitas nele e todas as faturas dele (pagas ou não)', () => {
  let s = doisCartoes();
  s = payBill(s, faturasDo(s)[0].id, '2026-11-18');
  s = confirmStatement(s, faturasDo(s)[1].id, 95000);
  const depois = removeCard(s, 'c1');
  assert.deepEqual(depois.cards.map((c) => c.id), ['c2']);
  assert.deepEqual(depois.transactions.map((t) => t.id).sort(), ['t3', 't4']);
  assert.deepEqual(faturasDo(depois, 'c1'), []);
});

test('apagar o cartão não mexe no outro cartão, nas outras compras nem nas outras contas', () => {
  const s = doisCartoes();
  const antes = faturasDo(s, 'c2');
  const depois = removeCard(s, 'c1');
  assert.deepEqual(faturasDo(depois, 'c2'), antes);
  assert.ok(depois.transactions.some((t) => t.id === 't4'));
  assert.ok(depois.bills.some((b) => b.id === 'b1'));
});

test('apagar o cartão tira o "Saiu" das compras dele', () => {
  const s = doisCartoes();
  const antes = monthlySummary(s.transactions, '2026-11').outTotalCents;
  const depois = monthlySummary(removeCard(s, 'c1').transactions, '2026-11').outTotalCents;
  assert.equal(antes - depois, 10000 + 4000);
});

test('apagar um cartão que não existe não muda nada', () => {
  const s = doisCartoes();
  assert.equal(removeCard(s, 'nao-existe'), s);
});

test('apagar o cartão não mexe no estado que recebe', () => {
  const s = doisCartoes();
  const copia = structuredClone(s);
  removeCard(s, 'c1');
  assert.deepEqual(s, copia);
});

test('o que vai sumir ao apagar o cartão: quantas compras, quanto somam e quantas faturas', () => {
  const s = doisCartoes();
  assert.deepEqual(cardUsage(s, 'c1'), { purchases: 2, purchasesCents: 14000, statements: faturasDo(s, 'c1').length });
  assert.deepEqual(cardUsage(s, 'c2'), { purchases: 1, purchasesCents: 5000, statements: 1 });
  assert.deepEqual(cardUsage(s, 'nao-existe'), { purchases: 0, purchasesCents: 0, statements: 0 });
});

test('compras do cartão: só as dele, da mais nova para a mais antiga', () => {
  const s = doisCartoes();
  assert.deepEqual(cardPurchases(s, 'c1').map((t) => t.id), ['t2', 't1']);
  assert.deepEqual(cardPurchases(s, 'c2').map((t) => t.id), ['t3']);
});

test('apagar uma fatura confirmada sem compras por trás: ela some de vez', () => {
  let s = addTransactionWithCards(comRoxo(), compraNoRoxo());
  s = confirmStatement(s, faturasDo(s)[0].id, 95000);
  s = removeTransactionWithCards(s, 't1'); // a fatura confirmada fica (por desenho), mas sem compra nenhuma
  assert.equal(faturasDo(s).length, 1);
  assert.deepEqual(faturasDo(removeStatement(s, faturasDo(s)[0].id)), []);
});

test('apagar uma fatura paga sem compras por trás: ela some, e o resto continua', () => {
  let s = addTransactionWithCards(comRoxo(), compraNoRoxo({ installments: 1 }));
  s = payBill(s, faturasDo(s)[0].id, '2026-11-18');
  s = removeTransactionWithCards(s, 't1');
  assert.equal(faturasDo(s).length, 1);
  s = removeStatement(s, faturasDo(s)[0].id);
  assert.deepEqual(faturasDo(s), []);
  assert.deepEqual(s.transactions, []);
});

test('apagar uma fatura confirmada que ainda tem compras por trás: volta como prevista, com a soma das compras', () => {
  let s = addTransactionWithCards(comRoxo(), compraNoRoxo());
  const primeira = faturasDo(s)[0];
  s = confirmStatement(s, primeira.id, 95000);
  s = removeStatement(s, primeira.id);
  const volta = faturasDo(s)[0];
  assert.deepEqual([volta.dueDate, volta.amountCents, volta.confirmed, volta.paidDate], ['2026-12-12', 3334, false, null]);
  assert.equal(faturasDo(s).length, 3);
});

test('apagar uma fatura não apaga compras', () => {
  let s = addTransactionWithCards(comRoxo(), compraNoRoxo());
  s = confirmStatement(s, faturasDo(s)[0].id, 95000);
  assert.equal(removeStatement(s, faturasDo(s)[0].id).transactions.length, 1);
});

test('removeStatement só apaga fatura de cartão: boleto e id desconhecido não mudam nada', () => {
  const s = doisCartoes();
  assert.equal(removeStatement(s, 'b1'), s);
  assert.equal(removeStatement(s, 'nao-existe'), s);
});

// ---- editar um lançamento já salvo ----

const comAzul = () => upsertCard(comRoxo(), { id: 'c2', name: 'Azul', closingDay: 28, dueDay: 5 });
const comUmaCompra = () => addTransactionWithCards(comRoxo(), compraNoRoxo());

test('editar troca o lançamento de mesmo id, no mesmo lugar da lista, sem mexer nos outros', () => {
  let s = addTransaction(emptyState(), { id: 'a', kind: 'expense', amountCents: 100, date: '2026-11-01', scope: 'personal', categoryId: 'outros' });
  s = addTransaction(s, { id: 'b', kind: 'expense', amountCents: 200, date: '2026-11-02', scope: 'personal', categoryId: 'outros' });
  s = addTransaction(s, { id: 'c', kind: 'income', amountCents: 300, date: '2026-11-03', scope: 'personal' });
  const novo = updateTransactionWithCards(s, { id: 'b', kind: 'expense', amountCents: 250, date: '2026-11-04', scope: 'work', categoryId: 'mercado', note: 'feira' });
  assert.deepEqual(novo.transactions.map((t) => t.id), ['a', 'b', 'c']);
  assert.deepEqual(novo.transactions[1], { id: 'b', kind: 'expense', amountCents: 250, date: '2026-11-04', scope: 'work', categoryId: 'mercado', note: 'feira' });
  assert.deepEqual(novo.transactions[0], s.transactions[0]);
  assert.deepEqual(novo.transactions[2], s.transactions[2]);
});

test('editar não mexe no estado que recebe', () => {
  const s = comUmaCompra();
  const antes = JSON.stringify(s);
  updateTransactionWithCards(s, compraNoRoxo({ amountCents: 30000 }));
  assert.equal(JSON.stringify(s), antes);
});

test('editar o valor de uma compra no cartão refaz as faturas previstas dela', () => {
  const s = updateTransactionWithCards(comUmaCompra(), compraNoRoxo({ amountCents: 30000 }));
  assert.deepEqual(faturasDo(s).map((b) => [b.dueDate, b.amountCents]),
    [['2026-12-12', 10000], ['2027-01-12', 10000], ['2027-02-12', 10000]]);
  assert.equal(s.transactions.length, 1);
});

test('editar a data da compra para antes do fechamento move as faturas e não deixa a antiga para trás', () => {
  const s = updateTransactionWithCards(comUmaCompra(), compraNoRoxo({ date: '2026-11-05' }));
  assert.deepEqual(faturasDo(s).map((b) => b.dueDate), ['2026-11-12', '2026-12-12', '2027-01-12']);
  assert.equal(s.bills.length, 3);
});

test('editar as parcelas de 3 para 1 deixa só uma fatura', () => {
  const s = updateTransactionWithCards(comUmaCompra(), compraNoRoxo({ installments: 1 }));
  assert.deepEqual(faturasDo(s).map((b) => [b.dueDate, b.amountCents]), [['2026-12-12', 10000]]);
});

test('trocar de cartão refaz as faturas dos dois: o antigo perde, o novo ganha', () => {
  const s0 = addTransactionWithCards(comAzul(), compraNoRoxo());
  const s = updateTransactionWithCards(s0, compraNoRoxo({ cardId: 'c2', installments: 2 }));
  assert.deepEqual(faturasDo(s, 'c1'), []);
  assert.deepEqual(faturasDo(s, 'c2').map((b) => [b.dueDate, b.amountCents]), [['2026-12-05', 5000], ['2027-01-05', 5000]]);
});

test('passar a compra do cartão para "na hora" tira as faturas previstas dela', () => {
  const { method, cardId, installments, ...naHora } = compraNoRoxo();
  const s = updateTransactionWithCards(comUmaCompra(), naHora);
  assert.deepEqual(s.bills, []);
  assert.equal(s.transactions[0].method, undefined);
});

test('passar um gasto "na hora" para o cartão cria as faturas previstas', () => {
  const { method, cardId, installments, ...naHora } = compraNoRoxo();
  const s0 = addTransactionWithCards(comRoxo(), naHora);
  assert.deepEqual(s0.bills, []);
  const s = updateTransactionWithCards(s0, compraNoRoxo());
  assert.equal(faturasDo(s).length, 3);
});

test('virar entrada também tira as faturas da compra', () => {
  const s = updateTransactionWithCards(comUmaCompra(), { id: 't1', kind: 'income', amountCents: 10000, date: '2026-11-06', scope: 'personal' });
  assert.deepEqual(s.bills, []);
  assert.equal(s.transactions[0].kind, 'income');
});

test('fatura já confirmada ou paga não muda quando a compra é editada (o que você pagou de verdade não se reescreve)', () => {
  const inicial = comUmaCompra();
  let s = confirmStatement(inicial, faturasDo(inicial)[0].id, 95000);
  s = payBill(s, faturasDo(s)[1].id, '2027-01-12');
  const antes = faturasDo(s).map((b) => ({ ...b }));
  assert.equal(antes[0].confirmed, true);
  assert.equal(antes[1].paidDate, '2027-01-12');
  s = updateTransactionWithCards(s, compraNoRoxo({ amountCents: 60000 }));
  const depois = faturasDo(s);
  assert.deepEqual(depois[0], antes[0]);
  assert.deepEqual(depois[1], antes[1]);
  assert.equal(depois[2].amountCents, 20000, 'a prevista acompanha a compra nova');
});

test('editar uma compra que não é de cartão não mexe nas faturas dos cartões', () => {
  let s = addTransactionWithCards(comUmaCompra(), { id: 'p1', kind: 'expense', amountCents: 500, date: '2026-11-10', scope: 'personal', categoryId: 'mercado' });
  const antes = JSON.stringify(s.bills);
  s = updateTransactionWithCards(s, { id: 'p1', kind: 'expense', amountCents: 900, date: '2026-11-11', scope: 'personal', categoryId: 'lazer' });
  assert.equal(JSON.stringify(s.bills), antes);
  assert.equal(s.transactions.find((t) => t.id === 'p1').amountCents, 900);
});

test('editar o pagamento de uma conta não vale: desfaz o pagamento e paga de novo', () => {
  const conta = { id: 'k1', title: 'Luz', kind: 'boleto', scope: 'personal', amountCents: 8000, dueDate: '2026-11-20', paidDate: null };
  const s = payBill(upsertBills(emptyState(), [conta]), 'k1', '2026-11-18');
  assert.throws(() => updateTransactionWithCards(s, { ...s.transactions[0], amountCents: 1 }), /pagamento/i);
  assert.equal(s.transactions[0].amountCents, 8000);
});

test('editar um lançamento que não existe mais avisa, em vez de fingir que salvou', () => {
  assert.throws(() => updateTransactionWithCards(comUmaCompra(), compraNoRoxo({ id: 'sumiu' })), /não existe mais/);
});

// ---- o lançamento que o formulário monta (novo ou editado) ----

const camposDeGasto = (extra = {}) => ({
  kind: 'expense', amountCents: 3540, date: '2026-11-18', scope: 'personal', categoryId: 'mercado', note: '', merchant: '', ...extra,
});

test('gasto simples: só os campos que valem, e um id novo', () => {
  const t = transactionFromFields(camposDeGasto());
  assert.match(t.id, /^[0-9a-f-]{36}$/);
  const { id, ...resto } = t;
  assert.deepEqual(resto, { kind: 'expense', amountCents: 3540, date: '2026-11-18', scope: 'personal', categoryId: 'mercado' });
});

test('ao editar, o id é o do lançamento que já existe', () => {
  assert.equal(transactionFromFields(camposDeGasto(), 'abc').id, 'abc');
});

test('descrição e local entram só se foram preenchidos', () => {
  const { id, ...com } = transactionFromFields(camposDeGasto({ note: 'feira', merchant: 'Mercadão' }), 'x');
  assert.deepEqual(com, { kind: 'expense', amountCents: 3540, date: '2026-11-18', scope: 'personal', categoryId: 'mercado', note: 'feira', merchant: 'Mercadão' });
});

test('entrada não leva categoria, cartão nem escopo de trabalho, mesmo que os campos venham preenchidos', () => {
  const { id, ...t } = transactionFromFields(camposDeGasto({ kind: 'income', scope: 'work', method: 'card', cardId: 'c1', installments: 3 }), 'x');
  assert.deepEqual(t, { kind: 'income', amountCents: 3540, date: '2026-11-18', scope: 'personal' });
});

test('compra no cartão leva cartão e parcelas', () => {
  const { id, ...t } = transactionFromFields(camposDeGasto({ method: 'card', cardId: 'c1', installments: 3 }), 'x');
  assert.deepEqual(t, { kind: 'expense', amountCents: 3540, date: '2026-11-18', scope: 'personal', categoryId: 'mercado', method: 'card', cardId: 'c1', installments: 3 });
});

test('compra no cartão sem cartão ou com parcelas ruins não é montada', () => {
  assert.throws(() => transactionFromFields(camposDeGasto({ method: 'card', installments: 2 })), /cartão/i);
  assert.throws(() => transactionFromFields(camposDeGasto({ method: 'card', cardId: 'c1', installments: 0 })), RangeError);
});
