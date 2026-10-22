(() => {
  const root = new URL('../', document.currentScript.src);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(new URL('sw.js', root)).catch(() => {});
  }
  if (standalone) {
    navigator.storage?.persisted?.().then((persisted) => persisted || navigator.storage.persist()).catch(() => {});
  } else {
    document.querySelector('.install-banner')?.removeAttribute('hidden');
  }
  if (!('caches' in window)) return;

  saveSeason().catch(() => {}).finally(markSaved);

  // The service worker only sees requests from pages it controls, which excludes the very first launch.
  async function saveSeason() {
    const cache = await caches.open('season');
    const response = await fetch(root, { cache: 'no-cache' });
    if (!response.ok) return;
    const html = await response.clone().text();
    await cache.put(root, response);
    const latest = html.match(/data-latest="([^"]+)"/)?.[1];
    if (latest) await cache.add(new URL(latest, root));
  }

  async function markSaved() {
    for (const link of document.querySelectorAll('a[data-programme]')) {
      if (await caches.match(link.href, { ignoreSearch: true })) link.querySelector('.saved')?.removeAttribute('hidden');
    }
  }
})();
