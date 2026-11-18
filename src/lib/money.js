/**
 * Converte um texto em reais para centavos inteiros.
 * Aceita "1.234,56", "12,5", "R$ 0,99" e "50". Recusa vazio, zero, negativo e texto.
 * @param {string} input
 * @returns {number} centavos
 */
export function parseBRL(input) {
  if (typeof input !== 'string') throw new RangeError('Digite um valor maior que zero');
  let s = input.replace(/R\$/gi, '').replace(/\s/g, '');
  if (s.includes(',')) {
    s = s.replace(/\./g, '');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  } else if (/^\d+\.\d{1,2}$/.test(s)) {
    s = s.replace('.', ',');
  }
  const m = /^(\d+)(?:,(\d{1,2}))?$/.exec(s);
  if (!m) throw new RangeError('Digite um valor maior que zero');
  const cents = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || 0);
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new RangeError('Digite um valor maior que zero');
  return cents;
}

/**
 * @param {number} cents
 * @returns {string} por exemplo "R$ 1.234,56"
 */
export function formatBRL(cents) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}
