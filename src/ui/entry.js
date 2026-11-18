import { addTransactionWithCards, cardPurchaseFields, parseInstallments } from '../domain/cards.js';
import { newId } from '../domain/model.js';
import { todayISO } from '../lib/dates.js';
import { parseBRL } from '../lib/money.js';
import { el } from './dom.js';
import { corDaCategoria } from './mosaico.js';
import { grupo } from './opcoes.js';

/** 3540 vira "35,40": o texto que vai dentro do campo de valor. */
function centavosParaCampo(centavos) {
  return `${Math.trunc(centavos / 100)},${String(centavos % 100).padStart(2, '0')}`;
}

/**
 * Tela de digitar um gasto ou uma entrada. Só o valor é obrigatório: categoria "Outros",
 * pessoal e a data de hoje já vêm marcados.
 * A tela da foto da nota usa esta mesma tela, já preenchida (`inicial`), só para gasto (`somenteGasto`),
 * com o valor lido em destaque (`destaque`) e montando o lançamento do seu jeito (`construir`).
 * @param {HTMLElement} raiz
 * @param {{getState(): any, commit(mutator: (s: any) => any): Promise<any>}} store
 * @param {(salvo: object | null) => void} aoTerminar recebe o lançamento salvo, ou null se cancelou
 * @param {{
 *   kind?: 'expense'|'income', faixa?: HTMLElement, titulo?: string,
 *   inicial?: {amountCents?: number | null, date?: string, merchant?: string, categoryId?: string | null, scope?: 'personal'|'work'},
 *   somenteGasto?: boolean, mostrarLocal?: boolean, destaque?: string, antes?: Node,
 *   construir?: (campos: object) => object,
 * }} [opcoes]
 */
export function renderEntry(raiz, store, aoTerminar, {
  kind = 'expense', faixa, titulo, inicial = {}, somenteGasto = false, mostrarLocal = false, destaque, antes, construir,
} = {}) {
  const categorias = store.getState().categories;
  let tipo = kind;

  const erro = el('p', { class: 'erro', role: 'alert' });
  const campoValor = el('input', {
    class: `campo campo-valor${destaque ? ' lido' : ''}`, id: 'valor', type: 'text', inputmode: 'decimal',
    autocomplete: 'off', placeholder: '0,00', enterkeyhint: 'done',
    value: Number.isSafeInteger(inicial.amountCents) && inicial.amountCents > 0 ? centavosParaCampo(inicial.amountCents) : null,
    'aria-describedby': destaque ? 'valor-aviso' : null,
  });
  const campoData = el('input', { class: 'campo', id: 'data', type: 'date', value: inicial.date ?? todayISO() });
  const campoNota = el('input', { class: 'campo', id: 'nota', type: 'text', autocomplete: 'off', maxlength: '80' });
  const campoLocal = el('input', { class: 'campo', id: 'local', type: 'text', autocomplete: 'off', maxlength: '60', value: inicial.merchant || null });

  const secaoGasto = el('div', { class: 'secao-gasto' });
  const atualizar = () => {
    secaoGasto.hidden = tipo !== 'expense';
    faixa?.replaceChildren(el('h1', {}, titulo ?? (tipo === 'expense' ? 'Novo gasto' : 'Nova entrada')));
  };

  const tipoGrupo = grupo({
    nome: 'Tipo', dividido: true, inicial: tipo,
    opcoes: [{ valor: 'expense', rotulo: 'Gasto' }, { valor: 'income', rotulo: 'Entrada' }],
    aoMudar: (valor) => { tipo = valor; atualizar(); },
  });
  const categoriaInicial = categorias.some((c) => c.id === inicial.categoryId)
    ? inicial.categoryId
    : (categorias.some((c) => c.id === 'outros') ? 'outros' : categorias[0]?.id);
  const categoriaGrupo = grupo({
    nome: 'Categoria',
    inicial: categoriaInicial,
    opcoes: categorias.map((c) => ({ valor: c.id, rotulo: c.name, cor: corDaCategoria(c.id, categorias) })),
  });
  const escopoGrupo = grupo({
    nome: 'Gasto pessoal ou do trabalho', dividido: true, inicial: inicial.scope ?? 'personal',
    opcoes: [{ valor: 'personal', rotulo: 'Pessoal' }, { valor: 'work', rotulo: 'Trabalho' }],
  });
  // "Como pagou" só aparece quando já existe um cartão cadastrado: quem não usa cartão não ganha toque nenhum a mais.
  const cartoes = store.getState().cards;
  const campoParcelas = el('input', {
    class: 'campo', id: 'parcelas', type: 'text', inputmode: 'numeric', autocomplete: 'off', maxlength: '3', value: '1',
  });
  const cartaoGrupo = cartoes.length ? grupo({
    nome: 'Cartão', inicial: cartoes[0].id, opcoes: cartoes.map((c) => ({ valor: c.id, rotulo: c.name })),
  }) : null;
  const secaoCartao = el('div', { class: 'secao-cartao', hidden: true },
    el('p', { class: 'rotulo' }, 'Qual cartão'), cartaoGrupo?.elemento,
    el('label', { class: 'rotulo', for: 'parcelas' }, 'Em quantas vezes?'),
    el('p', { class: 'aviso-valor' }, 'Digite 1 se pagou tudo de uma vez.'),
    campoParcelas);
  const metodoGrupo = cartoes.length ? grupo({
    nome: 'Como pagou', dividido: true, inicial: 'now',
    opcoes: [{ valor: 'now', rotulo: 'Na hora' }, { valor: 'card', rotulo: 'No cartão' }],
    aoMudar: (valor) => {
      secaoCartao.hidden = valor !== 'card';
      // O campo "Em quantas vezes?" nasce abaixo da barra de Salvar: traz para a tela, para ela ver que existe.
      if (valor === 'card') secaoCartao.scrollIntoView?.({ block: 'center' });
    },
  }) : null;
  secaoGasto.append(
    el('p', { class: 'rotulo' }, 'Categoria'), categoriaGrupo.elemento,
    el('p', { class: 'rotulo' }, 'De onde saiu'), escopoGrupo.elemento,
    metodoGrupo && el('p', { class: 'rotulo' }, 'Como pagou'),
    metodoGrupo && el('p', { class: 'aviso-valor' }, 'Na hora é Pix, dinheiro ou débito.'),
    metodoGrupo?.elemento,
    metodoGrupo && secaoCartao,
  );

  let salvando = false;
  const salvar = async (evento) => {
    evento.preventDefault();
    if (salvando) return;
    erro.textContent = '';
    let amountCents;
    try {
      amountCents = parseBRL(campoValor.value);
    } catch (falha) {
      erro.textContent = falha instanceof RangeError ? falha.message : 'Valor inválido';
      campoValor.focus();
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(campoData.value)) {
      erro.textContent = 'Escolha uma data.';
      return;
    }
    const nota = campoNota.value.trim();
    const noCartao = tipo === 'expense' && metodoGrupo?.valor() === 'card';
    let parcelas = 1;
    if (noCartao) {
      try {
        parcelas = parseInstallments(campoParcelas.value);
      } catch (falha) {
        erro.textContent = falha.message;
        campoParcelas.focus();
        return;
      }
    }
    const campos = {
      kind: tipo,
      amountCents,
      date: campoData.value,
      scope: tipo === 'expense' ? escopoGrupo.valor() : 'personal',
      categoryId: tipo === 'expense' ? categoriaGrupo.valor() : null,
      note: nota,
      merchant: campoLocal.value.trim(),
      ...(noCartao ? { method: 'card', cardId: cartaoGrupo.valor(), installments: parcelas } : {}),
    };
    const lancamento = construir ? construir(campos) : {
      id: newId(),
      kind: campos.kind,
      amountCents,
      date: campos.date,
      scope: campos.scope,
      ...(tipo === 'expense' ? { categoryId: campos.categoryId } : {}),
      ...cardPurchaseFields(campos),
      ...(nota ? { note: nota } : {}),
    };
    salvando = true;
    botaoSalvar.disabled = true;
    botaoSalvar.textContent = 'Salvando…';
    try {
      await store.commit((s) => addTransactionWithCards(s, lancamento));
      aoTerminar(lancamento);
    } catch (falha) {
      erro.textContent = `Não consegui salvar: ${falha.message}`;
      salvando = false;
      botaoSalvar.disabled = false;
      botaoSalvar.textContent = 'Salvar';
    }
  };

  const botaoSalvar = el('button', { class: 'botao botao-principal', type: 'submit' }, 'Salvar');
  raiz.append(el('form', { class: 'entrada', novalidate: true, onsubmit: salvar },
    antes,
    !somenteGasto && tipoGrupo.elemento,
    el('label', { class: 'rotulo', for: 'valor' }, 'Valor em reais'),
    destaque && el('p', { class: 'aviso-valor', id: 'valor-aviso', role: 'status' }, destaque),
    campoValor,
    secaoGasto,
    mostrarLocal && el('label', { class: 'rotulo', for: 'local' }, 'Local (opcional)'),
    mostrarLocal && campoLocal,
    el('label', { class: 'rotulo', for: 'data' }, 'Data'),
    campoData,
    el('label', { class: 'rotulo', for: 'nota' }, 'Descrição (opcional)'),
    campoNota,
    el('div', { class: 'barra-form' },
      erro,
      el('div', { class: 'barra-botoes' },
        el('button', { class: 'botao', type: 'button', onclick: () => aoTerminar(null) }, 'Cancelar'),
        botaoSalvar))));

  atualizar();
  campoValor.focus();
}
