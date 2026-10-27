// Service worker: red primero (para recibir siempre la última versión) y caché como respaldo sin conexión.
const CACHE = 'poker-v1';
const CORE = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/main.js', 'js/util.js', 'js/store.js', 'js/audio.js',
  'js/core/cards.js', 'js/core/evaluator.js', 'js/core/equity.js', 'js/core/ranges.js', 'js/core/engine.js', 'js/core/bots.js',
  'js/game/runner.js', 'js/game/session.js',
  'js/net/transport.js', 'js/net/host.js', 'js/net/client.js',
  'js/ui/components.js', 'js/ui/table.js', 'js/ui/room.js', 'js/ui/home.js', 'js/ui/online.js', 'js/ui/academy.js',
  'js/ui/widgets.js', 'js/ui/trainers.js', 'js/ui/tools.js', 'js/ui/wheel.js', 'js/ui/profile.js',
  'js/data/lessons.js', 'js/data/progress.js', 'js/data/tables.js',
  'vendor/qrcode.module.js', 'vendor/peerjs.min.js',
  'assets/icon.svg', 'assets/icon-192.png', 'assets/icon-512.png',
  'assets/fonts/bodoni-moda-latin-opsz-normal.woff2', 'assets/fonts/bodoni-moda-latin-opsz-italic.woff2', 'assets/fonts/manrope-latin-wght-normal.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
  );
});
