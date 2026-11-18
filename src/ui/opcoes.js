import { el } from './dom.js';

/**
 * Grupo de opções em que só uma fica marcada (como os botões de rádio, mas grandes para o dedo).
 * A opção marcada ganha um "✓" além da cor, para não depender só da cor.
 * @param {{nome: string, opcoes: {valor: string, rotulo: string, cor?: {fundo: string, texto: string}}[], inicial?: string | null, aoMudar?: (valor: string) => void, dividido?: boolean}} config
 */
export function grupo({ nome, opcoes, inicial, aoMudar, dividido = false }) {
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
