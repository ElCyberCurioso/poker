// Componentes visuales reutilizables: naipes, fichas, interruptores, segmentados.
import { h, svgIcon, fmt } from '../util.js';
import { RANK_LABEL, SUIT_NAMES, RANK_NAMES } from '../core/cards.js';

const SUIT_IDS = ['s-s', 's-h', 's-d', 's-c'];
const SUIT_CLS = ['s', 'h', 'd', 'c'];

// c: 0..51 (cara), -1 (dorso), null (hueco vacío)
export function cardEl(c, { cls = '', anim = '' } = {}) {
  if (c === null || c === undefined) return h('div.pcard.slot' + (cls ? '.' + cls : ''), { 'aria-hidden': 'true' });
  if (c < 0) return h('div.pcard.back' + (cls ? '.' + cls : '') + (anim ? '.' + anim : ''), { role: 'img', 'aria-label': 'Carta boca abajo' });
  const r = c >> 2, s = c & 3;
  const red = s === 1 || s === 2;
  const el = h('div.pcard.suit-' + SUIT_CLS[s] + (red ? '.red' : '') + (r >= 9 && r <= 11 ? '.face' : '') + (cls ? '.' + cls : '') + (anim ? '.' + anim : ''), {
    role: 'img', 'aria-label': `${RANK_NAMES[r]} de ${SUIT_NAMES[s]}`, dataset: { card: String(c) },
  });
  el.appendChild(h('span.rank' + (r === 8 ? '.ten' : ''), RANK_LABEL[r]));
  el.appendChild(svgIcon(SUIT_IDS[s], 's-small'));
  el.appendChild(svgIcon(SUIT_IDS[s], 's-big'));
  return el;
}

export function cardsRow(cards, opts = {}) {
  return h('div.card-row' + (opts.tight ? '.tight' : ''), cards.map((c) => cardEl(c, opts)));
}

// Colores de fichas según el valor
const CHIP_COLORS = [
  [1e6, '#7B5CC4'], [1e5, '#C8A24E'], [25000, '#C2263A'], [5000, '#2B2B2B'], [1000, '#E9E0CC'],
  [500, '#7A2531'], [100, '#1A6A61'], [25, '#2D63C8'], [5, '#B33A3A'], [0, '#D9D2C2'],
];
function chipColor(v) {
  for (const [min, c] of CHIP_COLORS) if (v >= min) return c;
  return '#D9D2C2';
}

// Pila de fichas visual (hasta 5 discos) para un importe.
export function chipStack(amount, bb = 20) {
  const n = Math.max(1, Math.min(5, Math.ceil(Math.log2(1 + amount / Math.max(1, bb)))));
  const el = h('div.chips');
  const unit = amount / n;
  for (let i = 0; i < n; i++) {
    const disc = h('i');
    disc.style.setProperty('--c', chipColor(i === n - 1 ? amount : unit * (i + 1)));
    disc.style.bottom = `calc(var(--s) * ${i * 3}px)`;
    el.appendChild(disc);
  }
  return el;
}

export function chipIcon(size) {
  const el = h('span.chip-ico', { 'aria-hidden': 'true' });
  if (size) { el.style.width = size + 'px'; el.style.height = size + 'px'; }
  return el;
}

export function toggleRow({ title, desc, checked, onChange }) {
  const input = h('input', { type: 'checkbox' });
  input.checked = !!checked;
  input.addEventListener('change', () => onChange(input.checked));
  return h('label.switch', h('div.sw-text', h('strong', title), desc ? h('span', desc) : null), h('span.toggle', input, h('span.track')));
}

export function segmented(options, value, onChange, { label } = {}) {
  const wrap = h('div.seg', { role: 'group', 'aria-label': label || '' });
  const render = (val) => {
    for (const b of wrap.children) b.setAttribute('aria-pressed', String(b.dataset.v === String(val)));
  };
  for (const o of options) {
    const b = h('button', { type: 'button', dataset: { v: String(o.value) } }, o.label);
    b.addEventListener('click', () => { render(o.value); onChange(o.value); });
    wrap.appendChild(b);
  }
  render(value);
  return wrap;
}

export function balanceText(n) {
  return fmt(n);
}

export function iconButton(icon, label, onClick, extra = '') {
  return h('button.icon-btn' + extra, { type: 'button', 'aria-label': label, title: label, onclick: onClick }, svgIcon(icon));
}

export function progressBar(ratio) {
  const p = h('div.progress', h('span'));
  p.firstChild.style.width = Math.max(0, Math.min(100, ratio * 100)) + '%';
  return p;
}

export function pips(n, max = 4) {
  return h('span.pips', { 'aria-label': `Dificultad ${n} de ${max}` }, Array.from({ length: max }, (_, i) => h('i' + (i < n ? '.on' : ''))));
}
