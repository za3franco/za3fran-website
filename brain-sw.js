/* brain-sw.js — service worker of the Za3fran Brain app (/brain), bi-1.0.0.
 * - Makes the app installable on the phone's home screen.
 * - Android "Share" target: a POST to /brain/share (title, text, url, files) is caught here, the files are kept
 *   in a local cache for a moment, and the app opens on /brain?share=1 with the capture form already filled.
 * - The app shell is cached for a quick start; every /api call always goes to the network.
 */
const SHELL = 'brain-shell-v1';
const SHARE = 'brain-share';
const SHELL_FILES = ['/brain', '/assets/logo.png', '/assets/brain/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('brain-shell-') && k !== SHELL).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function handleShare(request) {
  const form = await request.formData();
  const cache = await caches.open(SHARE);
  for (const k of await cache.keys()) await cache.delete(k);
  const files = form.getAll('files').filter((f) => f && typeof f === 'object' && f.size);
  let i = 0;
  for (const f of files.slice(0, 10)) {
    i += 1;
    await cache.put('/brain/shared/' + i, new Response(f, { headers: { 'Content-Type': f.type || 'application/octet-stream', 'X-Name': encodeURIComponent(f.name || ('file-' + i)) } }));
  }
  const q = new URLSearchParams({ share: '1', n: String(i) });
  ['title', 'text', 'url'].forEach((k) => { const v = form.get(k); if (v) q.set(k, String(v).slice(0, 4000)); });
  return Response.redirect('/brain?' + q.toString(), 303);
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  if (e.request.method === 'POST' && url.pathname === '/brain/share') { e.respondWith(handleShare(e.request)); return; }
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  if (url.pathname === '/brain' || url.pathname === '/brain.html') {
    // Network first (always the latest page), the cached shell when offline.
    e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(SHELL).then((c) => c.put('/brain', copy)); return r; })
      .catch(() => caches.match('/brain')));
  }
});
