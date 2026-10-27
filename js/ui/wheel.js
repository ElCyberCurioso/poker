// Ruleta de la suerte: un giro gratis cada 4 horas, probabilidades públicas.
import { h, clear, fmt, duration, toast, confetti, svgIcon, prefersReducedMotion } from '../util.js';
import { store } from '../store.js';
import { WHEEL_SEGMENTS, WHEEL_COOLDOWN_MS, DAILY_BONUS } from '../data/progress.js';
import { secureRandomInt } from '../core/cards.js';
import { play } from '../audio.js';

export function wheelReadyIn() {
  const last = store.get().wheel.last || 0;
  return Math.max(0, last + WHEEL_COOLDOWN_MS - Date.now());
}

// Acredita un premio que quedó pendiente si se cerró la página durante el giro.
export function settlePendingWheel() {
  const p = store.get().wheel.pending;
  if (p > 0) {
    store.update((s) => { s.wheel.pending = 0; });
    store.addBalance(p, 'ruleta');
    toast(`Premio de la ruleta acreditado: +${fmt(p)}`, { type: 'gold', icon: '🎡' });
  }
}

function pickSegment() {
  const total = WHEEL_SEGMENTS.reduce((a, s) => a + s.weight, 0);
  let r = secureRandomInt(total);
  for (let i = 0; i < WHEEL_SEGMENTS.length; i++) {
    r -= WHEEL_SEGMENTS[i].weight;
    if (r < 0) return i;
  }
  return 0;
}

const easeOut = (t) => 1 - Math.pow(1 - t, 4);

export function renderWheel(root, app) {
  const N = WHEEL_SEGMENTS.length;
  const seg = (2 * Math.PI) / N;
  const canvas = h('canvas', { width: '600', height: '600', role: 'img', 'aria-label': 'Ruleta de premios' });
  const pointer = h('div.wheel-pointer', { html: '<svg viewBox="0 0 38 50" width="38" height="50"><path d="M19 48 L3 8 Q19 -4 35 8 Z" fill="#E8CB84" stroke="#5E1A24" stroke-width="3"/><circle cx="19" cy="14" r="5" fill="#5E1A24"/></svg>' });
  const hub = h('button.wheel-hub', { type: 'button' });
  const wrap = h('div.wheel-wrap', canvas, pointer, hub);
  let angle = 0; // rotación actual (rad)
  let spinning = false;
  let bulbsOn = 0;

  const draw = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const size = Math.max(200, Math.round((rect.width || 520) * dpr));
    if (canvas.width !== size) { canvas.width = size; canvas.height = size; }
    const ctx = canvas.getContext('2d');
    const c = size / 2;
    const R = c * 0.96;
    ctx.clearRect(0, 0, size, size);
    // Aro exterior
    const rim = ctx.createRadialGradient(c, c, R * 0.86, c, c, R);
    rim.addColorStop(0, '#8A6A2C'); rim.addColorStop(0.5, '#E8CB84'); rim.addColorStop(1, '#8A6A2C');
    ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.fillStyle = rim; ctx.fill();
    const r = R * 0.88;
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(angle);
    for (let i = 0; i < N; i++) {
      const s = WHEEL_SEGMENTS[i];
      const a0 = -Math.PI / 2 - seg / 2 + i * seg;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, a0, a0 + seg); ctx.closePath();
      const g = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
      g.addColorStop(0, shade(s.color, 0.25)); g.addColorStop(1, s.color);
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = 'rgba(232,203,132,.55)'; ctx.lineWidth = Math.max(1, size / 300); ctx.stroke();
      // Texto
      ctx.save();
      ctx.rotate(a0 + seg / 2);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = s.jackpot ? '#3A0F16' : '#F4EDDF';
      ctx.font = `800 ${Math.round(size * (s.jackpot ? 0.05 : 0.044))}px "Bodoni Moda", Didot, serif`;
      ctx.fillText(fmt(s.amount), r * 0.9, 0);
      ctx.restore();
    }
    ctx.restore();
    // Bombillas
    const bulbs = 24;
    for (let i = 0; i < bulbs; i++) {
      const a = (i / bulbs) * Math.PI * 2;
      const on = spinning ? (i + bulbsOn) % 2 === 0 : i % 3 === 0;
      ctx.beginPath();
      ctx.arc(c + Math.cos(a) * R * 0.94, c + Math.sin(a) * R * 0.94, size * 0.009, 0, Math.PI * 2);
      ctx.fillStyle = on ? '#FFF6D8' : '#5E1A24';
      ctx.shadowColor = on ? 'rgba(255,240,200,.9)' : 'transparent';
      ctx.shadowBlur = on ? size * 0.02 : 0;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  };

  const status = h('div');
  const updateHub = () => {
    const wait = wheelReadyIn();
    hub.disabled = spinning || wait > 0;
    clear(hub).append(spinning ? '…' : wait > 0 ? h('span', { style: { fontSize: '.6em', fontFamily: 'var(--font-ui)', fontWeight: 800 } }, duration(wait).replace(/ \d+ s$/, '')) : 'Girar');
    clear(status);
    if (wait > 0 && !spinning) {
      status.append(h('div.muted.small', 'Próximo giro gratis en'), h('div.countdown', duration(wait)));
    } else if (!spinning) {
      status.append(h('div.countdown', { style: { color: 'var(--brass-hi)' } }, '¡Tienes un giro!'), h('div.muted.small', 'Pulsa el centro de la ruleta.'));
    }
  };

  const spin = () => {
    if (spinning || wheelReadyIn() > 0) return;
    spinning = true;
    const idx = pickSegment();
    const prize = WHEEL_SEGMENTS[idx].amount;
    store.update((s) => { s.wheel.last = Date.now(); s.wheel.pending = prize; });
    store.progress('spin');
    // El segmento i está centrado en ángulo i*seg (desde arriba) cuando angle = 0; queremos angle ≡ -i*seg
    const jitter = (Math.random() - 0.5) * seg * 0.7;
    const base = angle % (2 * Math.PI);
    let target = -idx * seg + jitter;
    while (target <= base) target += 2 * Math.PI;
    const turns = prefersReducedMotion() ? 0 : 6;
    const end = angle - base + target + turns * 2 * Math.PI;
    const start = angle;
    const dur = prefersReducedMotion() ? 600 : 5600;
    const t0 = performance.now();
    let lastSeg = Math.floor((start + seg / 2) / seg);
    updateHub();
    const frame = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      angle = start + (end - start) * easeOut(k);
      const curSeg = Math.floor((angle + seg / 2) / seg);
      if (curSeg !== lastSeg) {
        lastSeg = curSeg;
        play('tick');
        pointer.classList.remove('tick'); void pointer.offsetWidth; pointer.classList.add('tick');
      }
      if (Math.floor(t / 120) % 2 !== bulbsOn % 2) bulbsOn++;
      draw();
      if (k < 1) requestAnimationFrame(frame);
      else finish();
    };
    requestAnimationFrame(frame);
    const finish = () => {
      spinning = false;
      angle = end;
      const s = store.get();
      if (s.wheel.pending > 0) {
        store.update((st) => { st.wheel.pending = 0; st.stats.wheelSpins++; st.stats.wheelTotal += prize; });
        store.addBalance(prize, 'ruleta');
      }
      if (store.get().stats.wheelSpins >= 10) store.unlock('ruleta-10');
      const jackpot = WHEEL_SEGMENTS[idx].jackpot;
      if (jackpot) { store.unlock('jackpot'); play('jackpot'); confetti(220); }
      else { play('win'); if (prize >= 2500) confetti(120); }
      toast(`${jackpot ? '¡Premio gordo! ' : ''}+${fmt(prize)} fichas`, { type: 'gold', icon: '🎡', ms: 4000 });
      draw();
      updateHub();
      renderSide();
    };
  };
  hub.addEventListener('click', spin);

  // Lateral: probabilidades, bono diario y estadísticas
  const side = h('div.stack');
  const renderSide = () => {
    clear(side);
    const s = store.get();
    const total = WHEEL_SEGMENTS.reduce((a, x) => a + x.weight, 0);
    const sorted = WHEEL_SEGMENTS.slice().sort((a, b) => a.amount - b.amount);
    const odds = h('table.odds-table', h('tbody', sorted.map((x) => h('tr', h('td', h('strong', fmt(x.amount)), x.jackpot ? ' 💎' : ''), h('td', (x.weight / total * 100).toFixed(1).replace('.', ',') + ' %')))));
    const ev = WHEEL_SEGMENTS.reduce((a, x) => a + x.amount * x.weight, 0) / total;
    const daily = store.dailyStatus();
    side.append(
      h('h1.h1', 'Ruleta'),
      h('p.lead', { style: { marginTop: 0 } }, 'Un giro gratis cada 4 horas. Todos los premios son fichas para tu saldo.'),
      status,
      daily.available
        ? h('div.daily-banner', { style: { margin: '6px 0' } }, h('div', { style: { flex: 1 } }, h('strong', `Bono diario: ${fmt(DAILY_BONUS[daily.streak % 7])}`), h('div.small.muted', 'También lo tienes disponible hoy.')),
          h('button.btn.btn-primary.btn-sm', { type: 'button', onclick: () => { const g = store.claimDaily(DAILY_BONUS); if (g) { play('success'); toast(`+${fmt(g)} fichas`, { type: 'gold' }); renderSide(); } } }, svgIcon('i-gift'), 'Recoger'))
        : h('p.small.faint', `Bono diario recogido. Racha actual: ${daily.streak} ${daily.streak === 1 ? 'día' : 'días'}.`),
      h('div.panel.panel-tight', h('div.h3', { style: { marginBottom: '6px' } }, 'Probabilidades'), odds, h('p.small.faint', { style: { margin: '8px 0 0' } }, `Premio medio por giro: ${fmt(Math.round(ev))} fichas. Los gajos se ven iguales, pero cada premio tiene la probabilidad indicada.`)),
      h('p.small.faint', `Has girado ${s.stats.wheelSpins} ${s.stats.wheelSpins === 1 ? 'vez' : 'veces'} y ganado ${fmt(s.stats.wheelTotal)} fichas en la ruleta.`),
    );
    updateHub();
  };
  root.appendChild(h('div.wheel-page', wrap, side));
  renderSide();
  requestAnimationFrame(draw);
  const ro = new ResizeObserver(() => draw());
  ro.observe(wrap);
  const timer = setInterval(() => {
    if (!document.body.contains(wrap)) { clearInterval(timer); ro.disconnect(); return; }
    if (!spinning) updateHub();
  }, 1000);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => draw());
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) + 255 * amt), g = Math.min(255, ((n >> 8) & 255) + 255 * amt), b = Math.min(255, (n & 255) + 255 * amt);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
