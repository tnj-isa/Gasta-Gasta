// Service worker: guarda o app no celular para abrir sem internet.
// O número depois de "gasta-" é calculado por `npm run versao` (roda sozinho no `npm test`).
const CACHE = 'gasta-6a185345';

// Caminhos sempre relativos ("./"): o app mora em uma subpasta do GitHub Pages.
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon.svg',
  './src/data/storage.js',
  './src/data/store.js',
  './src/data/vault.js',
  './src/domain/model.js',
  './src/domain/summary.js',
  './src/lib/crypto.js',
  './src/lib/dates.js',
  './src/lib/money.js',
  './src/ui/app.css',
  './src/ui/app.js',
  './src/ui/dom.js',
  './src/ui/entry.js',
  './src/ui/fonts/lexend-latin-wght-normal.woff2',
  './src/ui/home.js',
  './src/ui/instalacao.js',
  './src/ui/lock.js',
  './src/ui/main.js',
  './src/ui/mosaico.js',
  './src/ui/tokens.css',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(
        nomes.filter((n) => n.startsWith('gasta-') && n !== CACHE).map((n) => caches.delete(n)),
      ))
      .then(() => self.clients.claim()),
  );
});

// Cache primeiro: se está guardado, usa; senão vai à rede. Os dados dela nunca passam por aqui.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((guardado) => guardado ?? fetch(event.request)),
  );
});
