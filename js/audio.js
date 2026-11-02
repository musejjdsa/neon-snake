"use strict";
/* Neon Snake — audio.js
 * Synth sound effects and generative background music (Web Audio).
 * Classic scripts, loaded in order from index.html, so they share
 * one global scope exactly as the original single file did.
 */
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
