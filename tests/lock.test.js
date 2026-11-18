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

// ---------- trocar a senha ----------
import { validarTrocaDeSenha } from '../src/ui/lock.js';

test('troca de senha: aceita atual preenchida e senha nova boa, repetida igual e diferente da atual', () => {
  assert.equal(validarTrocaDeSenha('senha-antiga', 'senha-nova-1', 'senha-nova-1'), null);
});

test('troca de senha: pede a senha atual', () => {
  assert.equal(validarTrocaDeSenha('', 'senha-nova-1', 'senha-nova-1'), 'Digite a senha atual.');
});

test('troca de senha: a senha nova segue as mesmas regras de sempre (curta, só espaços, confirmação diferente)', () => {
  assert.equal(validarTrocaDeSenha('senha-antiga', '1234567', '1234567'), 'A senha precisa ter pelo menos 8 caracteres.');
  assert.equal(validarTrocaDeSenha('senha-antiga', '        ', '        '), 'A senha não pode ser só espaços.');
  assert.equal(validarTrocaDeSenha('senha-antiga', 'senha-nova-1', 'senha-nova-2'), 'As senhas não são iguais.');
});

test('troca de senha: recusa a senha nova igual à atual (provavelmente um engano)', () => {
  assert.equal(validarTrocaDeSenha('senha-antiga', 'senha-antiga', 'senha-antiga'), 'A senha nova precisa ser diferente da atual.');
});
