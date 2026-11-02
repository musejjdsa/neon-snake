"use strict";
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

/* ---------- audio (synth, media-safe) ---------- */
let AC = null, muted = false;
const audio = () => {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } }
  if (AC && AC.state === "suspended") AC.resume();
  return AC;
};
const tone = (f0, f1, dur, type, vol, when = 0) => {
  if (muted) return; const ac = audio(); if (!ac) return;
  const t = ac.currentTime + when, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
};
const sfx = {
  shoot() { tone(880 + Math.random() * 120, 320, 0.07, "square", 0.028); },
  hit() { tone(220, 140, 0.04, "sawtooth", 0.02); },
  pop(big) { tone(180, 40, big ? 0.4 : 0.18, "sawtooth", big ? 0.22 : 0.1); tone(90, 30, big ? 0.5 : 0.22, "triangle", big ? 0.3 : 0.14); },
  pickup() { tone(620, 1240, 0.12, "sine", 0.12); tone(930, 1560, 0.14, "sine", 0.08, 0.06); },
  item() { tone(300, 900, 0.25, "square", 0.1); },
  bomb() { tone(140, 24, 0.7, "sawtooth", 0.3); tone(70, 20, 0.8, "triangle", 0.32); },
  missile() { tone(180, 920, 0.34, "sawtooth", 0.12); tone(360, 1240, 0.28, "square", 0.05, 0.05); },
  shieldUp() { tone(240, 880, 0.32, "sine", 0.13); tone(480, 1180, 0.26, "triangle", 0.08, 0.07); },
  shieldHit() { tone(660, 210, 0.13, "square", 0.09); },
  /* Repellant whoosh: breathy filtered noise whose band sweeps up as
     the dust wall ascends the screen, with a soft airy sine under it.
     Duration matches the wall's bottom-to-top travel (~1.5s). */
  whoosh() {
    if (muted) return; const ac = audio(); if (!ac) return;
    const dur = 1.55, t = ac.currentTime;
    const len = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const white = Math.random() * 2 - 1; last = last * 0.72 + white * 0.28; data[i] = last * 1.9; }
    const src = ac.createBufferSource(); src.buffer = buf;
    const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 0.85;
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(2500, t + dur * 0.62);
    bp.frequency.exponentialRampToValueAtTime(820, t + dur);
    const hp = ac.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 240;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.294, t + 0.22);
    g.gain.setValueAtTime(0.294, t + dur * 0.58);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp); bp.connect(hp); hp.connect(g); g.connect(ac.destination);
    src.start(t); src.stop(t + dur + 0.05);
    tone(160, 690, dur * 0.78, "sine", 0.0245);
  },
  over() { tone(440, 55, 1.1, "sawtooth", 0.16); },
  wave() { tone(392, 392, 0.11, "square", 0.09); tone(523, 523, 0.11, "square", 0.09, 0.12); tone(784, 784, 0.2, "square", 0.1, 0.24); },
  spit() { tone(340, 80, 0.18, "sawtooth", 0.06); },
  hurt() { tone(170, 45, 0.32, "sawtooth", 0.2); tone(90, 30, 0.4, "triangle", 0.18); },
};

/* ---------- background music: dark ambient dreamscape (generative, Web Audio) ----------
   Independent of the SFX mute above: `muted` silences sound effects only,
   `musicOn` silences the music only. Both controls live side by side in the HUD.
   Browsers block audio before a user gesture, so the music fades in on the
   first tap / LAUNCH even though it defaults to ON. */
let musicOn = true;
let musicNodes = null; // { gain, filter, delay } once built
let musicChordTimer = null, musicSparkTimer = null, musicStep = 0;
const MUSIC_VOL = 0.38;
/* D-minor dreamscape progression: Dm(add9) · Bbmaj7 · Gm(add9) · Am7 */
const MUSIC_CHORDS = [
  [146.83, 174.61, 220.00, 329.63],
  [116.54, 146.83, 174.61, 220.00],
  [98.00, 116.54, 146.83, 220.00],
  [110.00, 130.81, 164.81, 196.00],
];
const MUSIC_SPARKLE = [587.33, 698.46, 880.00, 1046.50, 1174.66, 783.99];
const playPadChord = () => {
  if (!musicOn || !musicNodes || !AC) return;
  const ac = AC, t = ac.currentTime;
  const chord = MUSIC_CHORDS[musicStep % MUSIC_CHORDS.length]; musicStep++;
  for (const f of chord) {
    for (const det of [-5, 4]) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = det < 0 ? "sine" : "triangle"; o.frequency.value = f; o.detune.value = det;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.055, t + 2.8);
      g.gain.setValueAtTime(0.055, t + 6.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 11.2);
      o.connect(g); g.connect(musicNodes.filter); g.connect(musicNodes.delay);
      o.start(t); o.stop(t + 11.4);
    }
  }
};
const playSparkle = () => {
  if (!musicOn || !musicNodes || !AC) return;
  const ac = AC, t = ac.currentTime;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = "sine"; o.frequency.value = MUSIC_SPARKLE[Math.floor(Math.random() * MUSIC_SPARKLE.length)];
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.06, t + 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
  o.connect(g); g.connect(musicNodes.delay); g.connect(musicNodes.gain);
  o.start(t); o.stop(t + 2.6);
};
const scheduleSparkle = () => {
  if (musicSparkTimer) return;
  const tick = () => {
    musicSparkTimer = null;
    if (!musicOn) return;
    playSparkle();
    musicSparkTimer = setTimeout(tick, 2800 + Math.random() * 3800);
  };
  musicSparkTimer = setTimeout(tick, 1600);
};
const startMusic = () => {
  if (!musicOn) return;
  const ac = audio(); if (!ac) return;
  if (!musicNodes) {
    const gain = ac.createGain(); gain.gain.value = 0; gain.connect(ac.destination);
    const filter = ac.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 720; filter.Q.value = 0.6; filter.connect(gain);
    const lfo = ac.createOscillator(), lfoGain = ac.createGain();
    lfo.frequency.value = 0.07; lfoGain.gain.value = 220; lfo.connect(lfoGain); lfoGain.connect(filter.frequency); lfo.start();
    const delay = ac.createDelay(1.0); delay.delayTime.value = 0.42;
    const fb = ac.createGain(); fb.gain.value = 0.32;
    const wet = ac.createGain(); wet.gain.value = 0.22;
    delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(gain);
    musicNodes = { gain, filter, delay };
    /* low sub drone under the pads */
    for (const [f, v] of [[55, 0.05], [73.42, 0.06], [110, 0.03]]) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = "sine"; o.frequency.value = f; g.gain.value = v;
      o.connect(g); g.connect(filter); o.start();
    }
  }
  if (!musicChordTimer) { playPadChord(); musicChordTimer = setInterval(playPadChord, 9000); }
  scheduleSparkle();
  const t = ac.currentTime;
  musicNodes.gain.gain.cancelScheduledValues(t);
  musicNodes.gain.gain.setTargetAtTime(MUSIC_VOL, t, 1.2);
};
const stopMusic = () => {
  if (musicChordTimer) { clearInterval(musicChordTimer); musicChordTimer = null; }
  if (musicSparkTimer) { clearTimeout(musicSparkTimer); musicSparkTimer = null; }
  if (musicNodes && AC) {
    const t = AC.currentTime;
    musicNodes.gain.gain.cancelScheduledValues(t);
    musicNodes.gain.gain.setTargetAtTime(0, t, 0.25);
  }
};
const syncMusicUI = () => {
  const btn = document.getElementById("btnMusic");
  if (btn) { btn.classList.toggle("off", !musicOn); btn.setAttribute("aria-pressed", String(musicOn)); }
};
const toggleMusic = () => {
  musicOn = !musicOn;
  if (musicOn) startMusic(); else stopMusic();
  syncMusicUI();
};

/* ---------- layout / path geometry ---------- */
let W = 540, H = 700, DPR = 1;
let bgCanvas = null;
const GEO = { margin: 30, topY: 28, rowGap: 47, segGap: 47, turnR: 23.5, leftX: 0, rightX: 0, straight: 0, cycle: 0, entryFrac: 0, prevEntryFrac: null };
const computeGeo = () => {
  GEO.leftX = GEO.margin + GEO.turnR;
  GEO.rightX = W - GEO.margin - GEO.turnR;
  GEO.straight = GEO.rightX - GEO.leftX;
  GEO.cycle = GEO.straight + Math.PI * GEO.turnR;
};
const entryXFor = () => GEO.rightX - GEO.entryFrac * GEO.straight;
const pathPoint = (s, out) => {
  /* Entry: before the first row, the snake descends vertically from the
     top edge at this wave's entry x (GEO.entryFrac along row 0, varied
     per wave in spawnWave) — s = -(topY + 36) puts the head's centre
     36px above the canvas so its nose tip sits exactly on the top
     edge. At s = 0 the path is shifted by the same entry offset, so
     the head joins row 0 exactly beneath where it descended, then
     follows the usual serpentine from there. Seamless at any entry x. */
  const entryOffset = GEO.entryFrac * GEO.straight;
  if (s < 0) { out.x = entryXFor(); out.y = GEO.topY + s; out.row = 0; return out; }
  const sEff = s + entryOffset;
  const r = Math.floor(sEff / GEO.cycle), t = sEff - r * GEO.cycle, y0 = GEO.topY + r * GEO.rowGap;
  if (t < GEO.straight) {
    const u = t / GEO.straight;
    out.x = (r % 2 === 0) ? GEO.rightX - u * GEO.straight : GEO.leftX + u * GEO.straight;
    out.y = y0;
  } else {
    const v = (t - GEO.straight) / (Math.PI * GEO.turnR);
    const cy = y0 + GEO.rowGap / 2;
    if (r % 2 === 0) { const a = -Math.PI / 2 - v * Math.PI; out.x = GEO.leftX + GEO.turnR * Math.cos(a); out.y = cy + GEO.turnR * Math.sin(a); }
    else { const a = -Math.PI / 2 + v * Math.PI; out.x = GEO.rightX + GEO.turnR * Math.cos(a); out.y = cy + GEO.turnR * Math.sin(a); }
  }
  out.row = r; return out;
};
const defenseY = () => H - 118;

const buildBG = () => {
  bgCanvas = document.createElement("canvas");
  bgCanvas.width = Math.max(2, W * DPR); bgCanvas.height = Math.max(2, H * DPR);
  const b = bgCanvas.getContext("2d"); b.scale(DPR, DPR);
  b.fillStyle = "#02030a"; b.fillRect(0, 0, W, H);
  const neb = (x, y, r, c) => { const g = b.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, c); g.addColorStop(1, "rgba(0,0,0,0)"); b.fillStyle = g; b.fillRect(x - r, y - r, r * 2, r * 2); };
  const blob = (x, y, r, rgb, a) => {
    const g = b.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${a})`);
    g.addColorStop(0.55, `rgba(${rgb},${a * 0.45})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    b.fillStyle = g; b.fillRect(x - r, y - r, r * 2, r * 2);
  };
  /* very faint ambient washes — kept whisper-quiet so gameplay stays crisp */
  neb(W * 0.14, H * 0.12, W * 0.52, "rgba(32,72,78,0.13)");
  neb(W * 0.88, H * 0.38, W * 0.46, "rgba(58,44,84,0.11)");
  neb(W * 0.26, H * 0.84, W * 0.48, "rgba(28,58,48,0.10)");
  neb(W * 0.78, H * 0.92, W * 0.38, "rgba(84,48,44,0.07)");

  /* ---------- faint Milky Way ----------
     A single diagonal band, drawn in rotated space so its spine,
     clouds, dust lanes and dense micro-stars all share one axis.
     Everything is low-alpha and desaturated — ivory, silver-blue,
     pale lavender and a touch of dusty rose — for a minimal,
     elegant glow rather than a colourful nebula poster. */
  const diag = Math.hypot(W, H);
  const bandL = diag * 1.2, bandH = H * 0.54;
  const gauss = () => (Math.random() + Math.random() + Math.random()) / 3 - 0.5; /* -0.5..0.5, centre-weighted */
  b.save();
  b.translate(W * 0.52, H * 0.46);
  b.rotate(-0.52);
  b.globalCompositeOperation = "screen";
  /* broad luminous spine */
  const spine = b.createLinearGradient(0, -bandH * 0.62, 0, bandH * 0.62);
  spine.addColorStop(0, "rgba(190,205,235,0)");
  spine.addColorStop(0.30, "rgba(205,218,242,0.026)");
  spine.addColorStop(0.50, "rgba(246,243,236,0.064)");
  spine.addColorStop(0.70, "rgba(205,214,238,0.023)");
  spine.addColorStop(1, "rgba(190,205,235,0)");
  b.fillStyle = spine;
  b.fillRect(-bandL / 2, -bandH * 0.62, bandL, bandH * 1.24);
  /* narrower, softer core */
  const core = b.createLinearGradient(0, -bandH * 0.22, 0, bandH * 0.22);
  core.addColorStop(0, "rgba(255,252,244,0)");
  core.addColorStop(0.5, "rgba(255,252,244,0.050)");
  core.addColorStop(1, "rgba(255,252,244,0)");
  b.fillStyle = core;
  b.fillRect(-bandL / 2, -bandH * 0.22, bandL, bandH * 0.44);
  /* nebular clouds clustered along the spine */
  const cloudTones = ["218,226,248", "196,214,238", "232,222,240", "246,238,226", "206,232,226", "240,224,222"];
  for (let i = 0; i < 120; i++) {
    const x = (Math.random() - 0.5) * bandL;
    const y = gauss() * bandH * 1.05;
    const r = 22 + Math.random() * 96;
    const tone = cloudTones[Math.floor(Math.random() * cloudTones.length)];
    blob(x, y, r, tone, 0.013 + Math.random() * 0.027);
  }
  /* a few slightly larger, dreamier veils for depth */
  for (let i = 0; i < 16; i++) {
    const x = (Math.random() - 0.5) * bandL * 0.9;
    const y = gauss() * bandH * 0.8;
    blob(x, y, 90 + Math.random() * 130, cloudTones[i % cloudTones.length], 0.011 + Math.random() * 0.010);
  }
  b.globalCompositeOperation = "source-over";
  /* dark dust lanes — faint silhouettes that give the band its shape */
  for (let i = 0; i < 30; i++) {
    const x = (Math.random() - 0.5) * bandL;
    const y = gauss() * bandH * 0.55 + bandH * 0.06;
    const r = 26 + Math.random() * 78;
    const g = b.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(2,3,10,0.13)");
    g.addColorStop(1, "rgba(2,3,10,0)");
    b.fillStyle = g;
    b.save(); b.translate(x, y); b.scale(1, 0.38); b.translate(-x, -y);
    b.fillRect(x - r, y - r, r * 2, r * 2); b.restore();
  }
  /* dense micro-stars that make the band read as the Milky Way */
  for (let i = 0; i < 340; i++) {
    const x = (Math.random() - 0.5) * bandL;
    const y = gauss() * bandH * 1.15;
    const warm = Math.random() < 0.22;
    b.globalAlpha = 0.10 + Math.random() * 0.42;
    b.fillStyle = warm ? "#ffeeda" : (Math.random() < 0.3 ? "#cfe4ff" : "#ffffff");
    const s = Math.random() < 0.06 ? 1.5 : (Math.random() < 0.4 ? 1 : 0.7);
    b.fillRect(x, y, s, s);
  }
  /* a handful of brighter anchor stars inside the band, with a soft halo */
  for (let i = 0; i < 14; i++) {
    const x = (Math.random() - 0.5) * bandL * 0.92;
    const y = gauss() * bandH * 0.9;
    b.globalAlpha = 1;
    blob(x, y, 9 + Math.random() * 8, "235,242,255", 0.10);
    b.globalAlpha = 0.55 + Math.random() * 0.35;
    b.fillStyle = "#ffffff";
    b.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
  }
  b.restore();
  b.globalAlpha = 1; b.globalCompositeOperation = "source-over";

  /* sparse general starfield outside the band */
  for (let i = 0; i < 110; i++) {
    b.globalAlpha = 0.18 + Math.random() * 0.62;
    b.fillStyle = Math.random() < 0.12 ? "#9beaff" : "#ffffff";
    const r = Math.random() < 0.07 ? 1.7 : 1;
    b.fillRect(Math.random() * W, Math.random() * H, r, r);
  }
  b.globalAlpha = 1;
  /* gentle vignette to keep the edges calm and focused */
  const vig = b.createRadialGradient(W / 2, H * 0.46, Math.min(W, H) * 0.32, W / 2, H * 0.5, Math.max(W, H) * 0.78);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,6,0.34)");
  b.fillStyle = vig; b.fillRect(0, 0, W, H);
};
const resize = () => {
  const r = stage.getBoundingClientRect();
  W = Math.max(300, r.width); H = Math.max(380, r.height);
  DPR = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = W * DPR; canvas.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  computeGeo(); buildBG();
  if (player) {
    player.x = Math.min(Math.max(player.x, 40), W - 40);
    player.tx = Math.min(Math.max(player.tx, 40), W - 40);
    if (player.ty == null) player.ty = player.y;
    player.y = Math.min(Math.max(player.y, Math.max(120, H - 230)), H - 52);
    player.ty = Math.min(Math.max(player.ty, Math.max(120, H - 230)), H - 52);
  }
};
window.addEventListener("resize", resize);

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

/* ---------- combat ---------- */
const GUN_STREAMS = { 1: [0], 2: [-7, 7], 3: [-12, 0, 12], 4: [-15, -5, 5, 15], 5: [-17, -8, 0, 8, 17], 6: [-19, -10, 0, 10, 19] };
const fireShips = (dt) => {
  player.fireT -= dt;
  const interval = (rapidT > 0 ? 0.062 : 0.108);
  if (player.fireT > 0) return;
  player.fireT = interval;
  const offs = shipOffsets(wingCount());
  const streams = GUN_STREAMS[player.gun];
  const dmg = 6 + player.gun * 2;
  for (const o of offs) {
    const sx = player.x + o, sy = player.y - 18;
    for (const so of streams) {
      const spread = so * 0.006;
      bullets.push({ x: sx + so, y: sy, vx: Math.sin(spread) * 620, vy: -Math.cos(spread) * 620, dmg, heavy: player.gun >= 5 && so === 0, t: 0 });
    }
  }
  sfx.shoot();
};

const destroySegment = (idx) => {
  const seg = segments[idx];
  const color = seg.head ? HEAD_TIERS[seg.tier || 0].glow : (seg.item ? ITEM_DEFS[seg.item].color : "#eaf6ff");
  burst(seg.x, seg.y, color, seg.head ? 60 : 22, seg.head ? 300 : 210);
  if (seg.item) drops.push({ x: seg.x, y: seg.y, vy: 60, type: seg.item, t: 0 });
  if (seg.head) {
    sfx.pop(true); shake = Math.max(shake, 16); flash = 0.7;
    addScore(1000 + wave * 250, seg.x, seg.y, "+" + (1000 + wave * 250));
    /* Only the snake is removed. In-flight projectiles (bullets and
       enemy bolts) and falling item drops stay alive across the kill
       and into the next wave — nothing else is cleared here. */
    segments = [];
    const rid = runId;
    setTimeout(() => { if (mode === "play" && rid === runId) { score += wave * 100; spawnWave(wave + 1); } }, 900);
    return;
  }
  sfx.pop(false); shake = Math.max(shake, 4);
  addScore(seg.max + 25, seg.x, seg.y);
  /* shift every segment on the head side back one slot — body stays contiguous */
  for (let i = 0; i < idx; i++) segments[i].sGoal -= GEO.segGap;
  segments.splice(idx, 1);
};

/* ---------- twin missiles + force bubble ---------- */
const shieldGeometry = () => {
  if (!player) return null;
  const offs = shipOffsets(wingCount());
  const lo = Math.min(...offs), hi = Math.max(...offs);
  return { x: player.x + (lo + hi) / 2, y: player.y - 2, rx: (hi - lo) / 2 + 50, ry: 54 };
};
const damageSegment = (seg, dmg, color = "#ffb02e") => {
  if (!seg || !segments.includes(seg)) return;
  const applied = Math.min(dmg, Math.max(0, seg.hp));
  seg.hp -= dmg; seg.flashT = 0.13; score += applied;
  burst(seg.x, seg.y, color, 4, 175);
  if (seg.hp <= 0) {
    const idx = segments.indexOf(seg);
    if (idx >= 0) destroySegment(idx);
  }
};
const explodeMissile = (m) => {
  explosions.push({ x: m.x, y: m.y, t: 0, life: 0.52, r: MISSILE_BLAST_R });
  burst(m.x, m.y, "#ffffff", 18, 260);
  burst(m.x, m.y, "#ffb02e", 34, 340);
  burst(m.x, m.y, "#ff5b3e", 22, 300);
  burst(m.x, m.y, "#59f7ff", 10, 210);
  flash = Math.max(flash, 0.42); shake = Math.max(shake, 12);
  sfx.bomb(); tone(96, 26, 0.52, "triangle", 0.2);
  const targets = segments
    .filter((seg) => Math.hypot(seg.x - m.x, seg.y - m.y) <= MISSILE_BLAST_R + (seg.head ? Math.max(26, (seg.headR || 34) - 4) : 22))
    .sort((a, b) => segments.indexOf(b) - segments.indexOf(a));
  for (const seg of targets) {
    if (!segments.includes(seg)) continue;
    const d = Math.hypot(seg.x - m.x, seg.y - m.y);
    const dmg = Math.round(MISSILE_DAMAGE - Math.min(1, d / (MISSILE_BLAST_R + 30)) * 72);
    damageSegment(seg, dmg, "#ffb02e");
    if (!segments.length) break;
  }
};
const pickMissileTarget = (x, y, avoid = null) => {
  if (!segments.length) return null;
  const candidates = segments
    .map((seg, idx) => ({ seg, idx, d: Math.hypot(seg.x - x, seg.y - y) }))
    .filter((c) => c.seg.y > -42 && c.seg.y < H - 64)
    .sort((a, b) => a.d - b.d);
  if (!candidates.length) return segments[0];
  if (avoid) {
    const avoidIdx = segments.indexOf(avoid);
    const separated = candidates.find((c) => c.seg !== avoid && Math.abs(c.idx - avoidIdx) >= 3);
    if (separated) return separated.seg;
    const other = candidates.find((c) => c.seg !== avoid);
    if (other) return other.seg;
  }
  return candidates[0].seg;
};
const launchTwinMissiles = () => {
  let firstTarget = null;
  for (const side of [-1, 1]) {
    const x = player.x + side * 17, y = player.y - 25;
    const target = pickMissileTarget(x, y, firstTarget);
    if (!firstTarget) firstTarget = target;
    missiles.push({
      x, y, vx: 0, vy: -455, ang: -Math.PI / 2 + side * 0.18,
      t: 0, life: 4.2, side, phase: side < 0 ? 0 : Math.PI,
      target, spread: side > 0, trailT: 0, speed: 455,
    });
  }
  sfx.missile();
  popups.push({ x: player.x, y: player.y - 48, txt: "⇈ ×2", t: 0, life: 0.95, color: ITEM_DEFS.missiles.color });
};
const updateMissiles = (dt) => {
  for (let i = missiles.length - 1; i >= 0; i--) {
    const m = missiles[i];
    m.t += dt; m.life -= dt;
    if (!m.target || !segments.includes(m.target)) m.target = pickMissileTarget(m.x, m.y);
    if (m.spread && m.target) {
      const sibling = missiles.find((other) => other !== m && other.target === m.target);
      if (sibling) {
        const separated = pickMissileTarget(m.x, m.y, m.target);
        if (separated && separated !== m.target) m.target = separated;
      }
    }
    const desired = m.target ? Math.atan2(m.target.y - m.y, m.target.x - m.x) : -Math.PI / 2;
    const diff = Math.atan2(Math.sin(desired - m.ang), Math.cos(desired - m.ang));
    const maxTurn = 4.6 * dt;
    m.ang += Math.max(-maxTurn, Math.min(maxTurn, diff));
    const wave = Math.sin(m.t * 9 + m.phase) * 180;
    m.vx = Math.cos(m.ang) * m.speed - Math.sin(m.ang) * wave;
    m.vy = Math.sin(m.ang) * m.speed + Math.cos(m.ang) * wave;
    m.x += m.vx * dt; m.y += m.vy * dt;
    m.trailT -= dt;
    if (m.trailT <= 0) {
      m.trailT = 0.022;
      parts.push({ x: m.x - Math.cos(m.ang) * 13 + rand(-2, 2), y: m.y - Math.sin(m.ang) * 13 + rand(-2, 2), vx: rand(-24, 24), vy: rand(12, 52), t: 0, life: rand(0.2, 0.42), color: Math.random() < 0.55 ? "#ffb02e" : "#ffe14d", r: rand(1.6, 3.2) });
    }
    let hit = null;
    for (const seg of segments) {
      const R = seg.head ? (seg.headR || 34) + 2 : 26;
      if (Math.hypot(seg.x - m.x, seg.y - m.y) < R + 9) { hit = seg; break; }
    }
    if (hit || m.life <= 0) { explodeMissile(m); missiles.splice(i, 1); continue; }
    if (m.x < -80 || m.x > W + 80 || m.y < -90 || m.y > H + 50) missiles.splice(i, 1);
  }
};

/* ---------- Repellant: green cosmic dust wall ----------
   Using a Repellant raises a wall of cosmic dust from the bottom of
   the screen. It ascends the full height of the field, translucent
   layered greens with glimmering dust pixels, and the moment its
   leading edge reaches the serpent the whole snake is shoved back
   four segment gaps along its path. The wall itself is harmless to
   the fleet — it passes over the ships on its way up. */
const DUST_GREENS = ["#3dff6e", "#7cffb2", "#a8ffd1", "#1ed760", "#00e676", "#69f0ae", "#b9fbc0", "#2eea7a", "#8affc1", "#00c853", "#ccffdd", "#4dff88"];
const DUST_BLOBS = ["61,255,110", "0,230,118", "168,255,209", "30,215,96", "105,240,174", "46,234,122"];
const spawnDustWall = () => {
  const motes = [];
  const count = Math.max(170, Math.floor(W * 0.5));
  for (let i = 0; i < count; i++) {
    motes.push({
      fx: Math.random(), oy: Math.pow(Math.random(), 0.85),
      size: Math.random() < 0.12 ? rand(2.2, 3.4) : rand(0.8, 2.1),
      color: DUST_GREENS[Math.floor(Math.random() * DUST_GREENS.length)],
      phase: rand(0, Math.PI * 2), tw: rand(2.4, 7), a: rand(0.35, 1), drift: rand(0.5, 1.6),
    });
  }
  const blobs = [];
  for (let i = 0; i < 14; i++) blobs.push({ fx: Math.random(), oy: Math.random(), r: rand(26, 74), rgb: DUST_BLOBS[i % DUST_BLOBS.length], a: rand(0.05, 0.12) });
  dustWalls.push({ front: H + 14, height: 134, t: 0, speed: 545, contacted: false, motes, blobs });
  sfx.whoosh();
};
const updateDustWalls = (dt) => {
  for (let i = dustWalls.length - 1; i >= 0; i--) {
    const w = dustWalls[i];
    w.t += dt; w.front -= w.speed * dt;
    if (!w.contacted && segments.length) {
      const hit = segments.find((sg) => { const R = sg.head ? (sg.headR || 34) : 24; return sg.y + R >= w.front && sg.y - R <= w.front + w.height; });
      if (hit) {
        w.contacted = true;
        /* the shove: every segment's goal steps back together, so the
           body stays contiguous while the snake eases back up-path */
        for (const sg of segments) sg.sGoal -= GEO.segGap * 4;
        burst(hit.x, hit.y, "#3dff6e", 34, 280);
        burst(hit.x, hit.y, "#a8ffd1", 16, 190);
        shake = Math.max(shake, 6);
        tone(220, 840, 0.32, "sine", 0.07);
        popups.push({ x: hit.x, y: hit.y - 42, txt: "≋", t: 0, life: 0.9, color: "#3dff6e" });
      }
    }
    if (w.front + w.height < -24) dustWalls.splice(i, 1);
  }
};
const drawDustWalls = () => {
  for (const w of dustWalls) {
    const top = w.front, hgt = w.height;
    const fadeIn = Math.min(1, w.t / 0.12);
    const fadeOut = Math.max(0, Math.min(1, (top + hgt) / 130));
    const alpha = fadeIn * fadeOut;
    if (alpha <= 0) continue;
    ctx.save();
    ctx.globalAlpha = alpha;
    /* wavy-edged translucent band in layered hues of green — the
       serpent and stars stay visible through it */
    const waveY = (x) => top + Math.sin(x * 0.021 + w.t * 3.4) * 5 + Math.sin(x * 0.008 - w.t * 2.1) * 3;
    ctx.beginPath();
    ctx.moveTo(-4, waveY(-4));
    for (let x = 20; x <= W + 4; x += 24) ctx.lineTo(x, waveY(x));
    ctx.lineTo(W + 4, top + hgt); ctx.lineTo(-4, top + hgt); ctx.closePath();
    const grad = ctx.createLinearGradient(0, top - 6, 0, top + hgt);
    grad.addColorStop(0, "rgba(185,251,192,.38)");
    grad.addColorStop(0.16, "rgba(61,255,110,.26)");
    grad.addColorStop(0.42, "rgba(0,230,118,.17)");
    grad.addColorStop(0.7, "rgba(30,215,96,.11)");
    grad.addColorStop(1, "rgba(61,255,110,0)");
    ctx.fillStyle = grad; ctx.fill();
    /* soft nebula blobs drifting inside the band, varied greens */
    for (const b of w.blobs) {
      const bx = b.fx * W + Math.sin(w.t * 0.7 + b.fx * 9) * 8, by = top + b.oy * hgt;
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, b.r);
      g.addColorStop(0, `rgba(${b.rgb},${b.a})`); g.addColorStop(1, `rgba(${b.rgb},0)`);
      ctx.fillStyle = g; ctx.fillRect(bx - b.r, by - b.r, b.r * 2, b.r * 2);
    }
    /* glimmering dust pixels — each twinkles on its own phase */
    for (const m of w.motes) {
      const tw = 0.3 + 0.7 * Math.abs(Math.sin(elapsed * m.tw + m.phase));
      ctx.globalAlpha = alpha * tw * m.a;
      ctx.fillStyle = m.color;
      const mx = m.fx * W + Math.sin(elapsed * m.drift + m.phase) * 5;
      const my = top + m.oy * hgt + Math.sin(elapsed * 1.7 + m.phase) * 2;
      ctx.fillRect(mx, my, m.size, m.size);
    }
    /* bright shimmering leading edge */
    ctx.globalAlpha = alpha * 0.85;
    ctx.beginPath();
    ctx.moveTo(-4, waveY(-4));
    for (let x = 20; x <= W + 4; x += 24) ctx.lineTo(x, waveY(x));
    ctx.strokeStyle = "rgba(190,255,214,.75)"; ctx.lineWidth = 2;
    ctx.shadowColor = "#3dff6e"; ctx.shadowBlur = 16; ctx.stroke();
    ctx.restore();
  }
};

const applyPickup = (type, x, y) => {
  const def = ITEM_DEFS[type];
  sfx.pickup();
  if (type === "gun") {
    if (player.gun < 6) { player.gun++; popups.push({ x, y, txt: "▸ LV" + player.gun, t: 0, life: 1.1, color: def.color }); }
    else { addScore(400, x, y, "+400"); }
  } else if (type === "ship") {
    if (player.wingShips.length < 4) { player.wingShips.push({ t: WING_TIME, hp: 3, maxHp: 3, flashT: 0 }); popups.push({ x, y, txt: "✈ 18s", t: 0, life: 1.1, color: def.color }); }
    else addScore(400, x, y, "+400");
  } else if (type === "rapid") {
    rapidT = 9; popups.push({ x, y, txt: "⚡!", t: 0, life: 1.1, color: def.color });
  } else if (type === "hull") {
    if (player.hull < 3) { player.hull++; popups.push({ x, y, txt: "✚ +1", t: 0, life: 1.1, color: def.color }); }
    else addScore(300, x, y, "+300");
  } else if (def.single) {
    if (inventory.length < 5) { inventory.push(type); popups.push({ x, y, txt: def.icon + " +1", t: 0, life: 1.1, color: def.color }); }
    else addScore(250, x, y, "+250");
  }
  syncItemUI(); syncPips();
};

/* Visible slot count: 3 empty slots from the start, growing to the
   5-slot inventory cap as more specials are held than fit. */
const slotCount = () => Math.min(5, Math.max(3, inventory.length));
const cycleSelection = (dir) => {
  const n = slotCount();
  selSlot = (((selSlot + dir) % n) + n) % n;
  tone(540, 780, 0.06, "square", 0.045);
  syncItemUI();
};
/* Fire the item in one specific slot (tap a slot). The no-arg useItem
   below fires the highlighted slot instead (A/B, Space, double-tap). */
const useItemAt = (idx) => {
  if (mode !== "play") return;
  const type = inventory[idx];
  if (!type) return;
  inventory.splice(idx, 1);
  if (idx < selSlot) selSlot--;
  if (selSlot >= inventory.length) selSlot = Math.max(0, inventory.length - 1);
  const def = ITEM_DEFS[type];
  sfx.item();
  if (type === "bomb") {
    sfx.bomb(); flash = 0.85; shake = Math.max(shake, 14);
    for (let i = segments.length - 1; i >= 0; i--) {
      const sg = segments[i];
      const d = sg.head ? 340 : 75;
      sg.hp -= d; addScore(Math.min(d, Math.max(0, sg.hp + d)) > 0 ? 0 : 0); score += Math.min(d, sg.max);
      burst(sg.x, sg.y, "#ffb02e", 5, 160);
      if (sg.hp <= 0) { destroySegment(i); if (!segments.length) break; }
    }
    popups.push({ x: W / 2, y: H * 0.4, txt: "✸", t: 0, life: 1.2, color: def.color });
  } else if (type === "chrono") {
    chronoT = 6;
    popups.push({ x: W / 2, y: H * 0.4, txt: "◷", t: 0, life: 1.2, color: def.color });
  } else if (type === "repel") {
    /* No instant shove anymore: the dust wall rises from the bottom
       of the screen and pushes the serpent back when it reaches it. */
    spawnDustWall();
    popups.push({ x: W / 2, y: H * 0.4, txt: "≋", t: 0, life: 1.2, color: def.color });
  } else if (type === "missiles") {
    launchTwinMissiles();
  } else if (type === "shield") {
    shieldT = SHIELD_TIME; shieldHP = SHIELD_MAX_HP; shieldFlashT = 0.28;
    sfx.shieldUp();
    popups.push({ x: player.x, y: player.y - 52, txt: "◎", t: 0, life: 1.1, color: def.color });
  }
  syncItemUI();
};
const useItem = () => useItemAt(selSlot);

/* ---------- serpent attacks ---------- */
const fireBolt = (x, y, ang, spd) => { ebolts.push({ x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, t: 0 }); };
/* The serpent mostly aims at the main ship, but sometimes picks a wing —
   that's how wings take their own damage in normal play. */
const aimPoint = () => {
  if (player && player.wingShips.length && Math.random() < 0.28) {
    const offs = shipOffsets(player.wingShips.length);
    const idx = 1 + Math.floor(Math.random() * player.wingShips.length);
    return { x: player.x + offs[idx], y: player.y };
  }
  return { x: player.x, y: player.y };
};
const updateHeadAttack = (dt) => {
  const head = segments[0];
  if (!head || head.y < 8 || !player) return;
  const spd = 215 + wave * 10, fx = head.x, fy = head.y + 24;
  /* burst follow-up shots (wave 3+) track the player between rounds */
  if (burstN > 0) {
    burstT -= dt;
    if (burstT <= 0) {
      burstT = 0.14; burstN--;
      const apB = aimPoint();
      fireBolt(fx, fy, Math.atan2(apB.y - fy, apB.x - fx) + rand(-0.04, 0.04), spd);
      sfx.spit();
    }
    return;
  }
  atkT -= dt;
  if (atkT > 0) return;
  atkT = Math.max(1.1, 2.7 - wave * 0.17) * rand(0.85, 1.15);
  shotCount++;
  const ap = aimPoint();
  const aim = Math.atan2(ap.y - fy, ap.x - fx);
  if (wave >= 5 && shotCount % 4 === 0) {
    /* venom fan */
    for (let k = -2; k <= 2; k++) fireBolt(fx, fy, aim + k * 0.17, spd * 0.92);
    sfx.spit();
  } else if (wave >= 3) {
    fireBolt(fx, fy, aim, spd); sfx.spit();
    burstN = 2; burstT = 0.14;
  } else {
    fireBolt(fx, fy, aim + rand(-0.05, 0.05), spd);
    sfx.spit();
  }
};
/* Wing escorts ARE destructible and have their own hull (3 hits each),
   kept completely separate from the main ship: a bolt that hits a wing
   damages / destroys only that wing — it never touches player.hull,
   never drops the main blaster, and can never end the run. Wings also
   still leave when their 18-second escort timer runs out. */
const damageWing = (idx, bx, by) => {
  const w = player && player.wingShips[idx];
  if (!w) return;
  if (w.hp == null) { w.hp = 3; w.maxHp = 3; }
  w.hp--; w.flashT = 0.22;
  const offsNow = shipOffsets(player.wingShips.length);
  const wx = player.x + (offsNow[idx + 1] || 0);
  burst(bx, by, "#c44dff", 9, 165);
  burst(wx, player.y, "#ff5b6a", 5, 130);
  tone(240, 90, 0.14, "sawtooth", 0.1);
  if (w.hp <= 0) {
    burst(wx, player.y, "#c44dff", 26, 245);
    burst(wx, player.y, "#ffffff", 10, 180);
    popups.push({ x: wx, y: player.y - 34, txt: "✈ ✸", t: 0, life: 0.9, color: "#c44dff" });
    player.wingShips.splice(idx, 1);
    syncPips();
  } else {
    popups.push({ x: wx, y: player.y - 34, txt: "✈ −1", t: 0, life: 0.7, color: "#ff8fa3" });
  }
  /* Deliberately no player.hull / player.gun change here. */
};
const hitPlayer = () => {
  burst(player.x, player.y, "#ff5b6a", 14, 200);
  if (player.invT > 0) return;
  player.hull--; player.invT = 1.1;
  player.gun = Math.max(1, player.gun - 1);
  shake = Math.max(shake, 9); flash = Math.max(flash, 0.25);
  sfx.hurt();
  syncPips();
  if (player.hull <= 0) { gameOver("hull"); return; }
  popups.push({ x: player.x, y: player.y - 36, txt: "♥ −1", t: 0, life: 1.1, color: "#ff5b6a" });
};

/* ---------- update ---------- */
const tmpA = { x: 0, y: 0 }, tmpB = { x: 0, y: 0 };
const update = (dt) => {
  elapsed += dt; waveTime += dt;
  if (rapidT > 0) rapidT -= dt;
  if (chronoT > 0) chronoT -= dt;
  if (shieldT > 0) { shieldT -= dt; if (shieldT <= 0) { shieldT = 0; shieldHP = 0; } }
  if (shieldFlashT > 0) shieldFlashT -= dt;
  if (player.invT > 0) player.invT -= dt;

  /* Wing escorts are temporary: each flies off when its timer runs out.
     Departure arcs out toward the nearest side — a wing on the player's
     left exits off the left edge, one on the right exits off the right
     edge — so it never climbs straight up through the snake's body.
     Departing wings are pure decoration: no collisions, no hull risk. */
  for (let i = player.wingShips.length - 1; i >= 0; i--) {
    const w = player.wingShips[i];
    w.t -= dt;
    if (w.flashT > 0) w.flashT -= dt;
    if (w.hp == null) { w.hp = 3; w.maxHp = 3; }
    if (w.t <= 0) {
      const offsNow = shipOffsets(player.wingShips.length);
      const wx = player.x + offsNow[i + 1];
      /* Side by the wing's position relative to the player (its formation
         offset); fall back to whichever screen edge is closer. */
      const dir = offsNow[i + 1] !== 0 ? Math.sign(offsNow[i + 1]) : (wx <= W / 2 ? -1 : 1);
      const dist = (dir < 0 ? wx : W - wx) + 64; /* travel from here to just past that edge */
      /* Departure starts in an 'ease' phase (see below) rather than
         snapping straight into the arc at full Bezier speed. */
      departing.push({ x: wx, y: player.y, sx: wx, sy: player.y, off: offsNow[i + 1], dir, dist, phase: "ease", easeT: 0, easeDur: 0.34, t: 0, dur: Math.max(1.15, Math.min(1.65, dist / 330)), rot: 0 });
      popups.push({ x: wx, y: player.y - 34, txt: dir < 0 ? "✈ ←" : "✈ →", t: 0, life: 0.9, color: "#c44dff" });
      player.wingShips.splice(i, 1);
      syncPips();
    }
  }
  for (let i = departing.length - 1; i >= 0; i--) {
    const d = departing[i];
    if (d.phase === "ease") {
      /* Ease-in: the wing keeps flying in formation with the player,
         drifting only a few px outward, dipping slightly and banking
         gently toward its exit side. Velocity ramps up from the
         formation's own velocity instead of jumping from 0 to the
         arc's initial speed in a single frame — that jump was the jank. */
      d.easeT += dt;
      const ep = Math.min(1, d.easeT / d.easeDur);
      const es = ep * ep * (3 - 2 * ep); /* smoothstep: 0 slope at both ends */
      d.x = player.x + d.off + d.dir * 12 * es;
      d.y = player.y + 7 * es;
      d.rot = d.dir * 0.24 * es;
      if (ep >= 1) { d.phase = "arc"; d.t = 0; d.sx = d.x; d.sy = d.y; }
      continue;
    }
    d.t += dt;
    const rawP = Math.min(1, d.t / d.dur);
    /* Smoothstep the arc progress too: the Bezier is traversed with
       zero velocity at the handover from the ease phase, accelerates
       through the middle, and settles as it leaves — no step change
       in speed or heading anywhere along the departure. */
    const p = rawP * rawP * (3 - 2 * rawP), mt = 1 - p;
    /* Quadratic arc: control point straight out to the side (the wing
       leaves horizontally first, staying in the player's low lane),
       end point past the side edge and higher — a smooth outward bow,
       never a vertical climb toward the snake. */
    const cx = d.sx + d.dir * Math.min(170, d.dist * 0.45), cy = d.sy;
    const ex = d.sx + d.dir * d.dist, ey = d.sy - 175;
    d.x = mt * mt * d.sx + 2 * mt * p * cx + p * p * ex;
    d.y = mt * mt * d.sy + 2 * mt * p * cy + p * p * ey;
    /* Bank into the direction of travel, smoothed so the heading
       eases round instead of snapping to the arc tangent. */
    const vx = 2 * mt * (cx - d.sx) + 2 * p * (ex - cx);
    const vy = 2 * mt * (cy - d.sy) + 2 * p * (ey - cy);
    const targetRot = Math.max(-1.05, Math.min(1.05, Math.atan2(vy, vx) + Math.PI / 2));
    d.rot += (targetRot - d.rot) * Math.min(1, dt * 7);
    if (rawP >= 1) departing.splice(i, 1);
  }

  /* serpent surge: a telegraphed lunge that more than doubles the advance */
  surgeMult = 1;
  const headNow = segments[0];
  if (surgeT > 0) { surgeT -= dt; surgeMult = 2.15; }
  else if (surgeWarnT > 0) {
    surgeWarnT -= dt;
    if (surgeWarnT <= 0) { surgeT = 1.6; tone(90, 38, 0.5, "sawtooth", 0.16); }
  } else if (headNow && headNow.y > 50) {
    nextSurge -= dt;
    if (nextSurge <= 0) {
      surgeWarnT = 0.85; nextSurge = rand(9, 14);
      popups.push({ x: W / 2, y: 64, txt: "⚠ SURGE", t: 0, life: 1.0, color: "#ff5b6a" });
    }
  }

  updateHeadAttack(dt);

  /* Venom bolts can hit the main ship OR a wing. Each has its own
     hitbox and its own hull: a wing hit is absorbed entirely by that
     wing (see damageWing) and never leaks into the main ship's hull,
     blaster or game-over state. Departing wings are not hitboxes. */
  const boltSlow = chronoT > 0 ? 0.45 : 1;
  for (let i = ebolts.length - 1; i >= 0; i--) {
    const b = ebolts[i]; b.t += dt;
    b.x += b.vx * dt * boltSlow; b.y += b.vy * dt * boltSlow;
    if (b.y > H + 24 || b.x < -24 || b.x > W + 24) { ebolts.splice(i, 1); continue; }
    /* Force bubble: one fleet-wide ellipse checks in before either
       individual ship hitbox. A bolt spent on the bubble damages only
       the bubble — neither the main hull nor any wing takes that hit.
       The bubble falls after SHIELD_MAX_HP absorbed bolts or when its
       timer expires, whichever comes first. */
    if (shieldT > 0 && shieldHP > 0) {
      const sg = shieldGeometry();
      const sdx = b.x - sg.x, sdy = b.y - sg.y;
      if ((sdx * sdx) / (sg.rx * sg.rx) + (sdy * sdy) / (sg.ry * sg.ry) < 1) {
        shieldHP--; shieldFlashT = 0.24;
        burst(b.x, b.y, "#59f7ff", 11, 175);
        burst(b.x, b.y, "#ffffff", 4, 120);
        sfx.shieldHit();
        if (shieldHP <= 0) {
          shieldHP = 0; shieldT = 0;
          burst(sg.x, sg.y, "#59f7ff", 24, 230);
          popups.push({ x: sg.x, y: sg.y - 58, txt: "◎ ✸", t: 0, life: 0.9, color: "#59f7ff" });
        } else {
          popups.push({ x: b.x, y: b.y - 12, txt: "◎ " + shieldHP, t: 0, life: 0.65, color: "#59f7ff" });
        }
        ebolts.splice(i, 1); continue;
      }
    }
    /* Ship hitbox — measured off the drawn sprite, not a loose circle.
       drawShip spans x −22..+22 and y −22..+17 around (player.x, player.y):
       a 27px-radius circle (54px across) was wider AND taller than the
       whole sprite, so bolts killed the ship up to ~5px past a wingtip
       and ~10px past the tail while visibly missing it. The lethal area
       is now the cockpit/core only: an ellipse centred 2px above the
       origin (the sprite's own centre) with radii 16 × 14 — inside the
       sprite in every direction (wingtips, nose and tail all sit a few
       px outside it), with the radii already allowing for the bolt's
       own ~5px visual radius. Grazes on a wingtip, the nose tip or the
       tail no longer cost hull; a bolt has to actually reach the body. */
    const dx = b.x - player.x, dy = b.y - (player.y - 2);
    if ((dx * dx) / (16 * 16) + (dy * dy) / (14 * 14) < 1) { hitPlayer(); ebolts.splice(i, 1); continue; }
    /* Wing hitbox: same cockpit/core idea, scaled for the 0.82-size
       wing sprite — ellipse radii 13 × 11 centred 2px above the wing.
       Wings sit ±58px (or ±116px) out, so this never overlaps the
       main ship's ellipse; a bolt registers on exactly one ship. */
    const wOffs = shipOffsets(wingCount());
    for (let wi = player.wingShips.length - 1; wi >= 0; wi--) {
      const wdx = b.x - (player.x + wOffs[wi + 1]), wdy = b.y - (player.y - 2);
      if ((wdx * wdx) / (13 * 13) + (wdy * wdy) / (11 * 11) < 1) { damageWing(wi, b.x, b.y); ebolts.splice(i, 1); break; }
    }
  }
  if (mode !== "play") return; /* a hull kill ends the run mid-update */

  /* player movement — relative drag takes priority, then mouse hover,
     then keys. Dragging moves the ship by the finger's delta (1:1),
     never to the finger, so the offset above the thumb is preserved. */
  if (player.ty == null) player.ty = player.y;
  let target = player.tx, targetY = player.ty;
  if (dragTarget) { target = dragTarget.x; targetY = dragTarget.y; }
  else if (pointerX !== null) target = pointerX;
  if (keys.left) { target = player.tx - 9999; dragTarget = null; }
  if (keys.right) { target = player.tx + 9999; dragTarget = null; }
  /* Gamepad (left stick / D-pad): velocity-style movement alongside
     touch, mouse and keys — it advances the target each frame while
     held, unless a drag or a held arrow key is already steering. */
  if ((padVector.x || padVector.y) && !dragTarget && !keys.left && !keys.right) {
    target = player.tx + padVector.x * 560 * dt;
    targetY = player.ty + padVector.y * 560 * dt;
  }
  /* keep whole formation on screen */
  const offs = shipOffsets(wingCount());
  const lo = -Math.min(...offs), hi = -Math.max(...offs);
  player.tx = Math.min(Math.max(target, 30 + lo), W - 30 + hi);
  player.ty = Math.min(Math.max(targetY, PLAYER_MIN_Y()), PLAYER_MAX_Y());
  player.x += (player.tx - player.x) * Math.min(1, dt * 16);
  player.y += (player.ty - player.y) * Math.min(1, dt * 16);
  if (indicatorFade) { indicatorFade.t += dt; if (indicatorFade.t > 0.28) indicatorFade = null; }
  for (let i = dblFx.length - 1; i >= 0; i--) { dblFx[i].t += dt; if (dblFx[i].t > 0.38) dblFx.splice(i, 1); }
  player.thrust = (player.thrust + dt * 9) % (Math.PI * 2);

  fireShips(dt);

  /* snake advance */
  const slow = chronoT > 0 ? 0.15 : 1;
  const speed = (17 + wave * 4.5 + Math.min(20, waveTime * 0.3)) * slow * surgeMult;
  for (const sg of segments) {
    sg.sGoal += speed * dt;
    sg.s += (sg.sGoal - sg.s) * Math.min(1, dt * 9);
    if (sg.flashT > 0) sg.flashT -= dt;
    pathPoint(sg.s, tmpA); pathPoint(sg.s + 3, tmpB);
    sg.x = tmpA.x; sg.y = tmpA.y; sg.ang = Math.atan2(tmpB.y - tmpA.y, tmpB.x - tmpA.x);
  }

  /* Repellant dust walls rise through the field and shove the
     serpent back on contact (checked against this frame's positions) */
  updateDustWalls(dt);

  /* breach check — held while a dust wall is still on screen: the
     wall spawns at the bottom and reaches a breaching head within a
     fraction of a second, and the contact push applied above needs a
     few frames to ease the head back above the line. */
  const head = segments[0];
  if (head && head.y >= defenseY()) {
    if (!dustWalls.length) { gameOver(); return; }
  }

  /* twin missiles: homing, sinusoidal flight, area explosions */
  updateMissiles(dt);
  if (mode !== "play") return;

  /* bullets */
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i]; b.t += dt; b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.y < -20 || b.x < -20 || b.x > W + 20) { bullets.splice(i, 1); continue; }
    let consumed = false;
    for (let j = segments.length - 1; j >= 0; j--) {
      const sg = segments[j], R = sg.head ? (sg.headR || 34) : 25;
      const dx = b.x - sg.x, dy = b.y - sg.y;
      if (dx * dx + dy * dy < R * R) {
        sg.hp -= b.dmg; sg.flashT = 0.07; score += b.dmg;
        sfx.hit();
        burst(b.x, b.y, rapidT > 0 ? "#ffe14d" : "#3dff6e", 2, 110);
        if (sg.hp <= 0) destroySegment(j);
        consumed = !b.heavy || Math.random() < 0.5;
        if (b.heavy && !consumed) b.dmg = Math.ceil(b.dmg / 2);
        break;
      }
    }
    if (consumed) bullets.splice(i, 1);
  }

  /* drops */
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i]; d.t += dt; d.vy = Math.min(215, d.vy + 260 * dt); d.y += d.vy * dt;
    d.x += Math.sin(d.t * 3.2) * 22 * dt;
    if (d.y > H + 26) { drops.splice(i, 1); continue; }
    let caught = false;
    for (const o of shipOffsets(wingCount())) {
      const dx = d.x - (player.x + o), dy = d.y - player.y;
      if (dx * dx + dy * dy < 34 * 34) { caught = true; break; }
    }
    if (caught) { applyPickup(d.type, d.x, d.y - 8); drops.splice(i, 1); }
  }

  /* fx */
  for (let i = explosions.length - 1; i >= 0; i--) {
    const ex = explosions[i]; ex.t += dt;
    if (ex.t > ex.life) explosions.splice(i, 1);
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.t += dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96;
    if (p.t > p.life) parts.splice(i, 1);
  }
  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i]; p.t += dt; p.y -= 34 * dt;
    if (p.t > p.life) popups.splice(i, 1);
  }
  for (const st of stars) { st.y += st.v * dt / H; if (st.y > 1) { st.y = 0; st.x = Math.random(); } }
  shake = Math.max(0, shake - dt * 26);
  flash = Math.max(0, flash - dt * 1.6);
};

/* ---------- drawing ---------- */
const hexPath = (x, y, r) => {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    const px = x + r * Math.cos(a), py = y + r * Math.sin(a);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
};
const drawItemGlyph = (type, x, y, s, color) => {
  ctx.save(); ctx.translate(x, y); ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth = 1.8; ctx.shadowColor = color; ctx.shadowBlur = 8;
  if (type === "gun") { /* blaster */
    ctx.beginPath(); ctx.moveTo(-s * .2, s * .5); ctx.lineTo(-s * .2, -s * .1); ctx.lineTo(s * .35, -s * .55); ctx.lineTo(s * .5, -s * .3); ctx.lineTo(s * .05, s * .15); ctx.lineTo(s * .35, s * .3); ctx.lineTo(s * .3, s * .5); ctx.closePath(); ctx.fill();
  } else if (type === "ship") { /* jet */
    ctx.beginPath(); ctx.moveTo(0, -s * .6); ctx.lineTo(s * .18, -s * .05); ctx.lineTo(s * .6, s * .42); ctx.lineTo(s * .2, s * .42); ctx.lineTo(s * .12, s * .18); ctx.lineTo(-s * .12, s * .18); ctx.lineTo(-s * .2, s * .42); ctx.lineTo(-s * .6, s * .42); ctx.lineTo(-s * .18, -s * .05); ctx.closePath(); ctx.stroke();
  } else if (type === "rapid") { /* bolt */
    ctx.beginPath(); ctx.moveTo(s * .16, -s * .62); ctx.lineTo(-s * .34, s * .12); ctx.lineTo(-s * .02, s * .12); ctx.lineTo(-s * .16, s * .62); ctx.lineTo(s * .34, -s * .12); ctx.lineTo(s * .02, -s * .12); ctx.closePath(); ctx.fill();
  } else if (type === "bomb") { /* bomb */
    ctx.beginPath(); ctx.arc(0, s * .12, s * .42, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, -s * .3); ctx.quadraticCurveTo(s * .3, -s * .55, s * .42, -s * .34); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(-s * .14, 0, s * .1, 0, Math.PI * 2); ctx.fill();
  } else if (type === "hull") { /* patch cross */
    ctx.fillRect(-s * .14, -s * .5, s * .28, s);
    ctx.fillRect(-s * .5, -s * .14, s, s * .28);
  } else if (type === "chrono") { /* clock */
    ctx.beginPath(); ctx.arc(0, 0, s * .48, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -s * .34); ctx.moveTo(0, 0); ctx.lineTo(s * .26, s * .1); ctx.stroke();
  } else if (type === "repel") { /* waves */
    for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.arc(0, k * s * .3, s * .34, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); ctx.beginPath(); ctx.arc(0, k * s * .3 + s * .62, s * .34, Math.PI * .15, Math.PI * .85); ctx.stroke(); }
  } else if (type === "missiles") { /* twin missiles */
    for (const xo of [-s * .23, s * .23]) {
      ctx.beginPath();
      ctx.moveTo(xo, -s * .58);
      ctx.quadraticCurveTo(xo + s * .13, -s * .3, xo + s * .11, -s * .02);
      ctx.lineTo(xo + s * .27, s * .3); ctx.lineTo(xo + s * .13, s * .34);
      ctx.lineTo(xo + s * .1, s * .48); ctx.lineTo(xo - s * .1, s * .48);
      ctx.lineTo(xo - s * .13, s * .34); ctx.lineTo(xo - s * .27, s * .3);
      ctx.lineTo(xo - s * .11, -s * .02);
      ctx.quadraticCurveTo(xo - s * .13, -s * .3, xo, -s * .58);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(xo, -s * .18, s * .055, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = color;
    }
  } else if (type === "shield") { /* force bubble */
    ctx.beginPath(); ctx.arc(0, 0, s * .5, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.arc(0, 0, s * .34, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(-s * .17, -s * .18, s * .09, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, -s * .5); ctx.lineTo(0, -s * .34); ctx.moveTo(0, s * .34); ctx.lineTo(0, s * .5);
    ctx.moveTo(-s * .5, 0); ctx.lineTo(-s * .34, 0); ctx.moveTo(s * .34, 0); ctx.lineTo(s * .5, 0); ctx.stroke();
  }
  ctx.restore();
};
const drawShip = (x, y, main, rot = 0) => {
  const s = main ? 1 : 0.82;
  ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); ctx.scale(s, s);
  const thrust = player ? player.thrust : 0;
  const fl = 8 + Math.sin(thrust * 3) * 3;
  if (main) {
    /* Main ship — unchanged identity: white hull, cyan cockpit, green flame. */
    ctx.beginPath(); ctx.moveTo(-4, 16); ctx.lineTo(0, 16 + fl); ctx.lineTo(4, 16); ctx.closePath();
    ctx.fillStyle = "rgba(61,255,110,.85)"; ctx.shadowColor = "#3dff6e"; ctx.shadowBlur = 10; ctx.fill();
    ctx.shadowBlur = 12; ctx.shadowColor = "#ffffff";
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, -22); ctx.lineTo(5, -6); ctx.lineTo(20, 10); ctx.lineTo(22, 15); ctx.lineTo(10, 13);
    ctx.lineTo(6, 17); ctx.lineTo(-6, 17); ctx.lineTo(-10, 13); ctx.lineTo(-22, 15); ctx.lineTo(-20, 10);
    ctx.lineTo(-5, -6); ctx.closePath();
    ctx.fillStyle = "rgba(14,20,40,.9)"; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(3, 2); ctx.lineTo(0, 10); ctx.lineTo(-3, 2); ctx.closePath();
    ctx.strokeStyle = "#2ee9ff"; ctx.lineWidth = 1.2; ctx.stroke();
  } else {
    /* Wingman — deliberately different from the main ship at a glance:
       violet/magenta hull (matching the ✈ wing colour everywhere else),
       pink cockpit, magenta flame, and a swept dart silhouette with
       notched wings and twin tail fins instead of the main ship's
       broad white delta. Same overall footprint, so its hitbox and
       formation spacing stay fair and unchanged. */
    ctx.beginPath(); ctx.moveTo(-3, 15); ctx.lineTo(0, 15 + fl * 0.9); ctx.lineTo(3, 15); ctx.closePath();
    ctx.fillStyle = "rgba(232,121,255,.9)"; ctx.shadowColor = "#c44dff"; ctx.shadowBlur = 11; ctx.fill();
    ctx.shadowBlur = 12; ctx.shadowColor = "#c44dff";
    ctx.strokeStyle = "#e879ff"; ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.moveTo(0, -21); ctx.lineTo(4, -7); ctx.lineTo(19, 4); ctx.lineTo(21, 12); ctx.lineTo(13, 10);
    ctx.lineTo(9, 16); ctx.lineTo(4, 11); ctx.lineTo(-4, 11); ctx.lineTo(-9, 16); ctx.lineTo(-13, 10);
    ctx.lineTo(-21, 12); ctx.lineTo(-19, 4); ctx.lineTo(-4, -7); ctx.closePath();
    ctx.fillStyle = "rgba(44,10,58,.94)"; ctx.fill(); ctx.stroke();
    /* wing accent stripes — magenta ships get pink wingtip lights */
    ctx.shadowBlur = 7; ctx.fillStyle = "#ff5ea8";
    ctx.beginPath(); ctx.arc(-17.5, 9, 1.7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(17.5, 9, 1.7, 0, Math.PI * 2); ctx.fill();
    /* cockpit: pink diamond, distinct from the main ship's cyan spine */
    ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(3.4, -1); ctx.lineTo(0, 9); ctx.lineTo(-3.4, -1); ctx.closePath();
    ctx.fillStyle = "rgba(196,77,255,.32)"; ctx.fill();
    ctx.strokeStyle = "#ff5ea8"; ctx.lineWidth = 1.2; ctx.stroke();
    /* centre chevron marking */
    ctx.beginPath(); ctx.moveTo(-4, 13.5); ctx.lineTo(0, 10.5); ctx.lineTo(4, 13.5); ctx.stroke();
  }
  ctx.restore();
};
/* ---------- serpent head, drawn per wave form ----------
   Local space: nose at (0,-36), back of the skull toward the body
   at +y, the whole head scaled by its form's scale. Spikes and fangs
   are decoration outside the collision radius; the skull fills it. */
const drawHead = (sg) => {
  const tier = HEAD_TIERS[sg.tier || 0];
  const sc = sg.headScale || 1;
  ctx.save(); ctx.translate(sg.x, sg.y); ctx.rotate(sg.ang + Math.PI / 2); ctx.scale(sc, sc);
  if (tier.aura) { /* pulsing aura on the late forms */
    ctx.save();
    ctx.globalAlpha = 0.13 + 0.05 * Math.sin(elapsed * 3 + sg.x * 0.05);
    ctx.fillStyle = tier.glow; ctx.shadowColor = tier.glow; ctx.shadowBlur = 30;
    ctx.beginPath(); ctx.arc(0, 0, 45, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  if (tier.spikes) { /* spikes behind the skull, front-top to back */
    const perSide = tier.spikes / 2;
    const basePts = [[23, -14], [25, 0], [22, 13], [17, 24]];
    ctx.fillStyle = tier.stroke; ctx.shadowColor = tier.glow; ctx.shadowBlur = 10;
    for (const side of [-1, 1]) {
      for (let k = 0; k < perSide; k++) {
        const bp = basePts[k];
        ctx.beginPath();
        ctx.moveTo(side * (bp[0] - 1), bp[1] - 4);
        ctx.lineTo(side * (bp[0] + tier.spikeLen), bp[1] - 7 - k * 1.5);
        ctx.lineTo(side * (bp[0] + 1), bp[1] + 4.5);
        ctx.closePath(); ctx.fill();
      }
    }
  }
  /* skull (wider hood on the flared forms) */
  const w = tier.hood ? 33 : 27;
  ctx.shadowColor = tier.glow; ctx.shadowBlur = 26;
  ctx.beginPath();
  ctx.moveTo(0, -36); ctx.quadraticCurveTo(w, -12, w - 4, 16); ctx.quadraticCurveTo(12, 33, 0, 30);
  ctx.quadraticCurveTo(-12, 33, -(w - 4), 16); ctx.quadraticCurveTo(-w, -12, 0, -36); ctx.closePath();
  ctx.fillStyle = sg.flashT > 0 ? "rgba(168,74,84,.95)" : tier.fill; ctx.fill();
  ctx.strokeStyle = tier.stroke; ctx.lineWidth = 2.4; ctx.stroke();
  if (tier.cracks) { /* molten cracks on the final forms */
    ctx.shadowColor = "#ff9f1c"; ctx.shadowBlur = 8; ctx.strokeStyle = "#ff9f1c"; ctx.lineWidth = 1.3;
    for (const line of [[[-14, 2], [-8, 8], [-11, 15]], [[10, -4], [14, 3], [11, 10]], [[0, 14], [3, 20], [1, 26]]]) {
      ctx.beginPath(); line.forEach((pt, li) => li ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1])); ctx.stroke();
    }
  }
  if (tier.fangs) { /* white fangs at the front jaw */
    ctx.shadowBlur = 4; ctx.fillStyle = "#fff";
    for (const fx of [-8, 8]) { ctx.beginPath(); ctx.moveTo(fx - 2.6, -14); ctx.lineTo(fx + 2.6, -14); ctx.lineTo(fx, -26); ctx.closePath(); ctx.fill(); }
  }
  if (tier.pupil === "slit") { /* angry brow ridges */
    ctx.shadowBlur = 0; ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(-16, -19); ctx.lineTo(-4, -16); ctx.moveTo(16, -19); ctx.lineTo(4, -16); ctx.stroke();
  }
  /* eyes: round pupils early, vertical slits later, a second smaller
     pair on the many-eyed forms */
  const drawEye = (ex, ey, r) => {
    ctx.beginPath(); ctx.arc(ex, ey, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#14040a";
    if (tier.pupil === "slit") ctx.fillRect(ex - 0.75, ey - r, 1.5, r * 2);
    else { ctx.beginPath(); ctx.arc(ex, ey, r * 0.4, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = tier.eye;
  };
  ctx.fillStyle = tier.eye; ctx.shadowColor = tier.eye; ctx.shadowBlur = 10;
  const eyeR = sc >= 1.23 ? 4.2 : 3.6;
  drawEye(-10, -13, eyeR); drawEye(10, -13, eyeR);
  if (tier.eyes4) { drawEye(-17.5, -3, 2.2); drawEye(17.5, -3, 2.2); }
  ctx.restore();
  /* surge telegraph ring + HP number/bar, unrotated; the bar tracks
     the head's radius so it stays under the skull at every size */
  ctx.save();
  if (surgeWarnT > 0) {
    ctx.beginPath(); ctx.arc(sg.x, sg.y, (sg.headR || 34) + 9 + Math.sin(elapsed * 26) * 4, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,210,62,.95)"; ctx.lineWidth = 2.2; ctx.shadowColor = "#ffd23e"; ctx.shadowBlur = 14; ctx.stroke();
  }
  ctx.font = "900 15px Orbitron"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.shadowColor = tier.glow; ctx.shadowBlur = 8; ctx.fillStyle = "#fff";
  ctx.fillText(fmt(Math.max(0, sg.hp)), sg.x, sg.y + 1);
  const wBar = Math.max(62, (sg.headR || 34) * 1.85), pct = Math.max(0, sg.hp / sg.max), barY = sg.y + (sg.headR || 34) - 9;
  ctx.shadowBlur = 0; ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.fillRect(sg.x - wBar / 2, barY, wBar, 4);
  ctx.fillStyle = tier.glow; ctx.fillRect(sg.x - wBar / 2, barY, wBar * pct, 4);
  ctx.restore();
};
const fmt = (n) => Math.round(n).toLocaleString("en-US");
/* Compact HUD format: full number under 10k, abbreviated above it so
   SCORE and BEST can never grow into each other or off-screen.
   The full exact value stays available in the stat's title tooltip. */
const fmtHud = (n) => {
  const v = Math.round(n), a = Math.abs(v);
  if (a < 10000) return fmt(v);
  if (a < 1000000) { const k = v / 1000; return (a < 100000 ? k.toFixed(1).replace(/\.0$/, "") : Math.round(k)) + "K"; }
  if (a < 1000000000) { const m = v / 1000000; return (a < 10000000 ? m.toFixed(2) : a < 100000000 ? m.toFixed(1).replace(/\.0$/, "") : Math.round(m)) + "M"; }
  return (v / 1000000000).toFixed(2).replace(/\.?0+$/, "") + "B";
};

const draw = () => {
  ctx.save();
  if (shake > 0) ctx.translate(rand(-shake, shake) * 0.5, rand(-shake, shake) * 0.5);
  if (bgCanvas) ctx.drawImage(bgCanvas, 0, 0, W, H);
  /* scrolling stars */
  ctx.fillStyle = "#cfe9ff";
  for (const st of stars) { ctx.globalAlpha = 0.35 + 0.4 * Math.sin(elapsed * 2 + st.x * 40); ctx.fillRect(st.x * W, st.y * H, st.s, st.s); }
  ctx.globalAlpha = 1;
  /* defense line */
  const dy = defenseY(), danger = segments.length && segments[0].y > dy - 150;
  ctx.save();
  ctx.strokeStyle = danger ? `rgba(255,43,62,${0.55 + 0.4 * Math.sin(elapsed * 9)})` : "rgba(255,43,62,.32)";
  ctx.lineWidth = 1.6; ctx.setLineDash([9, 7]); ctx.shadowColor = "#ff2b3e"; ctx.shadowBlur = danger ? 12 : 5;
  ctx.beginPath(); ctx.moveTo(8, dy); ctx.lineTo(W - 8, dy); ctx.stroke();
  ctx.setLineDash([]); ctx.shadowBlur = 0;
  
  ctx.restore();
  /* drops */
  for (const d of drops) {
    const def = ITEM_DEFS[d.type], bob = Math.sin(d.t * 5) * 2;
    ctx.save();
    ctx.shadowColor = def.color; ctx.shadowBlur = 16;
    ctx.strokeStyle = def.color; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(d.x, d.y + bob, 13, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(4,6,16,.88)"; ctx.fill(); ctx.stroke();
    ctx.restore();
    drawItemGlyph(d.type, d.x, d.y + bob, 15, def.color);
  }

  /* snake (tail first so head draws on top) */
  for (let i = segments.length - 1; i >= 0; i--) {
    const sg = segments[i];
    if (sg.y < -80 || sg.y > H + 70) continue;
    if (sg.head) {
      drawHead(sg);
    } else {
      const itemDef = sg.item ? ITEM_DEFS[sg.item] : null;
      const glow = sg.flashT > 0 ? "#ffffff" : (itemDef ? itemDef.color : "rgba(255,255,255,.95)");
      ctx.save();
      ctx.shadowColor = itemDef ? itemDef.color : "rgba(200,230,255,.8)";
      ctx.shadowBlur = sg.flashT > 0 ? 20 : (itemDef ? 18 : 9);
      hexPath(sg.x, sg.y, 23.5);
      ctx.fillStyle = sg.flashT > 0 ? "rgba(90,110,150,.95)" : (itemDef ? "rgba(16,10,34,.94)" : "rgba(13,17,30,.94)");
      ctx.fill();
      ctx.strokeStyle = glow; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
      if (itemDef) {
        drawItemGlyph(sg.item, sg.x, sg.y, 19, itemDef.color);
        ctx.save(); ctx.font = "900 10px Orbitron"; ctx.textAlign = "right"; ctx.textBaseline = "top";
        ctx.fillStyle = itemDef.color; ctx.fillText("+", sg.x - 15, sg.y - 11); ctx.restore();
      } else {
        ctx.save();
        ctx.font = "900 14px Orbitron"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.shadowColor = "rgba(160,220,255,.9)"; ctx.shadowBlur = 5;
        ctx.fillStyle = "#fff"; ctx.fillText(fmt(Math.max(0, sg.hp)), sg.x, sg.y + 1);
        ctx.restore();
      }
    }
  }

  /* Repellant dust walls — drawn over the serpent so the snake
     shows through the translucent green dust as the wall passes */
  drawDustWalls();

  /* venom bolts */
  for (const b of ebolts) {
    ctx.save();
    ctx.shadowColor = "#ff2b8e"; ctx.shadowBlur = 14;
    ctx.fillStyle = "#ff5ea8";
    ctx.beginPath(); ctx.arc(b.x, b.y, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(b.x, b.y, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /* bullets */
  ctx.save();
  ctx.shadowColor = rapidT > 0 ? "#ffe14d" : "#3dff6e"; ctx.shadowBlur = 9;
  ctx.fillStyle = rapidT > 0 ? "#ffe14d" : "#57ff7d";
  for (const b of bullets) {
    if (b.heavy) ctx.fillRect(b.x - 2.4, b.y - 10, 4.8, 15);
    else ctx.fillRect(b.x - 1.6, b.y - 7, 3.2, 11);
  }
  ctx.restore();

  /* twin missiles in flight: sleek body, orange nose and fins,
     flickering exhaust, drawn along their current heading */
  for (const m of missiles) {
    ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(m.ang + Math.PI / 2);
    const fl = 7 + Math.random() * 6;
    ctx.beginPath(); ctx.moveTo(-2.6, 9); ctx.lineTo(0, 9 + fl); ctx.lineTo(2.6, 9); ctx.closePath();
    ctx.fillStyle = "rgba(255,159,28,.9)"; ctx.shadowColor = "#ff9f1c"; ctx.shadowBlur = 10; ctx.fill();
    ctx.shadowBlur = 12; ctx.shadowColor = "#ffb02e";
    ctx.beginPath();
    ctx.moveTo(0, -14); ctx.quadraticCurveTo(4.4, -7, 4.2, 1); ctx.lineTo(8.4, 9); ctx.lineTo(3.6, 8.4);
    ctx.lineTo(3.4, 10.5); ctx.lineTo(-3.4, 10.5); ctx.lineTo(-3.6, 8.4); ctx.lineTo(-8.4, 9); ctx.lineTo(-4.2, 1);
    ctx.quadraticCurveTo(-4.4, -7, 0, -14); ctx.closePath();
    ctx.fillStyle = "#e8efff"; ctx.fill();
    ctx.strokeStyle = "#ff9f1c"; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.fillStyle = "#ff9f1c"; ctx.beginPath(); ctx.moveTo(0, -14); ctx.quadraticCurveTo(3.4, -9, 3.6, -4.5); ctx.lineTo(-3.6, -4.5); ctx.quadraticCurveTo(-3.4, -9, 0, -14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#59f7ff"; ctx.beginPath(); ctx.arc(0, 0.5, 1.7, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /* missile explosions: bright core, two expanding shock rings */
  for (const ex of explosions) {
    const p = Math.min(1, ex.t / ex.life), r = 10 + p * ex.r;
    ctx.save(); ctx.globalAlpha = 1 - p;
    const g = ctx.createRadialGradient(ex.x, ex.y, 0, ex.x, ex.y, r);
    g.addColorStop(0, "rgba(255,255,255,.95)"); g.addColorStop(0.35, "rgba(255,176,46,.75)");
    g.addColorStop(0.7, "rgba(255,91,62,.35)"); g.addColorStop(1, "rgba(255,91,62,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ex.x, ex.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#ffb02e"; ctx.lineWidth = 2.6; ctx.shadowColor = "#ffb02e"; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(ex.x, ex.y, r * 0.92, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(ex.x, ex.y, r * 0.55, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  /* player squadron */
  if (player && mode !== "over") {
    const offs = shipOffsets(wingCount());
    for (let i = offs.length - 1; i >= 0; i--) {
      if (i === 0) {
        if (player.invT > 0 && Math.floor(elapsed * 14) % 2 === 0) continue; /* hit-invulnerability blink */
        drawShip(player.x, player.y, true);
      } else {
        const w = player.wingShips[i - 1];
        ctx.save();
        if (w && w.t < 4) ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(elapsed * 9)); /* departure warning blink */
        drawShip(player.x + offs[i], player.y, false);
        ctx.restore();
        if (w && w.flashT > 0) { /* hit flash — this wing took damage */
          ctx.save(); ctx.globalAlpha = Math.min(1, w.flashT / 0.22);
          ctx.strokeStyle = "#ff5b6a"; ctx.lineWidth = 2; ctx.shadowColor = "#ff2b3e"; ctx.shadowBlur = 12;
          ctx.beginPath(); ctx.arc(player.x + offs[i], player.y - 2, 16, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
        }
        if (w) { /* wing hull (red, own health) + escort time remaining (purple) */
          const hf = Math.max(0, (w.hp == null ? 3 : w.hp) / (w.maxHp || 3));
          ctx.fillStyle = "rgba(255,91,106,.25)"; ctx.fillRect(player.x + offs[i] - 15, player.y + 20, 30, 3);
          ctx.fillStyle = hf > 0.34 ? "#ff5b6a" : "#ff2b3e"; ctx.fillRect(player.x + offs[i] - 15, player.y + 20, 30 * hf, 3);
          const f = Math.max(0, w.t / WING_TIME);
          ctx.fillStyle = "rgba(196,77,255,.25)"; ctx.fillRect(player.x + offs[i] - 15, player.y + 25, 30, 3);
          ctx.fillStyle = "#c44dff"; ctx.fillRect(player.x + offs[i] - 15, player.y + 25, 30 * f, 3);
        }
      }
    }
  }
  /* departing escorts ease out, then arc off the nearest side */
  for (const d of departing) {
    const arcP = d.phase === "arc" ? Math.min(1, d.t / d.dur) : 0;
    ctx.save(); ctx.globalAlpha = Math.max(0, 1 - Math.max(0, arcP - 0.75) * 4);
    drawShip(d.x, d.y, false, d.rot || 0);
    ctx.restore();
  }

  /* force bubble: one translucent ellipse around the whole fleet.
     Its rim arc shows the time left, the pips along the bottom show
     integrity (absorbed bolts) left, it flashes when it takes a hit,
     and it blinks as the timer runs out. */
  if (player && mode === "play" && shieldT > 0 && shieldHP > 0) {
    const geo = shieldGeometry();
    if (geo) {
      const timeFrac = Math.max(0, shieldT / SHIELD_TIME);
      const dying = shieldT < 2 && Math.floor(elapsed * 6) % 2 === 0;
      ctx.save();
      ctx.globalAlpha = dying ? 0.45 : 0.9;
      ctx.beginPath(); ctx.ellipse(geo.x, geo.y, geo.rx, geo.ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(89,247,255,.07)"; ctx.fill();
      ctx.strokeStyle = "rgba(89,247,255,.4)"; ctx.lineWidth = 1.4;
      ctx.shadowColor = "#59f7ff"; ctx.shadowBlur = 8; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(geo.x, geo.y, geo.rx, geo.ry, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * timeFrac);
      ctx.strokeStyle = "#aef7ff"; ctx.lineWidth = 2.6 + shieldFlashT * 9;
      ctx.shadowBlur = 16 + shieldFlashT * 46; ctx.stroke();
      if (shieldFlashT > 0) {
        ctx.beginPath(); ctx.ellipse(geo.x, geo.y, geo.rx + 5, geo.ry + 4, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,255,${shieldFlashT * 2.4})`; ctx.lineWidth = 1.6; ctx.stroke();
      }
      for (let i = 0; i < SHIELD_MAX_HP; i++) {
        const px = geo.x + (i - (SHIELD_MAX_HP - 1) / 2) * 13, py = geo.y + geo.ry - 7;
        ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2);
        if (i < shieldHP) { ctx.fillStyle = "#59f7ff"; ctx.shadowBlur = 7; ctx.fill(); }
        else { ctx.shadowBlur = 0; ctx.strokeStyle = "rgba(89,247,255,.35)"; ctx.lineWidth = 1; ctx.stroke(); }
      }
      ctx.restore();
    }
  }

  /* touch indicator — small ring at the finger's current position,
     with a faint tether up to the ship so the offset reads at a glance.
     The thumb stays on the ring; the ship, bolts and drops stay clear
     above it. Fades briefly on release; double-tap gets an amber ring. */
  const drawTouchMark = (x, y, alpha) => {
    ctx.save(); ctx.globalAlpha = alpha;
    if (player && mode === "play") {
      ctx.strokeStyle = "rgba(46,233,255,.38)"; ctx.lineWidth = 1; ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(player.x, player.y); ctx.stroke(); ctx.setLineDash([]);
    }
    const pulse = 1 + 0.08 * Math.sin(elapsed * 8);
    ctx.strokeStyle = "#2ee9ff"; ctx.lineWidth = 1.8; ctx.shadowColor = "#2ee9ff"; ctx.shadowBlur = 9;
    ctx.beginPath(); ctx.arc(x, y, 13 * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#eaf6ff"; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y - 19); ctx.lineTo(x, y - 15); ctx.moveTo(x, y + 15); ctx.lineTo(x, y + 19);
    ctx.moveTo(x - 19, y); ctx.lineTo(x - 15, y); ctx.moveTo(x + 15, y); ctx.lineTo(x + 19, y);
    ctx.stroke();
    ctx.restore();
  };
  if (dragState && mode === "play") drawTouchMark(dragState.curX, dragState.curY, 0.95);
  else if (indicatorFade) drawTouchMark(indicatorFade.x, indicatorFade.y, Math.max(0, 0.95 * (1 - indicatorFade.t / 0.28)));
  for (const f of dblFx) {
    const p = f.t / 0.38;
    ctx.save(); ctx.globalAlpha = (1 - p) * 0.95;
    ctx.strokeStyle = "#ffb02e"; ctx.lineWidth = 2.4; ctx.shadowColor = "#ffb02e"; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(f.x, f.y, 10 + p * 30, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(f.x, f.y, 5 + p * 16, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  /* particles & popups */
  for (const p of parts) {
    ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
    ctx.fillStyle = p.color; ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "center";
  for (const p of popups) {
    ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
    ctx.font = "700 14px Orbitron"; ctx.fillStyle = p.color;
    ctx.shadowColor = p.color; ctx.shadowBlur = 8;
    ctx.fillText(p.txt, p.x, p.y);
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;

  if (chronoT > 0) { ctx.fillStyle = "rgba(80,150,255,.08)"; ctx.fillRect(0, 0, W, H); }
  if (flash > 0) { ctx.fillStyle = `rgba(255,240,210,${flash * 0.55})`; ctx.fillRect(0, 0, W, H); }
  if (danger && mode === "play") {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.34, W / 2, H / 2, H * 0.72);
    g.addColorStop(0, "rgba(255,0,40,0)"); g.addColorStop(1, `rgba(255,0,40,${0.16 + 0.1 * Math.sin(elapsed * 9)})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.font = "900 15px Orbitron"; ctx.textAlign = "center"; ctx.fillStyle = "#ff5b6a";
    ctx.shadowColor = "#ff2b3e"; ctx.shadowBlur = 10;
    ctx.font = "900 22px Orbitron"; ctx.fillText("⚠", W / 2, dy - 18);
    ctx.shadowBlur = 0;
  }
  ctx.restore();
};

/* ---------- UI sync ---------- */
const mkPips = (el, n, cls) => { el.innerHTML = ""; for (let i = 0; i < n; i++) { const d = document.createElement("div"); d.className = "pip " + cls; el.appendChild(d); } };
mkPips(ui.gunPips, 6, ""); mkPips(ui.shipPips, 4, "ship"); mkPips(ui.hullPips, 3, "hull");
const syncPips = () => {
  [...ui.gunPips.children].forEach((p, i) => p.classList.toggle("on", i < player.gun));
  [...ui.shipPips.children].forEach((p, i) => p.classList.toggle("on", i < wingCount()));
  [...ui.hullPips.children].forEach((p, i) => p.classList.toggle("on", i < player.hull));
};
const syncItemUI = () => {
  const n = inventory.length, count = slotCount();
  if (selSlot >= count) selSlot = count - 1;
  if (selSlot < 0) selSlot = 0;
  /* Render the slots: filled ones carry their item's icon and colour,
     empty ones a dim dashed outline and dot. The selected slot gets
     the highlighted outline (its item's colour, cyan when empty). */
  ui.itemSlots.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const type = inventory[i];
    const b = document.createElement("button");
    b.type = "button";
    b.className = "slot" + (type ? " filled" : " empty") + (i === selSlot ? " sel" : "");
    b.dataset.idx = String(i);
    if (type) {
      const def = ITEM_DEFS[type];
      const s = document.createElement("span");
      s.className = "ic"; s.textContent = def.icon; s.style.color = def.color;
      b.appendChild(s);
      b.style.setProperty("--sc", def.color);
      b.setAttribute("aria-label", "Use " + def.name);
      b.title = def.name + " — tap to use";
      b.disabled = mode !== "play";
    } else {
      const s = document.createElement("span");
      s.className = "dot"; s.setAttribute("aria-hidden", "true");
      b.appendChild(s);
      b.setAttribute("aria-label", "Empty slot " + (i + 1));
      b.title = "Empty slot";
    }
    ui.itemSlots.appendChild(b);
  }
  /* The label above the slots names the SELECTED slot's item, so
     L1/R1 cycling tells you what A/B will fire. */
  if (ui.itemLabel) {
    const selType = inventory[selSlot];
    if (!n) {
      ui.itemLabel.textContent = "SPECIAL · EMPTY";
      ui.itemLabel.classList.add("empty"); ui.itemLabel.style.color = "";
      ui.itemLabel.title = "Special items — none held";
    } else if (selType) {
      const def = ITEM_DEFS[selType];
      ui.itemLabel.textContent = def.name;
      ui.itemLabel.classList.remove("empty");
      ui.itemLabel.style.color = def.color;
      ui.itemLabel.title = def.name + " selected — tap its slot, press A/B, Space or double-tap to use";
    } else {
      ui.itemLabel.textContent = "SLOT " + (selSlot + 1) + " · EMPTY";
      ui.itemLabel.classList.add("empty"); ui.itemLabel.style.color = "";
      ui.itemLabel.title = "Selected slot is empty";
    }
  }
};
let lastHud = "", savedBest = best;
const syncHud = () => {
  if (score > best) { best = score; if (best - savedBest >= 250) { savedBest = best; saveBest(); } }
  const key = score + "|" + wave + "|" + best;
  if (key !== lastHud) {
    lastHud = key;
    ui.score.textContent = fmtHud(score); ui.wave.textContent = wave; ui.best.textContent = fmtHud(best);
    if (ui.scoreWrap) ui.scoreWrap.title = "Score: " + fmt(score);
    if (ui.bestWrap) ui.bestWrap.title = "Best: " + fmt(best);
  }
  if (rapidT > 0) { ui.rapid.classList.add("on"); ui.rapid.textContent = "⚡ " + Math.ceil(rapidT); }
  else ui.rapid.classList.remove("on");
  /* wing pips fade as each escort's remaining time runs down */
  if (player) [...ui.shipPips.children].forEach((p, i) => { const w = player.wingShips[i]; p.style.opacity = w ? String(0.35 + 0.65 * Math.min(1, w.t / WING_TIME)) : "1"; });
};

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

/* ---------- main loop ---------- */
player = makePlayer();
resize();
syncPips(); syncItemUI();
document.getElementById("startBest").textContent = "★ " + fmt(best);
ui.best.textContent = fmtHud(best);
if (ui.bestWrap) ui.bestWrap.title = "Best: " + fmt(best);
if (ui.scoreWrap) ui.scoreWrap.title = "Score: " + fmt(score);
/* ambient menu snake for backdrop */
spawnWave(1); mode = "menu"; segments.forEach((sg, i) => { sg.sGoal = 700 - i * GEO.segGap; sg.s = sg.sGoal; });
let lastT = performance.now();
const loop = (now) => {
  requestAnimationFrame(loop);
  let dt = Math.min(0.033, (now - lastT) / 1000); lastT = now;
  pollGamepad();
  if (mode === "play") { update(dt); syncHud(); }
  else if (mode === "menu" || mode === "over") {
    elapsed += dt;
    for (const sg of segments) { pathPoint(sg.s, tmpA); sg.x = tmpA.x; sg.y = tmpA.y; }
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.t > p.life) parts.splice(i, 1); }
    for (const st of stars) { st.y += st.v * dt / H; if (st.y > 1) { st.y = 0; st.x = Math.random(); } }
    flash = Math.max(0, flash - dt * 1.6); shake = Math.max(0, shake - dt * 26);
  }
  draw();
};
requestAnimationFrame(loop);
