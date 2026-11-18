import { monthKey } from '../lib/dates.js';

const sum = (list) => list.reduce((total, t) => total + t.amountCents, 0);

/**
 * Resumo de um mês ("AAAA-MM"): entrou, saiu (pessoal e trabalho), sobrou e gastos por categoria.
 * Compra no cartão conta na data da compra; pagar a fatura não é um gasto novo.
 * @param {import('./model.js').Transaction[]} transactions
 * @param {string} month
 */
export function monthlySummary(transactions, month) {
  const doMes = transactions.filter((t) => monthKey(t.date) === month);
  const gastos = doMes.filter((t) => t.kind === 'expense');
  const inCents = sum(doMes.filter((t) => t.kind === 'income'));
  const outPersonalCents = sum(gastos.filter((t) => t.scope === 'personal'));
  const outWorkCents = sum(gastos.filter((t) => t.scope === 'work'));
  const outTotalCents = outPersonalCents + outWorkCents;

  const porCategoria = new Map();
  for (const t of gastos) {
    const id = t.categoryId ?? 'outros';
    porCategoria.set(id, (porCategoria.get(id) ?? 0) + t.amountCents);
  }
  const byCategory = [...porCategoria]
    .map(([categoryId, cents]) => ({ categoryId, cents }))
    .sort((a, b) => b.cents - a.cents || (a.categoryId < b.categoryId ? -1 : a.categoryId > b.categoryId ? 1 : 0));

  return {
    inCents,
    outPersonalCents,
    outWorkCents,
    outTotalCents,
    leftCents: inCents - outTotalCents,
    netAfterWorkCents: inCents - outWorkCents,
    byCategory,
  };
}

/**
 * Lançamentos de um mês ("AAAA-MM"), do mais novo para o mais antigo.
 * No mesmo dia, o que foi lançado por último aparece primeiro.
 * @param {import('./model.js').Transaction[]} transactions
 * @param {string} month
 */
export function monthTransactions(transactions, month) {
  return transactions
    .filter((t) => monthKey(t.date) === month)
    .reverse()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
