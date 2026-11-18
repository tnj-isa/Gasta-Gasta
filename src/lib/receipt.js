import { parseBRL } from './money.js';

/** Valor em reais com vírgula e dois dígitos: "35,40", "1.234,56". */
const VALOR = /(?<![\d.,])(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}(?!\d)/g;
const DATA = /(?<!\d)(\d{2})\/(\d{2})\/(\d{4}|\d{2})(?!\d)/g;
const LINHA_DE_TOTAL = /\b(?:VALOR\s+TOTAL|VALOR\s+A\s+PAGAR|TOTAL)\b/i;
const SUBTOTAL = /SUB[\s-]*TOTAL/i;

/** Letras de qualquer idioma (acentos incluídos). */
const contarLetras = (texto) => (texto.match(/\p{L}/gu) ?? []).length;

function dataValida(dia, mes, ano) {
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

function acharTotal(linhas) {
  for (let i = linhas.length - 1; i >= 0; i -= 1) {
    const linha = linhas[i];
    if (!LINHA_DE_TOTAL.test(linha) || SUBTOTAL.test(linha)) continue;
    const valores = linha.match(VALOR);
    if (!valores) continue; // "TOTAL DE ITENS 3": sem dinheiro, não é o total
    try {
      return parseBRL(valores[valores.length - 1]);
    } catch {
      // zero ou ilegível: procura a linha de total anterior
    }
  }
  return undefined;
}

function acharData(texto) {
  for (const [, dia, mes, ano] of texto.matchAll(DATA)) {
    const anoCheio = ano.length === 2 ? 2000 + Number(ano) : Number(ano);
    if (dataValida(Number(dia), Number(mes), anoCheio)) {
      return `${String(anoCheio).padStart(4, '0')}-${mes}-${dia}`;
    }
  }
  return undefined;
}

function acharLocal(linhas) {
  const serve = (linha) => contarLetras(linha) >= 3
    && !/\b(?:CNPJ|CPF)\b/i.test(linha)
    && !linha.match(DATA)
    && !linha.match(VALOR);
  const achada = linhas.find(serve);
  return achada?.replace(/\s+/g, ' ');
}

/**
 * Procura o total, a data e o local no texto lido de uma nota. Só devolve o que achou,
 * e quem usa sempre confere o resultado com a pessoa antes de gravar.
 * @param {string} text
 * @returns {{totalCents?: number, date?: string, merchant?: string}}
 */
export function parseReceipt(text) {
  const linhas = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '');
  const resultado = {};
  const totalCents = acharTotal(linhas);
  if (totalCents !== undefined) resultado.totalCents = totalCents;
  const date = acharData(text);
  if (date !== undefined) resultado.date = date;
  const merchant = acharLocal(linhas);
  if (merchant !== undefined) resultado.merchant = merchant;
  return resultado;
}
