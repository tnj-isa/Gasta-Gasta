import { DEFAULT_CATEGORIES } from '../domain/model.js';

const CORES_EXTRAS = 5;
const IDS_PADRAO = new Set(DEFAULT_CATEGORIES.map((c) => c.id));

/**
 * Reparte os gastos por categoria (do maior para o menor) em duas colunas de peso parecido:
 * cada bloco vai para a coluna que está mais leve. Em empate, vai para a primeira.
 * Com só um ou dois gastos, ficam todos na primeira coluna, empilhados (a diferença aparece na altura).
 * @param {{categoryId: string, cents: number}[]} itens
 * @returns {[typeof itens, typeof itens]}
 */
export function dividirMosaico(itens) {
  if (itens.length <= 2) return [[...itens], []];
  const colunas = [[], []];
  const pesos = [0, 0];
  for (const item of itens) {
    const i = pesos[1] < pesos[0] ? 1 : 0;
    colunas[i].push(item);
    pesos[i] += item.cents;
  }
  return colunas;
}

/** Altura do mosaico em pixels: 340, ou mais se uma coluna tiver muitos blocos (cada um precisa de 90). */
export function alturaDoMosaico(colunas, { minimo = 340, porBloco = 90 } = {}) {
  return Math.max(minimo, ...colunas.map((c) => c.length * porBloco));
}

/**
 * Parte da largura que cada coluna ocupa, pelo que foi gasto nela, mas nunca menos de 38% nem mais de 62%
 * (uma coluna fina demais não deixa o nome da categoria caber). Uma coluna só ocupa tudo.
 * @param {{cents: number}[][]} colunas
 * @returns {number[]}
 */
export function larguraDasColunas(colunas) {
  if (colunas.length === 1) return [1];
  const pesos = colunas.map((c) => c.reduce((soma, i) => soma + i.cents, 0));
  const total = pesos.reduce((a, b) => a + b, 0);
  const parte = (peso) => (total === 0 ? 1 / colunas.length : Math.min(0.62, Math.max(0.38, peso / total)));
  const larguras = pesos.map(parte);
  const soma = larguras.reduce((a, b) => a + b, 0);
  return larguras.map((l) => Math.round((l / soma) * 100) / 100);
}

/**
 * Cor do bloco e do texto por cima. As categorias padrão têm cor própria;
 * as criadas por ela usam as cores extras, na ordem em que foram criadas.
 * @param {string} id
 * @param {{id: string}[]} categorias
 * @returns {{fundo: string, texto: string}}
 */
export function corDaCategoria(id, categorias) {
  let nome = 'outros';
  if (IDS_PADRAO.has(id)) {
    nome = id;
  } else {
    const criadas = categorias.filter((c) => !IDS_PADRAO.has(c.id));
    const posicao = criadas.findIndex((c) => c.id === id);
    if (posicao !== -1) nome = `extra-${(posicao % CORES_EXTRAS) + 1}`;
  }
  return { fundo: `var(--cat-${nome})`, texto: `var(--cat-${nome}-texto)` };
}
