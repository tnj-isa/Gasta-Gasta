import { addTransaction, newId } from '../domain/model.js';
import { todayISO } from '../lib/dates.js';
import { parseBRL } from '../lib/money.js';
import { el } from './dom.js';
import { corDaCategoria } from './mosaico.js';

/**
 * Grupo de opções em que só uma fica marcada (como os botões de rádio, mas grandes para o dedo).
 * A opção marcada ganha um "✓" além da cor, para não depender só da cor.
 */
function grupo({ nome, opcoes, inicial, aoMudar, dividido = false }) {
  let escolhido = inicial;
  const botoes = new Map();
  const pintar = () => botoes.forEach((botao, valor) => botao.setAttribute('aria-checked', String(valor === escolhido)));
  const raiz = el('div', { class: `opcoes${dividido ? ' dividido' : ''}`, role: 'radiogroup', 'aria-label': nome });
  for (const opcao of opcoes) {
    const botao = el('button', {
      class: 'opcao', type: 'button', role: 'radio', 'aria-checked': 'false',
      onclick: () => { escolhido = opcao.valor; pintar(); aoMudar?.(escolhido); },
    }, opcao.rotulo);
    if (opcao.cor) {
      botao.style.setProperty('--fundo', opcao.cor.fundo);
      botao.style.setProperty('--texto', opcao.cor.texto);
    }
    botoes.set(opcao.valor, botao);
    raiz.append(botao);
  }
  pintar();
  return { elemento: raiz, valor: () => escolhido };
}

/**
 * Tela de digitar um gasto ou uma entrada. Só o valor é obrigatório: categoria "Outros",
 * pessoal e a data de hoje já vêm marcados.
 * @param {HTMLElement} raiz
 * @param {{getState(): any, commit(mutator: (s: any) => any): Promise<any>}} store
 * @param {(salvo: object | null) => void} aoTerminar recebe o lançamento salvo, ou null se cancelou
 * @param {{kind?: 'expense'|'income', faixa?: HTMLElement}} [inicio]
 */
export function renderEntry(raiz, store, aoTerminar, { kind = 'expense', faixa } = {}) {
  const categorias = store.getState().categories;
  let tipo = kind;

  const erro = el('p', { class: 'erro', role: 'alert' });
  const campoValor = el('input', {
    class: 'campo campo-valor', id: 'valor', type: 'text', inputmode: 'decimal',
    autocomplete: 'off', placeholder: '0,00', enterkeyhint: 'done',
  });
  const campoData = el('input', { class: 'campo', id: 'data', type: 'date', value: todayISO() });
  const campoNota = el('input', { class: 'campo', id: 'nota', type: 'text', autocomplete: 'off', maxlength: '80' });

  const secaoGasto = el('div', { class: 'secao-gasto' });
  const atualizar = () => {
    secaoGasto.hidden = tipo !== 'expense';
    faixa?.replaceChildren(el('h1', {}, tipo === 'expense' ? 'Novo gasto' : 'Nova entrada'));
  };

  const tipoGrupo = grupo({
    nome: 'Tipo', dividido: true, inicial: tipo,
    opcoes: [{ valor: 'expense', rotulo: 'Gasto' }, { valor: 'income', rotulo: 'Entrada' }],
    aoMudar: (valor) => { tipo = valor; atualizar(); },
  });
  const categoriaGrupo = grupo({
    nome: 'Categoria',
    inicial: categorias.some((c) => c.id === 'outros') ? 'outros' : categorias[0]?.id,
    opcoes: categorias.map((c) => ({ valor: c.id, rotulo: c.name, cor: corDaCategoria(c.id, categorias) })),
  });
  const escopoGrupo = grupo({
    nome: 'Gasto pessoal ou do trabalho', dividido: true, inicial: 'personal',
    opcoes: [{ valor: 'personal', rotulo: 'Pessoal' }, { valor: 'work', rotulo: 'Trabalho' }],
  });
  secaoGasto.append(
    el('p', { class: 'rotulo' }, 'Categoria'), categoriaGrupo.elemento,
    el('p', { class: 'rotulo' }, 'De onde saiu'), escopoGrupo.elemento,
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
    const lancamento = {
      id: newId(),
      kind: tipo,
      amountCents,
      date: campoData.value,
      scope: tipo === 'expense' ? escopoGrupo.valor() : 'personal',
      ...(tipo === 'expense' ? { categoryId: categoriaGrupo.valor() } : {}),
      ...(nota ? { note: nota } : {}),
    };
    salvando = true;
    botaoSalvar.disabled = true;
    botaoSalvar.textContent = 'Salvando…';
    try {
      await store.commit((s) => addTransaction(s, lancamento));
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
    tipoGrupo.elemento,
    el('label', { class: 'rotulo', for: 'valor' }, 'Valor em reais'),
    campoValor,
    secaoGasto,
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
