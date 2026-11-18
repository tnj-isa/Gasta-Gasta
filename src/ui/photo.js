import { cardPurchaseFields } from '../domain/cards.js';
import { newId } from '../domain/model.js';
import { todayISO } from '../lib/dates.js';
import { readReceiptText } from '../lib/ocr.js';
import { parseReceipt } from '../lib/receipt.js';
import { el, icone } from './dom.js';
import { renderEntry } from './entry.js';

const ICONE_CAMERA = ['M4 8h3l2-3h6l2 3h3v11H4z', 'M12 9.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z'];

/**
 * Rascunho de gasto a partir do que foi lido na nota. Sem data, usa hoje; sem total, o valor fica vazio
 * (null) para ela digitar. Nunca leva a foto nem o texto lido.
 * @param {{totalCents?: number, date?: string, merchant?: string}} parsed
 * @param {string} today
 */
export function draftFromReceipt(parsed, today) {
  return {
    kind: 'expense',
    amountCents: parsed.totalCents ?? null,
    date: parsed.date ?? today,
    merchant: parsed.merchant ?? '',
    scope: 'personal',
    categoryId: null,
  };
}

/**
 * Transforma o rascunho confirmado em lançamento. Só passam os campos de um lançamento
 * (nunca a foto, o texto da nota ou qualquer outra coisa que o rascunho carregue).
 * @param {ReturnType<typeof draftFromReceipt> & {amountCents: number, note?: string}} draft
 * @throws {RangeError} se o valor não for um número inteiro de centavos maior que zero, ou a compra no cartão estiver incompleta
 */
export function toTransaction(draft) {
  if (!Number.isSafeInteger(draft.amountCents) || draft.amountCents <= 0) {
    throw new RangeError('Digite um valor maior que zero');
  }
  const merchant = draft.merchant?.trim();
  const note = draft.note?.trim();
  return {
    id: newId(),
    kind: 'expense',
    amountCents: draft.amountCents,
    date: draft.date,
    scope: draft.scope ?? 'personal',
    categoryId: draft.categoryId ?? 'outros',
    ...cardPurchaseFields(draft),
    ...(merchant ? { merchant } : {}),
    ...(note ? { note } : {}),
  };
}

/**
 * Tela da foto da nota: tira (ou escolhe) a foto, lê o texto no próprio celular e abre o formulário
 * já preenchido. Nada é gravado até ela tocar em "Salvar". A foto nunca é guardada: some da memória ao sair.
 * Se a leitura falhar, ou não achar o valor, cai na digitação com o que deu para ler.
 * @param {HTMLElement} raiz
 * @param {{getState(): any, commit(mutator: (s: any) => any): Promise<any>}} store
 * @param {(salvo: object | null) => void} aoTerminar recebe o lançamento salvo, ou null se saiu sem salvar
 * @param {{faixa?: HTMLElement, ler?: typeof readReceiptText, aindaNaTela?: () => boolean}} [opcoes]
 *   `aindaNaTela` diz se esta tela ainda é a que aparece (se o app travou no meio da leitura, não é mais e nada é desenhado)
 */
export function renderPhoto(raiz, store, aoTerminar, { faixa, ler = readReceiptText, aindaNaTela = () => true } = {}) {
  let url = null;
  let ativa = true;
  const viva = () => ativa && aindaNaTela();
  const sair = (salvo) => {
    ativa = false;
    if (url) URL.revokeObjectURL(url);
    url = null;
    aoTerminar(salvo);
  };
  faixa?.replaceChildren(el('h1', {}, 'Foto da nota'));

  const confirmar = (lido, falhou) => {
    const rascunho = draftFromReceipt(lido, todayISO());
    let aviso = 'Valor lido da nota. Confira antes de salvar.';
    if (rascunho.amountCents === null) {
      aviso = falhou
        ? 'Não consegui ler a foto. Digite o valor da nota.'
        : 'Não achei o valor total na nota. Digite o valor.';
    }
    raiz.replaceChildren();
    renderEntry(raiz, store, sair, {
      kind: 'expense',
      faixa,
      titulo: 'Confira a nota',
      inicial: rascunho,
      somenteGasto: true,
      mostrarLocal: true,
      destaque: aviso,
      antes: el('img', { class: 'foto-previa', src: url, alt: 'Foto da nota', decoding: 'async' }),
      construir: (campos) => toTransaction({ ...rascunho, ...campos }),
    });
  };

  const ler1 = async (arquivo) => {
    if (!viva()) return;
    url = URL.createObjectURL(arquivo);
    const barra = el('progress', { max: '100', value: '0', 'aria-label': 'Andamento da leitura' });
    raiz.replaceChildren(el('div', { class: 'foto' },
      el('p', { role: 'status' }, 'Lendo a nota…'),
      barra,
      el('p', { class: 'foto-dica' }, 'Pode levar alguns segundos. A foto não sai do seu celular.'),
      el('button', { class: 'botao', type: 'button', onclick: () => sair(null) }, 'Cancelar')));
    let lido = {};
    let falhou = false;
    try {
      const texto = await ler(arquivo, (fracao) => { if (viva()) barra.value = Math.round(fracao * 100); });
      lido = parseReceipt(texto);
    } catch {
      falhou = true;
    }
    if (viva()) confirmar(lido, falhou);
    else if (url) { URL.revokeObjectURL(url); url = null; }
  };

  const aoEscolher = (evento) => {
    const arquivo = evento.target.files?.[0];
    if (arquivo) ler1(arquivo);
  };
  const camera = el('input', { id: 'foto-camera', type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: aoEscolher });
  const galeria = el('input', { id: 'foto-galeria', type: 'file', accept: 'image/*', hidden: true, onchange: aoEscolher });
  raiz.replaceChildren(el('div', { class: 'foto' },
    el('p', {}, 'Fotografe a nota com ela esticada, de frente e bem iluminada. A foto é lida aqui no celular e não é guardada.'),
    el('button', { class: 'botao botao-principal botao-largo botao-com-icone', type: 'button', onclick: () => camera.click() },
      icone(...ICONE_CAMERA), 'Fotografar a nota'),
    el('button', { class: 'botao botao-largo', type: 'button', onclick: () => galeria.click() }, 'Escolher uma foto da galeria'),
    el('button', { class: 'botao botao-discreto botao-largo', type: 'button', onclick: () => sair(null) }, 'Voltar'),
    camera,
    galeria));
}

