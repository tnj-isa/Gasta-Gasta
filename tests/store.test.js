import test from 'node:test';
import assert from 'node:assert/strict';
import { WrongPasswordError } from '../src/lib/crypto.js';
import { memoryStorage } from '../src/data/storage.js';
import { createVault } from '../src/data/vault.js';
import { createStore } from '../src/data/store.js';
import { addTransaction, emptyState } from '../src/domain/model.js';

const tx = (id) => ({ id, kind: 'expense', amountCents: 1250, date: '2026-11-18', scope: 'personal', categoryId: 'mercado' });
const novo = () => {
  const storage = memoryStorage();
  const vault = createVault(storage, { iterations: 1000 });
  return { storage, vault, store: createStore(vault) };
};

test('o que foi salvo volta depois de lock e unlock', async () => {
  const { vault, store } = novo();
  await store.create('senha-forte');
  await store.commit(s => addTransaction(s, tx('t1')));
  vault.lock();
  const s = await store.load('senha-forte');
  assert.equal(s.transactions.length, 1);
});

test('create devolve o estado vazio e getState o mostra', async () => {
  const { store } = novo();
  assert.deepEqual(await store.create('senha-forte'), emptyState());
  assert.deepEqual(store.getState(), emptyState());
});

test('dois commits ao mesmo tempo não perdem nenhum lançamento', async () => {
  const { vault, store } = novo();
  await store.create('senha-forte');
  await Promise.all([
    store.commit(s => addTransaction(s, tx('t1'))),
    store.commit(s => addTransaction(s, tx('t2'))),
  ]);
  vault.lock();
  const s = await store.load('senha-forte');
  assert.deepEqual(s.transactions.map(t => t.id), ['t1', 't2']);
});

test('commit com o cofre bloqueado falha e o estado não muda', async () => {
  const { vault, store } = novo();
  await store.create('senha-forte');
  vault.lock();
  await assert.rejects(store.commit(s => addTransaction(s, tx('t1'))));
  await store.load('senha-forte');
  assert.equal(store.getState().transactions.length, 0);
});

test('depois de bloquear, getState recusa entregar os dados', async () => {
  const { vault, store } = novo();
  await store.create('senha-forte');
  vault.lock();
  assert.throws(() => store.getState());
});

test('senha errada em load não entrega dados e não altera o cofre', async () => {
  const { storage, vault, store } = novo();
  await store.create('senha-forte');
  await store.commit(s => addTransaction(s, tx('t1')));
  const antes = await storage.get('vault');
  vault.lock();
  await assert.rejects(store.load('errada123'), WrongPasswordError);
  assert.throws(() => store.getState());
  assert.equal(await storage.get('vault'), antes);
});

test('replaceState troca tudo e persiste', async () => {
  const { vault, store } = novo();
  await store.create('senha-forte');
  await store.replaceState(addTransaction(emptyState(), tx('t9')));
  vault.lock();
  const s = await store.load('senha-forte');
  assert.deepEqual(s.transactions.map(t => t.id), ['t9']);
});

test('isInitialized diz se a senha já foi criada', async () => {
  const { store } = novo();
  assert.equal(await store.isInitialized(), false);
  await store.create('senha-forte');
  assert.equal(await store.isInitialized(), true);
});

test('lock tranca o cofre e tira o estado da memória, e a senha volta a abrir', async () => {
  const { vault, store } = novo();
  await store.create('senha-forte');
  await store.commit(s => addTransaction(s, tx('t1')));
  store.lock();
  assert.equal(vault.isUnlocked(), false);
  assert.throws(() => store.getState());
  const s = await store.load('senha-forte');
  assert.equal(s.transactions.length, 1);
});

test('create num app que já tem senha é recusado e não apaga nada', async () => {
  const { vault, store } = novo();
  await store.create('senha-forte');
  await store.commit(s => addTransaction(s, tx('t1')));
  vault.lock();
  await assert.rejects(store.create('outra-senha'));
  const s = await store.load('senha-forte');
  assert.equal(s.transactions.length, 1);
});

// ---------- trocar a senha ----------

test('trocar a senha: a nova abre e a antiga não, com tudo o que foi lançado', async () => {
  const { vault, store } = novo();
  await store.create('senha-antiga');
  await store.commit(s => addTransaction(s, tx('t1')));
  await store.changePassword('senha-antiga', 'senha-nova-1');
  vault.lock();
  await assert.rejects(store.load('senha-antiga'), WrongPasswordError);
  const s = await store.load('senha-nova-1');
  assert.deepEqual(s.transactions.map(t => t.id), ['t1']);
});

test('trocar a senha espera os salvamentos que já estavam na fila (nenhum lançamento fica de fora)', async () => {
  const { vault, store } = novo();
  await store.create('senha-antiga');
  const lancando = store.commit(s => addTransaction(s, tx('t1')));
  const trocando = store.changePassword('senha-antiga', 'senha-nova-1');
  const depois = store.commit(s => addTransaction(s, tx('t2')));
  await Promise.all([lancando, trocando, depois]);
  vault.lock();
  const s = await store.load('senha-nova-1');
  assert.deepEqual(s.transactions.map(t => t.id), ['t1', 't2']);
});

test('trocar a senha com a senha atual errada: recusa e o app segue funcionando', async () => {
  const { vault, store } = novo();
  await store.create('senha-antiga');
  await assert.rejects(store.changePassword('errada-123', 'senha-nova-1'), WrongPasswordError);
  await store.commit(s => addTransaction(s, tx('t1')));
  vault.lock();
  const s = await store.load('senha-antiga');
  assert.equal(s.transactions.length, 1);
});
