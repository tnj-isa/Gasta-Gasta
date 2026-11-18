// Service worker: guarda o app no celular para abrir sem internet.
// O número depois de "gasta-" é calculado por `npm run versao` (roda sozinho no `npm test`).
const CACHE = 'gasta-95c1a985';

// O leitor de notas (pasta vendor/, uns 13 MB) tem cache próprio: só é baixado de novo quando ele mesmo muda.
const CACHE_LEITOR = 'gasta-leitor-ce487a08';

// Caminhos sempre relativos ("./"): o app mora em uma subpasta do GitHub Pages.
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon.svg',
  './src/data/backup.js',
  './src/data/storage.js',
  './src/data/store.js',
  './src/data/vault.js',
  './src/domain/bills.js',
  './src/domain/cards.js',
  './src/domain/categorias.js',
  './src/domain/model.js',
  './src/domain/recurring.js',
  './src/domain/summary.js',
  './src/lib/crypto.js',
  './src/lib/dates.js',
  './src/lib/money.js',
  './src/lib/ocr.js',
  './src/lib/receipt.js',
  './src/ui/app.css',
  './src/ui/app.js',
  './src/ui/atualizacao.js',
  './src/ui/billsScreen.js',
  './src/ui/cardsScreen.js',
  './src/ui/dom.js',
  './src/ui/entry.js',
  './src/ui/faturasTexto.js',
  './src/ui/fonts/lexend-latin-wght-normal.woff2',
  './src/ui/home.js',
  './src/ui/instalacao.js',
  './src/ui/lock.js',
  './src/ui/main.js',
  './src/ui/mosaico.js',
  './src/ui/opcoes.js',
  './src/ui/photo.js',
  './src/ui/recurringScreen.js',
  './src/ui/settings.js',
  './src/ui/tokens.css',
];

// Arquivos do leitor de texto de imagens (funciona sem internet).
const LEITOR = [
  './vendor/tesseract/LEIAME.md',
  './vendor/tesseract/LICENSE.md',
  './vendor/tesseract/core/tesseract-core-lstm.wasm.js',
  './vendor/tesseract/core/tesseract-core-relaxedsimd-lstm.wasm.js',
  './vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js',
  './vendor/tesseract/lang/por.traineddata.gz',
  './vendor/tesseract/tesseract.esm.min.js',
  './vendor/tesseract/worker.min.js',
  './vendor/tesseract/worker.min.js.LICENSE.txt',
];

/** Pede o arquivo direto ao servidor, sem usar a cópia que o navegador guardou (que pode ser da versão anterior). */
const direto = (caminho) => new Request(caminho, { cache: 'reload' });

/** Guarda no cache do leitor só o que ainda não está lá. Se falhar (internet fraca), o app instala assim mesmo. */
async function guardarLeitor() {
  const cache = await caches.open(CACHE_LEITOR);
  for (const caminho of LEITOR) {
    if (!(await cache.match(caminho))) await cache.add(direto(caminho));
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      // O GitHub Pages deixa o navegador guardar cada arquivo por 10 minutos: sem "reload", uma versão nova podia guardar arquivos velhos.
      caches.open(CACHE).then((cache) => cache.addAll(ASSETS.map(direto))),
      guardarLeitor().catch(() => {}),
    ]).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(
        nomes.filter((n) => n.startsWith('gasta-') && n !== CACHE && n !== CACHE_LEITOR).map((n) => caches.delete(n)),
      ))
      .then(() => self.clients.claim()),
  );
});

// Cache primeiro: se está guardado, usa; senão vai à rede. Os dados dela nunca passam por aqui.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((guardado) => guardado ?? buscarEGuardar(event.request)),
  );
});

/** Vai à rede; se for arquivo do leitor que faltava no cache, guarda para a próxima vez (mesmo sem internet depois). */
async function buscarEGuardar(pedido) {
  const resposta = await fetch(pedido);
  if (resposta.ok && new URL(pedido.url).pathname.includes('vendor/tesseract/')) {
    const copia = resposta.clone();
    caches.open(CACHE_LEITOR).then((cache) => cache.put(pedido, copia)).catch(() => {});
  }
  return resposta;
}
