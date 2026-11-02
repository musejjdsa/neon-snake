"use strict";
/* Neon Snake — core.js
 * Canvas, DOM references, and high-score storage. Loaded first.
 * Classic scripts, loaded in order from index.html, so they share
 * one global scope exactly as the original single file did.
 */
/* ================= NEON SNAKE ================= */
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const stage = document.getElementById("stage");
const bannerEl = document.getElementById("banner");

const ui = {
  score: document.getElementById("uiScore"),
  scoreWrap: document.getElementById("uiScoreWrap"),
  best: document.getElementById("uiBest"),
  bestWrap: document.getElementById("uiBestWrap"),
  wave: document.getElementById("uiWave"),
  itemLabel: document.getElementById("itemLabel"),
  gunPips: document.getElementById("gunPips"),
  shipPips: document.getElementById("shipPips"),
  hullPips: document.getElementById("hullPips"),
  rapid: document.getElementById("rapidTag"),
  itemSlots: document.getElementById("itemSlots"),
  ovStart: document.getElementById("ovStart"),
  ovPause: document.getElementById("ovPause"),
  ovOver: document.getElementById("ovOver"),
};

/* ---------- high score (local storage, as requested) ---------- */
const HS_KEY = "neon-snake-highscore";
let best = 0;
try { best = parseInt(localStorage.getItem(HS_KEY) || "0", 10) || 0; } catch (e) { best = 0; }
const saveBest = () => { try { localStorage.setItem(HS_KEY, String(best)); } catch (e) {} };
