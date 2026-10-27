// Sonidos sintetizados con Web Audio (sin ficheros externos).
import { store } from './store.js';

let ctx = null;
let master = null;
let noiseBuf = null;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

// Los navegadores exigen un gesto del usuario para activar el audio.
export function unlockAudio() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume();
}
['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, unlockAudio, { once: true, passive: true }));

function enabled() {
  const s = store.get().settings;
  if (!s.sound) return false;
  const c = ensure();
  if (!c || c.state !== 'running') return false;
  master.gain.value = Math.max(0, Math.min(1, s.volume ?? 0.6));
  return true;
}

function noise(t, dur, freq, q, gain, type = 'bandpass') {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

function tone(t, dur, freq, gain, type = 'sine', slideTo) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

const sounds = {
  card() { const t = ctx.currentTime; noise(t, 0.07, 2600, 0.9, 0.35, 'highpass'); noise(t + 0.01, 0.05, 900, 1.2, 0.15); },
  flip() { const t = ctx.currentTime; noise(t, 0.05, 3200, 1, 0.25, 'highpass'); noise(t + 0.04, 0.06, 1800, 2, 0.18); },
  chip() {
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.045 + Math.random() * 0.01;
      tone(tt, 0.06, 3200 + Math.random() * 800, 0.08, 'triangle');
      noise(tt, 0.03, 5000, 3, 0.12);
    }
  },
  chips() {
    const t = ctx.currentTime;
    for (let i = 0; i < 7; i++) {
      const tt = t + i * 0.035 + Math.random() * 0.02;
      tone(tt, 0.05, 2800 + Math.random() * 1400, 0.06, 'triangle');
      noise(tt, 0.03, 4500, 3, 0.1);
    }
  },
  check() { const t = ctx.currentTime; tone(t, 0.09, 140, 0.5, 'sine', 70); tone(t + 0.11, 0.09, 140, 0.45, 'sine', 70); },
  fold() { const t = ctx.currentTime; noise(t, 0.18, 1200, 0.6, 0.18, 'lowpass'); },
  turn() { const t = ctx.currentTime; tone(t, 0.18, 880, 0.18, 'sine'); tone(t + 0.12, 0.28, 1320, 0.14, 'sine'); },
  allin() { const t = ctx.currentTime; tone(t, 0.35, 220, 0.2, 'sawtooth', 660); noise(t, 0.3, 800, 0.5, 0.1, 'lowpass'); },
  win() {
    const t = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(t + i * 0.09, 0.4, f, 0.16, 'triangle'));
    this.chips();
  },
  lose() { const t = ctx.currentTime; tone(t, 0.3, 330, 0.12, 'triangle', 247); tone(t + 0.2, 0.4, 247, 0.1, 'triangle', 196); },
  tick() { const t = ctx.currentTime; tone(t, 0.03, 1800, 0.12, 'square'); },
  tickSoft() { const t = ctx.currentTime; tone(t, 0.025, 1400, 0.06, 'square'); },
  jackpot() {
    const t = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568].forEach((f, i) => tone(t + i * 0.08, 0.5, f, 0.15, 'triangle'));
    for (let i = 0; i < 4; i++) setTimeout(() => sounds.chips(), i * 160);
  },
  click() { const t = ctx.currentTime; tone(t, 0.025, 1000, 0.05, 'sine'); },
  success() { const t = ctx.currentTime; tone(t, 0.12, 660, 0.14, 'sine'); tone(t + 0.09, 0.2, 990, 0.14, 'sine'); },
  error() { const t = ctx.currentTime; tone(t, 0.18, 220, 0.14, 'square', 180); },
  notify() { const t = ctx.currentTime; tone(t, 0.12, 1174.7, 0.1, 'sine'); tone(t + 0.1, 0.2, 1568, 0.1, 'sine'); },
};

export function play(name) {
  if (!enabled()) return;
  const fn = sounds[name];
  if (fn) {
    try { fn.call(sounds); } catch (e) { /* ignorar */ }
  }
}
