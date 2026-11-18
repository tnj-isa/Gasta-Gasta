import test from 'node:test';
import assert from 'node:assert/strict';
import {
  billToExpense, createBoleto, createInstallmentSeries, deleteBills, markPaid, markUnpaid, payBill, pendingTotals,
  contaDoGasto, seriesOf, unpayBill, upcomingBills,
} from '../src/domain/bills.js';
import { addTransaction, emptyState, removeTransaction, upsertBills } from '../src/domain/model.js';
import { monthKey } from '../src/lib/dates.js';

test('6 parcelas de R$ 200 a partir de 10/12', () => {
  const s = createInstallmentSeries({ title: 'Celular', count: 6, amountCents: 20000, firstDue: '2026-12-10', scope: 'personal' });
  assert.deepEqual(s.map((b) => b.dueDate),
    ['2026-12-10', '2027-01-10', '2027-02-10', '2027-03-10', '2027-04-10', '2027-05-10']);
  assert.deepEqual(s.map((b) => b.number), [1, 2, 3, 4, 5, 6]);
  assert.ok(s.every((b) => b.of === 6 && b.amountCents === 20000 && b.paidDate === null && b.kind === 'installment'));
  assert.equal(new Set(s.map((b) => b.groupId)).size, 1);
});

test('parcelas começando dia 31 caem no último dia do mês, sem derivar', () => {
  const s = createInstallmentSeries({ title: 'X', count: 4, amountCents: 100, firstDue: '2026-12-31', scope: 'work' });
  assert.deepEqual(s.map((b) => b.dueDate), ['2026-12-31', '2027-01-31', '2027-02-28', '2027-03-31']);
});

test('dia 30 volta a ser 30 depois de fevereiro (a data vem sempre da primeira parcela)', () => {
  const s = createInstallmentSeries({ title: 'X', count: 4, amountCents: 100, firstDue: '2026-12-30', scope: 'personal' });
  assert.deepEqual(s.map((b) => b.dueDate), ['2026-12-30', '2027-01-30', '2027-02-28', '2027-03-30']);
});

test('fevereiro de ano bissexto cai no dia 29', () => {
  const s = createInstallmentSeries({ title: 'X', count: 3, amountCents: 100, firstDue: '2027-12-31', scope: 'personal' });
  assert.deepEqual(s.map((b) => b.dueDate), ['2027-12-31', '2028-01-31', '2028-02-29']);
});

test('cada parcela tem id próprio, título, escopo e categoria da série', () => {
  const s = createInstallmentSeries({ title: 'Notebook', count: 3, amountCents: 30000, firstDue: '2026-12-20', scope: 'work', categoryId: 'casa' });
  assert.equal(new Set(s.map((b) => b.id)).size, 3);
  assert.ok(s.every((b) => b.title === 'Notebook' && b.scope === 'work' && b.categoryId === 'casa'));
});

test('sem categoria, a parcela não leva o campo categoryId', () => {
  const [b] = createInstallmentSeries({ title: 'X', count: 1, amountCents: 100, firstDue: '2026-12-10', scope: 'personal' });
  assert.equal('categoryId' in b, false);
});

test('duas séries diferentes têm groupId diferente', () => {
  const p = { title: 'X', count: 2, amountCents: 100, firstDue: '2026-12-10', scope: 'personal' };
  assert.notEqual(createInstallmentSeries(p)[0].groupId, createInstallmentSeries(p)[0].groupId);
});

test('série inválida é recusada: quantidade, valor e data', () => {
  const ok = { title: 'X', count: 3, amountCents: 100, firstDue: '2026-12-10', scope: 'personal' };
  for (const ruim of [{ count: 0 }, { count: -1 }, { count: 2.5 }, { count: 361 }, { amountCents: 0 }, { amountCents: -5 },
    { amountCents: 10.5 }, { firstDue: '10/12/2026' }, { firstDue: '' }, { title: '   ' }]) {
    assert.throws(() => createInstallmentSeries({ ...ok, ...ruim }), RangeError, JSON.stringify(ruim));
  }
});

const bill = (title, dueDate, amountCents, extra = {}) =>
  ({ id: title, title, kind: 'boleto', scope: 'personal', amountCents, dueDate, paidDate: null, ...extra });
const lista = [bill('Celular', '2026-12-10', 20000), bill('Cartão roxo', '2026-12-15', 95000, { kind: 'card_statement' }),
  bill('Notebook', '2026-12-20', 30000), bill('Internet', '2026-12-25', 12000)];

test('faturas a vencer e total', () => {
  const r = upcomingBills(lista, '2026-12-01');
  assert.deepEqual(r.items.map((b) => b.title), ['Celular', 'Cartão roxo', 'Notebook', 'Internet']);
  assert.equal(r.totalCents, 157000);
});

test('fatura vencida e não paga continua aparecendo, no topo', () => {
  const r = upcomingBills([...lista, bill('Água', '2026-11-30', 8000)], '2026-12-05');
  assert.equal(r.items[0].title, 'Água');
  assert.equal(r.items[0].overdue, true);
  assert.equal(r.totalCents, 165000, 'a vencida entra no total');
});

test('vencida há meses ainda aparece', () => {
  const r = upcomingBills([bill('Velha', '2026-03-10', 5000)], '2026-12-05');
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].overdue, true);
});

test('vence hoje: aparece e ainda não está vencida', () => {
  const r = upcomingBills([bill('Hoje', '2026-12-05', 100)], '2026-12-05');
  assert.equal(r.items[0].overdue, false);
});

test('janela de 30 dias e pagas ficam de fora', () => {
  const r = upcomingBills([bill('A', '2026-12-31', 100), bill('B', '2027-01-01', 100),
    bill('C', '2026-12-10', 100, { paidDate: '2026-12-01' })], '2026-12-01');
  assert.deepEqual(r.items.map((b) => b.title), ['A']);
});

test('janela pode ser outra e a lista sai ordenada por vencimento', () => {
  const desordenada = [bill('C', '2026-12-20', 1), bill('A', '2026-12-02', 1), bill('B', '2026-12-09', 1)];
  assert.deepEqual(upcomingBills(desordenada, '2026-12-01', 10).items.map((b) => b.title), ['A', 'B']);
  assert.deepEqual(upcomingBills(desordenada, '2026-12-01').items.map((b) => b.title), ['A', 'B', 'C']);
});

test('a virada de mês e de ano conta dias certos (sem fuso)', () => {
  // De 31/12 a 30/01 são 30 dias (entra); 31/01 já é o dia 31 (fica de fora).
  const r = upcomingBills([bill('A', '2027-01-30', 100), bill('B', '2027-01-31', 100)], '2026-12-31');
  assert.deepEqual(r.items.map((b) => b.title), ['A']);
  assert.equal(r.totalCents, 100);
});

test('lista vazia: nada a vencer e total zero; a lista original não muda', () => {
  assert.deepEqual(upcomingBills([], '2026-12-01'), { items: [], totalCents: 0 });
  const antes = JSON.stringify(lista);
  upcomingBills(lista, '2026-12-01');
  assert.equal(JSON.stringify(lista), antes);
  assert.equal('overdue' in lista[0], false);
});

test('faltam para zerar', () => {
  const r = pendingTotals([...lista, bill('Paga', '2026-12-01', 5000, { paidDate: '2026-12-01' })]);
  assert.equal(r.totalCents, 157000);
  assert.deepEqual(r.byMonth, { '2026-12': 157000 });
});

test('faltam para zerar soma por mês, inclusive vencidas e meses diferentes', () => {
  const r = pendingTotals([bill('Velha', '2026-10-05', 1000), bill('A', '2026-12-10', 200), bill('B', '2027-02-10', 300),
    bill('C', '2027-02-28', 400), bill('Paga', '2027-02-01', 9999, { paidDate: '2027-01-30' })]);
  assert.equal(r.totalCents, 1900);
  assert.deepEqual(r.byMonth, { '2026-10': 1000, '2026-12': 200, '2027-02': 700 });
});

test('nada pendente: total zero e nenhum mês', () => {
  assert.deepEqual(pendingTotals([]), { totalCents: 0, byMonth: {} });
  assert.deepEqual(pendingTotals([bill('P', '2026-12-01', 5, { paidDate: '2026-12-01' })]), { totalCents: 0, byMonth: {} });
});

test('pagar conta vira gasto, fatura de cartão não', () => {
  const gasto = billToExpense(markPaid(lista[0], '2026-12-10'));
  assert.equal(gasto.amountCents, 20000);
  assert.equal(gasto.id, 'bill:Celular');
  assert.equal(billToExpense(markPaid(lista[1], '2026-12-15')), null);
});

test('o gasto sai na data do pagamento, não na do vencimento, e copia escopo, categoria e nome', () => {
  const gasto = billToExpense(markPaid(bill('Luz', '2026-12-10', 8000, { scope: 'work', categoryId: 'casa' }), '2026-12-08'));
  assert.deepEqual(gasto, { id: 'bill:Luz', kind: 'expense', amountCents: 8000, date: '2026-12-08', scope: 'work', categoryId: 'casa', merchant: 'Luz' });
});

test('conta sem categoria vira gasto em "outros"', () => {
  assert.equal(billToExpense(markPaid(bill('Luz', '2026-12-10', 8000), '2026-12-10')).categoryId, 'outros');
});

test('conta não paga não vira gasto', () => {
  assert.equal(billToExpense(lista[0]), null);
});

test('markPaid e markUnpaid devolvem cópia e não mexem na conta original', () => {
  const original = bill('Luz', '2026-12-10', 8000);
  const paga = markPaid(original, '2026-12-10');
  assert.equal(original.paidDate, null);
  assert.equal(paga.paidDate, '2026-12-10');
  const desfeita = markUnpaid(paga);
  assert.equal(paga.paidDate, '2026-12-10');
  assert.equal(desfeita.paidDate, null);
  assert.deepEqual(desfeita, original);
});

test('markPaid recusa data que não é AAAA-MM-DD', () => {
  assert.throws(() => markPaid(lista[0], '10/12/2026'), RangeError);
  assert.throws(() => markPaid(lista[0], ''), RangeError);
});

test('pagar e desfazer: o gasto entra e sai do estado pelo id fixo, sem duplicar', () => {
  const gasto = billToExpense(markPaid(lista[0], '2026-12-10'));
  let s = addTransaction(emptyState(), gasto);
  assert.equal(s.transactions.length, 1);
  s = removeTransaction(s, billToExpense(markPaid(lista[0], '2026-12-12')).id);
  assert.equal(s.transactions.length, 0);
});

// --- estado: criar boleto, pagar, desfazer, apagar ---------------------------------------------------------

test('boleto avulso: conta não paga, do tipo boleto, com os dados digitados', () => {
  const b = createBoleto({ title: '  Internet ', amountCents: 11990, dueDate: '2026-12-22', scope: 'personal', categoryId: 'casa' });
  assert.equal(typeof b.id, 'string');
  assert.deepEqual({ ...b, id: 'x' }, { id: 'x', title: 'Internet', kind: 'boleto', scope: 'personal', amountCents: 11990, dueDate: '2026-12-22', paidDate: null, categoryId: 'casa' });
  assert.equal('categoryId' in createBoleto({ title: 'Luz', amountCents: 100, dueDate: '2026-12-22', scope: 'work' }), false);
  assert.notEqual(createBoleto({ title: 'A', amountCents: 1, dueDate: '2026-12-22', scope: 'work' }).id,
    createBoleto({ title: 'A', amountCents: 1, dueDate: '2026-12-22', scope: 'work' }).id);
});

test('boleto avulso inválido é recusado: nome, valor e vencimento', () => {
  const ok = { title: 'Luz', amountCents: 100, dueDate: '2026-12-22', scope: 'personal' };
  for (const ruim of [{ title: ' ' }, { amountCents: 0 }, { amountCents: -1 }, { amountCents: 1.5 }, { dueDate: '2026-02-30' }, { dueDate: '22/12/2026' }]) {
    assert.throws(() => createBoleto({ ...ok, ...ruim }), RangeError, JSON.stringify(ruim));
  }
});

const celular = () => createInstallmentSeries({ title: 'Celular', count: 6, amountCents: 20000, firstDue: '2026-12-10', scope: 'personal' });
const comCelular = () => upsertBills(emptyState(), celular());

test('o roteiro do celular: 6 parcelas somam R$ 1.200; pagar a primeira baixa para R$ 1.000 e lança R$ 200 no mês do pagamento', () => {
  let s = comCelular();
  assert.equal(pendingTotals(s.bills).totalCents, 120000);
  const primeira = s.bills[0];
  s = payBill(s, primeira.id, '2026-11-18');
  assert.equal(pendingTotals(s.bills).totalCents, 100000);
  assert.equal(s.transactions.length, 1);
  assert.equal(s.transactions[0].amountCents, 20000);
  assert.equal(monthKey(s.transactions[0].date), '2026-11');
  assert.equal(s.transactions[0].id, `bill:${primeira.id}`);
  s = unpayBill(s, primeira.id);
  assert.equal(pendingTotals(s.bills).totalCents, 120000);
  assert.equal(s.transactions.length, 0);
});

test('pagar não mexe no estado original e só a conta escolhida muda', () => {
  const antes = comCelular();
  const copia = JSON.stringify(antes);
  const depois = payBill(antes, antes.bills[2].id, '2026-12-01');
  assert.equal(JSON.stringify(antes), copia);
  assert.deepEqual(depois.bills.map((b) => b.paidDate), [null, null, '2026-12-01', null, null, null]);
});

test('pagar fatura de cartão marca como paga e não cria gasto', () => {
  const fatura = bill('Cartão roxo', '2026-12-15', 95000, { kind: 'card_statement' });
  const s = payBill(upsertBills(emptyState(), [fatura]), fatura.id, '2026-12-15');
  assert.equal(s.bills[0].paidDate, '2026-12-15');
  assert.equal(s.transactions.length, 0);
});

test('tocar duas vezes em "pagar" não duplica o gasto nem muda a data', () => {
  const s0 = comCelular();
  const s1 = payBill(s0, s0.bills[0].id, '2026-12-01');
  const s2 = payBill(s1, s0.bills[0].id, '2026-12-05');
  assert.equal(s2, s1);
  assert.equal(s2.transactions.length, 1);
  assert.equal(s2.bills[0].paidDate, '2026-12-01');
});

test('pagar uma conta que não existe não muda nada', () => {
  const s = comCelular();
  assert.equal(payBill(s, 'nao-existe', '2026-12-01'), s);
  assert.equal(unpayBill(s, 'nao-existe'), s);
});

test('pagar e desfazer devolve o estado exatamente como estava, sem tocar nos outros gastos', () => {
  const outro = { id: 't1', kind: 'expense', amountCents: 500, date: '2026-12-01', scope: 'personal', categoryId: 'mercado' };
  const antes = addTransaction(comCelular(), outro);
  const depois = unpayBill(payBill(antes, antes.bills[0].id, '2026-12-02'), antes.bills[0].id);
  assert.deepEqual(depois, antes);
});

test('desfazer remove também um gasto de pagamento que ficou sem a conta marcada como paga', () => {
  const s0 = comCelular();
  const solto = addTransaction(s0, billToExpense(markPaid(s0.bills[0], '2026-12-01')));
  assert.equal(unpayBill(solto, s0.bills[0].id).transactions.length, 0);
});

test('apagar contas remove também os gastos dos pagamentos delas, e só delas', () => {
  const s0 = comCelular();
  const outro = { id: 't1', kind: 'expense', amountCents: 500, date: '2026-12-01', scope: 'personal', categoryId: 'mercado' };
  let s = payBill(payBill(addTransaction(s0, outro), s0.bills[0].id, '2026-12-01'), s0.bills[1].id, '2026-12-02');
  assert.equal(s.transactions.length, 3);
  s = deleteBills(s, [s0.bills[0].id]);
  assert.equal(s.bills.length, 5);
  assert.deepEqual(s.transactions.map((t) => t.id), ['t1', `bill:${s0.bills[1].id}`]);
  s = deleteBills(s, s.bills.map((b) => b.id));
  assert.deepEqual(s.bills, []);
  assert.deepEqual(s.transactions.map((t) => t.id), ['t1']);
});

test('uma série é todas as parcelas do mesmo grupo; boleto avulso é só ele', () => {
  const s = upsertBills(comCelular(), [bill('Luz', '2026-12-20', 100)]);
  assert.equal(seriesOf(s.bills, s.bills[3]).length, 6);
  assert.deepEqual(seriesOf(s.bills, s.bills[3]).map((b) => b.number), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(seriesOf(s.bills, s.bills[6]).map((b) => b.id), ['Luz']);
});

test('pagar quando já existe um gasto solto com o mesmo id não duplica o gasto', () => {
  const s0 = comCelular();
  const solto = addTransaction(s0, billToExpense(markPaid(s0.bills[0], '2026-12-01')));
  const s = payBill(solto, s0.bills[0].id, '2026-12-03');
  assert.deepEqual(s.transactions.map((t) => [t.id, t.date]), [[`bill:${s0.bills[0].id}`, '2026-12-03']]);
});

test('reconhece o gasto que veio do pagamento de uma conta e diz qual conta é', () => {
  const s0 = comCelular();
  const s = payBill(s0, s0.bills[0].id, '2026-12-01');
  assert.equal(contaDoGasto(s.transactions[0]), s0.bills[0].id);
  assert.equal(contaDoGasto({ id: 't1' }), null);
  assert.equal(contaDoGasto({ id: 'xbill:1' }), null);
});
