import test from 'node:test';
import assert from 'node:assert/strict';
import { arquivoDaCopia, compartilhar, nomeDaCopia, podeCompartilhar, TIPO_DA_COPIA } from '../src/lib/compartilhar.js';

const arquivo = arquivoDaCopia('2026-11-18', '{"v":1}');

/** Um navigator de mentira que anota o que foi pedido. */
function navegador({ canShare = () => true, share } = {}) {
  const pedidos = [];
  return {
    pedidos,
    canShare: (dados) => { pedidos.push(['canShare', dados]); return canShare(dados); },
    share: async (dados) => { pedidos.push(['share', dados]); if (share) await share(dados); },
  };
}

test('o arquivo da cópia é .txt de texto puro: é o que o Chrome do celular deixa compartilhar (.json é recusado)', async () => {
  assert.equal(nomeDaCopia('2026-11-18'), 'controle-2026-11-18.txt');
  assert.equal(arquivo.name, 'controle-2026-11-18.txt');
  assert.equal(arquivo.type, TIPO_DA_COPIA);
  assert.equal(TIPO_DA_COPIA, 'text/plain');
  assert.equal(await arquivo.text(), '{"v":1}');
});

test('pode compartilhar quando o navegador tem share e aceita o arquivo', () => {
  const nav = navegador();
  assert.equal(podeCompartilhar(arquivo, nav), true);
  assert.deepEqual(nav.pedidos, [['canShare', { files: [arquivo] }]]);
});

test('não pode compartilhar sem navegador, sem share, sem canShare, se recusa o arquivo ou se canShare quebra', () => {
  assert.equal(podeCompartilhar(arquivo, undefined), false);
  assert.equal(podeCompartilhar(arquivo, {}), false);
  assert.equal(podeCompartilhar(arquivo, { share: async () => {} }), false);
  assert.equal(podeCompartilhar(arquivo, { canShare: () => true }), false);
  assert.equal(podeCompartilhar(arquivo, navegador({ canShare: () => false })), false);
  assert.equal(podeCompartilhar(arquivo, navegador({ canShare: () => { throw new TypeError('x'); } })), false);
});

test('compartilhar entrega só o arquivo (com título) e diz que compartilhou', async () => {
  const nav = navegador();
  assert.equal(await compartilhar(arquivo, nav), 'compartilhado');
  const [, dados] = nav.pedidos.find(([nome]) => nome === 'share');
  assert.deepEqual(dados.files, [arquivo]);
  assert.equal(typeof dados.title, 'string');
  assert.equal('text' in dados, false);
  assert.equal('url' in dados, false);
});

test('se a pessoa fecha a janela de compartilhar, volta "cancelado" (não é erro)', async () => {
  const nav = navegador({ share: () => { throw new DOMException('Share canceled', 'AbortError'); } });
  assert.equal(await compartilhar(arquivo, nav), 'cancelado');
});

test('qualquer outro erro de compartilhar continua sendo erro', async () => {
  const nav = navegador({ share: () => { throw new DOMException('não permitido', 'NotAllowedError'); } });
  await assert.rejects(compartilhar(arquivo, nav), /não permitido/);
});
