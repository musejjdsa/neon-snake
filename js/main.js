"use strict";
/* Neon Snake — main.js
 * Bootstrapping and the main loop. Loaded last.
 * Classic scripts, loaded in order from index.html, so they share
 * one global scope exactly as the original single file did.
 */
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
