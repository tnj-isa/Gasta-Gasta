import { dateInMonth, monthKey, shiftMonth } from '../lib/dates.js';
import { addTransaction, newId, removeTransaction, upsertBills } from './model.js';

/** @typedef {import('./model.js').Card} Card */
/** @typedef {import('./model.js').Bill} Bill */
/** @typedef {import('./model.js').Transaction} Transaction */
/** @typedef {import('./model.js').State} State */

/** Maior número de parcelas aceito (o mesmo das contas parceladas). */
export const MAX_PARCELAS = 360;

const diaValido = (dia) => Number.isInteger(dia) && dia >= 1 && dia <= 31;

/**
 * Monta um cartão conferindo o que foi digitado. Com `id` é o mesmo cartão (edição); sem `id`, um novo.
 * @param {{id?: string, name: string, closingDay: number, dueDay: number}} p
 * @returns {Card}
 * @throws {RangeError} se o nome estiver em branco ou um dos dias não for de 1 a 31
 */
export function buildCard({ id, name, closingDay, dueDay }) {
  const nome = typeof name === 'string' ? name.trim() : '';
  if (!nome) throw new RangeError('Escreva o nome do cartão');
  if (!diaValido(closingDay)) throw new RangeError('O dia do fechamento precisa ser de 1 a 31');
  if (!diaValido(dueDay)) throw new RangeError('O dia do vencimento precisa ser de 1 a 31');
  return { id: id ?? newId(), name: nome, closingDay, dueDay };
}

/**
 * O "em quantas vezes" digitado numa compra no cartão. Vazio vale 1 (à vista).
 * @param {string} texto
 * @returns {number}
 * @throws {RangeError} se não for um número inteiro de 1 até MAX_PARCELAS
 */
export function parseInstallments(texto) {
  const t = String(texto ?? '').trim();
  if (t === '') return 1;
  const n = /^\d+$/.test(t) ? Number(t) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > MAX_PARCELAS) {
    throw new RangeError(`Em quantas vezes? Digite um número de 1 a ${MAX_PARCELAS}`);
  }
  return n;
}

/**
 * Vencimento da fatura que fecha no mês `mesDoFechamento` ("AAAA-MM"): no mesmo mês se o dia de vencimento
 * vem depois do de fechamento, senão no mês seguinte. Dias 29 a 31 caem no último dia do mês.
 */
function vencimentoDaFatura(card, mesDoFechamento) {
  return dateInMonth(card.dueDay > card.closingDay ? mesDoFechamento : shiftMonth(mesDoFechamento, 1), card.dueDay);
}

/**
 * A fatura em que uma compra cai. Compra até o dia do fechamento (inclusive) entra na fatura que fecha
 * naquele mês; depois disso, na do mês seguinte.
 * @param {Card} card
 * @param {string} purchaseDate
 * @returns {{closing: string, due: string}}
 */
export function statementFor(card, purchaseDate) {
  const mes = monthKey(purchaseDate);
  let closing = dateInMonth(mes, card.closingDay);
  if (purchaseDate > closing) closing = dateInMonth(shiftMonth(mes, 1), card.closingDay);
  return { closing, due: vencimentoDaFatura(card, monthKey(closing)) };
}

/**
 * As faturas que o cartão deve ter, somando as compras feitas nele. Compra parcelada em `n` vezes vai
 * em `n` faturas seguidas, com o resto dos centavos na primeira. Cada data vem do mês do primeiro
 * fechamento mais `i` meses (nunca da fatura anterior), então um fechamento no dia 31 não derruba o dia.
 *
 * Uma fatura que já existe (mesmo cartão e mesmo vencimento) e que ela confirmou ou pagou volta igual,
 * sem mudança. Uma prevista antiga é trocada pela nova mas mantém o `id`, para gravar não duplicar.
 * @param {Card} card
 * @param {Transaction[]} transactions
 * @param {Bill[]} existing
 * @returns {Bill[]} faturas previstas, em ordem de vencimento
 */
export function predictedStatements(card, transactions, existing) {
  const somaPorVencimento = new Map();
  for (const t of transactions) {
    if (t.kind !== 'expense' || t.method !== 'card' || t.cardId !== card.id) continue;
    const n = Number.isInteger(t.installments) && t.installments >= 1 && t.installments <= MAX_PARCELAS ? t.installments : 1;
    const base = Math.floor(t.amountCents / n);
    const resto = t.amountCents - base * n;
    const mesDoPrimeiroFechamento = monthKey(statementFor(card, t.date).closing);
    for (let i = 0; i < n; i += 1) {
      const parte = i === 0 ? base + resto : base;
      if (parte <= 0) continue;
      const vencimento = vencimentoDaFatura(card, shiftMonth(mesDoPrimeiroFechamento, i));
      somaPorVencimento.set(vencimento, (somaPorVencimento.get(vencimento) ?? 0) + parte);
    }
  }

  const doCartao = existing.filter((b) => b.kind === 'card_statement' && b.cardId === card.id);
  return [...somaPorVencimento.keys()].sort().map((dueDate) => {
    const antiga = doCartao.find((b) => b.dueDate === dueDate);
    if (antiga && (antiga.confirmed === true || antiga.paidDate)) return { ...antiga };
    return {
      id: antiga?.id ?? newId(),
      title: card.name,
      kind: 'card_statement',
      scope: 'personal',
      cardId: card.id,
      dueDate,
      amountCents: somaPorVencimento.get(dueDate),
      paidDate: null,
      confirmed: false,
    };
  });
}

/**
 * Deixa as faturas do cartão em dia com as compras dele: grava as previstas e tira as previstas que
 * nenhuma compra sustenta mais (por exemplo, depois de apagar a compra). Fatura confirmada ou paga nunca é tirada
 * e só muda de nome, se o cartão foi renomeado.
 * @param {State} s
 * @param {string} cardId
 * @returns {State}
 */
export function syncCardStatements(s, cardId) {
  const card = s.cards.find((c) => c.id === cardId);
  if (!card) return s;
  const previstas = predictedStatements(card, s.transactions, s.bills);
  const mantidas = new Set(previstas.map((b) => b.id));
  const semFantasmas = s.bills.filter((b) => !(
    b.kind === 'card_statement' && b.cardId === cardId && b.confirmed === false && !b.paidDate && !mantidas.has(b.id)
  ));
  const sincronizado = upsertBills({ ...s, bills: semFantasmas }, previstas);
  // O nome da fatura acompanha o do cartão (renomear o cartão renomeia também as confirmadas e as pagas).
  return {
    ...sincronizado,
    bills: sincronizado.bills.map((b) => (
      b.kind === 'card_statement' && b.cardId === cardId && b.title !== card.name ? { ...b, title: card.name } : b)),
  };
}

/**
 * Corrige o valor de uma fatura de cartão para o da fatura real e a marca como confirmada
 * (a partir daí as compras novas não mudam mais esse valor). Fatura paga, conta que não é fatura de
 * cartão ou id desconhecido não mudam nada.
 * @param {State} s
 * @param {string} billId
 * @param {number} amountCents
 * @returns {State}
 * @throws {RangeError} se o valor não for um número inteiro de centavos maior que zero
 */
export function confirmStatement(s, billId, amountCents) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new RangeError('Digite um valor maior que zero');
  const fatura = s.bills.find((b) => b.id === billId);
  if (!fatura || fatura.kind !== 'card_statement' || fatura.paidDate) return s;
  return upsertBills(s, [{ ...fatura, amountCents, confirmed: true }]);
}

/**
 * Os campos que uma compra no cartão acrescenta ao lançamento (`method`, `cardId`, `installments`).
 * Se o lançamento não é compra no cartão, não acrescenta nada (um cartão que sobrou de antes não vale).
 * @param {{method?: string, cardId?: string, installments?: number}} p
 * @returns {{} | {method: 'card', cardId: string, installments: number}}
 * @throws {RangeError} se faltar o cartão ou as parcelas forem inválidas
 */
export function cardPurchaseFields({ method, cardId, installments = 1 }) {
  if (method !== 'card') return {};
  if (typeof cardId !== 'string' || cardId === '') throw new RangeError('Escolha o cartão');
  if (!Number.isInteger(installments) || installments < 1 || installments > MAX_PARCELAS) {
    throw new RangeError(`Em quantas vezes? Digite um número de 1 a ${MAX_PARCELAS}`);
  }
  return { method: 'card', cardId, installments };
}

/**
 * Guarda um lançamento e, se foi compra no cartão, atualiza as faturas desse cartão, tudo no mesmo estado novo.
 * @param {State} s
 * @param {Transaction} t
 * @returns {State}
 */
export function addTransactionWithCards(s, t) {
  const novo = addTransaction(s, t);
  return t.method === 'card' && t.cardId ? syncCardStatements(novo, t.cardId) : novo;
}

/**
 * Apaga um lançamento e, se era compra no cartão, atualiza as faturas desse cartão.
 * @param {State} s
 * @param {string} id
 * @returns {State}
 */
export function removeTransactionWithCards(s, id) {
  const apagado = s.transactions.find((t) => t.id === id);
  const novo = removeTransaction(s, id);
  return apagado?.method === 'card' && apagado.cardId ? syncCardStatements(novo, apagado.cardId) : novo;
}

/**
 * As compras feitas no cartão, da mais nova para a mais antiga.
 * @param {State} s
 * @param {string} cardId
 * @returns {Transaction[]}
 */
export function cardPurchases(s, cardId) {
  return s.transactions
    .filter((t) => t.kind === 'expense' && t.method === 'card' && t.cardId === cardId)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/**
 * O que existe ligado ao cartão: quantas compras, quanto elas somam e quantas faturas (pagas ou não).
 * É o que some junto quando o cartão é apagado.
 * @param {State} s
 * @param {string} cardId
 * @returns {{purchases: number, purchasesCents: number, statements: number}}
 */
export function cardUsage(s, cardId) {
  const compras = cardPurchases(s, cardId);
  return {
    purchases: compras.length,
    purchasesCents: compras.reduce((total, t) => total + t.amountCents, 0),
    statements: s.bills.filter((b) => b.kind === 'card_statement' && b.cardId === cardId).length,
  };
}

/**
 * Apaga o cartão e tudo o que é dele: as compras feitas nele (saem do "Saiu") e todas as faturas, pagas ou não.
 * Cartão que não existe não muda nada.
 * @param {State} s
 * @param {string} cardId
 * @returns {State}
 */
export function removeCard(s, cardId) {
  if (!s.cards.some((c) => c.id === cardId)) return s;
  return {
    ...s,
    cards: s.cards.filter((c) => c.id !== cardId),
    transactions: s.transactions.filter((t) => !(t.method === 'card' && t.cardId === cardId)),
    bills: s.bills.filter((b) => !(b.kind === 'card_statement' && b.cardId === cardId)),
  };
}

/**
 * Apaga uma fatura de cartão. Se ainda há compras nessa fatura, ela volta como prevista (a soma das compras, não paga,
 * sem o valor corrigido); sem compras, some de vez. Não apaga compras. Só vale para fatura de cartão.
 * @param {State} s
 * @param {string} billId
 * @returns {State}
 */
export function removeStatement(s, billId) {
  const fatura = s.bills.find((b) => b.id === billId);
  if (!fatura || fatura.kind !== 'card_statement') return s;
  const semFatura = { ...s, bills: s.bills.filter((b) => b.id !== billId) };
  return fatura.cardId ? syncCardStatements(semFatura, fatura.cardId) : semFatura;
}

/** Quantas faturas aparecem de uma vez na tela principal. */
export const FATURAS_NA_TELA_PRINCIPAL = 6;

/**
 * O que a tela principal mostra dos cartões: as próximas faturas ainda não pagas (de todos os cartões, as atrasadas
 * primeiro), quantas ficaram de fora, o total de tudo que falta pagar e o total de cada cartão.
 * @param {State} s
 * @param {number} [max] quantas faturas listar
 * @returns {{items: Bill[], totalCents: number, restantes: number, restantesCents: number, porCartao: {cardId: string, name: string, totalCents: number}[]}}
 */
export function faturasDosCartoes(s, max = FATURAS_NA_TELA_PRINCIPAL) {
  const abertas = s.bills
    .filter((b) => b.kind === 'card_statement' && !b.paidDate)
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
  const soma = (lista) => lista.reduce((total, b) => total + b.amountCents, 0);
  const fora = abertas.slice(max);
  return {
    items: abertas.slice(0, max),
    totalCents: soma(abertas),
    restantes: fora.length,
    restantesCents: soma(fora),
    porCartao: s.cards
      .map((c) => ({ cardId: c.id, name: c.name, totalCents: soma(abertas.filter((b) => b.cardId === c.id)) }))
      .filter((c) => c.totalCents > 0),
  };
}
