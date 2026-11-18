import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReceipt } from '../src/lib/receipt.js';

const nota = `SUPERMERCADO BOM PRECO
CNPJ 12.345.678/0001-90
11/11/2026 18:42
ARROZ 5KG 28,90
FEIJAO 1KG 8,50
SUBTOTAL 37,40
DESCONTO 2,00
TOTAL R$ 35,40
DINHEIRO 50,00
TROCO 14,60`;

test('escolhe o total entre vários números', () => {
  assert.deepEqual(parseReceipt(nota),
    { totalCents: 3540, date: '2026-11-11', merchant: 'SUPERMERCADO BOM PRECO' });
});

test('aceita VALOR A PAGAR e data com ano de dois dígitos', () => {
  const r = parseReceipt('PADARIA DO ZE\n05/12/26\nVALOR A PAGAR 22,00');
  assert.equal(r.totalCents, 2200);
  assert.equal(r.date, '2026-12-05');
});

test('sem palavra de total não chuta', () => {
  assert.equal(parseReceipt('LOJA X\nITEM 10,00\nITEM 5,00').totalCents, undefined);
});

test('texto vazio ou lixo devolve objeto vazio', () => {
  assert.deepEqual(parseReceipt(''), {});
  assert.deepEqual(parseReceipt('   \n\n  '), {});
  assert.deepEqual(parseReceipt('@@ ## 12 ..'), {});
});

test('SUBTOTAL sozinho não vale como total', () => {
  assert.equal(parseReceipt('LOJA X\nSUBTOTAL 37,40').totalCents, undefined);
  assert.equal(parseReceipt('LOJA X\nSUB TOTAL 37,40\nSub-total 40,00').totalCents, undefined, 'também com espaço ou hífen');
});

test('vale a última linha de total', () => {
  assert.equal(parseReceipt('LOJA X\nTOTAL 10,00\nVALOR TOTAL R$ 12,00').totalCents, 1200);
  assert.equal(parseReceipt('LOJA X\nVALOR A PAGAR 12,00\nTOTAL 10,00').totalCents, 1000);
});

test('"total de itens" sem dinheiro não atrapalha o total de verdade', () => {
  assert.equal(parseReceipt('LOJA X\nTOTAL R$ 35,40\nQTD. TOTAL DE ITENS 3').totalCents, 3540);
});

test('valor com milhar, em minúsculas e com quebra de linha do Windows', () => {
  assert.equal(parseReceipt('Loja X\r\nTotal R$ 1.234,56\r\n').totalCents, 123456);
});

test('pega o último valor da linha do total (o primeiro pode ser a quantidade ou um desconto)', () => {
  assert.equal(parseReceipt('LOJA X\nTOTAL 3 ITENS 1.000,00 R$ 987,65').totalCents, 98765);
});

test('total zerado ou impossível de ler não vira valor', () => {
  assert.equal(parseReceipt('LOJA X\nTOTAL R$ 0,00').totalCents, undefined);
  assert.equal(parseReceipt('LOJA X\nTOTAL R$ ??,??').totalCents, undefined);
});

test('a data certa é a primeira que existe de verdade, e o CNPJ não é data', () => {
  assert.equal(parseReceipt('CNPJ 12.345.678/0001-90\n31/02/2026\n05/03/26').date, '2026-03-05');
  assert.equal(parseReceipt('CNPJ 12.345.678/0001-90').date, undefined);
  assert.equal(parseReceipt('EMISSAO 29/02/2028 10:00').date, '2028-02-29');
  assert.equal(parseReceipt('EMISSAO 29/02/2027 10:00').date, undefined);
});

test('o local é a primeira linha com letras que não é CNPJ, data nem valor', () => {
  const r = parseReceipt('  \n12.345.678/0001-90\nCNPJ 12.345.678/0001-90\nR$\n11/11/2026\n 35,40\n  Padaria   do  Zé  \nTOTAL 5,00');
  assert.equal(r.merchant, 'Padaria do Zé');
});

test('sem nenhuma linha que sirva de local, a chave não aparece', () => {
  assert.equal('merchant' in parseReceipt('CNPJ 1\n11/11/2026\nTOTAL R$ 5,00'), false);
  assert.equal('merchant' in parseReceipt('ab\n12'), false);
});

test('só aparecem as chaves que foram achadas', () => {
  assert.deepEqual(parseReceipt('TOTAL R$ 5,00'), { totalCents: 500 });
  assert.deepEqual(parseReceipt('05/12/2026'), { date: '2026-12-05' });
});
