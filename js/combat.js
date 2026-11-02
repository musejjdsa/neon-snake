"use strict";
/* Neon Snake — combat.js
 * Weapons, segment damage, missiles, shield, Repellant, pickups, and serpent attacks.
 * Classic scripts, loaded in order from index.html, so they share
 * one global scope exactly as the original single file did.
 */
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
