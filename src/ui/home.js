import { shouldRemindBackup } from '../data/backup.js';
import { contaDoGasto, unpayBill } from '../domain/bills.js';
import { removeTransactionWithCards } from '../domain/cards.js';
import { monthlySummary, monthTransactions } from '../domain/summary.js';
import { daysBetween, monthKey, monthLabel, shiftMonth, shortDate, todayISO } from '../lib/dates.js';
import { formatBRL } from '../lib/money.js';
import { cartaoFaturas } from './billsScreen.js';
import { cartaoDosCartoes } from './cardsScreen.js';
import { botaoDeIcone, el, icone } from './dom.js';
import { alturaDoMosaico, corDaCategoria, dividirMosaico, larguraDasColunas } from './mosaico.js';

const ICONE_ANTERIOR = 'M15 5l-7 7 7 7';
const ICONE_PROXIMO = 'M9 5l7 7-7 7';
const ICONE_MAIS = 'M12 5v14M5 12h14';
const ICONE_CAMERA = ['M4 8h3l2-3h6l2 3h3v11H4z', 'M12 9.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z'];
const ICONE_CADEADO = ['M7 11h10a2 2 0 012 2v6a2 2 0 01-2 2H7a2 2 0 01-2-2v-6a2 2 0 012-2z', 'M8 11V8a4 4 0 018 0v3'];

let mes = null;

/** Mês que está aberto na tela principal ("AAAA-MM"). Começa no mês de hoje. */
export function mesAberto() {
  mes ??= monthKey(todayISO());
  return mes;
}

/** `null` volta ao mês de hoje. */
export function definirMes(chave) {
  mes = chave;
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

/**
 * Um lançamento da lista, com o botão de apagar em dois passos.
 * Gasto que veio do pagamento de uma conta não se apaga solto (a conta ficaria "paga" sem gasto):
 * o botão vira "Desfazer pagamento", que devolve a conta para "a pagar".
 */
function linhaDoLancamento(t, categorias, cartoes, aoApagar, aoEditar) {
  const pagamento = contaDoGasto(t) !== null;
  const rotulo = pagamento ? 'Desfazer pagamento' : 'Apagar';
  const nomeCategoria = categorias.find((c) => c.id === t.categoryId)?.name ?? 'Outros';
  const entrada = t.kind === 'income';
  const titulo = t.note || t.merchant || (entrada ? 'Entrada' : nomeCategoria);
  const nomeCartao = t.method === 'card' ? (cartoes.find((c) => c.id === t.cardId)?.name ?? 'Cartão') : null;
  const parcelas = t.installments > 1 ? ` em ${t.installments}x` : '';
  const detalhe = entrada
    ? shortDate(t.date)
    : `${shortDate(t.date)}, ${nomeCategoria}${nomeCartao ? `, ${nomeCartao}${parcelas}` : ''}`;
  const acoes = el('div', { class: 'lancamento-acoes' });
  const mostrarApagar = () => acoes.replaceChildren(...[
    // O gasto de um pagamento de conta não se edita: o pagamento se desfaz e se faz de novo (com a data certa).
    pagamento ? null : el('button', {
      class: 'botao botao-discreto', type: 'button', 'aria-label': `Editar: ${titulo}, ${formatBRL(t.amountCents)}`, onclick: () => aoEditar(t),
    }, 'Editar'),
    el('button', { class: 'botao botao-discreto', type: 'button', onclick: pedirConfirmacao }, rotulo),
  ].filter(Boolean));
  const pedirConfirmacao = () => acoes.replaceChildren(
    el('span', { class: 'confirmar' }, pagamento
      ? 'Desfazer o pagamento? A conta volta para "a pagar" e este gasto sai.'
      : 'Apagar este lançamento?'),
    el('button', { class: 'botao', type: 'button', onclick: mostrarApagar }, 'Cancelar'),
    el('button', { class: 'botao botao-perigo', type: 'button', onclick: () => aoApagar(t) }, pagamento ? 'Desfazer mesmo' : 'Apagar mesmo'));
  mostrarApagar();

  return el('li', { class: 'lancamento' },
    el('div', { class: 'lancamento-linha' },
      el('div', {},
        el('div', { class: 'lancamento-titulo' }, titulo),
        el('div', { class: 'lancamento-detalhe' }, detalhe, t.scope === 'work' && el('span', { class: 'etq' }, 'Trabalho'))),
      el('div', { class: `lancamento-valor${entrada ? ' entrada' : ''}` }, `${entrada ? '+' : ''}${formatBRL(t.amountCents)}`)),
    acoes);
}

/** Lembrete de cópia de segurança: só aparece se há dados e faz 30 dias (ou nunca houve cópia). */
function lembreteDeCopia(estado, ir) {
  const temDados = estado.transactions.length + estado.bills.length + estado.cards.length + estado.recurring.length > 0;
  const ultima = estado.settings.lastBackup;
  const hoje = todayISO();
  if (!shouldRemindBackup(ultima, hoje, temDados)) return null;
  const texto = ultima === null
    ? 'Você ainda não salvou uma cópia de segurança. Se perder o celular, perde os dados.'
    : `Sua última cópia de segurança foi há ${daysBetween(ultima, hoje)} dias.`;
  return el('section', { class: 'lembrete', role: 'note' },
    el('p', {}, texto),
    el('button', { class: 'botao botao-principal', type: 'button', onclick: () => ir('settings') }, 'Salvar cópia agora'));
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

  const erroAoApagar = el('p', { class: 'erro lancamentos-erro', role: 'alert' });
  const apagar = async (t) => {
    const conta = contaDoGasto(t);
    try {
      await store.commit((s) => (conta === null ? removeTransactionWithCards(s, t.id) : unpayBill(s, conta)));
    } catch (falha) {
      erroAoApagar.textContent = `Não consegui apagar: ${falha.message}`;
      return;
    }
    go('home');
  };
  const editar = (t) => go('entry', { editar: t.id, de: 'home' });
  const lancamentos = monthTransactions(estado.transactions, chave);

  raiz.classList.add('com-barra');
  raiz.append(
    lembreteDeCopia(estado, go) ?? '',
    el('section', {},
      el('h2', {}, 'Para onde foi o dinheiro'),
      el('dl', { class: 'divisao' },
        el('div', {}, el('dt', {}, 'Gastos pessoais'), el('dd', {}, formatBRL(resumo.outPersonalCents))),
        el('div', {}, el('dt', {}, 'Gastos do trabalho'), el('dd', {}, formatBRL(resumo.outWorkCents)))),
      resumo.byCategory.length
        ? mosaico(resumo, estado.categories)
        : el('p', { class: 'vazio' }, `Nenhum gasto em ${nomeDoMes} ainda. Toque em Gasto para registrar o primeiro.`)),
    cartaoFaturas(estado, todayISO(), go),
    cartaoDosCartoes(estado, todayISO(), go) ?? '',
    el('section', {},
      el('h2', {}, `Lançamentos de ${nomeDoMes}`),
      erroAoApagar,
      lancamentos.length
        ? el('ul', { class: 'lancamentos' }, lancamentos.map((t) => linhaDoLancamento(t, estado.categories, estado.cards, apagar, editar)))
        : el('p', { class: 'vazio' }, 'Nada lançado neste mês.')),
    el('section', {},
      el('button', { class: 'botao botao-largo', type: 'button', onclick: () => go('settings') }, 'Configurações e cópia de segurança')),
    el('nav', { class: 'acoes', 'aria-label': 'Registrar' },
      el('div', {},
        el('button', { class: 'btn', type: 'button', onclick: () => go('entry', { kind: 'expense' }) }, icone(ICONE_MAIS), 'Gasto'),
        el('div', { class: 'centro' },
          el('button', { class: 'camera', type: 'button', 'aria-label': 'Fotografar nota', onclick: () => go('photo') }, icone(...ICONE_CAMERA)),
          el('span', { class: 'camera-rotulo', 'aria-hidden': 'true' }, 'Fotografar nota')),
        el('button', { class: 'btn', type: 'button', onclick: () => go('entry', { kind: 'income' }) }, icone(ICONE_MAIS), 'Entrada'))));
}
