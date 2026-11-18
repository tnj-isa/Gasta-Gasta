import test from 'node:test';
import assert from 'node:assert/strict';
import { criarAtualizacao } from '../src/ui/atualizacao.js';

/** Faz de conta do `navigator.serviceWorker`: tem um controlador (ou não) e avisa quando ele troca. */
function servicoDoNavegador(controlador) {
  const alvo = new EventTarget();
  alvo.controller = controlador;
  return alvo;
}
const trocar = (alvo) => alvo.dispatchEvent(new Event('controllerchange'));

test('sem service worker no navegador, nunca há atualização e nada quebra', () => {
  const atualizacao = criarAtualizacao(null);
  assert.equal(atualizacao.pronta(), false);
  atualizacao.aoFicarPronta(() => assert.fail('não devia avisar'));
});

test('a primeira instalação do app não conta como versão nova', () => {
  const navegador = servicoDoNavegador(null);
  const atualizacao = criarAtualizacao(navegador);
  trocar(navegador);
  assert.equal(atualizacao.pronta(), false);
});

test('quando o app já tinha uma versão guardada e ela troca, há versão nova e avisa uma vez só', () => {
  const navegador = servicoDoNavegador({});
  const atualizacao = criarAtualizacao(navegador);
  let avisos = 0;
  atualizacao.aoFicarPronta(() => { avisos += 1; });
  assert.equal(atualizacao.pronta(), false);
  trocar(navegador);
  trocar(navegador);
  assert.equal(atualizacao.pronta(), true);
  assert.equal(avisos, 1);
});

test('quem pede o aviso depois que a versão nova já chegou é avisado na hora', () => {
  const navegador = servicoDoNavegador({});
  const atualizacao = criarAtualizacao(navegador);
  trocar(navegador);
  let avisos = 0;
  atualizacao.aoFicarPronta(() => { avisos += 1; });
  assert.equal(avisos, 1);
});
