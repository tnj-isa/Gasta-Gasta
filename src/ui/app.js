import { renderDiagnostico } from './diagnostico.js';
import { el } from './dom.js';

export const SCREENS = ['lock', 'home', 'entry', 'bills', 'cards', 'settings'];

/** @type {Map<string, (container: HTMLElement, api: {go: typeof go}) => void>} */
const renderers = new Map();
let tela = null;
let atual = null;

function conferirNome(nome) {
  if (!SCREENS.includes(nome)) throw new RangeError(`Tela desconhecida: ${nome}`);
}

/** As telas seguintes se registram aqui; enquanto não existem, aparece o aviso "em construção". */
export function registerScreen(nome, render) {
  conferirNome(nome);
  renderers.set(nome, render);
}

export function currentScreen() {
  return atual;
}

function emConstrucao(container, nome) {
  container.append(el('p', {}, 'Esta tela ainda está sendo construída.'));
  if (nome === 'home') renderDiagnostico(container);
}

/** Troca a tela que aparece. */
export function go(nome) {
  conferirNome(nome);
  if (!tela) throw new Error('Chame mount() antes de go()');
  atual = nome;
  tela.replaceChildren();
  const render = renderers.get(nome);
  if (render) render(tela, { go });
  else emConstrucao(tela, nome);
}

/** Monta a casca do app (faixa com o nome e a área da tela) e abre a tela inicial. */
export function mount(raiz) {
  tela = el('main', { class: 'tela' });
  raiz.replaceChildren(el('header', { class: 'faixa' }, el('h1', {}, 'Gasta&Gasta')), tela);
  go('home');
}
