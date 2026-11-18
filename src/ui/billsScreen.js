import {
  createBoleto, createInstallmentSeries, deleteBills, payBill, pendingTotals, seriesOf, unpayBill, upcomingBills,
} from '../domain/bills.js';
import { upsertBills } from '../domain/model.js';
import { addMonthsClamped, monthLabel, shortDate, todayISO } from '../lib/dates.js';
import { formatBRL, parseBRL } from '../lib/money.js';
import { botaoDeIcone, el } from './dom.js';
import { etiquetaDaConta, quandoVence } from './faturasTexto.js';
import { corDaCategoria } from './mosaico.js';
import { grupo } from './opcoes.js';

const ICONE_VOLTAR = 'M15 5l-7 7 7 7';
const PAGAS_VISIVEIS = 10;

/** Uma conta como linha de lista: nome, valor, etiqueta do tipo e quando vence. `acoes` é opcional. */
function linhaDaConta(conta, hoje, acoes) {
  const etiqueta = etiquetaDaConta(conta);
  const atrasada = conta.overdue ?? (conta.paidDate === null && conta.dueDate < hoje);
  return el('li', { class: `fatura${atrasada ? ' atrasada' : ''}${conta.paidDate ? ' paga' : ''}` },
    el('span', { class: 'titulo' }, conta.title),
    el('span', { class: 'preco' }, formatBRL(conta.amountCents)),
    el('span', { class: 'linha2' },
      el('span', { class: `etq ${etiqueta.tipo}` }, etiqueta.texto),
      conta.scope === 'work' && el('span', { class: 'etq trabalho' }, 'Trabalho')),
    el('span', { class: 'quando' }, quandoVence(conta, hoje)),
    acoes);
}

/**
 * O cartão "Faturas a vencer" da tela principal: contas dos próximos 30 dias (e as atrasadas, em destaque),
 * o total a vencer e quanto falta para zerar tudo.
 * @param {import('../domain/model.js').State} estado
 * @param {string} hoje
 * @param {(tela: string) => void} ir
 */
export function cartaoFaturas(estado, hoje, ir) {
  const { items, totalCents } = upcomingBills(estado.bills, hoje);
  const faltam = pendingTotals(estado.bills).totalCents;
  const botao = el('button', { class: 'botao botao-largo', type: 'button', onclick: () => ir('bills') },
    estado.bills.length ? 'Ver contas e parcelas' : 'Cadastrar contas e parcelas');

  let corpo;
  if (!estado.bills.length) {
    corpo = el('p', { class: 'vazio' }, 'Você ainda não cadastrou contas. Cadastre boletos e parcelas para ver aqui o que vai vencer.');
  } else if (!items.length) {
    corpo = el('p', { class: 'vazio' }, faltam > 0 ? 'Nada vence nos próximos 30 dias.' : 'Tudo pago. Nenhuma conta pendente.');
  } else {
    corpo = el('ul', { class: 'faturas' }, items.map((c) => linhaDaConta(c, hoje)));
  }
  const rodape = faltam > 0 && el('div', { class: 'faturas-rodape' },
    items.length > 0 && el('div', { class: 'total' }, el('span', {}, 'Total a vencer'), el('strong', {}, formatBRL(totalCents))),
    el('div', { class: 'zerar' }, el('span', {}, 'Faltam para zerar tudo'), el('b', {}, formatBRL(faltam))));

  return el('section', { class: 'faturas-secao', 'aria-label': 'Faturas a vencer' },
    el('h2', {}, 'Faturas a vencer'),
    el('p', { class: 'sub' }, 'Nos próximos 30 dias'),
    corpo, rodape, botao);
}

/** "6 parcelas de R$ 200,00: R$ 1.200,00 no total, até 10/mai/2027". Vazio se algo ainda está faltando. */
function resumoDoParcelamento(qtd, valorTexto, primeiroVencimento) {
  try {
    const n = /^\d+$/.test(qtd.trim()) ? Number(qtd.trim()) : NaN;
    const valor = parseBRL(valorTexto);
    if (!Number.isInteger(n) || n < 1 || n > 360 || !/^\d{4}-\d{2}-\d{2}$/.test(primeiroVencimento)) return '';
    const ultima = addMonthsClamped(primeiroVencimento, n - 1);
    return `${n} ${n === 1 ? 'parcela' : 'parcelas'} de ${formatBRL(valor)}: ${formatBRL(n * valor)} no total, até ${shortDate(ultima)}/${ultima.slice(0, 4)}`;
  } catch {
    return '';
  }
}

/** Formulário de boleto avulso (`tipo: 'boleto'`) ou de compra parcelada (`tipo: 'parcelado'`). */
function formularioDeConta({ tipo, categorias, aoSalvar, aoCancelar }) {
  const parcelado = tipo === 'parcelado';
  const nome = el('input', { class: 'campo', id: 'conta-nome', type: 'text', autocomplete: 'off', maxlength: '60' });
  const qtd = el('input', { class: 'campo', id: 'conta-qtd', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: '6', maxlength: '3' });
  const valor = el('input', { class: 'campo', id: 'conta-valor', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0,00' });
  const venc = el('input', { class: 'campo', id: 'conta-venc', type: 'date', value: todayISO() });
  const escopo = grupo({
    nome: 'Conta pessoal ou do trabalho', dividido: true, inicial: 'personal',
    opcoes: [{ valor: 'personal', rotulo: 'Pessoal' }, { valor: 'work', rotulo: 'Trabalho' }],
  });
  const categoria = grupo({
    nome: 'Categoria', inicial: categorias.some((c) => c.id === 'outros') ? 'outros' : categorias[0]?.id,
    opcoes: categorias.map((c) => ({ valor: c.id, rotulo: c.name, cor: corDaCategoria(c.id, categorias) })),
  });
  const erro = el('p', { class: 'erro', role: 'alert' });
  const resumo = el('p', { class: 'aviso-valor', id: 'conta-resumo', role: 'status' });
  const atualizarResumo = () => { resumo.textContent = parcelado ? resumoDoParcelamento(qtd.value, valor.value, venc.value) : ''; };
  for (const campo of [qtd, valor, venc]) campo.addEventListener('input', atualizarResumo);

  let salvando = false;
  const botaoSalvar = el('button', { class: 'botao botao-principal', type: 'submit' }, 'Salvar');
  const salvar = async (evento) => {
    evento.preventDefault();
    if (salvando) return;
    erro.textContent = '';
    let contas;
    let mensagem;
    try {
      const comum = { title: nome.value, scope: escopo.valor(), categoryId: categoria.valor() };
      if (parcelado) {
        const n = /^\d+$/.test(qtd.value.trim()) ? Number(qtd.value.trim()) : NaN;
        contas = createInstallmentSeries({ ...comum, count: n, amountCents: parseBRL(valor.value), firstDue: venc.value });
        mensagem = `Pronto: ${contas.length} ${contas.length === 1 ? 'parcela' : 'parcelas'} de ${contas[0].title} salvas.`;
      } else {
        contas = [createBoleto({ ...comum, amountCents: parseBRL(valor.value), dueDate: venc.value })];
        mensagem = `Pronto: ${contas[0].title} salvo.`;
      }
    } catch (falha) {
      erro.textContent = falha instanceof RangeError ? falha.message : 'Confira os campos.';
      return;
    }
    salvando = true;
    botaoSalvar.disabled = true;
    try {
      await aoSalvar(contas, mensagem);
    } catch (falha) {
      erro.textContent = `Não consegui salvar: ${falha.message}`;
      salvando = false;
      botaoSalvar.disabled = false;
    }
  };

  const form = el('form', { class: 'config-form conta-form', novalidate: true, onsubmit: salvar, 'aria-label': parcelado ? 'Novo parcelamento' : 'Novo boleto' },
    el('h2', {}, parcelado ? 'Novo parcelamento' : 'Novo boleto'),
    el('label', { class: 'rotulo', for: 'conta-nome' }, parcelado ? 'Nome da compra (ex.: Celular)' : 'Nome da conta (ex.: Internet)'),
    nome,
    parcelado && el('label', { class: 'rotulo', for: 'conta-qtd' }, 'Número de parcelas'),
    parcelado && qtd,
    el('label', { class: 'rotulo', for: 'conta-valor' }, parcelado ? 'Valor de cada parcela' : 'Valor em reais'),
    valor,
    el('label', { class: 'rotulo', for: 'conta-venc' }, parcelado ? 'Vencimento da primeira parcela' : 'Vencimento'),
    venc,
    parcelado && resumo,
    el('p', { class: 'rotulo' }, 'De onde sai'), escopo.elemento,
    el('p', { class: 'rotulo' }, 'Categoria'), categoria.elemento,
    erro,
    el('div', { class: 'botoes-form' },
      el('button', { class: 'botao', type: 'button', onclick: aoCancelar }, 'Cancelar'),
      botaoSalvar));
  queueMicrotask(() => nome.focus());
  return form;
}

/**
 * Tela de contas e parcelas: todas as contas por vencimento, criar boleto ou parcelamento,
 * marcar como paga com um toque (o gasto entra na hora) e desfazer.
 * @param {HTMLElement} raiz
 * @param {{getState(): any, commit(mutator: (s: any) => any): Promise<any>}} store
 * @param {{faixa: HTMLElement, go: (tela: string, params?: object) => void}} contexto
 */
export function renderBills(raiz, store, { faixa, go }) {
  faixa.replaceChildren(el('div', { class: 'topo' },
    botaoDeIcone('Voltar', ICONE_VOLTAR, () => go('home')),
    el('h1', {}, 'Contas e parcelas')));

  const aviso = el('p', { class: 'aviso', role: 'status', hidden: true });
  const area = el('div', { class: 'contas-formulario' });
  const lista = el('div', { class: 'contas' });
  let todasAsPagas = false;

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
  const abrirFormulario = (tipo) => {
    dizer('');
    area.replaceChildren(formularioDeConta({
      tipo, categorias: store.getState().categories, aoCancelar: fecharFormulario,
      aoSalvar: async (contas, mensagem) => {
        await store.commit((s) => upsertBills(s, contas));
        fecharFormulario();
        dizer(mensagem);
        desenhar();
      },
    }));
  };

  /** Botões de uma conta: pagar/desfazer e apagar (com confirmação, e escolha entre uma parcela ou todas). */
  function acoesDaConta(conta) {
    const caixa = el('div', { class: 'fatura-acoes' });
    const todas = seriesOf(store.getState().bills, conta);
    const contexto = `${conta.title}, ${etiquetaDaConta(conta).texto}`;
    const normal = () => {
      const principal = conta.paidDate === null
        ? el('button', {
          class: 'botao botao-principal', type: 'button', 'aria-label': `Marcar como paga: ${contexto}`,
          onclick: (e) => { e.currentTarget.disabled = true; mudar((s) => payBill(s, conta.id, todayISO()), `${conta.title} marcada como paga. O gasto entrou neste mês.`); },
        }, 'Marcar como paga')
        : el('button', {
          class: 'botao', type: 'button', 'aria-label': `Desfazer pagamento: ${contexto}`,
          onclick: (e) => { e.currentTarget.disabled = true; mudar((s) => unpayBill(s, conta.id), `Pagamento de ${conta.title} desfeito. A conta voltou para "a pagar".`); },
        }, 'Desfazer');
      caixa.replaceChildren(principal,
        el('button', { class: 'botao botao-discreto', type: 'button', 'aria-label': `Apagar: ${contexto}`, onclick: perguntar }, 'Apagar'));
    };
    const perguntar = () => {
      const apagar = (ids, texto) => () => mudar((s) => deleteBills(s, ids), texto);
      const cancelar = el('button', { class: 'botao', type: 'button', onclick: normal }, 'Cancelar');
      if (todas.length > 1) {
        caixa.replaceChildren(
          el('span', { class: 'confirmar' }, 'Apagar o quê? Os pagamentos já feitos também saem dos gastos.'),
          cancelar,
          el('button', { class: 'botao botao-perigo', type: 'button', onclick: apagar([conta.id], `${conta.title}: parcela apagada.`) }, 'Só esta parcela'),
          el('button', { class: 'botao botao-perigo', type: 'button', onclick: apagar(todas.map((b) => b.id), `${conta.title}: ${todas.length} parcelas apagadas.`) }, `As ${todas.length} parcelas`));
      } else {
        caixa.replaceChildren(
          el('span', { class: 'confirmar' }, conta.paidDate ? 'Apagar esta conta? O gasto do pagamento também sai.' : 'Apagar esta conta?'),
          cancelar,
          el('button', { class: 'botao botao-perigo', type: 'button', onclick: apagar([conta.id], `${conta.title} apagada.`) }, 'Apagar mesmo'));
      }
    };
    normal();
    return caixa;
  }

  function desenhar() {
    const estado = store.getState();
    const hoje = todayISO();
    const aPagar = upcomingBills(estado.bills, hoje, Infinity).items;
    const pagas = estado.bills.filter((b) => b.paidDate !== null)
      .sort((a, b) => (a.paidDate < b.paidDate ? 1 : a.paidDate > b.paidDate ? -1 : 0));
    const { totalCents, byMonth } = pendingTotals(estado.bills);
    const meses = Object.keys(byMonth).sort();
    const pagasMostradas = todasAsPagas ? pagas : pagas.slice(0, PAGAS_VISIVEIS);

    // replaceChildren escreveria "null" na tela se recebesse null: só passa o que existe.
    lista.replaceChildren(...[
      el('section', {},
        el('h2', {}, 'A pagar'),
        aPagar.length
          ? el('div', { class: 'zerar-tela' },
            el('div', { class: 'zerar' }, el('span', {}, 'Faltam para zerar tudo'), el('b', {}, formatBRL(totalCents))),
            el('dl', { class: 'por-mes', 'aria-label': 'Quanto vence em cada mês' },
              meses.map((m) => el('div', {}, el('dt', {}, monthLabel(m)), el('dd', {}, formatBRL(byMonth[m])))))) : null,
        aPagar.length
          ? el('ul', { class: 'faturas' }, aPagar.map((c) => linhaDaConta(c, hoje, acoesDaConta(c))))
          : el('p', { class: 'vazio' }, estado.bills.length ? 'Nenhuma conta a pagar. Tudo em dia!' : 'Nenhuma conta ainda. Toque em "Novo boleto" ou "Parcelamento" para cadastrar.')),
      pagas.length ? el('section', {},
        el('h2', {}, 'Pagas'),
        el('ul', { class: 'faturas' }, pagasMostradas.map((c) => linhaDaConta(c, hoje, acoesDaConta(c)))),
        pagas.length > PAGAS_VISIVEIS && el('button', {
          class: 'botao botao-largo', type: 'button',
          onclick: () => { todasAsPagas = !todasAsPagas; desenhar(); },
        }, todasAsPagas ? 'Mostrar só as mais recentes' : `Mostrar todas as ${pagas.length} pagas`)) : null,
    ].filter(Boolean));
  }

  raiz.append(
    el('div', { class: 'config-botoes' },
      el('button', { class: 'botao botao-principal', type: 'button', onclick: () => abrirFormulario('boleto') }, 'Novo boleto'),
      el('button', { class: 'botao botao-principal', type: 'button', onclick: () => abrirFormulario('parcelado') }, 'Parcelamento')),
    aviso, area, lista);
  desenhar();
}
