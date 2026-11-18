/**
 * @typedef {string} ISODate  texto local "AAAA-MM-DD"
 * @typedef {'personal'|'work'} Scope
 * @typedef {{id:string, kind:'expense'|'income', amountCents:number, date:ISODate, scope:Scope,
 *   categoryId?:string, method?:'pix'|'debit'|'cash'|'boleto'|'card', cardId?:string,
 *   installments?:number, merchant?:string, note?:string}} Transaction
 * @typedef {{id:string, title:string, kind:'boleto'|'installment'|'card_statement', scope:Scope,
 *   amountCents:number, dueDate:ISODate, paidDate:ISODate|null, categoryId?:string, groupId?:string,
 *   number?:number, of?:number, cardId?:string, confirmed?:boolean}} Bill
 * @typedef {{id:string, name:string, closingDay:number, dueDay:number}} Card
 * @typedef {{id:string, title:string, kind:'bill'|'expense'|'income', amountCents:number,
 *   dayOfMonth:number, scope:Scope, categoryId?:string}} RecurringRule
 * @typedef {{id:string, name:string}} Category
 * @typedef {{version:1, categories:Category[], cards:Card[], transactions:Transaction[], bills:Bill[],
 *   recurring:RecurringRule[], settings:{autoLockMs:number, lastBackup:ISODate|null,
 *   recurringThrough:string|null}}} State
 */

export const DEFAULT_CATEGORIES = Object.freeze([
  { id: 'mercado', name: 'Mercado' },
  { id: 'dia-a-dia', name: 'Dia a dia' },
  { id: 'lazer', name: 'Lazer' },
  { id: 'comer-fora', name: 'Comer fora' },
  { id: 'transporte', name: 'Transporte' },
  { id: 'casa', name: 'Casa' },
  { id: 'saude', name: 'Saúde' },
  { id: 'outros', name: 'Outros' },
]);

const FALLBACK_CATEGORY = 'outros';

/** @returns {State} */
export function emptyState() {
  return {
    version: 1,
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    cards: [],
    transactions: [],
    bills: [],
    recurring: [],
    settings: { autoLockMs: 180000, lastBackup: null, recurringThrough: null },
  };
}

export function newId() {
  return crypto.randomUUID();
}

/** Substitui o item de mesmo id ou acrescenta no fim. */
function upsertById(list, item) {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [...list, item];
  return list.map((x, j) => (j === i ? item : x));
}

/** @returns {State} */
export function addTransaction(s, t) {
  return { ...s, transactions: [...s.transactions, t] };
}

/** @returns {State} */
export function removeTransaction(s, id) {
  return { ...s, transactions: s.transactions.filter((t) => t.id !== id) };
}

/** @returns {State} */
export function upsertBills(s, bills) {
  return { ...s, bills: bills.reduce(upsertById, s.bills) };
}

/** @returns {State} */
export function upsertCard(s, c) {
  return { ...s, cards: upsertById(s.cards, c) };
}

/** @returns {State} */
export function upsertRule(s, r) {
  return { ...s, recurring: upsertById(s.recurring, r) };
}

/** @returns {State} */
export function setSettings(s, patch) {
  return { ...s, settings: { ...s.settings, ...patch } };
}

/** Renomeia a categoria de mesmo id ou acrescenta uma nova. @returns {State} */
export function upsertCategory(s, c) {
  return { ...s, categories: upsertById(s.categories, c) };
}

/**
 * Remove a categoria; tudo que apontava para ela passa para "outros".
 * "outros" não pode ser removida.
 * @returns {State}
 */
export function removeCategory(s, id) {
  if (id === FALLBACK_CATEGORY) return s;
  const move = (x) => (x.categoryId === id ? { ...x, categoryId: FALLBACK_CATEGORY } : x);
  return {
    ...s,
    categories: s.categories.filter((c) => c.id !== id),
    transactions: s.transactions.map(move),
    bills: s.bills.map(move),
    recurring: s.recurring.map(move),
  };
}
