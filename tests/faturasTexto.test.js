import test from 'node:test';
import assert from 'node:assert/strict';
import { etiquetaDaConta, quandoVence } from '../src/ui/faturasTexto.js';

const conta = (extra) => ({ id: 'x', title: 'X', kind: 'boleto', scope: 'personal', amountCents: 100, dueDate: '2026-11-22', paidDate: null, ...extra });

test('etiqueta: boleto, parcela com número e cartão, cada um com o seu tipo de cor', () => {
  assert.deepEqual(etiquetaDaConta(conta({})), { texto: 'Boleto', tipo: 'boleto' });
  assert.deepEqual(etiquetaDaConta(conta({ kind: 'installment', number: 4, of: 10 })), { texto: 'Parcela 4 de 10', tipo: 'parcela' });
  assert.deepEqual(etiquetaDaConta(conta({ kind: 'card_statement', confirmed: true })), { texto: 'Fatura do cartão', tipo: 'cartao' });
});

test('fatura de cartão ainda prevista (não corrigida) diz que é prevista; confirmada ou paga, não', () => {
  const fatura = (extra) => conta({ kind: 'card_statement', ...extra });
  assert.equal(etiquetaDaConta(fatura({ confirmed: false })).texto, 'Fatura prevista');
  assert.equal(etiquetaDaConta(fatura({ confirmed: false, paidDate: '2026-11-12' })).texto, 'Fatura do cartão');
  assert.equal(etiquetaDaConta(fatura({ confirmed: true })).texto, 'Fatura do cartão');
  assert.equal(etiquetaDaConta(fatura({})).texto, 'Fatura do cartão', 'sem o campo confirmed, conta como confirmada');
  assert.equal(etiquetaDaConta(fatura({ confirmed: false })).tipo, 'cartao');
});

test('etiqueta de parcela sem número (dado antigo ou cópia estranha) não mostra "undefined"', () => {
  assert.deepEqual(etiquetaDaConta(conta({ kind: 'installment' })), { texto: 'Parcela', tipo: 'parcela' });
  assert.deepEqual(etiquetaDaConta(conta({ kind: 'installment', number: 2 })), { texto: 'Parcela', tipo: 'parcela' });
  assert.deepEqual(etiquetaDaConta(conta({ kind: 'installment', of: 6 })), { texto: 'Parcela', tipo: 'parcela' });
});

test('quando vence: atrasada, hoje, amanhã, em poucos dias e mais adiante', () => {
  const hoje = '2026-11-18';
  assert.equal(quandoVence(conta({ dueDate: '2026-11-12' }), hoje), 'Atrasada desde 12/nov');
  assert.equal(quandoVence(conta({ dueDate: '2026-11-18' }), hoje), 'Vence hoje');
  assert.equal(quandoVence(conta({ dueDate: '2026-11-19' }), hoje), '19/nov, amanhã');
  assert.equal(quandoVence(conta({ dueDate: '2026-11-22' }), hoje), '22/nov, em 4 dias');
  assert.equal(quandoVence(conta({ dueDate: '2026-11-25' }), hoje), '25/nov, em 7 dias');
  assert.equal(quandoVence(conta({ dueDate: '2026-11-26' }), hoje), '26/nov');
});

test('em outro ano o texto leva o ano, para não confundir parcelas de janeiro', () => {
  assert.equal(quandoVence(conta({ dueDate: '2027-01-10' }), '2026-11-18'), '10/jan/2027');
  assert.equal(quandoVence(conta({ dueDate: '2026-12-31' }), '2026-11-18'), '31/dez');
  assert.equal(quandoVence(conta({ dueDate: '2025-12-30' }), '2026-01-05'), 'Atrasada desde 30/dez/2025');
});

test('conta paga mostra o dia do pagamento, não o vencimento', () => {
  assert.equal(quandoVence(conta({ dueDate: '2026-12-10', paidDate: '2026-11-18' }), '2026-11-18'), 'Paga em 18/nov');
  assert.equal(quandoVence(conta({ dueDate: '2026-12-10', paidDate: '2027-01-02' }), '2026-12-20'), 'Paga em 2/jan/2027');
});
