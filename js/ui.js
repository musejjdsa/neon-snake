"use strict";
/* Neon Snake — ui.js
 * HUD sync: pips, item slots, score, wave, and best displays.
 * Classic scripts, loaded in order from index.html, so they share
 * one global scope exactly as the original single file did.
 */
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
