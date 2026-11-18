import { indexedDbStorage } from '../data/storage.js';
import { createStore } from '../data/store.js';
import { createAutoLock, createVault } from '../data/vault.js';
import { syncAllCards } from '../domain/cards.js';
import { applyRecurring } from '../domain/recurring.js';
import { todayISO } from '../lib/dates.js';
import { atualizacao } from './atualizacao.js';
import { renderBills } from './billsScreen.js';
import { renderCards } from './cardsScreen.js';
import { el } from './dom.js';
import { renderEntry } from './entry.js';
import { definirMes, renderHome } from './home.js';
import { renderLock } from './lock.js';
import { renderPhoto } from './photo.js';
import { renderRecurring } from './recurringScreen.js';
import { renderSettings } from './settings.js';

export const SCREENS = ['lock', 'home', 'entry', 'photo', 'bills', 'cards', 'recurring', 'settings'];

const AUTO_LOCK_PADRAO_MS = 180000;

/** @type {Map<string, (container: HTMLElement, api: {go: typeof go, store: ReturnType<typeof createStore>, faixa: HTMLElement, params: object, lock: typeof lockApp, rearmar: () => void}) => void>} */
const renderers = new Map();
let tela = null;
let faixa = null;
let atual = null;
let store = null;
let autoLock = null;
let navegacao = 0; // conta cada troca de tela: serve para uma tela saber que já saiu de cena (ex.: o app travou)

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
  definirMes(null); // ao destravar, a tela principal abre no mês de hoje (o app pode ter ficado aberto na virada do mês)
  go('lock');
}

/** Começa a contar o tempo sem uso, pelo tempo definido nas configurações. */
function comecarAutoBloqueio(estado) {
  autoLock?.stop();
  const ms = estado.settings?.autoLockMs > 0 ? estado.settings.autoLockMs : AUTO_LOCK_PADRAO_MS;
  autoLock = createAutoLock({ timeoutMs: ms, onLock: lockApp });
  autoLock.touch();
}

/** Aviso na tela de senha: o app baixou uma versão nova. Atualizar aqui não perde nada, porque nada está aberto. */
function avisoDeAtualizacao() {
  return el('div', { class: 'aviso-atualizacao', role: 'status' },
    el('p', {}, 'Tem uma versão nova do app.'),
    el('button', { class: 'botao botao-principal', type: 'button', onclick: () => location.reload() }, 'Atualizar agora'));
}

/** Cria as contas fixas do mês (e dos meses em que o app ficou fechado). Se falhar, o app abre igual e tenta de novo na próxima vez. */
async function criarContasFixas(cofre) {
  try {
    const hoje = todayISO();
    if (applyRecurring(cofre.getState(), hoje) !== cofre.getState()) await cofre.commit((s) => applyRecurring(s, hoje));
  } catch {
    // sem isto o app abre normalmente; as contas fixas são conferidas de novo no próximo desbloqueio
  }
}

/** Arruma as faturas dos cartões (por exemplo, duas no mesmo mês, de versões antigas do app). Só grava se havia o que arrumar. */
async function arrumarFaturasDosCartoes(cofre) {
  try {
    if (syncAllCards(cofre.getState()) !== cofre.getState()) await cofre.commit((s) => syncAllCards(s));
  } catch {
    // sem isto o app abre normalmente; as faturas são conferidas de novo no próximo desbloqueio
  }
}

/** Pede ao Chrome para não apagar os dados sozinho se faltar espaço. Se ele recusar, nada muda. */
function pedirArmazenamentoProtegido() {
  navigator.storage?.persist?.().catch(() => {});
}

renderers.set('lock', (container, { store: cofre, go: ir }) => {
  renderLock(container, cofre, async (estado) => {
    comecarAutoBloqueio(estado);
    pedirArmazenamentoProtegido();
    await arrumarFaturasDosCartoes(cofre);
    await criarContasFixas(cofre);
    ir('home');
  });
  let mostrado = false;
  atualizacao.aoFicarPronta(() => {
    if (mostrado || currentScreen() !== 'lock' || !container.isConnected) return;
    mostrado = true;
    container.prepend(avisoDeAtualizacao());
  });
});

renderers.set('home', (container, api) => renderHome(container, api.store, api));

renderers.set('photo', (container, { store: cofre, go: ir, faixa: topo, aindaNaTela }) => renderPhoto(
  container, cofre, () => ir('home'), { faixa: topo, aindaNaTela }));

renderers.set('settings', (container, api) => renderSettings(container, api.store, api));

renderers.set('bills', (container, api) => renderBills(container, api.store, api));

renderers.set('cards', (container, api) => renderCards(container, api.store, api));

renderers.set('recurring', (container, api) => renderRecurring(container, api.store, api));

renderers.set('entry', (container, { store: cofre, go: ir, faixa: topo, params }) => {
  const voltar = () => ir(params.de ?? 'home');
  const editar = params.editar ? cofre.getState().transactions.find((t) => t.id === params.editar) : undefined;
  if (params.editar && !editar) {
    // Outra janela do app pode ter apagado o lançamento no meio do caminho.
    topo.replaceChildren(el('h1', {}, 'Editar'));
    container.append(
      el('p', { class: 'erro', role: 'alert' }, 'Esse lançamento não existe mais.'),
      el('button', { class: 'botao botao-largo', type: 'button', onclick: voltar }, 'Voltar'));
    return;
  }
  renderEntry(container, cofre, voltar, { kind: params.kind, faixa: topo, editar });
});

function emConstrucao(container) {
  container.append(el('p', {}, 'Esta tela ainda está sendo construída.'));
}

function faixaPadrao() {
  faixa.replaceChildren(el('h1', {}, 'Gasta&Gasta'));
}

/**
 * Troca a tela que aparece. A faixa de cima volta ao padrão (só o nome do app);
 * cada tela pode trocar o que mostra nela. `params` leva o que a tela precisa saber (ex.: o tipo do lançamento).
 */
export function go(nome, params = {}) {
  conferirNome(nome);
  if (!tela) throw new Error('Chame mount() antes de go()');
  atual = nome;
  navegacao += 1;
  const minhaNavegacao = navegacao;
  tela.replaceChildren();
  tela.className = 'tela';
  faixaPadrao();
  const render = renderers.get(nome);
  if (render) {
    render(tela, {
      go, store, faixa, params, lock: lockApp, rearmar: () => comecarAutoBloqueio(store.getState()),
      aindaNaTela: () => minhaNavegacao === navegacao,
    });
  }
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
  faixa = el('header', { class: 'faixa' });
  raiz.replaceChildren(faixa, tela);
  ligarAtividade();
  go('lock');
}
