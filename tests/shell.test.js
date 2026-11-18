import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const raiz = new URL('..', import.meta.url).pathname;
const ler = (caminho) => readFileSync(join(raiz, caminho), 'utf8');

/** Todos os arquivos de dentro de uma pasta, com caminho relativo à raiz. */
function arquivos(pasta) {
  const inicio = join(raiz, pasta);
  if (!existsSync(inicio)) return [];
  const achados = [];
  const visitar = (dir) => {
    for (const nome of readdirSync(dir)) {
      const completo = join(dir, nome);
      if (statSync(completo).isDirectory()) visitar(completo);
      else achados.push(relative(raiz, completo).split(sep).join('/'));
    }
  };
  visitar(inicio);
  return achados;
}

/** Lê uma lista (ASSETS ou LEITOR) do sw.js sem rodar o arquivo. */
function listaDoServiceWorker(nome = 'ASSETS') {
  const texto = ler('sw.js');
  const bloco = new RegExp(`const ${nome} = \\[([\\s\\S]*?)\\];`).exec(texto);
  assert.ok(bloco, `sw.js precisa ter "const ${nome} = [ ... ];"`);
  return [...bloco[1].matchAll(/['"]\.\/([^'"]*)['"]/g)].map((m) => m[1]);
}

test('o service worker guarda todos os arquivos do app, e só arquivos que existem', () => {
  const guardados = [...listaDoServiceWorker('ASSETS'), ...listaDoServiceWorker('LEITOR')];
  const doApp = ['index.html', 'manifest.webmanifest', ...arquivos('src'), ...arquivos('icons'), ...arquivos('vendor')];
  const faltando = doApp.filter((f) => !guardados.includes(f));
  assert.deepEqual(faltando, [], 'arquivos que o app usa e o sw.js não guarda (o app não abriria offline)');
  const fantasmas = guardados.filter((f) => f !== '' && !existsSync(join(raiz, f)));
  assert.deepEqual(fantasmas, [], 'arquivos listados no sw.js que não existem (a instalação falharia)');
});

test('o leitor de notas (vendor/) fica num cache só dele, para não ser baixado de novo a cada atualização do app', () => {
  const doLeitor = listaDoServiceWorker('LEITOR');
  assert.deepEqual([...doLeitor].sort(), arquivos('vendor').sort(), 'LEITOR guarda exatamente os arquivos de vendor/');
  const doApp = listaDoServiceWorker('ASSETS');
  assert.deepEqual(doApp.filter((f) => f.startsWith('vendor/')), [], 'vendor/ não entra na lista do app');
});

test('o cache é cache primeiro e a versão no nome acompanha o conteúdo dos arquivos', async () => {
  const texto = ler('sw.js');
  assert.match(texto, /const CACHE = 'gasta-[0-9a-f]{8}'/);
  assert.match(texto, /caches\.match/);
  assert.match(texto, /skipWaiting/);
  assert.match(texto, /caches\.delete/);
  // Se um arquivo do app mudou e a versão não, ela não receberia a atualização no celular.
  const { calcularVersao, calcularVersaoDoLeitor } = await import('../scripts/stamp-sw.mjs');
  const [, versaoNoArquivo] = /const CACHE = 'gasta-([0-9a-f]{8})'/.exec(texto);
  assert.equal(versaoNoArquivo, calcularVersao(raiz), 'rode "npm run versao" para atualizar a versão do cache');
  const [, versaoDoLeitor] = /const CACHE_LEITOR = 'gasta-leitor-([0-9a-f]{8})'/.exec(texto);
  assert.equal(versaoDoLeitor, calcularVersaoDoLeitor(raiz), 'rode "npm run versao" para atualizar a versão do cache do leitor');
  assert.match(texto, /caches\.open\(CACHE_LEITOR\)/);
  assert.match(texto, /n !== CACHE && n !== CACHE_LEITOR/, 'a limpeza não pode apagar o cache do leitor');
});

test('ao instalar, o service worker pede os arquivos direto ao servidor (nunca a cópia de 10 minutos do navegador)', () => {
  const texto = ler('sw.js');
  assert.match(texto, /new Request\(caminho, \{ cache: 'reload' \}\)/);
  assert.match(texto, /cache\.addAll\(ASSETS\.map\(direto\)\)/, 'os arquivos do app entram no cache pelo pedido "reload"');
  assert.match(texto, /cache\.add\(direto\(caminho\)\)/, 'os do leitor também');
  assert.doesNotMatch(texto, /addAll\(ASSETS\)/);
});

test('o service worker usa só caminhos relativos, para funcionar em /Gasta-Gasta/', () => {
  const texto = ler('sw.js');
  assert.doesNotMatch(texto, /['"]\/[a-z]/i, 'caminho começando com / quebra em subpasta do GitHub Pages');
});

test('manifest: instalável, tela cheia, português', () => {
  const m = JSON.parse(ler('manifest.webmanifest'));
  assert.equal(m.display, 'standalone');
  assert.equal(m.lang, 'pt-BR');
  assert.equal(m.start_url, './');
  assert.equal(m.scope, './');
  assert.ok(m.name && m.short_name);
  assert.match(m.theme_color, /^#[0-9A-Fa-f]{6}$/);
  assert.match(m.background_color, /^#[0-9A-Fa-f]{6}$/);
});

test('manifest: ícones de 192 e 512 existem, são PNG e têm o tamanho que dizem', () => {
  const m = JSON.parse(ler('manifest.webmanifest'));
  for (const tamanho of [192, 512]) {
    const icone = m.icons.find((i) => i.sizes === `${tamanho}x${tamanho}`);
    assert.ok(icone, `falta ícone ${tamanho}x${tamanho}`);
    assert.equal(icone.type, 'image/png');
    assert.match(icone.purpose ?? 'any', /maskable/);
    const bytes = readFileSync(join(raiz, icone.src));
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    assert.equal(bytes.readUInt32BE(16), tamanho, 'largura');
    assert.equal(bytes.readUInt32BE(20), tamanho, 'altura');
  }
});

test('index.html: português, celular, manifest, visual e script do app', () => {
  const html = ler('index.html');
  assert.match(html, /<html lang="pt-BR"/);
  assert.match(html, /name="viewport"[^>]*width=device-width/);
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest"/);
  assert.match(html, /href="src\/ui\/tokens\.css"/);
  assert.match(html, /<script type="module" src="src\/ui\/main\.js"/);
  assert.doesNotMatch(html, /https?:\/\//, 'nada de endereços externos: o app funciona sem internet');
});
