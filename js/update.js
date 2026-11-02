"use strict";
/* Neon Snake — update.js
 * Per-frame game update: movement, collisions, and timers.
 * Classic scripts, loaded in order from index.html, so they share
 * one global scope exactly as the original single file did.
 */
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
