import test from 'node:test';
import assert from 'node:assert/strict';
import { validarNovaSenha } from '../src/ui/lock.js';

test('aceita senha com 8 ou mais caracteres, igual à confirmação', () => {
  assert.equal(validarNovaSenha('12345678', '12345678'), null);
  assert.equal(validarNovaSenha('uma frase longa', 'uma frase longa'), null);
});

test('recusa senha curta', () => {
  assert.equal(validarNovaSenha('1234567', '1234567'), 'A senha precisa ter pelo menos 8 caracteres.');
  assert.equal(validarNovaSenha('', ''), 'A senha precisa ter pelo menos 8 caracteres.');
});

test('conta letras com acento e emojis como um caractere cada', () => {
  assert.equal(validarNovaSenha('açaí-bom', 'açaí-bom'), null);
  assert.equal(validarNovaSenha('😀😀😀😀😀😀😀😀', '😀😀😀😀😀😀😀😀'), null);
});

test('recusa confirmação diferente', () => {
  assert.equal(validarNovaSenha('12345678', '12345679'), 'As senhas não são iguais.');
});

test('recusa senha só de espaços', () => {
  assert.equal(validarNovaSenha('        ', '        '), 'A senha não pode ser só espaços.');
});
