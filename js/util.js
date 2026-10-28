// Utilidades de DOM y formato. Todo el contenido de usuario se inserta con textContent (nunca innerHTML).

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// h('div.clase#id', {attrs}, ...hijos). Las cadenas se insertan como texto.
export function h(tag, attrs, ...children) {
  const m = tag.match(/^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i);
  const el = document.createElement((m && m[1]) || 'div');
  if (m && m[2]) {
    for (const part of m[2].match(/[.#][\w-]+/g) || []) {
      if (part[0] === '.') el.classList.add(part.slice(1));
      else el.id = part.slice(1);
    }
  }
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = null;
  }
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className += (el.className ? ' ' : '') + v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v; // sólo para marcado estático propio
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function svgIcon(id, cls = 'icon') {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(ns, 'use');
  use.setAttribute('href', '#' + id);
  svg.appendChild(use);
  return svg;
}

export function fmt(n) {
  n = Math.round(Number(n) || 0);
  const neg = n < 0;
  const s = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '−' : '') + s;
}

export function fmtShort(n) {
  n = Math.round(Number(n) || 0);
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(a >= 1e10 ? 0 : 1).replace('.', ',') + ' B';
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, '').replace('.', ',') + ' M';
  if (a >= 1e5) return Math.round(n / 1e3) + ' k';
  return fmt(n);
}

export function fmtSigned(n) {
  return (n > 0 ? '+' : '') + fmt(n);
}

export function pct(x, digits = 1) {
  return (x * 100).toFixed(digits).replace('.', ',') + ' %';
}

export function duration(ms) {
  if (ms <= 0) return '0 s';
  const s = Math.ceil(ms / 1000);
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  if (hh > 0) return `${hh} h ${String(mm).padStart(2, '0')} min`;
  if (mm > 0) return `${mm} min ${String(ss).padStart(2, '0')} s`;
  return `${ss} s`;
}

export function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function daysBetween(a, b) {
  const da = new Date(a + 'T00:00:00'), db = new Date(b + 'T00:00:00');
  return Math.round((db - da) / 86400000);
}

export function randomHex(bytes = 8) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function randomCode(len = 6) {
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  return [...a].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}
export function normalizeCode(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}
export function isValidCode(s) {
  return /^[A-HJ-NP-Z2-9]{6}$/.test(s);
}

// Limpia nombres: sin caracteres de control ni bidi, longitud limitada.
export function cleanName(s, max = 18) {
  return String(s || '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function cleanText(s, max = 200) {
  return String(s || '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '')
    .trim()
    .slice(0, max);
}

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const prefersReducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Toasts ----------
let toastHost;
export function toast(message, { type = 'info', ms = 3200, icon } = {}) {
  if (!toastHost) {
    toastHost = h('div.toasts', { role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(toastHost);
  }
  const el = h('div.toast.' + type, icon ? h('span.toast-icon', icon) : null, h('span', message));
  toastHost.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => {
    el.classList.remove('in');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 600);
  }, ms);
}

// ---------- Modales ----------
export function modal({ title, body, actions = [], onClose, wide = false, dismissable = true, className = '' }) {
  const prevFocus = document.activeElement;
  const close = (val) => {
    overlay.classList.remove('in');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => overlay.remove(), 220);
    if (prevFocus && prevFocus.focus) prevFocus.focus();
    if (onClose) onClose(val);
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && dismissable) close(null);
  };
  const footer = actions.length
    ? h('div.modal-actions', actions.map((a) => {
      const b = h('button.btn' + (a.primary ? '.btn-primary' : a.danger ? '.btn-danger' : '.btn-ghost'), { type: 'button' }, a.label);
      b.addEventListener('click', async () => {
        if (a.onClick) {
          const r = await a.onClick(close);
          if (r === false) return;
        }
        close(a.value ?? a.label);
      });
      return b;
    }))
    : null;
  const titleId = 'm' + randomHex(3);
  const dialog = h('div.modal' + (wide ? '.wide' : '') + (className ? '.' + className : ''), { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    h('div.modal-head', h('h2', { id: titleId }, title || ''), dismissable ? h('button.icon-btn.modal-x', { type: 'button', 'aria-label': 'Cerrar', onclick: () => close(null) }, svgIcon('i-x')) : null),
    h('div.modal-body', body),
    footer,
  );
  const overlay = h('div.overlay', dialog);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay && dismissable) close(null); });
  document.body.appendChild(overlay);
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => {
    overlay.classList.add('in');
    const f = dialog.querySelector('[autofocus]') || dialog.querySelector('input:not([readonly]), button.btn-primary, button.btn, [tabindex="0"]');
    if (f) f.focus({ preventScroll: true });
  });
  return { close, el: dialog };
}

export function confirmDialog(title, text, { ok = 'Aceptar', cancel = 'Cancelar', danger = false } = {}) {
  return new Promise((resolve) => {
    modal({
      title,
      body: h('p', text),
      actions: [
        { label: cancel, value: false },
        { label: ok, value: true, primary: !danger, danger },
      ],
      onClose: (v) => resolve(v === true),
    });
  });
}

// ---------- Confeti ----------
export function confetti(count = 140) {
  if (prefersReducedMotion()) return;
  const c = h('canvas.confetti');
  document.body.appendChild(c);
  const dpr = window.devicePixelRatio || 1;
  c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  const colors = ['#C8A24E', '#F4EDDF', '#C2263A', '#2E8B7F', '#E9C46A', '#ffffff'];
  const parts = Array.from({ length: count }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 120,
    y: innerHeight * 0.45,
    vx: (Math.random() - 0.5) * 14,
    vy: -6 - Math.random() * 10,
    r: 4 + Math.random() * 6,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.4,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));
  const t0 = performance.now();
  const frame = (t) => {
    const dt = Math.min(32, t - (frame.last || t)) / 16;
    frame.last = t;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 0.32 * dt; p.vx *= 0.99; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.color; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
      ctx.restore();
    }
    if (t - t0 < 3200) requestAnimationFrame(frame);
    else c.remove();
  };
  requestAnimationFrame(frame);
}

export function vibrate(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* sin soporte */ }
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }, text);
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
    ta.remove();
    return ok;
  }
}
