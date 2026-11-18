import { removeTransaction } from '../domain/model.js';
import { monthlySummary, monthTransactions } from '../domain/summary.js';
import { monthKey, monthLabel, shiftMonth, shortDate, todayISO } from '../lib/dates.js';
import { formatBRL } from '../lib/money.js';
import { el, icone } from './dom.js';
import { alturaDoMosaico, corDaCategoria, dividirMosaico, larguraDasColunas } from './mosaico.js';

const ICONE_ANTERIOR = 'M15 5l-7 7 7 7';
const ICONE_PROXIMO = 'M9 5l7 7-7 7';
const ICONE_MAIS = 'M12 5v14M5 12h14';
const ICONE_CADEADO = ['M7 11h10a2 2 0 012 2v6a2 2 0 01-2 2H7a2 2 0 01-2-2v-6a2 2 0 012-2z', 'M8 11V8a4 4 0 018 0v3'];

let mes = null;

/** Mês que está aberto na tela principal ("AAAA-MM"). Começa no mês de hoje. */
export function mesAberto() {
  mes ??= monthKey(todayISO());
  return mes;
}

export function definirMes(chave) {
  mes = chave;
}

function botaoDeIcone(rotulo, caminho, aoClicar) {
  return el('button', { class: 'icone', type: 'button', 'aria-label': rotulo, onclick: aoClicar }, icone(caminho));
}

function itemDoResumo(rotulo, centavos, classe = '') {
  const negativo = centavos < 0 ? ' negativo' : '';
  return el('div', { class: `${classe}${negativo}`.trim() },
    el('dt', {}, rotulo), el('dd', {}, formatBRL(centavos)));
}

function blocoDoMosaico(item, resumo, categorias) {
  const nome = categorias.find((c) => c.id === item.categoryId)?.name ?? 'Outros';
  const cor = corDaCategoria(item.categoryId, categorias);
  const porcento = Math.round((item.cents / resumo.outTotalCents) * 100);
  const bloco = el('div', {
    class: 'bloco', role: 'group', style: `flex: ${item.cents}`,
    'aria-label': `${nome}: ${formatBRL(item.cents)}, ${porcento}% do que saiu`,
  },
  el('span', { class: 'nome' }, nome),
  el('span', {}, el('span', { class: 'valor' }, formatBRL(item.cents)), el('br'), el('span', { class: 'pct' }, `${porcento}%`)));
  bloco.style.setProperty('--fundo', cor.fundo);
  bloco.style.setProperty('--texto', cor.texto);
  return bloco;
}

function mosaico(resumo, categorias) {
  const colunas = dividirMosaico(resumo.byCategory).filter((c) => c.length > 0);
  const larguras = larguraDasColunas(colunas);
  const lado = (coluna, i) => el('div', { class: 'col', style: `flex: ${larguras[i]}` },
    coluna.map((item) => blocoDoMosaico(item, resumo, categorias)));
  return el('div', { class: 'mosaico', style: `height: ${alturaDoMosaico(colunas)}px` }, colunas.map(lado));
}

function linhaDoLancamento(t, categorias, aoApagar) {
  const nomeCategoria = categorias.find((c) => c.id === t.categoryId)?.name ?? 'Outros';
  const entrada = t.kind === 'income';
  const titulo = t.note || (entrada ? 'Entrada' : nomeCategoria);
  const detalhe = entrada ? shortDate(t.date) : `${shortDate(t.date)}, ${nomeCategoria}`;
  const acoes = el('div', { class: 'lancamento-acoes' });
  const mostrarApagar = () => acoes.replaceChildren(
    el('button', { class: 'botao botao-discreto', type: 'button', onclick: () => aoApagar(t) }, 'Apagar'));
  const pedirConfirmacao = () => acoes.replaceChildren(
    el('span', { class: 'confirmar' }, 'Apagar este lançamento?'),
    el('button', { class: 'botao', type: 'button', onclick: mostrarApagar }, 'Cancelar'),
    el('button', { class: 'botao botao-perigo', type: 'button', onclick: () => aoApagar(t) }, 'Apagar mesmo'));
  acoes.append(el('button', { class: 'botao botao-discreto', type: 'button', onclick: pedirConfirmacao }, 'Apagar'));

  return el('li', { class: 'lancamento' },
    el('div', { class: 'lancamento-linha' },
      el('div', {},
        el('div', { class: 'lancamento-titulo' }, titulo),
        el('div', { class: 'lancamento-detalhe' }, detalhe, t.scope === 'work' && el('span', { class: 'etq' }, 'Trabalho'))),
      el('div', { class: `lancamento-valor${entrada ? ' entrada' : ''}` }, `${entrada ? '+' : ''}${formatBRL(t.amountCents)}`)),
    acoes);
}

/**
 * Tela principal: resumo do mês na faixa de cima, "para onde foi o dinheiro" em blocos,
 * lançamentos do mês e os botões de registrar.
 * @param {HTMLElement} raiz
 * @param {{getState(): any, commit(mutator: (s: any) => any): Promise<any>}} store
 * @param {{faixa: HTMLElement, go: (tela: string, params?: object) => void, lock: () => void}} contexto
 */
export function renderHome(raiz, store, { faixa, go, lock }) {
  const estado = store.getState();
  const chave = mesAberto();
  const nomeDoMes = monthLabel(chave);
  const resumo = monthlySummary(estado.transactions, chave);
  const trocarMes = (passo) => { definirMes(shiftMonth(chave, passo)); go('home'); };

  faixa.replaceChildren(
    el('div', { class: 'topo' },
      el('div', { class: 'mes' },
        botaoDeIcone('Mês anterior', ICONE_ANTERIOR, () => trocarMes(-1)),
        el('h1', {}, nomeDoMes),
        botaoDeIcone('Próximo mês', ICONE_PROXIMO, () => trocarMes(1))),
      el('button', { class: 'travar', type: 'button', onclick: lock }, icone(...ICONE_CADEADO), 'Travar')),
    el('dl', { class: 'trio', 'aria-label': 'Resumo do mês' },
      itemDoResumo('Entrou', resumo.inCents),
      itemDoResumo('Saiu', resumo.outTotalCents),
      itemDoResumo('Sobrou', resumo.leftCents, 'sobrou')),
    el('div', { class: 'liquido' },
      el('span', {}, 'Ganho depois dos custos do trabalho'),
      el('strong', {}, formatBRL(resumo.netAfterWorkCents))));

  const apagar = async (t) => {
    await store.commit((s) => removeTransaction(s, t.id));
    go('home');
  };
  const lancamentos = monthTransactions(estado.transactions, chave);

  raiz.classList.add('com-barra');
  raiz.append(
    el('section', {},
      el('h2', {}, 'Para onde foi o dinheiro'),
      el('dl', { class: 'divisao' },
        el('div', {}, el('dt', {}, 'Gastos pessoais'), el('dd', {}, formatBRL(resumo.outPersonalCents))),
        el('div', {}, el('dt', {}, 'Gastos do trabalho'), el('dd', {}, formatBRL(resumo.outWorkCents)))),
      resumo.byCategory.length
        ? mosaico(resumo, estado.categories)
        : el('p', { class: 'vazio' }, `Nenhum gasto em ${nomeDoMes} ainda. Toque em Gasto para registrar o primeiro.`)),
    el('section', {},
      el('h2', {}, `Lançamentos de ${nomeDoMes}`),
      lancamentos.length
        ? el('ul', { class: 'lancamentos' }, lancamentos.map((t) => linhaDoLancamento(t, estado.categories, apagar)))
        : el('p', { class: 'vazio' }, 'Nada lançado neste mês.')),
    el('nav', { class: 'acoes', 'aria-label': 'Registrar' },
      el('div', {},
        el('button', { class: 'btn', type: 'button', onclick: () => go('entry', { kind: 'expense' }) }, icone(ICONE_MAIS), 'Gasto'),
        el('button', { class: 'btn', type: 'button', onclick: () => go('entry', { kind: 'income' }) }, icone(ICONE_MAIS), 'Entrada'))));
}
