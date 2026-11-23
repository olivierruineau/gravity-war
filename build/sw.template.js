// Service worker (8.10) — gabarit : `build/pwaPlugin.js` remplace les deux marqueurs à la construction.
// Précache TOUS les fichiers du build : le jeu démarre hors ligne. Chaque build a son propre cache :
// l'installation d'un nouveau worker précache les nouveaux fichiers, l'activation supprime les anciens caches.
const BUILD_ID = '__BUILD_ID__';
const FILES = '__PRECACHE__';
const CACHE = `gravity-war-${BUILD_ID}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

// Réseau d'abord pour la page (une version fraîche dès qu'on est en ligne), cache sinon ; cache d'abord pour le reste
// (les fichiers de `assets/` ont un nom à empreinte : leur contenu ne change jamais).
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('./', { ignoreSearch: true, ignoreVary: true })),
    );
    return;
  }
  event.respondWith(
    caches.match(request, { ignoreVary: true }).then((hit) => hit ?? fetch(request)),
  );
});
