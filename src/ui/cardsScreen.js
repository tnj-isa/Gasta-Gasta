import { payBill, unpayBill } from '../domain/bills.js';
import {
  buildCard, cardPurchases, cardUsage, confirmStatement, faturasDosCartoes, removeCard, removeStatement, removeTransactionWithCards, syncCardStatements,
} from '../domain/cards.js';
import { upsertCard } from '../domain/model.js';
import { shortDate, todayISO } from '../lib/dates.js';
import { centavosParaCampo, formatBRL, parseBRL } from '../lib/money.js';
import { linhaDaConta } from './billsScreen.js';
import { botaoDeIcone, el } from './dom.js';
import { perguntarDataDoPagamento } from './pagamento.js';

const ICONE_VOLTAR = 'M15 5l-7 7 7 7';
const PAGAS_VISIVEIS = 3;

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/** Texto de "dia 1 a 31" digitado: só 1 ou 2 números, senão NaN (o cartão recusa com a mensagem certa). */
const lerDia = (texto) => (/^\d{1,2}$/.test(texto.trim()) ? Number(texto.trim()) : NaN);

/**
 * Formulário de cartão: novo (sem `cartao`) ou edição (com `cartao`).
 * @param {{cartao?: import('../domain/model.js').Card, aoSalvar: (c: import('../domain/model.js').Card) => Promise<void>, aoCancelar: () => void}} p
 */
function formularioDeCartao({ cartao, aoSalvar, aoCancelar }) {
  const nome = el('input', { class: 'campo', id: 'cartao-nome', type: 'text', autocomplete: 'off', maxlength: '40', value: cartao?.name ?? null });
  const fechamento = el('input', {
    class: 'campo', id: 'cartao-fecha', type: 'text', inputmode: 'numeric', autocomplete: 'off', maxlength: '2', value: cartao?.closingDay ?? null,
  });
  const vencimento = el('input', {
    class: 'campo', id: 'cartao-vence', type: 'text', inputmode: 'numeric', autocomplete: 'off', maxlength: '2', value: cartao?.dueDay ?? null,
  });
  const erro = el('p', { class: 'erro', role: 'alert' });
  const botaoSalvar = el('button', { class: 'botao botao-principal', type: 'submit' }, 'Salvar');
  let salvando = false;
  const salvar = async (evento) => {
    evento.preventDefault();
    if (salvando) return;
    erro.textContent = '';
    let novo;
    try {
      novo = buildCard({ id: cartao?.id, name: nome.value, closingDay: lerDia(fechamento.value), dueDay: lerDia(vencimento.value) });
    } catch (falha) {
      erro.textContent = falha instanceof RangeError ? falha.message : 'Confira os campos.';
      return;
    }
    salvando = true;
    botaoSalvar.disabled = true;
    try {
      await aoSalvar(novo);
    } catch (falha) {
      erro.textContent = `Não consegui salvar: ${falha.message}`;
      salvando = false;
      botaoSalvar.disabled = false;
    }
  };
  const form = el('form', { class: 'config-form conta-form', novalidate: true, onsubmit: salvar, 'aria-label': cartao ? 'Editar cartão' : 'Novo cartão' },
    el('h2', {}, cartao ? 'Editar cartão' : 'Novo cartão'),
    el('label', { class: 'rotulo', for: 'cartao-nome' }, 'Nome do cartão (ex.: Cartão roxo)'), nome,
    el('p', { class: 'aviso-valor' }, 'Os dois dias abaixo aparecem no app do banco, na tela da fatura.'),
    el('label', { class: 'rotulo', for: 'cartao-fecha' }, 'Dia em que a fatura fecha (1 a 31)'), fechamento,
    el('label', { class: 'rotulo', for: 'cartao-vence' }, 'Dia em que a fatura vence (1 a 31)'), vencimento,
    erro,
    el('div', { class: 'botoes-form' },
      el('button', { class: 'botao', type: 'button', onclick: aoCancelar }, 'Cancelar'),
      botaoSalvar));
  queueMicrotask(() => nome.focus());
  return form;
}

/**
 * O cartão "Cartões de crédito" da tela principal, com o mesmo visual do "Faturas a vencer": as próximas faturas
 * de todos os cartões (as atrasadas primeiro), o total que falta pagar e, com mais de um cartão, o total de cada um.
 * Sem cartão cadastrado não mostra nada (devolve `null`).
 * @param {import('../domain/model.js').State} estado
 * @param {string} hoje
 * @param {(tela: string) => void} ir
 * @returns {HTMLElement | null}
 */
export function cartaoDosCartoes(estado, hoje, ir) {
  if (estado.cards.length === 0) return null;
  const { items, totalCents, restantes, restantesCents, porCartao } = faturasDosCartoes(estado);
  const corpo = items.length === 0
    ? el('p', { class: 'vazio' }, 'Nenhuma fatura em aberto. As compras feitas "No cartão" aparecem aqui.')
    : [
      el('ul', { class: 'faturas' }, items.map((f) => linhaDaConta(f, hoje))),
      restantes > 0 && el('p', { class: 'aviso-valor' },
        `Mais ${restantes} ${restantes === 1 ? 'fatura' : 'faturas'} depois destas: ${formatBRL(restantesCents)}.`),
    ];
  const rodape = totalCents > 0 && el('div', { class: 'faturas-rodape' },
    el('div', { class: 'total' }, el('span', {}, 'Total nos cartões'), el('strong', {}, formatBRL(totalCents))),
    porCartao.length > 1 && el('dl', { class: 'por-mes' },
      porCartao.map((c) => el('div', {}, el('dt', {}, c.name), el('dd', {}, formatBRL(c.totalCents))))));
  return el('section', { class: 'faturas-secao', 'aria-label': 'Cartões de crédito' },
    el('h2', {}, 'Cartões de crédito'),
    el('p', { class: 'sub' }, 'O que falta pagar nas faturas'),
    corpo, rodape,
    el('button', { class: 'botao botao-largo', type: 'button', onclick: () => ir('cards') },
      items.length > 0 ? 'Corrigir valor ou pagar fatura' : 'Ver cartões'));
}

/**
 * Tela de cartões: cadastrar e editar cartões (dia de fechamento e de vencimento), ver as faturas de cada um
 * (previstas pela soma das compras), corrigir o valor para o da fatura real e marcar a fatura como paga.
 * Pagar a fatura não cria gasto novo: as compras já foram lançadas, cada uma no dia em que aconteceu.
 * @param {HTMLElement} raiz
 * @param {{getState(): any, commit(mutator: (s: any) => any): Promise<any>}} store
 * @param {{faixa: HTMLElement, go: (tela: string, params?: object) => void}} contexto
 */
export function renderCards(raiz, store, { faixa, go }) {
  faixa.replaceChildren(el('div', { class: 'topo' },
    botaoDeIcone('Voltar', ICONE_VOLTAR, () => go('home')),
    el('h1', {}, 'Cartões')));

  const aviso = el('p', { class: 'aviso', role: 'status', hidden: true });
  const area = el('div', { class: 'contas-formulario' });
  const lista = el('div', { class: 'contas' });
  const comprasAbertas = new Set();

  const dizer = (texto) => { aviso.textContent = texto; aviso.hidden = !texto; };
  const mudar = async (mutator, mensagem) => {
    try {
      await store.commit(mutator);
      dizer(mensagem ?? '');
    } catch (falha) {
      dizer(`Não consegui salvar: ${falha.message}`);
    }
    desenhar();
  };
  const fecharFormulario = () => area.replaceChildren();
  const abrirFormulario = (cartao) => {
    dizer('');
    area.replaceChildren(formularioDeCartao({
      cartao,
      aoCancelar: fecharFormulario,
      aoSalvar: async (novo) => {
        await store.commit((s) => syncCardStatements(upsertCard(s, novo), novo.id));
        fecharFormulario();
        dizer(cartao ? `Pronto: ${novo.name} atualizado.` : `Pronto: ${novo.name} cadastrado. Agora, ao registrar um gasto, escolha "No cartão".`);
        desenhar();
      },
    }));
    area.scrollIntoView?.({ block: 'nearest' });
  };

  /** Botões de uma fatura: corrigir o valor (confirma) e marcar como paga, ou desfazer se já paga. */
  function acoesDaFatura(fatura) {
    const caixa = el('div', { class: 'fatura-acoes' });
    const contexto = `${fatura.title}, vence ${fatura.dueDate.split('-').reverse().join('/')}`;
    const apagavel = fatura.paidDate || fatura.confirmed === true;
    const botaoApagar = () => el('button', {
      class: 'botao botao-discreto', type: 'button', 'aria-label': `Apagar fatura: ${contexto}`, onclick: perguntarApagar,
    }, 'Apagar');
    const normal = () => {
      if (fatura.paidDate) {
        caixa.replaceChildren(el('button', {
          class: 'botao', type: 'button', 'aria-label': `Desfazer pagamento: ${contexto}`,
          onclick: (e) => { e.currentTarget.disabled = true; mudar((s) => unpayBill(s, fatura.id), 'Pagamento da fatura desfeito.'); },
        }, 'Desfazer'), botaoApagar());
        return;
      }
      // replaceChildren escreveria "false" na tela se recebesse false: só passa o que existe.
      caixa.replaceChildren(...[
        el('button', { class: 'botao', type: 'button', 'aria-label': `Corrigir valor: ${contexto}`, onclick: corrigir }, 'Corrigir valor'),
        el('button', {
          class: 'botao botao-principal', type: 'button', 'aria-label': `Marcar como paga: ${contexto}`,
          onclick: (e) => {
            e.currentTarget.disabled = true;
            mudar((s) => payBill(s, fatura.id, todayISO()), 'Fatura paga. Isso não vira gasto novo: as compras já estão lançadas.');
          },
        }, 'Marcar como paga'),
        el('button', { class: 'botao', type: 'button', 'aria-label': `Pagar em outro dia: ${contexto}`, onclick: outroDia }, 'Outro dia'),
        apagavel ? botaoApagar() : null,
      ].filter(Boolean));
    };
    const outroDia = () => perguntarDataDoPagamento(caixa, {
      hoje: todayISO(), contexto, aoCancelar: normal,
      aoConfirmar: (data) => mudar((s) => payBill(s, fatura.id, data), `Fatura paga em ${shortDate(data)}. Isso não vira gasto novo: as compras já estão lançadas.`),
    });
    const perguntarApagar = () => caixa.replaceChildren(
      el('span', { class: 'confirmar' }, 'Apagar esta fatura? Se ainda há compras nela, ela volta como prevista, com a soma das compras. As compras não são apagadas.'),
      el('button', { class: 'botao', type: 'button', onclick: normal }, 'Cancelar'),
      el('button', {
        class: 'botao botao-perigo', type: 'button',
        onclick: (e) => { e.currentTarget.disabled = true; mudar((s) => removeStatement(s, fatura.id), 'Fatura apagada.'); },
      }, 'Apagar mesmo'));
    const corrigir = () => {
      const campo = el('input', {
        class: 'campo campo-valor', type: 'text', inputmode: 'decimal', autocomplete: 'off', value: centavosParaCampo(fatura.amountCents),
        'aria-label': `Valor da fatura que vence ${fatura.dueDate.split('-').reverse().join('/')}`,
      });
      const erro = el('p', { class: 'erro', role: 'alert' });
      const form = el('form', {
        class: 'corrigir', novalidate: true,
        onsubmit: (e) => {
          e.preventDefault();
          let centavos;
          try {
            centavos = parseBRL(campo.value);
          } catch (falha) {
            erro.textContent = falha instanceof RangeError ? falha.message : 'Valor inválido';
            return;
          }
          mudar((s) => confirmStatement(s, fatura.id, centavos), `Valor da fatura corrigido para ${formatBRL(centavos)}.`);
        },
      },
      el('p', { class: 'confirmar' }, 'Digite o valor da fatura que veio do banco.'),
      campo, erro,
      el('div', { class: 'botoes-form' },
        el('button', { class: 'botao', type: 'button', onclick: normal }, 'Cancelar'),
        el('button', { class: 'botao botao-principal', type: 'submit' }, 'Salvar valor')));
      caixa.replaceChildren(form);
      campo.focus();
      campo.select();
    };
    normal();
    return caixa;
  }

  /** Uma compra no cartão, com Apagar em dois passos (as faturas do cartão são recalculadas). */
  function linhaDaCompra(t, estado) {
    const categoria = estado.categories.find((c) => c.id === t.categoryId)?.name ?? 'Outros';
    const titulo = t.note || t.merchant || categoria;
    const vezes = t.installments > 1 ? `, em ${t.installments}x` : '';
    const ano = t.date.slice(0, 4) === todayISO().slice(0, 4) ? '' : `/${t.date.slice(0, 4)}`;
    const acoes = el('div', { class: 'lancamento-acoes' });
    const normal = () => acoes.replaceChildren(
      el('button', {
        class: 'botao botao-discreto', type: 'button', 'aria-label': `Editar compra: ${titulo}, ${formatBRL(t.amountCents)}`,
        onclick: () => go('entry', { editar: t.id, de: 'cards' }),
      }, 'Editar'),
      el('button', {
        class: 'botao botao-discreto', type: 'button', 'aria-label': `Apagar compra: ${titulo}, ${formatBRL(t.amountCents)}`, onclick: perguntar,
      }, 'Apagar'));
    const perguntar = () => acoes.replaceChildren(
      el('span', { class: 'confirmar' }, 'Apagar esta compra? Ela sai do "Saiu" e das faturas.'),
      el('button', { class: 'botao', type: 'button', onclick: normal }, 'Cancelar'),
      el('button', {
        class: 'botao botao-perigo', type: 'button',
        onclick: (e) => { e.currentTarget.disabled = true; mudar((s) => removeTransactionWithCards(s, t.id), 'Compra apagada. As faturas foram recalculadas.'); },
      }, 'Apagar mesmo'));
    normal();
    return el('li', { class: 'lancamento' },
      el('div', { class: 'lancamento-linha' },
        el('div', {},
          el('div', { class: 'lancamento-titulo' }, titulo),
          el('div', { class: 'lancamento-detalhe' }, `${shortDate(t.date)}${ano}, ${categoria}${vezes}`)),
        el('div', { class: 'lancamento-valor' }, formatBRL(t.amountCents))),
      acoes);
  }

  /** Rodapé do cartão: ver (e apagar) as compras e apagar o cartão inteiro, com a conta do que vai junto. */
  function rodapeDoCartao(cartao, estado) {
    const uso = cardUsage(estado, cartao.id);
    const caixa = el('div', { class: 'cartao-rodape' });
    const normal = () => caixa.replaceChildren(
      el('button', {
        class: 'botao', type: 'button', 'aria-expanded': String(comprasAbertas.has(cartao.id)),
        'aria-label': `${comprasAbertas.has(cartao.id) ? 'Esconder compras' : `Compras (${uso.purchases})`} do ${cartao.name}`,
        onclick: () => { if (comprasAbertas.has(cartao.id)) comprasAbertas.delete(cartao.id); else comprasAbertas.add(cartao.id); desenhar(); },
      }, comprasAbertas.has(cartao.id) ? 'Esconder compras' : `Compras (${uso.purchases})`),
      el('button', { class: 'botao botao-discreto', type: 'button', 'aria-label': `Apagar cartão ${cartao.name}`, onclick: perguntar }, 'Apagar cartão'));
    const perguntar = () => {
      const leva = uso.purchases + uso.statements === 0 ? ''
        : ` Também saem ${plural(uso.purchases, 'compra feita nele', 'compras feitas nele')} (${formatBRL(uso.purchasesCents)} em "Saiu") e ${plural(uso.statements, 'fatura', 'faturas')}.`;
      caixa.replaceChildren(
        el('span', { class: 'confirmar' }, `Apagar o cartão ${cartao.name}?${leva} Não dá para desfazer.`),
        el('button', { class: 'botao', type: 'button', onclick: normal }, 'Cancelar'),
        el('button', {
          class: 'botao botao-perigo', type: 'button',
          onclick: (e) => { e.currentTarget.disabled = true; comprasAbertas.delete(cartao.id); mudar((s) => removeCard(s, cartao.id), `${cartao.name} apagado.`); },
        }, 'Apagar cartão mesmo'));
    };
    normal();
    return caixa;
  }

  function secaoDoCartao(cartao, estado, hoje) {
    const faturas = estado.bills.filter((b) => b.kind === 'card_statement' && b.cardId === cartao.id);
    const aPagar = faturas.filter((b) => !b.paidDate).sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
    const pagas = faturas.filter((b) => b.paidDate).sort((a, b) => (a.paidDate < b.paidDate ? 1 : -1)).slice(0, PAGAS_VISIVEIS);
    const temPrevista = aPagar.some((b) => b.confirmed === false);
    const compras = comprasAbertas.has(cartao.id) ? cardPurchases(estado, cartao.id) : [];
    return el('section', { class: 'cartao', 'aria-label': cartao.name },
      el('div', { class: 'cartao-topo' },
        el('h2', {}, cartao.name),
        el('button', { class: 'botao botao-discreto', type: 'button', 'aria-label': `Editar ${cartao.name}`, onclick: () => abrirFormulario(cartao) }, 'Editar')),
      el('p', { class: 'config-status' }, `Fecha dia ${cartao.closingDay} e vence dia ${cartao.dueDay}.`),
      faturas.length === 0
        ? el('p', { class: 'vazio' }, 'Ainda não há compras neste cartão. Ao registrar um gasto, escolha "No cartão".')
        : [
          aPagar.length > 0 && el('ul', { class: 'faturas' }, aPagar.map((f) => linhaDaConta(f, hoje, acoesDaFatura(f)))),
          temPrevista && el('p', { class: 'aviso-valor' },
            'Fatura prevista é a soma das compras. Quando a fatura real chegar, toque em "Corrigir valor". Para tirar uma fatura prevista, apague as compras dela.'),
          pagas.length > 0 && el('h3', {}, 'Pagas'),
          pagas.length > 0 && el('ul', { class: 'faturas' }, pagas.map((f) => linhaDaConta(f, hoje, acoesDaFatura(f)))),
        ],
      rodapeDoCartao(cartao, estado),
      comprasAbertas.has(cartao.id) && (compras.length > 0
        ? el('ul', { class: 'lancamentos', 'aria-label': `Compras no ${cartao.name}` }, compras.map((t) => linhaDaCompra(t, estado)))
        : el('p', { class: 'vazio' }, 'Nenhuma compra neste cartão.')));
  }

  function desenhar() {
    const estado = store.getState();
    const hoje = todayISO();
    lista.replaceChildren(...(estado.cards.length
      ? estado.cards.map((c) => secaoDoCartao(c, estado, hoje))
      : [el('p', { class: 'vazio' }, 'Nenhum cartão ainda. Toque em "Novo cartão" para cadastrar o primeiro.')]));
  }

  raiz.append(
    el('div', { class: 'config-botoes' },
      el('button', { class: 'botao botao-principal', type: 'button', onclick: () => abrirFormulario(undefined) }, 'Novo cartão')),
    aviso, area, lista);
  desenhar();
}
