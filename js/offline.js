/* ---------------- Offline play: network-first cache + service worker ----------------
 * Online: the service worker (sw.js) fetches the newest version
 * first, so updates are picked up as soon as they are published and the
 * game is never locked to an old cached copy. Its fresh responses are
 * written back into Cache Storage.
 * Offline: that cache is the fallback — once the game has been loaded
 * once, it opens and plays with no connection.
 * Everything here is best-effort and failure-proof: if the browser or
 * the hosting frame refuses service workers / Cache Storage, the game
 * itself is untouched and just plays as a normal web page. */
(() => {
  const CACHE_NAME = "neon-snake-v1"; /* keep in sync with CACHE_VERSION in sw.js */
  const FONT_CSS_URL = "https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Rajdhani:wght@500;600;700&display=swap";
  const STASH_URLS = [
    "./", "index.html", "css/style.css", "js/game.js", "js/offline.js", "sw.js",
    "manifest.webmanifest", "assets/icon-192.png", "assets/icon-512.png",
    "assets/icon-maskable-512.png", "assets/apple-touch-icon.png",
    FONT_CSS_URL
  ];
  const dot = document.getElementById("netDot");
  let cacheReady = false;

  const renderNetStatus = () => {
    if (!dot) return;
    const offline = !navigator.onLine;
    dot.classList.toggle("offline", offline);
    dot.classList.toggle("ready", !offline && cacheReady);
    const label = offline
      ? (cacheReady ? "Offline — playing from cache" : "Offline")
      : (cacheReady ? "Online — saved for offline play" : "Caching the game for offline play");
    dot.setAttribute("aria-label", label);
    dot.title = label;
  };

  /* Also cache the actual font files referenced by the font stylesheet,
   * so Orbitron / Rajdhani render offline too, not just the CSS. */
  const stashFonts = (cache) => {
    if (!navigator.onLine) return Promise.resolve();
    return fetch(FONT_CSS_URL)
      .then((res) => (res && res.ok ? res.text() : ""))
      .then((css) => {
        const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]))];
        return Promise.all(urls.map((u) => cache.add(u).catch(() => {})));
      })
      .catch(() => {});
  };

  /* Stash a copy of the game in Cache Storage from the page itself, so
   * the bytes are on the device even before / without a controlling
   * service worker. Individual adds: one failure sinks nothing. The
   * page's own readiness is settled before the (slower, optional) font
   * stash, so the status dot never waits on the network for fonts. */
  const stash = () => {
    if (!("caches" in window)) { renderNetStatus(); return; }
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        await Promise.all(STASH_URLS.map((u) => cache.add(u).catch(() => {})));
        let hit = await caches.match("index.html", { ignoreSearch: true }).catch(() => null);
        if (!hit) {
          /* Re-fetching the page was blocked or failed, but we are
           * looking at it: cache the live document itself. Only done
           * while the start screen is untouched, so the cached copy
           * is the pristine menu state. */
          try {
            const ov = document.getElementById("ovStart");
            if (ov && ov.classList.contains("on")) {
              const html = "<!doctype html>\n" + document.documentElement.outerHTML;
              const makeRes = () => new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
              await cache.put("index.html", makeRes());
              await cache.put("./", makeRes());
              hit = await caches.match("index.html", { ignoreSearch: true }).catch(() => null);
            }
          } catch (e) { /* synthetic stash unavailable — network stash may still land later */ }
        }
        if (hit) cacheReady = true;
        renderNetStatus();
        stashFonts(cache); /* fire-and-forget: fonts must not gate readiness */
      })
      .catch(() => { renderNetStatus(); });
  };

  /* Returning visitor: a previous visit may already have the cache. */
  if ("caches" in window) {
    caches.match("index.html", { ignoreSearch: true })
      .then((hit) => { if (hit) { cacheReady = true; renderNetStatus(); } })
      .catch(() => {});
  }

  let registration = null;
  const checkForUpdate = () => {
    /* Only meaningful online: ask the browser to re-fetch sw.js and
     * install any newer version it finds. Page loads are network-first,
     * so the fresh game itself is served (and re-cached) regardless. */
    if (registration && navigator.onLine) registration.update().catch(() => {});
  };

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      /* sw.js sits at the project root, next to this page, so its scope covers the game page itself and it can intercept navigations and serve the cached game offline. */
      navigator.serviceWorker.register("sw.js")
        .then((reg) => { registration = reg; checkForUpdate(); })
        .catch(() => { /* refused (e.g. embedded frame) — cache stash still applies */ });
    });
    window.addEventListener("focus", checkForUpdate);
    setInterval(checkForUpdate, 60 * 1000);
  }

  window.addEventListener("online", () => { renderNetStatus(); checkForUpdate(); stash(); });
  window.addEventListener("offline", renderNetStatus);

  stash();
  renderNetStatus();
})();
