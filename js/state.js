"use strict";
/* Neon Snake — state.js
 * Game state, item and head-tier tables, player and wave spawning.
 * Classic scripts, loaded in order from index.html, so they share
 * one global scope exactly as the original single file did.
 */
/* ---------- game state ---------- */
const ITEM_DEFS = {
  gun:    { name: "BLASTER +", icon: "▸", color: "#2ee9ff", single: false },
  ship:   { name: "+ WING SHIP", icon: "✈", color: "#c44dff", single: false },
  rapid:  { name: "RAPID FIRE", icon: "⚡", color: "#ffe14d", single: false },
  bomb:   { name: "NOVA BOMB", icon: "✸", color: "#ff2b3e", single: true },
  chrono: { name: "CHRONO SLOW", icon: "◷", color: "#6ab8ff", single: true },
  repel:  { name: "REPELLANT", icon: "≋", color: "#3dff6e", single: true },
  missiles: { name: "TWIN MISSILES", icon: "⇈", color: "#ff9f1c", single: true },
  shield: { name: "FORCE BUBBLE", icon: "◎", color: "#59f7ff", single: true },
  hull:   { name: "HULL PATCH", icon: "✚", color: "#ff5b6a", single: false },
};
/* ---------- serpent head evolution ----------
   One form per wave, escalating in size, colour, spikes, fangs and
   glow. The collision radius (headR) is derived from the same scale
   as the drawing, so the visible skull and the hitbox grow together
   and stay fair: spikes/fangs sit outside the radius, the skull body
   sits inside it. Waves past the last form keep the APEX form and
   creep a little larger (capped in spawnWave). */
const HEAD_TIERS = [
  { name: "HATCHLING",   scale: 1.00, fill: "rgba(70,4,10,.92)",  stroke: "#ff4455", glow: "#ff2b3e", eye: "#ffd23e", pupil: "round", spikes: 0, spikeLen: 0,  fangs: false, hood: false, eyes4: false, cracks: false, aura: false },
  { name: "VIPER",       scale: 1.05, fill: "rgba(74,10,6,.93)",  stroke: "#ff6a3c", glow: "#ff4a2e", eye: "#ffb02e", pupil: "round", spikes: 2, spikeLen: 9,  fangs: false, hood: false, eyes4: false, cracks: false, aura: false },
  { name: "COBRA",       scale: 1.11, fill: "rgba(80,16,4,.93)",  stroke: "#ff7a2e", glow: "#ff6a1e", eye: "#ffcf3e", pupil: "slit",  spikes: 2, spikeLen: 13, fangs: true,  hood: true,  eyes4: false, cracks: false, aura: false },
  { name: "HYDRA",       scale: 1.17, fill: "rgba(64,6,26,.94)",  stroke: "#ff3e7a", glow: "#e83e8c", eye: "#7df9ff", pupil: "slit",  spikes: 4, spikeLen: 13, fangs: true,  hood: false, eyes4: true,  cracks: false, aura: true },
  { name: "WYVERN",      scale: 1.23, fill: "rgba(46,6,54,.94)",  stroke: "#c44dff", glow: "#b04dff", eye: "#ff5ea8", pupil: "slit",  spikes: 4, spikeLen: 17, fangs: true,  hood: false, eyes4: true,  cracks: false, aura: true },
  { name: "LEVIATHAN",   scale: 1.29, fill: "rgba(16,10,58,.94)", stroke: "#7a5cff", glow: "#6a5cff", eye: "#9beaff", pupil: "slit",  spikes: 6, spikeLen: 17, fangs: true,  hood: true,  eyes4: true,  cracks: false, aura: true },
  { name: "DREADNOUGHT", scale: 1.35, fill: "rgba(10,4,8,.96)",   stroke: "#ff2b3e", glow: "#ff2b3e", eye: "#ffffff", pupil: "slit",  spikes: 6, spikeLen: 20, fangs: true,  hood: false, eyes4: true,  cracks: true,  aura: true },
  { name: "APEX",        scale: 1.42, fill: "rgba(24,4,4,.96)",   stroke: "#ffb02e", glow: "#ff7a1e", eye: "#ff3b30", pupil: "slit",  spikes: 8, spikeLen: 21, fangs: true,  hood: false, eyes4: true,  cracks: true,  aura: true },
];
const rand = (a, b) => a + Math.random() * (b - a);
const pickItem = () => {
  const pool = [["gun", 22], ["ship", 17], ["rapid", 19], ["bomb", 15], ["chrono", 11], ["repel", 11], ["missiles", 10], ["shield", 9], ["hull", 10]];
  let tot = 0; for (const p of pool) tot += p[1];
  let x = Math.random() * tot;
  for (const p of pool) { x -= p[1]; if (x <= 0) return p[0]; }
  return "rapid";
};

let mode = "menu"; // menu | play | pause | over
let runId = 0; /* bumped by startGame so a pending next-wave timer from a previous run can never spawn a wave into a fresh run */
let score = 0, wave = 1, elapsed = 0, waveTime = 0, shake = 0, flash = 0;
let segments = [], bullets = [], drops = [], parts = [], popups = [], ebolts = [], departing = [], missiles = [], explosions = [], dustWalls = [];
let player = null, inventory = [], rapidT = 0, chronoT = 0, shieldT = 0, shieldHP = 0, shieldFlashT = 0;
let selSlot = 0; /* highlighted special-item slot: L1/R1 (and tapping an empty slot) move it; A/B, Space and double-tap fire it; tapping a filled slot fires that slot directly */
let atkT = 3, burstN = 0, burstT = 0, shotCount = 0;
let surgeT = 0, surgeWarnT = 0, nextSurge = 11, surgeMult = 1;
const WING_TIME = 18;
const SHIELD_TIME = 10, SHIELD_MAX_HP = 5;
const MISSILE_DAMAGE = 150, MISSILE_BLAST_R = 88;
/* Relative drag (touch): the ship moves by the finger's delta, never to
   the finger itself. dragState anchors touch + ship at drag start; the
   ship therefore keeps its offset above the thumb for the whole drag.
   dragTarget is the ship destination derived from that delta. */
const TOUCH_OFFSET_Y = 96; /* guaranteed clearance when a drag starts on/near the ship */
let pointerX = null, keys = {};
let dragState = null; /* { id, startX, startY, curX, curY, shipX, shipY } */
let dragTarget = null; /* { x, y } while dragging, else null */
let indicatorFade = null; /* { x, y, t } brief fade-out after release */
let dblFx = []; /* expanding amber rings confirming a double-tap item use */
let lastTap = null; /* { time, x, y } last short, near-stationary tap (touch) */
let padVector = { x: 0, y: 0 }; /* current gamepad move vector, -1..1 per axis */
let padSeen = false; /* a gamepad is currently detected */
let padPrevFace = false, padPrevStart = false, padPrevLB = false, padPrevRB = false; /* button edge detection */
const PLAYER_HOME_Y = () => H - 74;
const PLAYER_MIN_Y = () => Math.max(120, H - 230);
const PLAYER_MAX_Y = () => H - 52;
const stars = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), s: rand(0.4, 1.6), v: rand(6, 26) }));

const makePlayer = () => ({ x: W / 2, y: H - 74, tx: W / 2, ty: H - 74, gun: 1, wingShips: [], hull: 3, invT: 0, fireT: 0, thrust: 0 });
const shipOffsets = (n) => { const o = [0]; const seq = [-58, 58, -116, 116]; for (let i = 0; i < n; i++) o.push(seq[i]); return o; };
const wingCount = () => (player ? player.wingShips.length : 0);

const spawnWave = (n) => {
  /* Projectiles (player bullets + enemy bolts) and item drops carry
     over between waves: they must NOT vanish when a snake is killed,
     so they are deliberately not cleared here. A fresh run clears
     them in startGame() before it calls spawnWave(1). */
  wave = n; waveTime = 0;
  atkT = 3.4; burstN = 0; shotCount = 0; surgeT = 0; surgeWarnT = 0; nextSurge = rand(9, 13);
  segments = [];
  const count = Math.min(48, 27 + n * 4);
  const headHP = Math.round(1300 + n * 750);
  /* Vary this wave's descent origin along the top edge: pick an entry
     fraction along row 0 that is clearly different from the previous
     wave's (≥30% of the row width away, up to 12 tries), so consecutive
     waves never drop in from the same spot. */
  let entryFrac = Math.random() * 0.95;
  for (let tries = 0; tries < 12 && GEO.prevEntryFrac !== null && Math.abs(entryFrac - GEO.prevEntryFrac) < 0.3; tries++) entryFrac = Math.random() * 0.95;
  GEO.entryFrac = entryFrac; GEO.prevEntryFrac = entryFrac;
  /* This wave's head form: bigger and meaner every wave. headR scales
     with the drawing so the hitbox stays matched to the skull. */
  const tierIdx = Math.min(HEAD_TIERS.length - 1, Math.max(0, n - 1));
  const tier = HEAD_TIERS[tierIdx];
  const headScale = tier.scale + (n > HEAD_TIERS.length ? Math.min(0.08, (n - HEAD_TIERS.length) * 0.01) : 0);
  const headR = Math.round(34 * headScale);
  /* Spawn with the head's tip exactly on the top edge: centre one
     nose-length (36 × headScale) above the canvas top, directly above
     this wave's entry x. The whole body trails above and descends. */
  const entryS = -(GEO.topY + 36 * headScale);
  const head = { head: true, hp: headHP, max: headHP, s: entryS, sGoal: entryS, item: null, flashT: 0, x: entryXFor(), y: -36 * headScale, ang: Math.PI / 2, tier: tierIdx, headScale, headR };
  segments.push(head);
  let prevTierBase = 0;
  for (let i = 1; i < count; i++) {
    const roll = Math.random();
    let mult;
    if (roll < 0.42) mult = rand(0.75, 1.0); else if (roll < 0.8) mult = rand(1.0, 1.45); else mult = rand(1.5, 2.1);
    const base = (30 + n * 20) * mult;
    const hp = Math.round(base / 3) * 3;
    prevTierBase = hp;
    const item = Math.random() < 0.24 ? pickItem() : null;
    const sg = entryS - i * GEO.segGap;
    segments.push({ head: false, hp, max: hp, s: sg, sGoal: sg, item, flashT: 0, x: 0, y: -60, ang: 0 });
  }
  /* Evolution waves announce the new form by name; the HUD still
     shows the wave number. */
  showBanner(n >= 2 && n <= HEAD_TIERS.length ? tier.name : "WAVE " + n);
  sfx.wave();
};
const showBanner = (txt) => {
  bannerEl.textContent = txt;
  bannerEl.classList.remove("show"); void bannerEl.offsetWidth; bannerEl.classList.add("show");
};

const addScore = (n, x, y, label) => {
  score += n;
  if (x !== undefined) popups.push({ x, y, txt: label || ("+" + n), t: 0, life: 0.8, color: "#b6ffd0" });
};
const burst = (x, y, color, n, spd = 190) => {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = rand(spd * 0.25, spd);
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: rand(0.3, 0.75), color, r: rand(1.4, 3.4) });
  }
};
