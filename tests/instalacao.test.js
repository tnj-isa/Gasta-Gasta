import test from 'node:test';
import assert from 'node:assert/strict';
import { criarInstalacao } from '../src/ui/instalacao.js';

/** Faz de conta do aviso "este site pode ser instalado" que o Chrome dispara. */
function avisoDoChrome(resposta = 'accepted') {
  const e = new Event('beforeinstallprompt', { cancelable: true });
  e.chamadas = 0;
  e.prompt = () => { e.chamadas += 1; };
  e.userChoice = Promise.resolve({ outcome: resposta });
  return e;
}

test('começa sem poder instalar e recusa instalar', async () => {
  const instalacao = criarInstalacao(new EventTarget());
  assert.equal(instalacao.podeInstalar(), false);
  assert.equal(await instalacao.instalar(), 'indisponivel');
});

test('guarda o aviso do Chrome, segura a barra automática e instala quando ela pede', async () => {
  const alvo = new EventTarget();
  const instalacao = criarInstalacao(alvo);
  const aviso = avisoDoChrome('accepted');
  alvo.dispatchEvent(aviso);
  assert.equal(aviso.defaultPrevented, true);
  assert.equal(instalacao.podeInstalar(), true);
  assert.equal(await instalacao.instalar(), 'accepted');
  assert.equal(aviso.chamadas, 1);
  assert.equal(instalacao.podeInstalar(), false, 'o aviso só vale uma vez');
});

test('devolve a resposta dela quando recusa', async () => {
  const alvo = new EventTarget();
  const instalacao = criarInstalacao(alvo);
  alvo.dispatchEvent(avisoDoChrome('dismissed'));
  assert.equal(await instalacao.instalar(), 'dismissed');
});

test('quem pede para ser avisado recebe na hora se o aviso já chegou, ou quando chegar', () => {
  const alvo = new EventTarget();
  const instalacao = criarInstalacao(alvo);
  let vezes = 0;
  instalacao.aoPoderInstalar(() => { vezes += 1; });
  assert.equal(vezes, 0);
  alvo.dispatchEvent(avisoDoChrome());
  assert.equal(vezes, 1);
  instalacao.aoPoderInstalar(() => { vezes += 1; });
  assert.equal(vezes, 2);
});

test('depois de instalado, deixa de oferecer a instalação', () => {
  const alvo = new EventTarget();
  const instalacao = criarInstalacao(alvo);
  alvo.dispatchEvent(avisoDoChrome());
  alvo.dispatchEvent(new Event('appinstalled'));
  assert.equal(instalacao.podeInstalar(), false);
});
