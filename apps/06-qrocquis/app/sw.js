// QRocquis hors ligne : l'app tient dans un seul fichier, gardé en cache au premier passage.
// Hors ligne, on sert le cache. En ligne, on sert le cache tout de suite et on le met à jour en arrière-plan.
const CACHE = 'qrocquis-v2';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', '../media/favicon.png', '../media/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then(r => { if (r.ok && FILES.some(f => new URL(f, location).href === new URL(req.url).href.split('?')[0])) c.put(req, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
