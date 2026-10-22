// Pages and programmes are never evicted; a season is well under 20 MB.
const PAGES = 'season';
const ASSETS = 'assets';

const PRECACHE = [
  'assets/programme.css',
  'assets/app.css',
  'assets/app.js',
  'assets/icons/icon-192.png',
  'assets/fonts/fraunces-latin-standard-normal.woff2',
  'assets/fonts/fraunces-latin-ext-standard-normal.woff2',
  'assets/fonts/fraunces-latin-standard-italic.woff2',
  'assets/fonts/fraunces-latin-ext-standard-italic.woff2',
  'assets/fonts/ibm-plex-sans-latin-400-normal.woff2',
  'assets/fonts/ibm-plex-sans-latin-ext-400-normal.woff2',
  'assets/fonts/ibm-plex-sans-latin-500-normal.woff2',
  'assets/fonts/ibm-plex-sans-latin-ext-500-normal.woff2',
  'assets/fonts/ibm-plex-sans-latin-600-normal.woff2',
  'assets/fonts/ibm-plex-sans-latin-ext-600-normal.woff2',
];

const SCOPE = new URL(self.registration.scope);
const PROGRAMME = /^programmes\/(\d{4}-\d{2}-\d{2})-[^/]+\/(index\.html)?$/;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(ASSETS).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;
  const path = url.pathname.slice(SCOPE.pathname.length);

  if (path === '' || path === 'index.html') {
    event.respondWith(networkFirst(event.request, PAGES));
    return;
  }
  const programme = path.match(PROGRAMME);
  if (programme) {
    event.respondWith(programme[1] < today() ? cacheFirst(event.request, PAGES) : networkFirst(event.request, PAGES));
    return;
  }
  if (path.startsWith('assets/') || path === 'install/') {
    event.respondWith(staleWhileRevalidate(event.request, ASSETS));
  }
});

async function networkFirst(request, name) {
  const cache = await caches.open(name);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    return (await cache.match(request, { ignoreSearch: true })) ?? Response.error();
  }
}

async function cacheFirst(request, name) {
  const cache = await caches.open(name);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request, name) {
  const cache = await caches.open(name);
  const cached = await cache.match(request, { ignoreSearch: true });
  const fresh = fetch(request).then(async (response) => {
    if (response.ok) await cache.put(request, response.clone());
    return response;
  });
  if (!cached) return fresh;
  fresh.catch(() => {});
  return cached;
}
