import { DEFAULT_ITERATIONS, WrongPasswordError, decryptJSON, encryptJSON } from '../lib/crypto.js';
import { daysBetween } from '../lib/dates.js';

const APP = 'controle-financeiro';
const VERSAO = 1;
const DIAS_ENTRE_COPIAS = 30;
const MAX_ITERACOES = 10_000_000;

/** A cópia de segurança não pôde ser lida (arquivo errado, danificado ou com dados inválidos). */
export class BackupError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BackupError';
  }
}

const ehObjeto = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const ehTexto = (v) => typeof v === 'string' && v !== '';
const ehInteiro = (v, minimo, maximo = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(v) && v >= minimo && v <= maximo;

function ehData(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [ano, mes, dia] = v.split('-').map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

function exigir(condicao, onde) {
  if (!condicao) throw new BackupError(`Os dados dentro da cópia não são válidos (${onde}).`);
}

function conferirLista(estado, nome, conferirItem) {
  const lista = estado[nome];
  exigir(Array.isArray(lista), nome);
  const ids = new Set();
  lista.forEach((item, i) => {
    const onde = `${nome}[${i}]`;
    exigir(ehObjeto(item), onde);
    exigir(ehTexto(item.id), `${onde}.id`);
    exigir(!ids.has(item.id), `${onde}.id repetido`);
    ids.add(item.id);
    conferirItem(item, onde);
  });
  return ids;
}

const ESCOPOS = ['personal', 'work'];
const opcionalTexto = (item, campo, onde) => exigir(item[campo] === undefined || typeof item[campo] === 'string', `${onde}.${campo}`);

/**
 * Confere se o valor é um estado do app: o suficiente para o resumo, as faturas e os cartões
 * funcionarem sem quebrar. Campos que este app ainda não conhece são aceitos e mantidos.
 * @param {unknown} valor
 * @returns {import('../domain/model.js').State} o próprio valor, se estiver certo
 * @throws {BackupError}
 */
export function validateState(valor) {
  exigir(ehObjeto(valor), 'estado');
  const s = valor;
  exigir(s.version === 1, 'version');

  const categorias = conferirLista(s, 'categories', (c, onde) => exigir(ehTexto(c.name), `${onde}.name`));
  exigir(categorias.has('outros'), 'categories sem "outros"');

  conferirLista(s, 'cards', (c, onde) => {
    exigir(ehTexto(c.name), `${onde}.name`);
    exigir(ehInteiro(c.closingDay, 1, 31), `${onde}.closingDay`);
    exigir(ehInteiro(c.dueDay, 1, 31), `${onde}.dueDay`);
  });

  conferirLista(s, 'transactions', (t, onde) => {
    exigir(t.kind === 'expense' || t.kind === 'income', `${onde}.kind`);
    exigir(ehInteiro(t.amountCents, 1), `${onde}.amountCents`);
    exigir(ehData(t.date), `${onde}.date`);
    exigir(ESCOPOS.includes(t.scope), `${onde}.scope`);
    for (const campo of ['categoryId', 'cardId', 'method', 'merchant', 'note']) opcionalTexto(t, campo, onde);
  });

  conferirLista(s, 'bills', (b, onde) => {
    exigir(ehTexto(b.title), `${onde}.title`);
    exigir(['boleto', 'installment', 'card_statement'].includes(b.kind), `${onde}.kind`);
    exigir(ESCOPOS.includes(b.scope), `${onde}.scope`);
    exigir(ehInteiro(b.amountCents, 0), `${onde}.amountCents`);
    exigir(ehData(b.dueDate), `${onde}.dueDate`);
    exigir(b.paidDate === null || ehData(b.paidDate), `${onde}.paidDate`);
    for (const campo of ['categoryId', 'groupId', 'cardId']) opcionalTexto(b, campo, onde);
  });

  conferirLista(s, 'recurring', (r, onde) => {
    exigir(ehTexto(r.title), `${onde}.title`);
    exigir(['bill', 'expense', 'income'].includes(r.kind), `${onde}.kind`);
    exigir(ehInteiro(r.amountCents, 0), `${onde}.amountCents`);
    exigir(ehInteiro(r.dayOfMonth, 1, 31), `${onde}.dayOfMonth`);
    exigir(ESCOPOS.includes(r.scope), `${onde}.scope`);
    opcionalTexto(r, 'categoryId', onde);
    exigir(r.through == null || (typeof r.through === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(r.through)), `${onde}.through`);
  });

  exigir(ehObjeto(s.settings), 'settings');
  exigir(ehInteiro(s.settings.autoLockMs, 1), 'settings.autoLockMs');
  exigir(s.settings.lastBackup === null || ehData(s.settings.lastBackup), 'settings.lastBackup');
  exigir(s.settings.recurringThrough === null || /^\d{4}-\d{2}$/.test(s.settings.recurringThrough ?? ''), 'settings.recurringThrough');
  return valor;
}

/**
 * Gera o texto do arquivo de cópia: tudo criptografado com a senha dada.
 * @param {import('../domain/model.js').State} state
 * @param {string} password
 * @param {{iterations?: number}} [opts]
 * @returns {Promise<string>}
 */
export async function exportBackup(state, password, { iterations = DEFAULT_ITERATIONS } = {}) {
  const blob = await encryptJSON(state, password, { iterations });
  return JSON.stringify({ app: APP, v: VERSAO, blob });
}

function lerArquivo(texto) {
  let arquivo;
  try {
    arquivo = JSON.parse(texto);
  } catch {
    throw new BackupError('Este arquivo não é uma cópia de segurança do Gasta&Gasta.');
  }
  if (!ehObjeto(arquivo) || arquivo.app !== APP) {
    throw new BackupError('Este arquivo não é uma cópia de segurança do Gasta&Gasta.');
  }
  if (arquivo.v !== VERSAO) {
    throw new BackupError('Esta cópia foi feita por uma versão do app que esta não entende.');
  }
  const blob = arquivo.blob;
  const completo = ehObjeto(blob) && blob.v === 1 && blob.kdf === 'PBKDF2-SHA256'
    && ehInteiro(blob.iterations, 1, MAX_ITERACOES) && ehTexto(blob.salt) && ehTexto(blob.iv) && ehTexto(blob.data);
  if (!completo) throw new BackupError('O arquivo da cópia está danificado.');
  return blob;
}

/**
 * Abre uma cópia de segurança. Confere tudo antes de devolver: nada é alterado se algo estiver errado.
 * @param {string} text conteúdo do arquivo
 * @param {string} password senha da cópia
 * @returns {Promise<import('../domain/model.js').State>}
 * @throws {WrongPasswordError} senha da cópia incorreta
 * @throws {BackupError} arquivo que não é do app, danificado ou com dados inválidos
 */
export async function importBackup(text, password) {
  const blob = lerArquivo(text);
  let estado;
  try {
    estado = await decryptJSON(blob, password);
  } catch (erro) {
    if (erro instanceof WrongPasswordError) throw erro;
    throw new BackupError('O arquivo da cópia está danificado.');
  }
  return validateState(estado);
}

/**
 * Hora de lembrar de fazer uma cópia? Só se há dados, e nunca houve cópia ou já passaram 30 dias.
 * @param {string | null} lastBackup
 * @param {string} today
 * @param {boolean} hasData
 */
export function shouldRemindBackup(lastBackup, today, hasData) {
  if (!hasData) return false;
  if (lastBackup === null) return true;
  return daysBetween(lastBackup, today) >= DIAS_ENTRE_COPIAS;
}
