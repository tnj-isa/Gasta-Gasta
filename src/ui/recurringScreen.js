import { newId, removeRule, upsertRule } from '../domain/model.js';
import { applyRecurring } from '../domain/recurring.js';
import { dateInMonth, monthKey, shortDate, todayISO } from '../lib/dates.js';
import { formatBRL, parseBRL } from '../lib/money.js';
import { botaoDeIcone, el } from './dom.js';
import { corDaCategoria } from './mosaico.js';
import { grupo } from './opcoes.js';

const ICONE_VOLTAR = 'M15 5l-7 7 7 7';

/** O que cada tipo de conta fixa é, para a etiqueta e para a explicação no formulário. */
const TIPOS = {
  bill: { rotulo: 'Conta a pagar', etiqueta: 'boleto', dica: 'Todo mês a conta aparece em "Faturas a vencer", com o vencimento neste dia.' },
  expense: { rotulo: 'Gasto', etiqueta: 'parcela', dica: 'Todo mês o gasto é lançado sozinho neste dia, sem você precisar registrar.' },
  income: { rotulo: 'Entrada', etiqueta: 'receita', dica: 'Todo mês a entrada é lançada sozinha neste dia, sem você precisar registrar.' },
};

/** Texto de "dia 1 a 31" digitado: só 1 ou 2 números, senão NaN. */
const lerDia = (texto) => (/^\d{1,2}$/.test(texto.trim()) ? Number(texto.trim()) : NaN);

/**
 * Formulário de conta fixa.
 * @param {{categorias: import('../domain/model.js').Category[], aoSalvar: (r: import('../domain/model.js').RecurringRule) => Promise<void>, aoCancelar: () => void}} p
 */
function formularioDeContaFixa({ categorias, aoSalvar, aoCancelar }) {
  const nome = el('input', { class: 'campo', id: 'fixa-nome', type: 'text', autocomplete: 'off', maxlength: '60' });
  const valor = el('input', { class: 'campo campo-valor', id: 'fixa-valor', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0,00' });
  const dia = el('input', { class: 'campo', id: 'fixa-dia', type: 'text', inputmode: 'numeric', autocomplete: 'off', maxlength: '2', placeholder: '25' });
  const dica = el('p', { class: 'aviso-valor' }, TIPOS.bill.dica);
  const secaoGasto = el('div', { class: 'secao-fixa' });
  const tipo = grupo({
    nome: 'O que é', inicial: 'bill',
    opcoes: Object.entries(TIPOS).map(([chave, t]) => ({ valor: chave, rotulo: t.rotulo })),
    aoMudar: (escolhido) => { dica.textContent = TIPOS[escolhido].dica; secaoGasto.hidden = escolhido === 'income'; },
  });
  const escopo = grupo({
    nome: 'Conta pessoal ou do trabalho', dividido: true, inicial: 'personal',
    opcoes: [{ valor: 'personal', rotulo: 'Pessoal' }, { valor: 'work', rotulo: 'Trabalho' }],
  });
  const categoria = grupo({
    nome: 'Categoria', inicial: categorias.some((c) => c.id === 'outros') ? 'outros' : categorias[0]?.id,
    opcoes: categorias.map((c) => ({ valor: c.id, rotulo: c.name, cor: corDaCategoria(c.id, categorias) })),
  });
  secaoGasto.append(
    el('p', { class: 'rotulo' }, 'Categoria'), categoria.elemento,
    el('p', { class: 'rotulo' }, 'É pessoal ou do trabalho?'), escopo.elemento);

  const erro = el('p', { class: 'erro', role: 'alert' });
  const botaoSalvar = el('button', { class: 'botao botao-principal', type: 'submit' }, 'Salvar');
  let salvando = false;
  const salvar = async (evento) => {
    evento.preventDefault();
    if (salvando) return;
    erro.textContent = '';
    const titulo = nome.value.trim();
    if (!titulo) { erro.textContent = 'Escreva o nome da conta fixa'; nome.focus(); return; }
    let amountCents;
    try {
      amountCents = parseBRL(valor.value);
    } catch (falha) {
      erro.textContent = falha instanceof RangeError ? falha.message : 'Valor inválido';
      valor.focus();
      return;
    }
    const dayOfMonth = lerDia(dia.value);
    if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
      erro.textContent = 'O dia do mês precisa ser de 1 a 31';
      dia.focus();
      return;
    }
    const kind = tipo.valor();
    const regra = {
      id: newId(), title: titulo, kind, amountCents, dayOfMonth,
      scope: kind === 'income' ? 'personal' : escopo.valor(),
      ...(kind === 'income' ? {} : { categoryId: categoria.valor() }),
    };
    salvando = true;
    botaoSalvar.disabled = true;
    try {
      await aoSalvar(regra);
    } catch (falha) {
      erro.textContent = `Não consegui salvar: ${falha.message}`;
      salvando = false;
      botaoSalvar.disabled = false;
    }
  };

  const form = el('form', { class: 'config-form conta-form', novalidate: true, onsubmit: salvar, 'aria-label': 'Nova conta fixa' },
    el('h2', {}, 'Nova conta fixa'),
    el('p', { class: 'rotulo' }, 'O que é'), tipo.elemento, dica,
    el('label', { class: 'rotulo', for: 'fixa-nome' }, 'Nome (ex.: Internet)'), nome,
    el('label', { class: 'rotulo', for: 'fixa-valor' }, 'Valor em reais'), valor,
    el('label', { class: 'rotulo', for: 'fixa-dia' }, 'Dia do mês (1 a 31)'), dia,
    el('p', { class: 'aviso-valor' }, 'Se o mês não tiver esse dia (31 em fevereiro, por exemplo), vale o último dia do mês.'),
    secaoGasto, erro,
    el('div', { class: 'botoes-form' },
      el('button', { class: 'botao', type: 'button', onclick: aoCancelar }, 'Cancelar'),
      botaoSalvar));
  queueMicrotask(() => nome.focus());
  return form;
}

/** O que dizer logo depois de cadastrar, conforme o que o app já criou para este mês. */
function mensagemDeCadastro(regra, estado, hoje) {
  const mes = monthKey(hoje);
  const dia = shortDate(dateInMonth(mes, regra.dayOfMonth));
  if (regra.kind === 'bill') {
    return `Pronto: ${regra.title} será criada todo mês. A deste mês já está em "Faturas a vencer" (vence ${dia}).`;
  }
  return estado.transactions.some((t) => t.id === `${regra.id}:${mes}`)
    ? `Pronto: ${regra.title} lançado neste mês, no dia ${dia}. Se você já tinha lançado, apague um dos dois. Nos próximos meses entra sozinho.`
    : `Pronto: ${regra.title} será lançado sozinho todo mês, a partir de ${dia}.`;
}

/**
 * Tela de contas fixas: o que se repete todo mês (contas a pagar, gastos e entradas). Cadastra, mostra e apaga as regras;
 * quem cria as contas de cada mês é `applyRecurring`, ao destravar o app.
 * @param {HTMLElement} raiz
 * @param {{getState(): any, commit(mutator: (s: any) => any): Promise<any>}} store
 * @param {{faixa: HTMLElement, go: (tela: string, params?: object) => void, params?: {de?: string}}} contexto
 */
export function renderRecurring(raiz, store, { faixa, go, params = {} }) {
  const voltarPara = params.de ?? 'bills';
  faixa.replaceChildren(el('div', { class: 'topo' },
    botaoDeIcone('Voltar', ICONE_VOLTAR, () => go(voltarPara)),
    el('h1', {}, 'Contas fixas')));

  const aviso = el('p', { class: 'aviso', role: 'status', hidden: true });
  const area = el('div', { class: 'contas-formulario' });
  const lista = el('div', { class: 'contas' });

  const dizer = (texto) => { aviso.textContent = texto; aviso.hidden = !texto; };
  const mudar = async (mutator, mensagem) => {
    try {
      await store.commit(mutator);
      dizer(mensagem);
    } catch (falha) {
      dizer(`Não consegui salvar: ${falha.message}`);
    }
    desenhar();
  };
  const fecharFormulario = () => area.replaceChildren();
  const abrirFormulario = () => {
    dizer('');
    area.replaceChildren(formularioDeContaFixa({
      categorias: store.getState().categories,
      aoCancelar: fecharFormulario,
      aoSalvar: async (regra) => {
        const hoje = todayISO();
        const novo = await store.commit((s) => applyRecurring(upsertRule(s, regra), hoje));
        fecharFormulario();
        dizer(mensagemDeCadastro(regra, novo, hoje));
        desenhar();
      },
    }));
    area.scrollIntoView?.({ block: 'nearest' });
  };

  /** Botão Apagar da regra, com confirmação. */
  function acoesDaRegra(regra) {
    const caixa = el('div', { class: 'fatura-acoes' });
    const normal = () => caixa.replaceChildren(el('button', {
      class: 'botao botao-discreto', type: 'button', 'aria-label': `Apagar conta fixa: ${regra.title}`, onclick: perguntar,
    }, 'Apagar'));
    const perguntar = () => caixa.replaceChildren(
      el('span', { class: 'confirmar' }, 'Apagar esta conta fixa? O que ela já criou continua; só deixa de criar nos próximos meses.'),
      el('button', { class: 'botao', type: 'button', onclick: normal }, 'Cancelar'),
      el('button', {
        class: 'botao botao-perigo', type: 'button',
        onclick: (e) => { e.currentTarget.disabled = true; mudar((s) => removeRule(s, regra.id), `${regra.title}: conta fixa apagada.`); },
      }, 'Apagar mesmo'));
    normal();
    return caixa;
  }

  function linhaDaRegra(regra) {
    const tipo = TIPOS[regra.kind] ?? TIPOS.bill;
    return el('li', { class: 'fatura' },
      el('span', { class: 'titulo' }, regra.title),
      el('span', { class: 'preco' }, formatBRL(regra.amountCents)),
      el('span', { class: 'linha2' },
        el('span', { class: `etq ${tipo.etiqueta}` }, tipo.rotulo),
        regra.scope === 'work' && el('span', { class: 'etq trabalho' }, 'Trabalho')),
      el('span', { class: 'quando' }, `Todo dia ${regra.dayOfMonth}`),
      acoesDaRegra(regra));
  }

  function desenhar() {
    const regras = [...store.getState().recurring].sort((a, b) => a.dayOfMonth - b.dayOfMonth || a.title.localeCompare(b.title, 'pt-BR'));
    lista.replaceChildren(...[
      regras.length
        ? el('ul', { class: 'faturas' }, regras.map(linhaDaRegra))
        : el('p', { class: 'vazio' }, 'Nenhuma conta fixa ainda. Toque em "Nova conta fixa" para cadastrar internet, aluguel, mensalidades…'),
    ]);
  }

  raiz.append(
    el('p', { class: 'aviso-valor' }, 'Cadastre uma vez o que se repete todo mês. O app cria a conta, o gasto ou a entrada sozinho a cada mês, quando você abre o app.'),
    el('div', { class: 'config-botoes' },
      el('button', { class: 'botao botao-principal', type: 'button', onclick: abrirFormulario }, 'Nova conta fixa')),
    aviso, area, lista);
  desenhar();
}
