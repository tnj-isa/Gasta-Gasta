import test from 'node:test';
import assert from 'node:assert/strict';
import { WrongPasswordError } from '../src/lib/crypto.js';
import { memoryStorage } from '../src/data/storage.js';
import { createVault, createAutoLock, VaultConflictError } from '../src/data/vault.js';

test('init, lock e unlock', async () => {
  const v = createVault(memoryStorage(), { iterations: 1000 });
  assert.equal(await v.isInitialized(), false);
  await v.init('senha-forte', { n: 1 });
  v.lock();
  assert.equal(v.isUnlocked(), false);
  assert.deepEqual(await v.unlock('senha-forte'), { n: 1 });
});

test('senha errada não altera o que está guardado', async () => {
  const storage = memoryStorage();
  const v = createVault(storage, { iterations: 1000 });
  await v.init('senha-forte', { n: 1 });
  const antes = await storage.get('vault');
  v.lock();
  await assert.rejects(v.unlock('errada123'), WrongPasswordError);
  assert.equal(v.isUnlocked(), false);
  assert.equal(await storage.get('vault'), antes);
});

test('save persiste e sobrevive a lock/unlock', async () => {
  const v = createVault(memoryStorage(), { iterations: 1000 });
  await v.init('senha-forte', { n: 1 });
  await v.save({ n: 2 });
  v.lock();
  assert.deepEqual(await v.unlock('senha-forte'), { n: 2 });
});

test('save com o cofre bloqueado é recusado e não grava nada', async () => {
  const storage = memoryStorage();
  const v = createVault(storage, { iterations: 1000 });
  await v.init('senha-forte', { n: 1 });
  const antes = await storage.get('vault');
  v.lock();
  await assert.rejects(v.save({ n: 99 }));
  assert.equal(await storage.get('vault'), antes);
});

test('init não sobrescreve um cofre que já existe', async () => {
  const storage = memoryStorage();
  const v = createVault(storage, { iterations: 1000 });
  await v.init('senha-forte', { n: 1 });
  const antes = await storage.get('vault');
  await assert.rejects(v.init('outra-senha', { n: 2 }));
  assert.equal(await storage.get('vault'), antes);
});

/** Duas janelas do app (ex.: o ícone instalado e uma aba do Chrome) abertas e destravadas ao mesmo tempo. */
async function duasJanelas() {
  const storage = memoryStorage();
  const a = createVault(storage, { iterations: 1000 });
  await a.init('senha-forte', { n: 1 });
  const b = createVault(storage, { iterations: 1000 });
  await b.unlock('senha-forte');
  return { storage, a, b };
}

test('duas janelas abertas: a que grava depois é recusada e não apaga o que a outra gravou', async () => {
  const { a, b } = await duasJanelas();
  await a.save({ n: 2 });
  await assert.rejects(b.save({ n: 3 }), VaultConflictError);
  b.lock();
  assert.deepEqual(await b.unlock('senha-forte'), { n: 2 });
});

test('depois de recusada, a janela atrasada destrava de novo, vê o que a outra gravou e volta a gravar', async () => {
  const { a, b } = await duasJanelas();
  await a.save({ n: 2 });
  await assert.rejects(b.save({ n: 3 }), VaultConflictError);
  b.lock();
  await b.unlock('senha-forte');
  await b.save({ n: 4 });
  a.lock();
  assert.deepEqual(await a.unlock('senha-forte'), { n: 4 });
});

test('na mesma janela, gravar várias vezes seguidas continua funcionando', async () => {
  const v = createVault(memoryStorage(), { iterations: 1000 });
  await v.init('senha-forte', { n: 1 });
  for (const n of [2, 3, 4]) await v.save({ n });
  v.lock();
  assert.deepEqual(await v.unlock('senha-forte'), { n: 4 });
});

test('duas janelas criando a senha ao mesmo tempo: só a primeira cria, a outra é recusada e não apaga nada', async () => {
  const storage = memoryStorage();
  const a = createVault(storage, { iterations: 1000 });
  const b = createVault(storage, { iterations: 1000 });
  const resultados = await Promise.allSettled([a.init('senha-forte', { n: 1 }), b.init('outra-senha', { n: 9 })]);
  assert.deepEqual(resultados.map((r) => r.status).sort(), ['fulfilled', 'rejected']);
  const venceu = resultados[0].status === 'fulfilled' ? ['senha-forte', { n: 1 }] : ['outra-senha', { n: 9 }];
  assert.deepEqual(await createVault(storage, { iterations: 1000 }).unlock(venceu[0]), venceu[1]);
});

test('o conflito explica em português o que fazer', async () => {
  const { a, b } = await duasJanelas();
  await a.save({ n: 2 });
  await assert.rejects(b.save({ n: 3 }), /outra janela.*abra o app de novo/i);
});

test('autoLock chama onLock depois do tempo e touch reinicia', () => {
  const timers = []; let locked = 0;
  const al = createAutoLock({ timeoutMs: 180000, onLock: () => locked++,
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimer: () => {} });
  al.touch();
  assert.equal(timers.at(-1).ms, 180000);
  timers.at(-1).fn();
  assert.equal(locked, 1);
});

test('touch cancela o relógio anterior e stop cancela o atual', () => {
  const cancelados = [];
  const al = createAutoLock({ timeoutMs: 1000, onLock: () => {},
    setTimer: () => 7, clearTimer: (id) => cancelados.push(id) });
  al.touch();
  al.touch();
  assert.deepEqual(cancelados, [7]);
  al.stop();
  assert.deepEqual(cancelados, [7, 7]);
});

test('check trava se o tempo passou, mesmo que o relógio do navegador não tenha disparado', () => {
  let agora = 1000; let travou = 0;
  const al = createAutoLock({ timeoutMs: 180000, onLock: () => travou++, setTimer: () => 1, clearTimer: () => {}, now: () => agora });
  al.touch();
  agora += 179999;
  al.check();
  assert.equal(travou, 0);
  agora += 1;
  al.check();
  assert.equal(travou, 1);
  al.check();
  assert.equal(travou, 1, 'trava uma vez só');
});

test('check não faz nada antes de começar nem depois de parar', () => {
  let agora = 0; let travou = 0;
  const al = createAutoLock({ timeoutMs: 1000, onLock: () => travou++, setTimer: () => 1, clearTimer: () => {}, now: () => agora });
  agora = 99999;
  al.check();
  al.touch();
  al.stop();
  agora = 999999;
  al.check();
  assert.equal(travou, 0);
});

test('depois que o relógio dispara, check não trava de novo, e touch recomeça', () => {
  let agora = 0; let travou = 0; const timers = [];
  const al = createAutoLock({ timeoutMs: 1000, onLock: () => travou++, setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => {}, now: () => agora });
  al.touch();
  timers.at(-1)();
  agora = 5000;
  al.check();
  assert.equal(travou, 1);
  al.touch();
  agora = 5999;
  al.check();
  assert.equal(travou, 1);
  agora = 6000;
  al.check();
  assert.equal(travou, 2);
});
