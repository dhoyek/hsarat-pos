/* hsarat-pos service worker — v26
   Freshness first, offline as a safety net.

   The page is ALWAYS fetched from the network with the browser's own HTTP cache
   bypassed ({cache:'no-store'}), so a new deploy shows up on the very next open.
   The response is kept as a spare copy, used only when the network is unreachable,
   so the POS still opens during an internet cut. */
const CACHE = 'hsarat-pos-v31';
const SHELL = ['./index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c =>
    Promise.all(SHELL.map(u =>
      fetch(new Request(u, {cache: 'reload'}))
        .then(r => (r && r.ok) ? c.put(u, r) : null)
        .catch(() => null)))));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()));
});

const isDoc = req =>
  req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;

  if (isDoc(req)) {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(new Request(url.pathname + url.search, {cache: 'no-store'}));
        if (fresh && fresh.ok) {
          const copy = fresh.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy)).catch(() => {});
          return fresh;
        }
        throw new Error('bad response');
      } catch (_) {
        const hit = await caches.match('./index.html');
        return hit || Response.error();
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) {
      fetch(req).then(r => {
        if (r && r.ok) caches.open(CACHE).then(c => c.put(req, r.clone())).catch(() => {});
      }).catch(() => {});
      return hit;
    }
    try {
      const r = await fetch(req);
      if (r && r.ok) caches.open(CACHE).then(c => c.put(req, r.clone())).catch(() => {});
      return r;
    } catch (_) { return Response.error(); }
  })());
});
