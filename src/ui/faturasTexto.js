import { daysBetween, shortDate } from '../lib/dates.js';

/** "2026-11-12" -> "12/nov"; em outro ano que não o de `hoje`, "10/jan/2027". */
function dataCurta(iso, hoje) {
  const ano = iso.slice(0, 4);
  return ano === hoje.slice(0, 4) ? shortDate(iso) : `${shortDate(iso)}/${ano}`;
}

/**
 * O que aparece na etiqueta colorida de uma conta. `tipo` escolhe a cor (boleto, parcela, cartao).
 * @param {import('../domain/model.js').Bill} conta
 * @returns {{texto: string, tipo: 'boleto'|'parcela'|'cartao'}}
 */
export function etiquetaDaConta(conta) {
  if (conta.kind === 'installment') {
    const temNumero = Number.isInteger(conta.number) && Number.isInteger(conta.of);
    return { texto: temNumero ? `Parcela ${conta.number} de ${conta.of}` : 'Parcela', tipo: 'parcela' };
  }
  if (conta.kind === 'card_statement') return { texto: 'Cartão', tipo: 'cartao' };
  return { texto: 'Boleto', tipo: 'boleto' };
}

/**
 * Quando a conta vence, em palavras: "Atrasada desde 12/nov", "Vence hoje", "22/nov, em 4 dias".
 * Conta paga mostra o dia em que foi paga.
 * @param {import('../domain/model.js').Bill} conta
 * @param {string} hoje
 */
export function quandoVence(conta, hoje) {
  if (conta.paidDate) return `Paga em ${dataCurta(conta.paidDate, hoje)}`;
  const dias = daysBetween(hoje, conta.dueDate);
  const data = dataCurta(conta.dueDate, hoje);
  if (dias < 0) return `Atrasada desde ${data}`;
  if (dias === 0) return 'Vence hoje';
  if (dias === 1) return `${data}, amanhã`;
  if (dias <= 7) return `${data}, em ${dias} dias`;
  return data;
}
