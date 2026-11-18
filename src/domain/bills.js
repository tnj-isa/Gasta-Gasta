import { addMonthsClamped, daysBetween, monthKey } from '../lib/dates.js';
import { newId, upsertBills } from './model.js';

/** @typedef {import('./model.js').Bill} Bill */
/** @typedef {import('./model.js').Transaction} Transaction */
/** @typedef {import('./model.js').State} State */

const MAX_PARCELAS = 360;
const JANELA_PADRAO = 30;

const PREFIXO_DO_GASTO = 'bill:';
const idDoGasto = (billId) => `${PREFIXO_DO_GASTO}${billId}`;

/** Se o gasto veio do pagamento de uma conta, o id dessa conta; senão null. */
export function contaDoGasto(gasto) {
  return gasto.id.startsWith(PREFIXO_DO_GASTO) ? gasto.id.slice(PREFIXO_DO_GASTO.length) : null;
}

/** Confere que é uma data de verdade no formato AAAA-MM-DD (não aceita 30/02). */
function dataValida(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [a, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function nomeValido(title, mensagem) {
  const nome = typeof title === 'string' ? title.trim() : '';
  if (!nome) throw new RangeError(mensagem);
  return nome;
}

function valorValido(amountCents) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new RangeError('Digite um valor maior que zero');
}

/**
 * Cria as parcelas de uma compra parcelada, uma conta por parcela.
 * Cada vencimento é calculado a partir da primeira parcela (nunca da anterior), então um
 * vencimento no dia 31 cai no último dia de fevereiro e volta ao dia 31 em março.
 * `amountCents` é o valor de cada parcela.
 * @param {{title: string, count: number, amountCents: number, firstDue: string, scope: 'personal'|'work', categoryId?: string}} p
 * @returns {Bill[]}
 * @throws {RangeError} se a quantidade, o valor, a data ou o nome forem inválidos
 */
export function createInstallmentSeries({ title, count, amountCents, firstDue, scope, categoryId }) {
  const nome = nomeValido(title, 'Escreva o nome da compra');
  if (!Number.isInteger(count) || count < 1 || count > MAX_PARCELAS) {
    throw new RangeError(`A quantidade de parcelas precisa ser de 1 a ${MAX_PARCELAS}`);
  }
  valorValido(amountCents);
  if (!dataValida(firstDue)) throw new RangeError('Escolha a data da primeira parcela');
  const groupId = newId();
  return Array.from({ length: count }, (_, i) => ({
    id: newId(),
    title: nome,
    kind: 'installment',
    scope,
    amountCents,
    dueDate: addMonthsClamped(firstDue, i),
    paidDate: null,
    ...(categoryId ? { categoryId } : {}),
    groupId,
    number: i + 1,
    of: count,
  }));
}

/** Devolve a conta marcada como paga em `paidDate` (a original não muda). @returns {Bill} */
export function markPaid(bill, paidDate) {
  if (!dataValida(paidDate)) throw new RangeError('Escolha a data do pagamento');
  return { ...bill, paidDate };
}

/** Devolve a conta de volta a "não paga" (a original não muda). @returns {Bill} */
export function markUnpaid(bill) {
  return { ...bill, paidDate: null };
}

/**
 * O gasto que uma conta paga representa, na data do pagamento. O id é fixo (`bill:<id da conta>`):
 * é por ele que desfazer o pagamento remove exatamente esse gasto, sem duplicar.
 * Fatura de cartão não vira gasto (as compras do cartão já foram lançadas uma a uma) e conta não paga também não.
 * @returns {Transaction | null}
 */
export function billToExpense(bill) {
  if (bill.kind === 'card_statement' || !bill.paidDate) return null;
  return {
    id: idDoGasto(bill.id),
    kind: 'expense',
    amountCents: bill.amountCents,
    date: bill.paidDate,
    scope: bill.scope,
    categoryId: bill.categoryId ?? 'outros',
    merchant: bill.title,
  };
}

/**
 * Contas não pagas que vencem nos próximos `days` dias (hoje conta como dia 0), mais todas as já vencidas
 * e não pagas, que ficam no topo. Ordenadas por vencimento. `overdue` é true só para vencimento antes de hoje.
 * @param {Bill[]} bills
 * @param {string} today
 * @param {number} [days]
 * @returns {{items: (Bill & {overdue: boolean})[], totalCents: number}}
 */
export function upcomingBills(bills, today, days = JANELA_PADRAO) {
  const items = bills
    .filter((b) => b.paidDate === null && daysBetween(today, b.dueDate) <= days)
    .map((b) => ({ ...b, overdue: daysBetween(today, b.dueDate) < 0 }))
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
  return { items, totalCents: items.reduce((soma, b) => soma + b.amountCents, 0) };
}

/**
 * Quanto falta pagar para zerar tudo: soma de todas as contas não pagas (vencidas inclusive),
 * no total e por mês de vencimento ("AAAA-MM").
 * @param {Bill[]} bills
 * @returns {{totalCents: number, byMonth: Record<string, number>}}
 */
export function pendingTotals(bills) {
  const byMonth = {};
  let totalCents = 0;
  for (const b of bills) {
    if (b.paidDate !== null) continue;
    totalCents += b.amountCents;
    const mes = monthKey(b.dueDate);
    byMonth[mes] = (byMonth[mes] ?? 0) + b.amountCents;
  }
  return { totalCents, byMonth };
}

/**
 * Cria um boleto avulso (uma conta só, não paga).
 * @param {{title: string, amountCents: number, dueDate: string, scope: 'personal'|'work', categoryId?: string}} p
 * @returns {Bill}
 * @throws {RangeError} se o nome, o valor ou o vencimento forem inválidos
 */
export function createBoleto({ title, amountCents, dueDate, scope, categoryId }) {
  const nome = nomeValido(title, 'Escreva o nome da conta');
  valorValido(amountCents);
  if (!dataValida(dueDate)) throw new RangeError('Escolha a data de vencimento');
  return {
    id: newId(),
    title: nome,
    kind: 'boleto',
    scope,
    amountCents,
    dueDate,
    paidDate: null,
    ...(categoryId ? { categoryId } : {}),
  };
}

/** As contas da mesma compra parcelada (mesmo `groupId`); um boleto avulso é só ele mesmo. */
export function seriesOf(bills, bill) {
  return bill.groupId ? bills.filter((b) => b.groupId === bill.groupId) : bills.filter((b) => b.id === bill.id);
}


/**
 * Confere a data que a pessoa escolheu para um pagamento: tem que ser uma data de verdade e não pode estar
 * no futuro (um ano digitado errado, por exemplo, mandaria o gasto para um mês que ainda não existe).
 * Devolve a mensagem de erro, ou null se está tudo certo.
 * @param {string} data "AAAA-MM-DD"
 * @param {string} hoje "AAAA-MM-DD"
 * @returns {string | null}
 */
export function validarDataDoPagamento(data, hoje) {
  if (!dataValida(data)) return 'Escolha a data do pagamento.';
  if (data > hoje) return 'A data do pagamento não pode estar no futuro.';
  return null;
}

/**
 * Marca a conta como paga e lança o gasto dela, tudo de uma vez (para nunca ficar um sem o outro).
 * Conta que não existe ou que já está paga não muda nada, então um toque repetido não duplica o gasto.
 * @param {State} s
 * @param {string} billId
 * @param {string} paidDate
 * @returns {State}
 */
export function payBill(s, billId, paidDate) {
  const conta = s.bills.find((b) => b.id === billId);
  if (!conta || conta.paidDate !== null) return s;
  const paga = markPaid(conta, paidDate);
  const gasto = billToExpense(paga);
  const comConta = upsertBills(s, [paga]);
  return gasto ? { ...comConta, transactions: [...comConta.transactions.filter((t) => t.id !== gasto.id), gasto] } : comConta;
}

/**
 * Volta a conta para "a pagar" e tira o gasto do pagamento dela.
 * @param {State} s
 * @param {string} billId
 * @returns {State}
 */
export function unpayBill(s, billId) {
  const conta = s.bills.find((b) => b.id === billId);
  if (!conta) return s;
  return {
    ...upsertBills(s, [markUnpaid(conta)]),
    transactions: s.transactions.filter((t) => t.id !== idDoGasto(billId)),
  };
}

/**
 * Apaga as contas e também os gastos dos pagamentos que elas já tinham.
 * @param {State} s
 * @param {string[]} ids
 * @returns {State}
 */
export function deleteBills(s, ids) {
  const apagar = new Set(ids);
  const gastos = new Set(ids.map(idDoGasto));
  return {
    ...s,
    bills: s.bills.filter((b) => !apagar.has(b.id)),
    transactions: s.transactions.filter((t) => !gastos.has(t.id)),
  };
}
