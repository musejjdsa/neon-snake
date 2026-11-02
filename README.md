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
index.html              # Page markup; loads the game modules in order
css/
  style.css             # All game styling (HUD, stage, overlays, bottom bar)
js/
  core.js               # Canvas, DOM references, high-score storage
  audio.js              # Synth sound effects and generative background music
  background.js         # Stage geometry, serpentine path, Milky Way backdrop
  state.js              # Game state, item/head-tier tables, player and wave spawning
  combat.js             # Weapons, segment damage, missiles, shield, Repellant, pickups, attacks
  update.js             # Per-frame update: movement, collisions, timers
  render.js             # Canvas drawing: serpent, ships, drops, effects, HUD frame
  ui.js                 # HUD sync: pips, item slots, score, wave, best
  flow.js               # Fullscreen handling; start, pause, and game over
  input.js              # Keyboard, touch drag, double-tap, zoom prevention, gamepad
  main.js               # Bootstrapping and the main loop (loaded last)
  offline.js            # Offline caching: Cache Storage stash + service worker registration
sw.js                   # Service worker: network-first, cache fallback for offline play
manifest.webmanifest    # PWA manifest (name, theme, icons, start URL)
assets/
  apple-touch-icon.png  # 180x180 iOS touch icon
  icon-192.png          # 192x192 PWA icon
  icon-512.png          # 512x512 PWA icon
  icon-maskable-512.png # 512x512 maskable PWA icon
```

The game modules are classic scripts loaded in the order listed above, so they
share one global scope exactly as the original single file did. That keeps the
split a pure move — no behaviour changed — and each file can be reviewed on
its own. To change one area, edit only its file: sound in `audio.js`, the
serpent's attacks in `combat.js`, drawing in `render.js`, and so on.

High score is stored in the browser's local storage. No build step is needed.
