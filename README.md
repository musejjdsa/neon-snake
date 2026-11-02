# Neon Snake

A neon retro vertical shooter: blast the descending serpent, grab the drops, and protect your hull.

## Run it

Serve the project root over HTTP (service workers and offline caching don't work from `file://`):

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000/>.

## Project structure

```
index.html              # Page markup; pulls in CSS and JS below
css/
  style.css             # All game styling (HUD, stage, overlays, bottom bar)
js/
  game.js               # Game logic: serpent, combat, items, input, drawing, UI sync
  offline.js            # Offline caching: Cache Storage stash + service worker registration
sw.js                   # Service worker: network-first, cache fallback for offline play
manifest.webmanifest    # PWA manifest (name, theme, icons, start URL)
assets/
  apple-touch-icon.png  # 180x180 iOS touch icon
  icon-192.png          # 192x192 PWA icon
  icon-512.png          # 512x512 PWA icon
  icon-maskable-512.png # 512x512 maskable PWA icon
```

High score is stored in the browser's local storage. No build step is needed.
