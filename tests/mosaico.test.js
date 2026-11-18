import test from 'node:test';
import assert from 'node:assert/strict';
import { dividirMosaico, alturaDoMosaico, larguraDasColunas, corDaCategoria } from '../src/ui/mosaico.js';
import { DEFAULT_CATEGORIES } from '../src/domain/model.js';

const item = (categoryId, cents) => ({ categoryId, cents });
const ids = (coluna) => coluna.map((i) => i.categoryId);

test('divide em duas colunas, sempre pondo o próximo maior na coluna mais leve', () => {
  const [a, b] = dividirMosaico([item('mercado', 900), item('dia-a-dia', 650), item('casa', 500), item('lazer', 400), item('outros', 400)]);
  assert.deepEqual(ids(a), ['mercado', 'lazer']);
  assert.deepEqual(ids(b), ['dia-a-dia', 'casa', 'outros']);
});

test('sem gastos, duas colunas vazias; com um gasto só, ele ocupa uma coluna', () => {
  assert.deepEqual(dividirMosaico([]), [[], []]);
  const [a, b] = dividirMosaico([item('lazer', 100)]);
  assert.deepEqual(ids(a), ['lazer']);
  assert.deepEqual(b, []);
});

test('a altura cresce quando há muitos blocos numa coluna', () => {
  assert.equal(alturaDoMosaico([[1, 2], [3, 4, 5]]), 340);
  assert.equal(alturaDoMosaico([[1, 2, 3, 4, 5, 6], [1]]), 540);
});

test('categorias padrão usam a cor própria, e as criadas por ela usam as extras na ordem', () => {
  const categorias = [...DEFAULT_CATEGORIES, { id: 'pets', name: 'Pets' }, { id: 'viagem', name: 'Viagem' }];
  assert.deepEqual(corDaCategoria('mercado', categorias), { fundo: 'var(--cat-mercado)', texto: 'var(--cat-mercado-texto)' });
  assert.deepEqual(corDaCategoria('dia-a-dia', categorias), { fundo: 'var(--cat-dia-a-dia)', texto: 'var(--cat-dia-a-dia-texto)' });
  assert.equal(corDaCategoria('pets', categorias).fundo, 'var(--cat-extra-1)');
  assert.equal(corDaCategoria('viagem', categorias).texto, 'var(--cat-extra-2-texto)');
});

test('depois da quinta categoria criada as cores extras se repetem', () => {
  const novas = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, name: id }));
  const categorias = [...DEFAULT_CATEGORIES, ...novas];
  assert.equal(corDaCategoria('e', categorias).fundo, 'var(--cat-extra-5)');
  assert.equal(corDaCategoria('f', categorias).fundo, 'var(--cat-extra-1)');
});

test('categoria que não existe mais cai na cor de outros', () => {
  assert.equal(corDaCategoria('apagada', DEFAULT_CATEGORIES).fundo, 'var(--cat-outros)');
});

test('com dois gastos só, os dois ficam empilhados na mesma coluna (a diferença aparece na altura)', () => {
  const [a, b] = dividirMosaico([item('lazer', 10000), item('mercado', 1250)]);
  assert.deepEqual(ids(a), ['lazer', 'mercado']);
  assert.deepEqual(b, []);
});

test('nenhuma coluna fica estreita demais para caber o texto: a largura vai de 38% a 62%', () => {
  assert.deepEqual(larguraDasColunas([[item('a', 100)]]), [1]);
  assert.deepEqual(larguraDasColunas([[item('a', 500)], [item('b', 500)]]), [0.5, 0.5]);
  const [larga, estreita] = larguraDasColunas([[item('a', 9000)], [item('b', 100), item('c', 100)]]);
  assert.equal(larga, 0.62);
  assert.equal(estreita, 0.38);
});
