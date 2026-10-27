// Widgets interactivos de la academia y las herramientas.
import { h, clear, pct, fmt } from '../util.js';
import { cardEl, cardsRow, segmented } from './components.js';
import { parseCards } from '../core/cards.js';
import { gridKey, OPEN_RANGES, DEFENSE_RANGES, parseRange, rangePercent, POSITION_INFO, positionLabels, rangeKeyFor, comboCount, EQUITY_VS_RANDOM, handRankIndex } from '../core/ranges.js';
import { HAND_LADDER, GLOSSARY } from '../data/lessons.js';

export function rangeGrid({ on = new Set(), tb = new Set(), onCell } = {}) {
  const grid = h('div.range-grid', { role: 'grid', 'aria-label': 'Cuadrícula de manos iniciales' });
  for (let r = 0; r < 13; r++) {
    for (let c = 0; c < 13; c++) {
      const key = gridKey(r, c);
      const cls = ['cell'];
      if (r === c) cls.push('pair');
      if (tb.has(key)) cls.push('tb');
      else if (on.has(key)) cls.push('on');
      const cell = h('button.' + cls.join('.'), { type: 'button', role: 'gridcell', 'aria-label': key + (on.has(key) || tb.has(key) ? ', incluida' : ''), dataset: { key } }, key);
      if (onCell) {
        cell.addEventListener('mouseenter', () => onCell(key, cell));
        cell.addEventListener('focus', () => onCell(key, cell));
        cell.addEventListener('click', () => onCell(key, cell));
      }
      grid.appendChild(cell);
    }
  }
  return grid;
}

function handInfoLine(key) {
  const eq = EQUITY_VS_RANDOM[key];
  const combos = comboCount(key);
  const rank = handRankIndex(key) + 1;
  return `${key}: ${combos} combinaciones, puesto ${rank} de 169 por fuerza${eq ? `, ${String(eq).replace('.', ',')} % contra una mano aleatoria` : ''}.`;
}

export function rangesWidget(initial = 'BTN') {
  const keys = ['UTG9', 'UTG1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'HU'];
  const wrap = h('div.stack');
  const info = h('p.small.muted', { style: { minHeight: '2.6em', margin: 0 } });
  const head = h('div.row');
  const gridHost = h('div');
  const pctEl = h('strong');
  const textEl = h('p.small.faint', { style: { margin: 0 } });
  const render = (k) => {
    const set = parseRange(OPEN_RANGES[k].text);
    clear(gridHost).appendChild(rangeGrid({ on: set, onCell: (key) => { info.textContent = handInfoLine(key) + (set.has(key) ? ' Se abre desde esta posición.' : ' No se abre desde esta posición.'); } }));
    pctEl.textContent = pct(rangePercent(set), 1) + ' de las manos';
    textEl.textContent = 'Notación: ' + OPEN_RANGES[k].text;
    info.textContent = 'Pasa el dedo o el ratón por una celda para ver los detalles de esa mano.';
  };
  const seg = segmented(keys.map((k) => ({ value: k, label: OPEN_RANGES[k].label.replace(' (9 jugadores)', ' 9-max').replace('Ciega pequeña', 'SB').replace('Botón heads-up', 'HU').replace('Botón', 'BTN').replace('Cutoff', 'CO').replace('Hijack', 'HJ') })), initial, render, { label: 'Posición' });
  head.append(seg);
  wrap.append(head, h('div.row', pctEl), gridHost, info, textEl,
    h('div.range-legend', h('span', h('i', { style: { background: 'var(--felt-hi)' } }), 'Abrir subiendo'), h('span', h('i', { style: { background: 'rgba(255,255,255,.08)' } }), 'Tirar')));
  render(initial);
  return wrap;
}

export function defenseWidget() {
  const wrap = h('div.stack');
  const info = h('p.small.muted', { style: { minHeight: '1.4em', margin: 0 } });
  const host = h('div');
  const render = (k) => {
    const d = DEFENSE_RANGES[k];
    const tb = parseRange(d.threeBet), call = parseRange(d.call);
    clear(host).appendChild(rangeGrid({ on: call, tb, onCell: (key) => { info.textContent = `${key}: ${tb.has(key) ? 'resubir (3-bet)' : call.has(key) ? 'pagar' : 'tirar'}.`; } }));
    info.textContent = `${d.label}: 3-bet con ${pct(rangePercent(tb), 1)}, pagar con ${pct(rangePercent(call), 1)}.`;
  };
  wrap.append(segmented(Object.keys(DEFENSE_RANGES).map((k) => ({ value: k, label: k === 'BB_VS_BTN' ? 'BB contra BTN' : 'BTN contra CO' })), 'BB_VS_BTN', render), host, info,
    h('div.range-legend', h('span', h('i', { style: { background: 'var(--oxblood-hi)' } }), '3-bet'), h('span', h('i', { style: { background: 'var(--felt-hi)' } }), 'Pagar'), h('span', h('i', { style: { background: 'rgba(255,255,255,.08)' } }), 'Tirar')));
  render('BB_VS_BTN');
  return wrap;
}

export function ladderWidget() {
  return h('div.ladder', HAND_LADDER.map((r, i) => h('div.ladder-row',
    h('span.n', String(i + 1)),
    h('div.t', h('strong', r.name), h('span', r.desc)),
    cardsRow(parseCards(r.cards), { tight: true }),
    h('span.p', `Probabilidad con 7 cartas: ${r.prob}`),
  )));
}

export function positionsWidget() {
  const wrap = h('div');
  const table = h('div.pos-table', h('div.rail', h('div.felt')));
  const info = h('div.notice', { style: { minHeight: '84px' } });
  let n = 6;
  const render = () => {
    table.querySelectorAll('.pos-dot').forEach((d) => d.remove());
    const labels = positionLabels(n);
    for (let off = 0; off < n; off++) {
      // Asiento 0 abajo; el orden de reparto avanza en sentido horario
      const a = Math.PI / 2 + (off * 2 * Math.PI) / n;
      const label = labels[off];
      const pi = POSITION_INFO[label];
      const dot = h('button.pos-dot', { type: 'button', dataset: { g: pi.group } }, label, h('small', pi.group));
      dot.style.left = 50 + 46 * Math.cos(a) + '%';
      dot.style.top = 50 + 42 * Math.sin(a) + '%';
      dot.addEventListener('click', () => select(label, dot));
      table.appendChild(dot);
    }
    const first = table.querySelector('.pos-dot');
    select(labels[0], first);
  };
  const select = (label, dot) => {
    table.querySelectorAll('.pos-dot').forEach((d) => d.classList.remove('sel'));
    if (dot) dot.classList.add('sel');
    const pi = POSITION_INFO[label];
    const rk = rangeKeyFor(label, n);
    const rp = rk ? rangePercent(parseRange(OPEN_RANGES[rk].text)) : null;
    clear(info).append(h('div', h('strong', `${label}: ${pi.name}`), h('div', pi.desc), rp != null ? h('div.small.faint', { style: { marginTop: '4px' } }, `Apertura orientativa con ${n} jugadores: ${pct(rp, 0)} de las manos.`) : h('div.small.faint', { style: { marginTop: '4px' } }, 'La ciega grande no abre: defiende contra las subidas de los demás.')));
  };
  wrap.append(segmented([{ value: 6, label: '6 jugadores' }, { value: 9, label: '9 jugadores' }], 6, (v) => { n = v; render(); }), table, info);
  render();
  return wrap;
}

export function sizingWidget() {
  const wrap = h('div.panel.panel-tight.stack');
  const range = h('input.range', { type: 'range', min: '10', max: '200', step: '5', value: '50', 'aria-label': 'Tamaño de la apuesta en porcentaje del bote' });
  const lbl = h('div.calc-out');
  const out = h('div.grid-3');
  const render = () => {
    const f = Number(range.value) / 100;
    range.style.setProperty('--fill', ((f * 100 - 10) / 190) * 100 + '%');
    lbl.textContent = `${Math.round(f * 100)} % del bote`;
    const need = f / (1 + 2 * f);
    const be = f / (1 + f);
    const mdf = 1 / (1 + f);
    clear(out).append(
      h('div', h('div.h3', pct(need, 1)), h('div.small.muted', 'Equity que necesita tu rival para pagar')),
      h('div', h('div.h3', pct(be, 1)), h('div.small.muted', 'Frecuencia de retirada para que un farol gane')),
      h('div', h('div.h3', pct(mdf, 1)), h('div.small.muted', 'Frecuencia mínima de defensa (MDF)')),
    );
  };
  range.addEventListener('input', render);
  wrap.append(lbl, range, out);
  render();
  return wrap;
}

export function outsWidget() {
  const rows = [
    ['Proyecto de escalera interna (gutshot)', 4], ['Dos cartas más altas que el tablero', 6], ['Pareja a trío (set)', 2],
    ['Proyecto de escalera abierto', 8], ['Proyecto de color', 9], ['Color + escalera interna', 12], ['Color + escalera abierta', 15],
  ];
  const tbl = h('table', h('thead', h('tr', h('th', 'Proyecto'), h('th.r', 'Outs'), h('th.r', 'En el turn'), h('th.r', 'Hasta el river'), h('th.r', 'Regla del 4'))));
  const body = h('tbody');
  for (const [name, o] of rows) {
    const turn = o / 47;
    const river = 1 - ((47 - o) / 47) * ((46 - o) / 46);
    body.appendChild(h('tr', h('td', name), h('td.r', String(o)), h('td.r', pct(turn, 1)), h('td.r', pct(river, 1)), h('td.r', Math.min(100, o * 4) + ' %')));
  }
  tbl.appendChild(body);
  return tbl;
}

export function glossaryWidget() {
  const dl = h('dl', { style: { margin: 0 } });
  for (const [term, def] of GLOSSARY) {
    dl.append(h('dt', { style: { fontWeight: 800, marginTop: '14px', color: 'var(--text)' } }, term), h('dd', { style: { margin: '2px 0 0', color: 'var(--text-dim)' } }, def));
  }
  return dl;
}

export const WIDGETS = {
  ladder: ladderWidget,
  positions: positionsWidget,
  ranges: () => rangesWidget('BTN'),
  defense: defenseWidget,
  sizing: sizingWidget,
  outs: outsWidget,
  glossary: glossaryWidget,
};

export { cardEl, fmt };
