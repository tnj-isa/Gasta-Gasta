import test from 'node:test';
import assert from 'node:assert/strict';
import { fracaoDoProgresso, tamanhoReduzido, LADO_MAXIMO } from '../src/lib/ocr.js';

test('a leitura propriamente dita ocupa a maior parte da barra, do 30% ao 100%', () => {
  assert.equal(fracaoDoProgresso({ status: 'recognizing text', progress: 0 }), 0.3);
  assert.equal(fracaoDoProgresso({ status: 'recognizing text', progress: 0.5 }), 0.65);
  assert.equal(fracaoDoProgresso({ status: 'recognizing text', progress: 1 }), 1);
});

test('o preparo (baixar motor e idioma) vem antes e nunca passa de 30%', () => {
  for (const status of ['loading tesseract core', 'initializing tesseract', 'loading language traineddata', 'initializing api']) {
    assert.ok(fracaoDoProgresso({ status, progress: 0 }) >= 0, status);
    assert.ok(fracaoDoProgresso({ status, progress: 1 }) <= 0.3 + 1e-9, status);
  }
  assert.ok(fracaoDoProgresso({ status: 'loading language traineddata', progress: 0 })
    > fracaoDoProgresso({ status: 'loading tesseract core', progress: 1 }) - 1e-9);
});

test('mensagem que não é de progresso é ignorada, e progresso fora de 0 a 1 é limitado', () => {
  assert.equal(fracaoDoProgresso({ status: 'initialized api', progress: 1 }), null);
  assert.equal(fracaoDoProgresso({ status: 'outra coisa' }), null);
  assert.equal(fracaoDoProgresso(null), null);
  assert.equal(fracaoDoProgresso({ status: 'recognizing text', progress: 7 }), 1);
  assert.equal(fracaoDoProgresso({ status: 'recognizing text', progress: -3 }), 0.3);
  assert.equal(fracaoDoProgresso({ status: 'recognizing text', progress: Number.NaN }), 0.3);
});

test('foto de celular (12 megapixels) é reduzida para o lado maior caber no limite', () => {
  assert.deepEqual(tamanhoReduzido(4000, 3000), { largura: LADO_MAXIMO, altura: Math.round(3000 * (LADO_MAXIMO / 4000)) });
  const retrato = tamanhoReduzido(3000, 4000);
  assert.equal(retrato.altura, LADO_MAXIMO);
  assert.equal(retrato.largura, Math.round(3000 * (LADO_MAXIMO / 4000)));
});

test('imagem pequena não é ampliada', () => {
  assert.deepEqual(tamanhoReduzido(800, 1200), { largura: 800, altura: 1200 });
  assert.deepEqual(tamanhoReduzido(LADO_MAXIMO, 10), { largura: LADO_MAXIMO, altura: 10 });
});

test('nunca devolve lado zero, mesmo numa tira finíssima', () => {
  const r = tamanhoReduzido(100000, 3);
  assert.equal(r.largura, LADO_MAXIMO);
  assert.equal(r.altura, 1);
});
