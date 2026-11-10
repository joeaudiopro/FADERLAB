// Ratio (relación de aspecto): guarda todo en el dispositivo para usarse sin conexión.
// Cambia VERSION cada vez que subas una versión nueva del index.html.
const VERSION = 'v1';
const CORE = 'ratio-' + VERSION;
const FONTS = 'ratio-fuentes';
const FILES = ['./', './index.html', './manifest.webmanifest', './apple-touch-icon.png', './icon-192.png', './icon-512.png', './icon-maskable.png'];
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600&display=swap';

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CORE);
    await c.addAll(FILES);
    // Fuentes: se intentan guardar, pero si fallan la app sigue funcionando con la fuente del sistema.
    try {
      const f = await caches.open(FONTS);
      const css = await fetch(FONT_CSS);
      if (css.ok) {
        const text = await css.clone().text();
        await f.put(FONT_CSS, css);
        const urls = [...text.matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]);
        await Promise.all(urls.map(u => fetch(u).then(r => r.ok && f.put(u, r)).catch(() => {})));
      }
    } catch (_) {}
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // Solo borra cachés viejos de esta app: el dominio comparte cachés con las otras apps de FaderLab.
    for (const k of await caches.keys()) if (k.startsWith('ratio-') && k !== CORE && k !== FONTS) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (isFont) {
    e.respondWith(caches.open(FONTS).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      try { const r = await fetch(req); if (r.ok) c.put(req, r.clone()); return r; }
      catch (_) { return new Response('', { status: 504 }); }
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  // Primero lo guardado (arranca al instante y sin red); en segundo plano se actualiza si hay internet.
  e.respondWith((async () => {
    const c = await caches.open(CORE);
    const hit = await c.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' && await c.match('./index.html'));
    const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => null);
    return hit || (await net) || new Response('Sin conexión', { status: 503 });
  })());
});
