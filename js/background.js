"use strict";
/* Neon Snake — background.js
 * Stage geometry, serpentine path, and the faint Milky Way backdrop.
 * Classic scripts, loaded in order from index.html, so they share
 * one global scope exactly as the original single file did.
 */
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
