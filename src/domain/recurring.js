import { dateInMonth, monthKey, shiftMonth } from '../lib/dates.js';

/** @typedef {import('./model.js').State} State */
/** @typedef {import('./model.js').RecurringRule} RecurringRule */

/** Se o app ficou parado por muito tempo, só os últimos meses são recuperados (proteção contra dado estragado). */
export const MAX_MESES_ATRASADOS = 36;

const CATEGORIA_PADRAO = 'outros';

/** A conta, o gasto ou a entrada que a regra gera para o mês `mes`, na data `data`. */
function itemDaRegra(regra, mes, data) {
  const id = `${regra.id}:${mes}`;
  if (regra.kind === 'bill') {
    return {
      id, title: regra.title, kind: 'boleto', scope: regra.scope, amountCents: regra.amountCents, dueDate: data, paidDate: null,
      ...(regra.categoryId ? { categoryId: regra.categoryId } : {}),
    };
  }
  if (regra.kind === 'expense') {
    return {
      id, kind: 'expense', amountCents: regra.amountCents, date: data, scope: regra.scope,
      categoryId: regra.categoryId ?? CATEGORIA_PADRAO, merchant: regra.title,
    };
  }
  return { id, kind: 'income', amountCents: regra.amountCents, date: data, scope: regra.scope, note: regra.title };
}

/**
 * Cria o que as contas fixas pedem até `today`. Cada regra anota em `through` o último mês que já criou, então:
 * - a primeira vez cria só o mês atual (não preenche o passado);
 * - meses em que o app ficou fechado são criados na volta (até MAX_MESES_ATRASADOS);
 * - uma conta (ou gasto, ou entrada) apagada não volta, e uma regra nova, cadastrada no meio do mês, cria o mês atual;
 * - a conta é criada no começo do mês, mesmo que o dia já tenha passado (fica atrasada até ser paga);
 *   gasto e entrada só são lançados quando o dia chega, e esperam a vez nos meses seguintes.
 * Cada item tem o id `${regra.id}:${AAAA-MM}`, então nunca duplica nem substitui um que já existe.
 * `settings.recurringThrough` guarda o mês da última conferência. Se não há nada a fazer, devolve o mesmo `s`.
 * @param {State} s
 * @param {string} today "AAAA-MM-DD", o dia local de hoje
 * @returns {State}
 */
export function applyRecurring(s, today) {
  const mes = monthKey(today);
  const maisAntigo = shiftMonth(mes, -(MAX_MESES_ATRASADOS - 1));
  const ocupados = new Set([...s.bills, ...s.transactions].map((x) => x.id));
  const contas = [];
  const lancamentos = [];
  let regrasMudaram = false;

  const recurring = s.recurring.map((regra) => {
    const anotado = regra.through ?? null;
    const primeiro = anotado ? shiftMonth(anotado, 1) : mes;
    let ate = anotado;
    for (let m = primeiro < maisAntigo ? maisAntigo : primeiro; m <= mes; m = shiftMonth(m, 1)) {
      const data = dateInMonth(m, regra.dayOfMonth);
      if (regra.kind !== 'bill' && data > today) break;
      const item = itemDaRegra(regra, m, data);
      if (!ocupados.has(item.id)) {
        ocupados.add(item.id);
        (regra.kind === 'bill' ? contas : lancamentos).push(item);
      }
      ate = m;
    }
    if (ate === anotado) return regra;
    regrasMudaram = true;
    return { ...regra, through: ate };
  });

  if (!regrasMudaram && s.settings.recurringThrough === mes) return s;
  return {
    ...s,
    recurring,
    bills: [...s.bills, ...contas],
    transactions: [...s.transactions, ...lancamentos],
    settings: { ...s.settings, recurringThrough: mes },
  };
}
