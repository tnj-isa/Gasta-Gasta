import test from 'node:test';
import assert from 'node:assert/strict';
import { WrongPasswordError } from '../src/lib/crypto.js';
import { BackupError, exportBackup, importBackup, shouldRemindBackup, validateState } from '../src/data/backup.js';
import { addTransaction, emptyState, upsertBills, upsertCard, upsertRule } from '../src/domain/model.js';

const tx = { id: 't1', kind: 'expense', amountCents: 1250, date: '2026-11-18', scope: 'personal', categoryId: 'mercado', note: 'Pão e leite' };
const bill = { id: 'b1', title: 'Internet', kind: 'boleto', scope: 'personal', amountCents: 11990, dueDate: '2026-11-22', paidDate: null };
const card = { id: 'c1', name: 'Nubank', closingDay: 3, dueDay: 10 };
const rule = { id: 'r1', title: 'Aluguel', kind: 'bill', amountCents: 100000, dayOfMonth: 5, scope: 'personal' };
const completo = () => upsertRule(upsertCard(upsertBills(addTransaction(emptyState(), tx), [bill]), card), rule);

test('ida e volta do backup', async () => {
  const s = addTransaction(emptyState(), tx);
  const texto = await exportBackup(s, 'senha-forte', { iterations: 1000 });
  assert.deepEqual(await importBackup(texto, 'senha-forte'), s);
});

test('ida e volta com tudo preenchido (lançamentos, faturas, cartões e contas fixas)', async () => {
  const s = completo();
  assert.deepEqual(await importBackup(await exportBackup(s, 'senha-forte', { iterations: 1000 }), 'senha-forte'), s);
});

test('o arquivo é texto JSON identificado e não deixa os dados à vista', async () => {
  const texto = await exportBackup(completo(), 'senha-forte', { iterations: 1000 });
  const arquivo = JSON.parse(texto);
  assert.equal(arquivo.app, 'controle-financeiro');
  assert.equal(arquivo.v, 1);
  assert.ok(arquivo.blob);
  for (const segredo of ['Pão e leite', 'Internet', 'Nubank', 'Aluguel', 'mercado']) {
    assert.ok(!texto.includes(segredo), `não pode aparecer "${segredo}" no arquivo`);
  }
});

test('senha errada rejeita', async () => {
  const texto = await exportBackup(emptyState(), 'certa123', { iterations: 1000 });
  await assert.rejects(importBackup(texto, 'errada123'), WrongPasswordError);
});

test('arquivo corrompido ou de outro app rejeita com BackupError', async () => {
  await assert.rejects(importBackup('não é json', 'x'), BackupError);
  await assert.rejects(importBackup('{"app":"outro","v":1}', 'x'), BackupError);
  await assert.rejects(importBackup('[]', 'x'), BackupError);
  await assert.rejects(importBackup('null', 'x'), BackupError);
});

test('arquivo de uma versão que este app não conhece rejeita', async () => {
  const arquivo = JSON.parse(await exportBackup(emptyState(), 'senha-forte', { iterations: 1000 }));
  await assert.rejects(importBackup(JSON.stringify({ ...arquivo, v: 2 }), 'senha-forte'), BackupError);
});

test('arquivo com a parte criptografada incompleta ou danificada rejeita com BackupError', async () => {
  const arquivo = JSON.parse(await exportBackup(emptyState(), 'senha-forte', { iterations: 1000 }));
  const sem = (campo) => { const blob = { ...arquivo.blob }; delete blob[campo]; return JSON.stringify({ ...arquivo, blob }); };
  for (const campo of ['salt', 'iv', 'data', 'iterations']) {
    await assert.rejects(importBackup(sem(campo), 'senha-forte'), BackupError, campo);
  }
  const lixo = JSON.stringify({ ...arquivo, blob: { ...arquivo.blob, salt: '!!!não é base64!!!' } });
  await assert.rejects(importBackup(lixo, 'senha-forte'), BackupError);
});

test('um número de iterações absurdo não trava o celular: é recusado antes de calcular', async () => {
  const arquivo = JSON.parse(await exportBackup(emptyState(), 'senha-forte', { iterations: 1000 }));
  for (const iterations of [0, -5, 1.5, 1e12, '1000', null]) {
    await assert.rejects(importBackup(JSON.stringify({ ...arquivo, blob: { ...arquivo.blob, iterations } }), 'senha-forte'), BackupError, String(iterations));
  }
});

test('estado inválido dentro de um backup válido rejeita', async () => {
  const texto = await exportBackup({ lixo: true }, 'senha-forte', { iterations: 1000 });
  await assert.rejects(importBackup(texto, 'senha-forte'), BackupError);
});

test('lembrete mensal', () => {
  assert.equal(shouldRemindBackup(null, '2026-11-18', true), true);
  assert.equal(shouldRemindBackup('2026-11-01', '2026-11-18', true), false);
  assert.equal(shouldRemindBackup('2026-10-18', '2026-11-18', true), true);
  assert.equal(shouldRemindBackup(null, '2026-11-18', false), false);
});

test('o lembrete aparece no 30º dia e não no 29º', () => {
  assert.equal(shouldRemindBackup('2026-10-20', '2026-11-18', true), false);
  assert.equal(shouldRemindBackup('2026-10-19', '2026-11-18', true), true);
});

test('sem dados não há o que lembrar, mesmo com a última cópia antiga', () => {
  assert.equal(shouldRemindBackup('2020-01-01', '2026-11-18', false), false);
});

test('validateState aceita o estado vazio e o completo e devolve o mesmo valor', () => {
  const vazio = emptyState();
  assert.equal(validateState(vazio), vazio);
  const cheio = completo();
  assert.equal(validateState(cheio), cheio);
});

test('validateState aceita campos que ainda não existem hoje (cópias de versões futuras do mesmo formato)', () => {
  const s = { ...completo(), extra: 1 };
  s.transactions = [{ ...tx, campoNovo: 'x' }];
  assert.doesNotThrow(() => validateState(s));
});

test('validateState recusa o que não é um estado do app', () => {
  const ruim = (mudanca, nome) => assert.throws(() => validateState(mudanca), BackupError, nome);
  ruim(null, 'null');
  ruim('texto', 'texto');
  ruim([], 'lista');
  ruim({ ...emptyState(), version: 2 }, 'versão');
  ruim({ ...emptyState(), categories: 'x' }, 'categorias não é lista');
  ruim({ ...emptyState(), categories: [{ id: 'mercado', name: 'Mercado' }] }, 'sem a categoria outros');
  ruim({ ...emptyState(), categories: [{ id: 'outros', name: 'Outros' }, { id: 'outros', name: 'Outros 2' }] }, 'categoria repetida');
  ruim({ ...emptyState(), transactions: {} }, 'lançamentos não é lista');
  ruim({ ...emptyState(), settings: null }, 'sem configurações');
  ruim({ ...emptyState(), settings: { ...emptyState().settings, autoLockMs: 0 } }, 'bloqueio zero');
  ruim({ ...emptyState(), settings: { ...emptyState().settings, lastBackup: '2026-13-40' } }, 'data da cópia');
  const sem = { ...emptyState() }; delete sem.bills;
  ruim(sem, 'sem faturas');
});

test('validateState confere cada lançamento: valor, data, tipo, escopo e id', () => {
  const com = (parte) => ({ ...emptyState(), transactions: [{ ...tx, ...parte }] });
  assert.doesNotThrow(() => validateState(com({})));
  for (const [nome, parte] of Object.entries({
    'valor com centavos quebrados': { amountCents: 12.5 },
    'valor zero': { amountCents: 0 },
    'valor negativo': { amountCents: -100 },
    'valor em texto': { amountCents: '1250' },
    'valor enorme demais': { amountCents: Number.MAX_SAFE_INTEGER + 2 },
    'data que não existe': { date: '2026-02-30' },
    'data em outro formato': { date: '18/11/2026' },
    'tipo desconhecido': { kind: 'transfer' },
    'escopo desconhecido': { scope: 'casa' },
    'id vazio': { id: '' },
    'categoria que não é texto': { categoryId: 7 },
  })) {
    assert.throws(() => validateState(com(parte)), BackupError, nome);
  }
  assert.throws(() => validateState({ ...emptyState(), transactions: [tx, { ...tx }] }), BackupError, 'id repetido');
  assert.throws(() => validateState({ ...emptyState(), transactions: [null] }), BackupError, 'lançamento nulo');
});

test('validateState confere faturas, cartões e contas fixas', () => {
  const ruim = (parte, nome) => assert.throws(() => validateState({ ...emptyState(), ...parte }), BackupError, nome);
  ruim({ bills: [{ ...bill, dueDate: '2026-00-10' }] }, 'vencimento inválido');
  ruim({ bills: [{ ...bill, paidDate: '2026-11-31' }] }, 'pagamento inválido');
  ruim({ bills: [{ ...bill, kind: 'outro' }] }, 'tipo de fatura');
  ruim({ bills: [{ ...bill, amountCents: -1 }] }, 'fatura negativa');
  ruim({ cards: [{ ...card, closingDay: 32 }] }, 'dia de fechamento');
  ruim({ cards: [{ ...card, dueDay: 0 }] }, 'dia de vencimento');
  ruim({ recurring: [{ ...rule, dayOfMonth: 40 }] }, 'dia da conta fixa');
  ruim({ recurring: [{ ...rule, kind: 'x' }] }, 'tipo da conta fixa');
  ruim({ recurring: [{ ...rule, through: '2026-13' }] }, 'mês anotado inexistente');
  ruim({ recurring: [{ ...rule, through: '2026-1' }] }, 'mês anotado mal escrito');
  ruim({ recurring: [{ ...rule, through: 202611 }] }, 'mês anotado que não é texto');
  for (const through of [undefined, null, '2026-11']) {
    assert.doesNotThrow(() => validateState({ ...emptyState(), recurring: [{ ...rule, through }] }), `mês anotado ${through}`);
  }
});
