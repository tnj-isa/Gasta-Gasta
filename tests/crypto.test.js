import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptJSON, decryptJSON, WrongPasswordError } from '../src/lib/crypto.js';

test('ida e volta', async () => {
  const blob = await encryptJSON({ a: 1 }, 'senha-forte', { iterations: 1000 });
  assert.deepEqual(await decryptJSON(blob, 'senha-forte'), { a: 1 });
});

test('senha errada lança WrongPasswordError', async () => {
  const blob = await encryptJSON({ a: 1 }, 'certa123', { iterations: 1000 });
  await assert.rejects(decryptJSON(blob, 'errada123'), WrongPasswordError);
});

test('o mesmo dado criptografado duas vezes gera blobs diferentes', async () => {
  const a = await encryptJSON({ a: 1 }, 'senha-forte', { iterations: 1000 });
  const b = await encryptJSON({ a: 1 }, 'senha-forte', { iterations: 1000 });
  assert.notEqual(a.data, b.data);
});

test('o blob não contém o texto original', async () => {
  const blob = await encryptJSON({ segredo: 'mercado-do-ze' }, 'senha-forte', { iterations: 1000 });
  assert.equal(JSON.stringify(blob).includes('mercado-do-ze'), false);
});

test('a mesma senha digitada em formas Unicode diferentes abre o blob', async () => {
  const blob = await encryptJSON({ a: 1 }, 'café-forte', { iterations: 1000 });
  assert.deepEqual(await decryptJSON(blob, 'café-forte'), { a: 1 });
});

test('dados grandes cifram e decifram', async () => {
  const grande = { itens: Array.from({ length: 20000 }, (_, i) => ({ i, nome: 'item ' + i })) };
  const blob = await encryptJSON(grande, 'senha-forte', { iterations: 1000 });
  assert.deepEqual(await decryptJSON(blob, 'senha-forte'), grande);
});
