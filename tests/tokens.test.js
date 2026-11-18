import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/ui/tokens.css', import.meta.url), 'utf8');
const vars = Object.fromEntries([...css.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, nome, valor]) => [nome, valor.trim()]));

const luminancia = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a, b) => {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (escuro + 0.05);
};
const cor = (nome) => {
  assert.match(vars[nome] ?? '', /^#[0-9A-Fa-f]{6}$/, `${nome} precisa existir e ser uma cor #RRGGBB`);
  return vars[nome];
};

const CATEGORIAS = ['mercado', 'dia-a-dia', 'lazer', 'comer-fora', 'transporte', 'casa', 'saude', 'outros'];
const EXTRAS = ['extra-1', 'extra-2', 'extra-3', 'extra-4', 'extra-5'];

test('texto principal e secundário são legíveis sobre o fundo e o papel', () => {
  for (const [texto, fundo] of [['--cor-tinta', '--cor-fundo'], ['--cor-tinta-suave', '--cor-fundo'], ['--cor-tinta-suave', '--cor-papel'], ['--cor-tinta', '--cor-papel']]) {
    assert.ok(contraste(cor(texto), cor(fundo)) >= 4.5, `${texto} sobre ${fundo}`);
  }
});

test('a faixa do mês, o botão da câmera e o valor "sobrou" são legíveis', () => {
  assert.ok(contraste(cor('--cor-faixa-texto'), cor('--cor-faixa')) >= 4.5, 'faixa');
  assert.ok(contraste(cor('--cor-acao-texto'), cor('--cor-acao')) >= 4.5, 'câmera');
  assert.ok(contraste(cor('--cor-positivo'), cor('--cor-fundo')) >= 4.5, 'sobrou');
});

test('conta atrasada é legível sobre o fundo avermelhado', () => {
  assert.ok(contraste(cor('--cor-atrasada'), cor('--cor-atrasada-fundo')) >= 4.5);
  assert.ok(contraste(cor('--cor-tinta-suave'), cor('--cor-atrasada-fundo')) >= 4.5);
});

test('etiquetas de boleto, parcela e cartão têm texto legível', () => {
  for (const tipo of ['boleto', 'parcela', 'cartao']) {
    assert.ok(contraste(cor('--cor-etiqueta-texto'), cor(`--cor-etiqueta-${tipo}`)) >= 4.5, tipo);
  }
});

test('toda categoria tem cor própria e texto legível por cima', () => {
  const fundos = new Set();
  for (const id of [...CATEGORIAS, ...EXTRAS]) {
    const fundo = cor(`--cat-${id}`);
    fundos.add(fundo.toLowerCase());
    assert.ok(contraste(cor(`--cat-${id}-texto`), fundo) >= 4.5, `categoria ${id}`);
  }
  assert.equal(fundos.size, CATEGORIAS.length + EXTRAS.length, 'duas categorias com a mesma cor');
});

test('tamanhos mínimos: texto 14px e toque 48px', () => {
  assert.ok(parseFloat(vars['--fonte-pequena']) >= 14);
  assert.ok(parseFloat(vars['--fonte-base']) >= 16);
  assert.ok(parseFloat(vars['--toque']) >= 48);
});

test('a fonte é servida do próprio app, sem internet', () => {
  assert.match(css, /@font-face\s*{[^}]*url\(\s*["']?fonts\/lexend-latin-wght-normal\.woff2/);
  assert.doesNotMatch(css, /https?:\/\//);
});
