import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRecurring, editRule, MAX_MESES_ATRASADOS } from '../src/domain/recurring.js';
import { payBill } from '../src/domain/bills.js';
import { emptyState, upsertRule } from '../src/domain/model.js';

const regra = { id: 'r1', title: 'Internet', kind: 'bill', amountCents: 12000, dayOfMonth: 31, scope: 'personal' };
const base = upsertRule(emptyState(), regra);
const salario = { id: 'r2', title: 'Fixo', kind: 'income', amountCents: 100000, dayOfMonth: 20, scope: 'personal' };
const academia = { id: 'r3', title: 'Academia', kind: 'expense', amountCents: 9900, dayOfMonth: 10, scope: 'personal', categoryId: 'saude' };

test('primeira execução cria só o mês atual, com o dia limitado ao fim do mês', () => {
  const s = applyRecurring(base, '2027-02-10');
  assert.deepEqual(s.bills.map((b) => [b.id, b.dueDate]), [['r1:2027-02', '2027-02-28']]);
});

test('rodar duas vezes não duplica', () => {
  const um = applyRecurring(base, '2027-02-10');
  assert.equal(applyRecurring(um, '2027-02-10').bills.length, 1);
});

test('meses perdidos são criados na volta', () => {
  const um = applyRecurring(base, '2027-02-10');
  assert.equal(applyRecurring(um, '2027-04-02').bills.length, 3);
});

test('entrada recorrente só aparece depois da data', () => {
  const s = applyRecurring(upsertRule(emptyState(), salario), '2026-11-18');
  assert.equal(s.transactions.length, 0);
});

test('a conta criada é um boleto em aberto, com os dados da regra', () => {
  const trabalho = { ...regra, scope: 'work', categoryId: 'casa' };
  const [conta] = applyRecurring(upsertRule(emptyState(), trabalho), '2026-11-10').bills;
  assert.deepEqual(conta, {
    id: 'r1:2026-11', title: 'Internet', kind: 'boleto', scope: 'work', amountCents: 12000,
    dueDate: '2026-11-30', paidDate: null, categoryId: 'casa',
  });
});

test('a conta aparece mesmo com o dia deste mês já passado (fica atrasada até ser paga)', () => {
  const s = applyRecurring(upsertRule(emptyState(), { ...regra, dayOfMonth: 5 }), '2026-11-18');
  assert.deepEqual(s.bills.map((b) => b.dueDate), ['2026-11-05']);
});

test('o dia 31 vira o último dia de cada mês, e em ano bissexto fevereiro vai até o 29', () => {
  const s = applyRecurring({ ...base, recurring: [{ ...regra, through: '2027-12' }] }, '2028-04-01');
  assert.deepEqual(s.bills.map((b) => b.dueDate), ['2028-01-31', '2028-02-29', '2028-03-31', '2028-04-30']);
});

test('na virada do ano continua no mês seguinte', () => {
  const dez = applyRecurring(upsertRule(emptyState(), { ...regra, dayOfMonth: 15 }), '2026-12-20');
  const jan = applyRecurring(dez, '2027-01-02');
  assert.deepEqual(jan.bills.map((b) => b.id), ['r1:2026-12', 'r1:2027-01']);
});

test('o mês da última conferência fica anotado nas configurações', () => {
  assert.equal(applyRecurring(base, '2027-02-10').settings.recurringThrough, '2027-02');
  assert.equal(applyRecurring(emptyState(), '2027-02-10').settings.recurringThrough, '2027-02');
});

test('se não há nada a fazer, devolve o mesmo estado (nada para salvar)', () => {
  const um = applyRecurring(base, '2027-02-10');
  assert.equal(applyRecurring(um, '2027-02-15'), um);
  const sem = applyRecurring(emptyState(), '2027-02-10');
  assert.equal(applyRecurring(sem, '2027-02-20'), sem);
});

test('não altera o estado recebido', () => {
  const antes = structuredClone(base);
  applyRecurring(base, '2027-02-10');
  assert.deepEqual(base, antes);
});

test('gasto fixo vira gasto na data do mês, com a categoria da regra', () => {
  const s = applyRecurring(upsertRule(emptyState(), academia), '2026-11-18');
  assert.deepEqual(s.transactions, [{
    id: 'r3:2026-11', kind: 'expense', amountCents: 9900, date: '2026-11-10', scope: 'personal', categoryId: 'saude', merchant: 'Academia',
  }]);
  assert.equal(s.bills.length, 0);
});

test('entrada fixa vira entrada na data, sem categoria', () => {
  const s = applyRecurring(upsertRule(emptyState(), salario), '2026-11-25');
  assert.deepEqual(s.transactions, [{
    id: 'r2:2026-11', kind: 'income', amountCents: 100000, date: '2026-11-20', scope: 'personal', note: 'Fixo',
  }]);
});

test('no próprio dia da data a entrada já aparece', () => {
  assert.equal(applyRecurring(upsertRule(emptyState(), salario), '2026-11-20').transactions.length, 1);
  assert.equal(applyRecurring(upsertRule(emptyState(), salario), '2026-11-19').transactions.length, 0);
});

test('a entrada que ainda não chegou aparece quando o dia chega, no mesmo mês, uma vez só', () => {
  const antes = applyRecurring(upsertRule(emptyState(), salario), '2026-11-18');
  const depois = applyRecurring(antes, '2026-11-21');
  assert.deepEqual(depois.transactions.map((t) => [t.id, t.date]), [['r2:2026-11', '2026-11-20']]);
  assert.equal(applyRecurring(depois, '2026-11-28').transactions.length, 1);
});

test('gastos de meses perdidos entram nas datas certas, sem preencher o passado antes do primeiro uso', () => {
  const um = applyRecurring(upsertRule(emptyState(), academia), '2027-02-12');
  assert.deepEqual(um.transactions.map((t) => t.date), ['2027-02-10']);
  const volta = applyRecurring(um, '2027-04-15');
  assert.deepEqual(volta.transactions.map((t) => t.date), ['2027-02-10', '2027-03-10', '2027-04-10']);
});

test('um mês futuro nunca é criado antes da hora (o mês seguinte espera a vez)', () => {
  const s = applyRecurring(upsertRule(emptyState(), salario), '2026-11-25');
  assert.deepEqual(s.transactions.map((t) => t.date), ['2026-11-20']);
  assert.deepEqual(applyRecurring(s, '2026-12-19').transactions.map((t) => t.date), ['2026-11-20']);
  assert.deepEqual(applyRecurring(s, '2026-12-20').transactions.map((t) => t.date), ['2026-11-20', '2026-12-20']);
});

test('uma regra nova, cadastrada depois da conferência do mês, também cria o mês atual', () => {
  const conferido = applyRecurring(base, '2026-11-10');
  const comNova = upsertRule(conferido, { ...regra, id: 'r9', title: 'Aluguel', dayOfMonth: 25 });
  const s = applyRecurring(comNova, '2026-11-12');
  assert.deepEqual(s.bills.map((b) => b.id), ['r1:2026-11', 'r9:2026-11']);
});

test('conta apagada não volta ao abrir de novo no mesmo mês', () => {
  const s = applyRecurring(base, '2026-11-10');
  const apagada = { ...s, bills: [] };
  assert.equal(applyRecurring(apagada, '2026-11-11').bills.length, 0);
  assert.equal(applyRecurring(apagada, '2026-12-11').bills.length, 1, 'mas o mês seguinte vem normal');
});

test('gasto apagado também não volta, mesmo havendo outra regra esperando a data', () => {
  const duas = upsertRule(upsertRule(emptyState(), academia), salario);
  const s = applyRecurring(duas, '2026-11-12');
  const semGasto = { ...s, transactions: s.transactions.filter((t) => t.id !== 'r3:2026-11') };
  assert.equal(applyRecurring(semGasto, '2026-11-15').transactions.length, 0);
  assert.deepEqual(applyRecurring(semGasto, '2026-11-21').transactions.map((t) => t.id), ['r2:2026-11']);
});

test('conta que já foi paga continua paga ao rodar de novo', () => {
  const s = applyRecurring(base, '2026-11-10');
  const paga = payBill(s, 'r1:2026-11', '2026-11-12');
  const de_novo = applyRecurring(paga, '2026-12-02');
  assert.equal(de_novo.bills.find((b) => b.id === 'r1:2026-11').paidDate, '2026-11-12');
  assert.equal(de_novo.bills.length, 2);
});

test('um item que já existe com o mesmo id nunca é substituído nem duplicado (ex.: cópia restaurada sem a anotação)', () => {
  const existente = { id: 'r1:2027-02', title: 'Internet', kind: 'boleto', scope: 'personal', amountCents: 11000, dueDate: '2027-02-28', paidDate: '2027-02-20' };
  const s = applyRecurring({ ...base, bills: [existente] }, '2027-02-10');
  assert.deepEqual(s.bills, [existente]);
  assert.equal(s.recurring[0].through, '2027-02', 'e a anotação é refeita');
});

test('atraso enorme não trava: só os últimos meses são criados', () => {
  const velha = { ...regra, dayOfMonth: 5, through: '1990-01' };
  const s = applyRecurring(upsertRule(emptyState(), velha), '2027-02-10');
  assert.equal(MAX_MESES_ATRASADOS, 36);
  assert.equal(s.bills.length, 36);
  assert.equal(s.bills[0].id, 'r1:2024-03');
  assert.equal(s.bills.at(-1).id, 'r1:2027-02');
});

test('regra anotada num mês que ainda não chegou (relógio mudado) não cria nada nem anda para trás', () => {
  const futura = { ...regra, through: '2030-01' };
  const s = applyRecurring(upsertRule(emptyState(), futura), '2027-02-10');
  assert.equal(s.bills.length, 0);
  assert.equal(s.recurring[0].through, '2030-01');
});

// ---- editar uma conta fixa ----

test('editar muda a regra e guarda a anotação do último mês criado (o passado não é refeito)', () => {
  const s = applyRecurring(base, '2027-02-10');
  const novo = editRule(s, 'r1', { title: 'Internet fibra', amountCents: 13000, dayOfMonth: 10, scope: 'work', categoryId: 'casa' });
  assert.deepEqual(novo.recurring[0], {
    id: 'r1', title: 'Internet fibra', kind: 'bill', amountCents: 13000, dayOfMonth: 10, scope: 'work', categoryId: 'casa', through: '2027-02',
  });
  assert.equal(novo.bills.length, 1, 'editar não cria conta nova sozinho');
});

test('editar não troca o tipo nem o id da regra, mesmo que venham nos campos', () => {
  const s = applyRecurring(base, '2027-02-10');
  const novo = editRule(s, 'r1', { id: 'outro', kind: 'income', title: 'X', amountCents: 100, dayOfMonth: 5, scope: 'personal' });
  assert.equal(novo.recurring[0].id, 'r1');
  assert.equal(novo.recurring[0].kind, 'bill');
});

test('a conta deste mês que ainda não foi paga acompanha a edição (nome, valor, dia, de onde sai e categoria)', () => {
  const s = applyRecurring(base, '2027-02-10');
  const novo = editRule(s, 'r1', { title: 'Internet fibra', amountCents: 13000, dayOfMonth: 10, scope: 'work', categoryId: 'casa' });
  assert.deepEqual(novo.bills[0], {
    id: 'r1:2027-02', title: 'Internet fibra', kind: 'boleto', scope: 'work', amountCents: 13000,
    dueDate: '2027-02-10', paidDate: null, categoryId: 'casa',
  });
});

test('a conta deste mês que já foi paga não muda, nem o gasto do pagamento', () => {
  let s = applyRecurring(base, '2027-02-10');
  s = payBill(s, 'r1:2027-02', '2027-02-12');
  const antes = JSON.stringify([s.bills, s.transactions]);
  const novo = editRule(s, 'r1', { title: 'Internet fibra', amountCents: 13000, dayOfMonth: 10, scope: 'personal' });
  assert.equal(JSON.stringify([novo.bills, novo.transactions]), antes);
  assert.equal(novo.recurring[0].amountCents, 13000, 'mas os próximos meses já usam a regra nova');
});

test('contas de meses que já passaram continuam como estavam', () => {
  let s = applyRecurring(base, '2027-02-10');
  s = applyRecurring(s, '2027-04-02');
  const velhas = s.bills.filter((b) => b.id !== 'r1:2027-04').map((b) => ({ ...b }));
  const novo = editRule(s, 'r1', { title: 'Nova', amountCents: 1, dayOfMonth: 1, scope: 'personal' });
  assert.deepEqual(novo.bills.filter((b) => b.id !== 'r1:2027-04'), velhas);
  assert.equal(novo.bills.find((b) => b.id === 'r1:2027-04').amountCents, 1);
});

test('o próximo mês nasce com os dados da regra editada', () => {
  let s = applyRecurring(base, '2027-02-10');
  s = editRule(s, 'r1', { title: 'Nova', amountCents: 15000, dayOfMonth: 8, scope: 'personal', categoryId: 'casa' });
  s = applyRecurring(s, '2027-03-02');
  assert.deepEqual(s.bills.find((b) => b.id === 'r1:2027-03'), {
    id: 'r1:2027-03', title: 'Nova', kind: 'boleto', scope: 'personal', amountCents: 15000, dueDate: '2027-03-08', paidDate: null, categoryId: 'casa',
  });
});

test('gasto fixo: o lançamento deste mês não é reescrito (para mudar, edita-se o lançamento)', () => {
  let s = applyRecurring(upsertRule(emptyState(), academia), '2026-11-18');
  const antes = JSON.stringify(s.transactions);
  s = editRule(s, 'r3', { title: 'Academia nova', amountCents: 12000, dayOfMonth: 10, scope: 'personal', categoryId: 'saude' });
  assert.equal(JSON.stringify(s.transactions), antes);
  assert.equal(s.recurring[0].title, 'Academia nova');
});

test('entrada fixa fica sem categoria, e o escopo continua pessoal', () => {
  const s = editRule(upsertRule(emptyState(), salario), 'r2', { title: 'Fixo novo', amountCents: 120000, dayOfMonth: 5, scope: 'work', categoryId: 'casa' });
  assert.deepEqual(s.recurring[0], { id: 'r2', title: 'Fixo novo', kind: 'income', amountCents: 120000, dayOfMonth: 5, scope: 'personal' });
});

test('editar uma regra que não existe mais avisa', () => {
  assert.throws(() => editRule(base, 'sumiu', { title: 'X', amountCents: 1, dayOfMonth: 1, scope: 'personal' }), /não existe mais/);
});

test('editar não mexe no estado que recebe', () => {
  const s = applyRecurring(base, '2027-02-10');
  const antes = JSON.stringify(s);
  editRule(s, 'r1', { title: 'Nova', amountCents: 1, dayOfMonth: 1, scope: 'work' });
  assert.equal(JSON.stringify(s), antes);
});
