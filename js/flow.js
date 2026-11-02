"use strict";
/* Neon Snake — flow.js
 * Fullscreen handling and run flow: start, pause, and game over.
 * Classic scripts, loaded in order from index.html, so they share
 * one global scope exactly as the original single file did.
 */
/* ---------- flow ---------- */
/* ---------- Fullscreen ----------
   Entered automatically when a run launches (startGame below) and
   toggleable any time from the HUD button: expand icon = enter,
   compress icon = the clear exit. Browsers only grant fullscreen
   on a user gesture and may still refuse (iframe policy, gamepad
   start, iPhone Safari) — every refusal is swallowed so the game
   always starts normally either way. */
const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
const syncFullscreenUI = () => {
  const btn = document.getElementById("btnFullscreen");
  if (!btn) return;
  const fs = isFullscreen();
  const enter = document.getElementById("icoFsEnter");
  const exit = document.getElementById("icoFsExit");
  if (enter) enter.style.display = fs ? "none" : "";
  if (exit) exit.style.display = fs ? "" : "none";
  btn.setAttribute("aria-label", fs ? "Exit fullscreen" : "Enter fullscreen");
  btn.title = fs ? "Exit fullscreen" : "Enter fullscreen";
};
const enterFullscreen = () => {
  if (isFullscreen()) return;
  const el = document.documentElement;
  try {
    if (el.requestFullscreen) {
      const p = el.requestFullscreen({ navigationUI: "hide" });
      if (p && p.catch) p.catch(() => {
        try { const q = el.requestFullscreen(); if (q && q.catch) q.catch(() => {}); } catch (e) {}
      });
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    }
  } catch (e) {
    try { const q = el.requestFullscreen && el.requestFullscreen(); if (q && q.catch) q.catch(() => {}); } catch (err) {}
  }
};
const exitFullscreen = () => {
  if (!isFullscreen()) return;
  try {
    if (document.exitFullscreen) { const p = document.exitFullscreen(); if (p && p.catch) p.catch(() => {}); }
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  } catch (e) {}
};
const toggleFullscreen = () => { if (isFullscreen()) exitFullscreen(); else enterFullscreen(); };
document.addEventListener("fullscreenchange", () => { syncFullscreenUI(); setTimeout(() => { try { resize(); } catch (e) {} }, 50); });
document.addEventListener("webkitfullscreenchange", () => { syncFullscreenUI(); setTimeout(() => { try { resize(); } catch (e) {} }, 50); });

const startGame = () => {
  runId++;
  audio(); startMusic(); enterFullscreen();
  score = 0; elapsed = 0; inventory = []; selSlot = 0; rapidT = 0; chronoT = 0;
  shieldT = 0; shieldHP = 0; shieldFlashT = 0;
  parts = []; popups = []; bullets = []; drops = []; ebolts = []; departing = []; missiles = []; explosions = []; dustWalls = [];
  player = makePlayer(); player.x = W / 2; player.tx = W / 2; player.y = H - 74; player.ty = H - 74;
  dragState = null; dragTarget = null; indicatorFade = null; lastTap = null; dblFx = [];
  mode = "play";
  ui.ovStart.classList.remove("on"); ui.ovOver.classList.remove("on"); ui.ovPause.classList.remove("on");
  syncPips(); syncItemUI();
  spawnWave(1);
};
const gameOver = (reason) => {
  mode = "over"; sfx.over();
  document.getElementById("overSub").textContent = reason === "hull" ? "SHOT DOWN" : "BREACHED";
  const head = segments[0];
  if (head) burst(head.x, head.y, "#ff2b3e", 70, 320);
  if (player) for (const o of shipOffsets(wingCount())) burst(player.x + o, player.y, "#ffffff", 18, 220);
  shake = 18;
  const isBest = score >= best && score > 0;
  if (score > best) { best = score; }
  saveBest();
  document.getElementById("finScore").textContent = fmt(score);
  document.getElementById("finWave").textContent = wave;
  document.getElementById("finBest").textContent = fmt(best);
  document.getElementById("newBest").style.display = isBest ? "block" : "none";
  document.getElementById("startBest").textContent = "★ " + fmt(best);
  setTimeout(() => { if (mode === "over") ui.ovOver.classList.add("on"); }, 650);
  syncItemUI();
};
const setPause = (p) => {
  if (p && mode === "play") { mode = "pause"; ui.ovPause.classList.add("on"); }
  else if (!p && mode === "pause") { mode = "play"; ui.ovPause.classList.remove("on"); }
  syncItemUI();
};
