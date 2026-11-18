import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryIdFromName, validateCategoryName, MAX_CATEGORY_NAME } from '../src/domain/categorias.js';
import { DEFAULT_CATEGORIES } from '../src/domain/model.js';

test('o id vem do nome, sem acento, em minúsculas e com hífens', () => {
  assert.equal(categoryIdFromName('Pets e bichos', []), 'pets-e-bichos');
  assert.equal(categoryIdFromName('  Açaí & Cia!! ', []), 'acai-cia');
});

test('se o id já existe, ganha um número no fim', () => {
  assert.equal(categoryIdFromName('Saúde', ['saude']), 'saude-2');
  assert.equal(categoryIdFromName('Saúde', ['saude', 'saude-2']), 'saude-3');
});

test('nome só com símbolos vira "categoria"', () => {
  assert.equal(categoryIdFromName('!!!', []), 'categoria');
  assert.equal(categoryIdFromName('???', ['categoria']), 'categoria-2');
});

test('nome válido não dá erro', () => {
  assert.equal(validateCategoryName('Pets', DEFAULT_CATEGORIES), null);
  assert.equal(validateCategoryName('  Pets  ', DEFAULT_CATEGORIES), null);
});

test('nome vazio ou só espaços pede um nome', () => {
  assert.equal(validateCategoryName('', DEFAULT_CATEGORIES), 'Dê um nome à categoria.');
  assert.equal(validateCategoryName('   ', DEFAULT_CATEGORIES), 'Dê um nome à categoria.');
});

test('nome comprido demais é recusado', () => {
  assert.equal(validateCategoryName('a'.repeat(MAX_CATEGORY_NAME), DEFAULT_CATEGORIES), null);
  assert.match(validateCategoryName('a'.repeat(MAX_CATEGORY_NAME + 1), DEFAULT_CATEGORIES), /até 24 caracteres/);
});

test('nome repetido é recusado, mesmo com outra caixa ou sem acento', () => {
  const erro = 'Já existe uma categoria com esse nome.';
  assert.equal(validateCategoryName('mercado', DEFAULT_CATEGORIES), erro);
  assert.equal(validateCategoryName('SAUDE', DEFAULT_CATEGORIES), erro);
  assert.equal(validateCategoryName(' Comer  fora ', DEFAULT_CATEGORIES), erro);
});

test('ao renomear, a própria categoria não conta como repetida', () => {
  assert.equal(validateCategoryName('Mercado', DEFAULT_CATEGORIES, 'mercado'), null);
  assert.equal(validateCategoryName('Lazer', DEFAULT_CATEGORIES, 'mercado'), 'Já existe uma categoria com esse nome.');
});
