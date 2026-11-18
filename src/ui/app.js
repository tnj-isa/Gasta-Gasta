import { indexedDbStorage } from '../data/storage.js';
import { createStore } from '../data/store.js';
import { createAutoLock, createVault } from '../data/vault.js';
import { el } from './dom.js';
import { renderLock } from './lock.js';

export const SCREENS = ['lock', 'home', 'entry', 'bills', 'cards', 'settings'];

const AUTO_LOCK_PADRAO_MS = 180000;

/** @type {Map<string, (container: HTMLElement, api: {go: typeof go, store: ReturnType<typeof createStore>}) => void>} */
const renderers = new Map();
let tela = null;
let atual = null;
let store = null;
let autoLock = null;

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

/** Tira os dados da memória e da tela, e volta para a tela de senha. */
export function lockApp() {
  autoLock?.stop();
  autoLock = null;
  store.lock();
  go('lock');
}

/** Começa a contar o tempo sem uso, pelo tempo definido nas configurações. */
function comecarAutoBloqueio(estado) {
  autoLock?.stop();
  const ms = estado.settings?.autoLockMs > 0 ? estado.settings.autoLockMs : AUTO_LOCK_PADRAO_MS;
  autoLock = createAutoLock({ timeoutMs: ms, onLock: lockApp });
  autoLock.touch();
}

renderers.set('lock', (container, { store: cofre, go: ir }) => renderLock(container, cofre, (estado) => {
  comecarAutoBloqueio(estado);
  ir('home');
}));

function emConstrucao(container) {
  container.append(el('p', {}, 'Esta tela ainda está sendo construída.'));
}

/** Troca a tela que aparece. */
export function go(nome) {
  conferirNome(nome);
  if (!tela) throw new Error('Chame mount() antes de go()');
  atual = nome;
  tela.replaceChildren();
  const render = renderers.get(nome);
  if (render) render(tela, { go, store });
  else emConstrucao(tela);
}

/** Qualquer toque ou tecla conta como uso. Se o tempo já passou, trava antes de aceitar o toque. */
function ligarAtividade() {
  const usou = () => { autoLock?.check(); autoLock?.touch(); };
  document.addEventListener('pointerdown', usou, { capture: true, passive: true });
  document.addEventListener('keydown', usou, { capture: true, passive: true });
  // O celular pode congelar o app em segundo plano; ao voltar, confere pelo horário.
  const conferir = () => autoLock?.check();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') conferir(); });
  window.addEventListener('pageshow', conferir);
  window.addEventListener('focus', conferir);
}

/** Monta a casca do app (faixa com o nome e a área da tela) e abre a tela de senha. */
export function mount(raiz) {
  store = createStore(createVault(indexedDbStorage()));
  tela = el('main', { class: 'tela' });
  raiz.replaceChildren(el('header', { class: 'faixa' }, el('h1', {}, 'Gasta&Gasta')), tela);
  ligarAtividade();
  go('lock');
}
