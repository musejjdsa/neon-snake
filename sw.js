/* Neon Snake — service worker
 *
 * Strategy: NETWORK-FIRST, always.
 * - When there is a connection, every request goes to the network first and
 *   the newest response is served (and written back into the cache). The
 *   game is never locked into an old cached copy while online, so updates
 *   are picked up on the next load.
 * - The cache is only a fallback for when the network is unreachable
 *   (offline / connection dropped), so a game that has been loaded once
 *   still opens and plays with no connection.
 *
 * Updates: bump CACHE_VERSION on each release. Old versioned caches are
 * deleted on activate; the new worker skips waiting and claims clients,
 * and because page loads are network-first the fresh version is what
 * gets served (and re-cached) as soon as it is published.
 */
var CACHE_VERSION = 'v1';
var CACHE_NAME = 'neon-snake-' + CACHE_VERSION;

/* The Google Fonts stylesheet for Orbitron / Rajdhani. Cached at runtime
 * (and best-effort at install) so the game's type also survives offline. */
var FONT_CSS_URL = 'https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Rajdhani:wght@500;600;700&display=swap';

/* Resolved relative to this worker's location (the project root). */
var PRECACHE_URLS = [
  './', 'index.html', 'css/style.css', 'js/game.js', 'js/offline.js',
  'manifest.webmanifest', 'assets/icon-192.png', 'assets/icon-512.png',
  'assets/icon-maskable-512.png', 'assets/apple-touch-icon.png',
  FONT_CSS_URL
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      /* Individual adds: one missing / uncacheable file must not sink
       * the whole install. */
      return Promise.all(PRECACHE_URLS.map(function (url) {
        return cache.add(url).catch(function () { /* skip uncacheable entry */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (name) {
        if (name.indexOf('neon-snake-') === 0 && name !== CACHE_NAME) {
          return caches.delete(name); /* clean up old versioned caches */
        }
        return Promise.resolve(false);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  /* NETWORK-FIRST for everything: online always wins and the fresh
   * response refreshes the cache. Only when the network fails do we
   * fall back to whatever is cached, so the game still opens offline. */
  event.respondWith(
    fetch(req).then(function (res) {
      if (res) {
        var url = new URL(req.url);
        var sameOrigin = url.origin === self.location.origin;
        var fontHost = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
        /* Cache good same-origin responses, plus font responses
         * (including opaque cross-origin ones) so type works offline. */
        if ((res.ok && (sameOrigin || fontHost)) || (fontHost && res.type === 'opaque')) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); });
        }
      }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) {
        if (hit) return hit;
        if (req.mode === 'navigate') {
          /* Offline navigation: serve the cached game page. */
          return caches.match('index.html', { ignoreSearch: true })
            .then(function (page) { return page || caches.match('./', { ignoreSearch: true }); });
        }
        return Response.error();
      });
    })
  );
});
