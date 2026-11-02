"use strict";
/* Neon Snake — input.js
 * Keyboard, touch drag, double-tap, page-zoom prevention, and gamepad input.
 * Classic scripts, loaded in order from index.html, so they share
 * one global scope exactly as the original single file did.
 */
/* ---------- input ---------- */
const stagePos = (cx) => { const r = canvas.getBoundingClientRect(); return cx - r.left; };
const stagePoint = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
/* --- Relative drag + double-tap (touch-first, mouse-drag compatible) ---
   pointerdown only ANCHORS: it records where the finger landed and
   where the ship's target was. It never moves the ship to the finger.
   pointermove applies the finger's delta 1:1 to that anchored target.
   If the anchor started on/near the ship, the anchored ship target is
   lifted so the ship sits TOUCH_OFFSET_Y above the touch point —
   otherwise the natural gap (drag from anywhere) is preserved as-is.
   A double-tap is two short, near-stationary taps: it is recognised
   on pointerUP, and any move >14px cancels that tap's candidacy, so
   a drag — including the second half of a would-be double-tap that
   turns into a drag — never fires the item by accident. Firing the
   item does not move the ship: dragTarget is left exactly as it was. */
const TAP_MAX_MS = 280, TAP_MAX_MOVE = 14, DBL_WINDOW_MS = 340, DBL_MAX_DIST = 56;
const endDrag = (e, cancelled) => {
  if (!dragState || e.pointerId !== dragState.id) return;
  const ds = dragState;
  dragState = null; dragTarget = null;
  if (ds.isTouch) indicatorFade = { x: ds.curX, y: ds.curY, t: 0 };
  if (!ds.isTouch || cancelled || mode !== "play") { if (cancelled) lastTap = null; return; }
  const dur = performance.now() - ds.downTime;
  const isTap = !ds.moved && dur <= TAP_MAX_MS;
  if (!isTap) { lastTap = null; return; }
  const now = performance.now();
  if (lastTap && now - lastTap.time <= DBL_WINDOW_MS && Math.hypot(ds.curX - lastTap.x, ds.curY - lastTap.y) <= DBL_MAX_DIST) {
    lastTap = null;
    if (inventory.length) { dblFx.push({ x: ds.curX, y: ds.curY, t: 0 }); useItem(); }
  } else {
    lastTap = { time: now, x: ds.curX, y: ds.curY };
  }
};
canvas.addEventListener("pointerdown", (e) => {
  audio();
  if (dragState) return; /* one drag at a time; extra fingers ignored */
  const p = stagePoint(e);
  const isTouch = e.pointerType === "touch" || e.pointerType === "pen";
  if (!isTouch) pointerX = p.x;
  if (!player) return;
  const baseX = player.tx, baseY = player.ty == null ? player.y : player.ty;
  let shipY = baseY;
  /* Drag started on/near the ship: lift the anchor target so the ship
     rides above the thumb instead of underneath it. Drags starting
     anywhere else keep their existing separation — no jump. */
  if (isTouch && Math.hypot(p.x - player.x, p.y - player.y) < 72) {
    shipY = Math.min(baseY, Math.max(PLAYER_MIN_Y(), Math.min(PLAYER_MAX_Y(), p.y - TOUCH_OFFSET_Y)));
  }
  dragState = { id: e.pointerId, startX: p.x, startY: p.y, curX: p.x, curY: p.y, shipX: baseX, shipY, isTouch, downTime: performance.now(), moved: false };
  dragTarget = { x: baseX, y: shipY };
  indicatorFade = null;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
});
canvas.addEventListener("pointermove", (e) => {
  if (dragState && e.pointerId === dragState.id) {
    const p = stagePoint(e);
    dragState.curX = p.x; dragState.curY = p.y;
    if (Math.hypot(p.x - dragState.startX, p.y - dragState.startY) > TAP_MAX_MOVE) dragState.moved = true;
    /* 1:1 relative movement: ship delta == finger delta */
    dragTarget = { x: dragState.shipX + (p.x - dragState.startX), y: dragState.shipY + (p.y - dragState.startY) };
  } else if (e.pointerType === "mouse" && e.buttons === 0) {
    pointerX = stagePos(e.clientX); /* desktop hover-follow, unchanged */
  }
});
canvas.addEventListener("pointerup", (e) => endDrag(e, false));
canvas.addEventListener("pointercancel", (e) => endDrag(e, true));
canvas.addEventListener("touchmove", (e) => { e.preventDefault(); }, { passive: false });
window.addEventListener("keydown", (e) => {
  if (e.code === "ArrowLeft" || e.code === "KeyA") { keys.left = true; e.preventDefault(); }
  if (e.code === "ArrowRight" || e.code === "KeyD") { keys.right = true; e.preventDefault(); }
  if (e.code === "Space" || e.code === "KeyE") { e.preventDefault(); if (mode === "play") useItem(); else if (e.code === "Space" && (mode === "menu" || mode === "over")) startGame(); }
  if (e.code === "KeyP" || e.code === "Escape") { if (mode === "play" || mode === "pause") setPause(mode === "play"); }
  if (e.code === "KeyM") { toggleMusic(); }
  /* Start: Enter launches from the start screen and restarts from the
     game-over screen — no waiting for the overlay fade-in delay, and
     resumes from pause. */
  if (e.code === "Enter") { if (mode === "menu" || mode === "over") startGame(); else if (mode === "pause") setPause(false); }
});
window.addEventListener("keyup", (e) => {
  if (e.code === "ArrowLeft" || e.code === "KeyA") keys.left = false;
  if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = false;
});
document.getElementById("btnStart").addEventListener("click", startGame);
document.getElementById("btnRetry").addEventListener("click", startGame);
document.getElementById("btnResume").addEventListener("click", () => setPause(false));
document.getElementById("btnPause").addEventListener("click", () => { if (mode === "play" || mode === "pause") setPause(mode === "play"); });
document.getElementById("btnFullscreen").addEventListener("click", toggleFullscreen);
syncFullscreenUI();
/* ---------- Prevent page zoom ----------
   Viewport is locked in the meta tag and touch-action:none is set
   in CSS (which alone stops pinch + double-tap zoom in modern
   browsers). The guards below cover the browsers that ignore those:
   iOS Safari gesture events for pinch, multi-touch move, Ctrl+wheel
   and Ctrl/Cmd +/-/0 zoom shortcuts, and desktop double-click zoom.
   None of them cancel pointer events, clicks or single-finger drags,
   so the relative-drag steering and the custom double-tap-to-use-item
   gesture (recognised on pointerup in the drag code above) are
   untouched — a double-tap still fires the item, it just never zooms. */
document.addEventListener("gesturestart", (e) => e.preventDefault());
document.addEventListener("gesturechange", (e) => e.preventDefault());
document.addEventListener("gestureend", (e) => e.preventDefault());
document.addEventListener("touchmove", (e) => { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });
document.addEventListener("wheel", (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
document.addEventListener("dblclick", (e) => e.preventDefault());
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && (e.key === "+" || e.key === "-" || e.key === "=" || e.key === "0")) e.preventDefault();
});
/* Slot taps: a filled slot fires that item immediately; tapping an
   empty slot just moves the highlight to it. */
ui.itemSlots.addEventListener("click", (e) => {
  const b = e.target.closest(".slot");
  if (!b) return;
  const idx = parseInt(b.dataset.idx, 10);
  if (inventory[idx]) useItemAt(idx);
  else { selSlot = idx; syncItemUI(); }
});
const btnSound = document.getElementById("btnSound");
btnSound.addEventListener("click", () => {
  muted = !muted;
  document.getElementById("icoSndOn").style.display = muted ? "none" : "";
  document.getElementById("icoSndOff").style.display = muted ? "" : "none";
  if (!muted) audio();
});
/* Music has its own toggle, separate from the SFX mute above. The HUD
   button stays visible during play, pause and menus. First tap anywhere
   also kicks the music off (browser gesture requirement). */
document.getElementById("btnMusic").addEventListener("click", toggleMusic);
document.addEventListener("pointerdown", () => { if (musicOn) startMusic(); });
syncMusicUI();
document.addEventListener("visibilitychange", () => { if (document.hidden && mode === "play") setPause(true); });

/* ---------- gamepad (8BitDo & any standard-mapping pad) ----------
   Standard Gamepad API mapping: left stick axes 0/1, D-pad buttons
   12–15, L1/R1 (buttons 4/5) cycle the highlighted special-item slot,
   A/B (buttons 0/1) fire the highlighted slot's item, Start/Options
   button 9 starts / restarts from menus and pauses during play.
   Polled every frame from the main loop, so pause
   works while paused and detection needs no event first (some
   browsers only list a pad after a button press). Touch, mouse and
   keyboard are untouched and keep working alongside it. */
const padIndicatorEl = document.getElementById("padIndicator");
const syncPadUI = () => { if (padIndicatorEl) padIndicatorEl.classList.toggle("on", padSeen); };
const pollGamepad = () => {
  let gp = null;
  try {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) { if (p && p.connected) { gp = p; break; } }
  } catch (err) { gp = null; }
  const seen = !!gp;
  if (seen !== padSeen) { padSeen = seen; syncPadUI(); }
  if (!gp) { padVector = { x: 0, y: 0 }; padPrevFace = false; padPrevStart = false; padPrevLB = false; padPrevRB = false; return; }
  const dead = (v) => { const a = Math.abs(v || 0); return a < 0.16 ? 0 : Math.sign(v) * (a - 0.16) / 0.84; };
  let mx = dead(gp.axes && gp.axes[0]), my = dead(gp.axes && gp.axes[1]);
  const btn = (i) => !!(gp.buttons && gp.buttons[i] && gp.buttons[i].pressed);
  if (btn(14)) mx = -1; if (btn(15)) mx = 1;
  if (btn(12)) my = -1; if (btn(13)) my = 1;
  padVector = { x: Math.max(-1, Math.min(1, mx)), y: Math.max(-1, Math.min(1, my)) };
  /* L1 / R1 cycle the highlighted slot (edge-triggered, wraps). */
  const lb = btn(4), rb = btn(5);
  if (lb && !padPrevLB && mode === "play") cycleSelection(-1);
  if (rb && !padPrevRB && mode === "play") cycleSelection(1);
  padPrevLB = lb; padPrevRB = rb;
  /* A / B fire the highlighted slot's item. */
  const face = btn(0) || btn(1);
  if (face && !padPrevFace && mode === "play") useItem();
  padPrevFace = face;
  /* Start button (9): launches from the start screen, restarts from
     the game-over screen, and pauses / resumes during play. */
  const start = btn(9);
  if (start && !padPrevStart) {
    if (mode === "menu" || mode === "over") startGame();
    else if (mode === "play" || mode === "pause") setPause(mode === "play");
  }
  padPrevStart = start;
};
window.addEventListener("gamepadconnected", () => { padSeen = true; syncPadUI(); });
window.addEventListener("gamepaddisconnected", () => { padSeen = false; padVector = { x: 0, y: 0 }; syncPadUI(); });
syncPadUI();
