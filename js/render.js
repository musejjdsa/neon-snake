"use strict";
/* Neon Snake — render.js
 * Canvas drawing: serpent, ships, drops, effects, and HUD frame.
 * Classic scripts, loaded in order from index.html, so they share
 * one global scope exactly as the original single file did.
 */
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
