// Herramientas: calculadora de equity, pot odds, visor de rangos e historial de manos.
import { h, clear, svgIcon, fmt, pct, toast, modal, fmtSigned } from '../util.js';
import { cardEl, segmented } from './components.js';
import { store } from '../store.js';
import { calcEquityAsync } from '../core/equity.js';
import { parseCards, RANKS } from '../core/cards.js';
import { rangesWidget, defenseWidget } from './widgets.js';

const TABS = [
  ['equity', 'Calculadora de equity'],
  ['odds', 'Pot odds'],
  ['rangos', 'Rangos'],
  ['historial', 'Historial de manos'],
];

export function renderTools(root, tab, app) {
  const current = TABS.some(([k]) => k === tab) ? tab : 'equity';
  root.appendChild(h('div.section-head', h('div', h('h1.h1', 'Herramientas'), h('p.lead', 'Calcula probabilidades, consulta rangos y repasa tus manos.'))));
  root.appendChild(h('div', { style: { marginBottom: '20px', overflowX: 'auto' } }, segmented(TABS.map(([k, l]) => ({ value: k, label: l })), current, (v) => app.navigate('#/herramientas/' + v), { label: 'Herramienta' })));
  const body = h('div');
  root.appendChild(body);
  if (current === 'equity') equityTool(body);
  else if (current === 'odds') oddsTool(body);
  else if (current === 'rangos') body.append(h('div.grid-2', h('div.panel', h('h2.h3', { style: { marginBottom: '12px' } }, 'Apertura por posición'), rangesWidget('CO')), h('div.panel', h('h2.h3', { style: { marginBottom: '12px' } }, 'Defensa contra subidas'), defenseWidget())));
  else historyTool(body);
}

// ---------------- Calculadora de equity ----------------
function equityTool(root) {
  const st = { players: [[null, null], [null, null]], board: [null, null, null, null, null], target: { p: 0, i: 0 }, job: null, results: null };
  const playersEl = h('div.eq-players');
  const boardEl = h('div.board-slots');
  const picker = h('div.picker', { role: 'grid', 'aria-label': 'Selector de cartas' });
  const status = h('p.small.faint', { style: { margin: 0 } });
  const used = () => new Set([...st.players.flat(), ...st.board].filter((c) => c !== null));

  const advanceTarget = () => {
    const slots = [];
    st.players.forEach((pl, p) => pl.forEach((c, i) => slots.push({ p, i, c })));
    st.board.forEach((c, i) => slots.push({ p: 'b', i, c }));
    const curIdx = slots.findIndex((s) => s.p === st.target.p && s.i === st.target.i);
    for (let k = 1; k <= slots.length; k++) {
      const s = slots[(curIdx + k) % slots.length];
      if (s.c === null) { st.target = { p: s.p, i: s.i }; return; }
    }
  };
  const setCard = (c) => {
    if (st.target.p === 'b') st.board[st.target.i] = c;
    else st.players[st.target.p][st.target.i] = c;
    st.results = null;
    advanceTarget();
    render();
  };
  const slotBtn = (c, isTarget, onClick, label) => {
    const b = h('button.slot-btn' + (isTarget ? '.active' : ''), { type: 'button', 'aria-label': label }, cardEl(c));
    b.addEventListener('click', onClick);
    return b;
  };
  const render = () => {
    clear(playersEl);
    st.players.forEach((pl, p) => {
      const r = st.results;
      const res = h('div.eq-res');
      if (r) {
        const bar = h('div.bar', h('span.w'), h('span.t'));
        bar.children[0].style.width = (r.win[p] * 100) + '%';
        bar.children[1].style.width = (r.tie[p] * 100) + '%';
        res.append(h('div.nums', h('strong', pct(r.equity[p], 1)), h('span', 'gana ' + pct(r.win[p], 1)), h('span', 'empata ' + pct(r.tie[p], 1))), bar);
      } else res.append(h('span.small.faint', pl.every((c) => c === null) ? 'Mano aleatoria' : pl.some((c) => c === null) ? 'Elige la segunda carta' : 'Lista'));
      const remove = st.players.length > 2 ? h('button.icon-btn', { type: 'button', 'aria-label': 'Quitar jugador', onclick: () => { st.players.splice(p, 1); st.target = { p: 0, i: 0 }; st.results = null; render(); } }, svgIcon('i-x')) : h('span');
      playersEl.appendChild(h('div.eq-player',
        h('span.idx', String(p + 1)),
        h('div.card-row', pl.map((c, i) => slotBtn(c, st.target.p === p && st.target.i === i, () => {
          if (c !== null) { st.players[p][i] = null; st.results = null; }
          st.target = { p, i }; render();
        }, `Jugador ${p + 1}, carta ${i + 1}`))),
        res,
        remove,
      ));
    });
    clear(boardEl);
    st.board.forEach((c, i) => boardEl.appendChild(slotBtn(c, st.target.p === 'b' && st.target.i === i, () => {
      if (c !== null) { st.board[i] = null; st.results = null; }
      st.target = { p: 'b', i }; render();
    }, `Tablero, carta ${i + 1}`)));
    clear(picker);
    const u = used();
    for (let s = 0; s < 4; s++) {
      for (let r = 12; r >= 0; r--) {
        const c = (r << 2) | s;
        const b = h('button', { type: 'button', disabled: u.has(c), 'aria-label': RANKS[r] + 'shdc'[s] }, cardEl(c));
        b.addEventListener('click', () => setCard(c));
        picker.appendChild(b);
      }
    }
  };
  const run = async () => {
    for (const pl of st.players) if (pl.filter((c) => c !== null).length === 1) { toast('Cada jugador necesita dos cartas o ninguna (aleatoria)', { type: 'error' }); return; }
    const board = st.board.filter((c) => c !== null);
    if (board.length > 0 && board.length < 3) { toast('El tablero debe tener 0, 3, 4 o 5 cartas', { type: 'error' }); return; }
    if (st.job) st.job.cancel();
    const hands = st.players.map((pl) => (pl[0] === null ? null : pl.slice()));
    status.textContent = 'Calculando…';
    st.job = calcEquityAsync({ hands, board, iterations: 60000 }, (r, done) => {
      st.results = r;
      status.textContent = done ? (r.exhaustive ? `Cálculo exacto: ${fmt(r.samples)} combinaciones.` : `Simulación Monte Carlo: ${fmt(r.samples)} repartos.`) : `Calculando… ${fmt(r.samples)}`;
      render();
    });
    await st.job.promise;
    store.progress('equityCalc');
  };
  const quick = (txt) => {
    const parts = txt.split(' vs ').map((x) => parseCards(x));
    st.players = parts.map((p) => [p[0], p[1]]);
    st.board = [null, null, null, null, null];
    st.target = { p: 'b', i: 0 };
    st.results = null;
    render();
    run();
  };
  root.append(h('div.grid-2', { style: { alignItems: 'start' } },
    h('div.panel.stack',
      h('h2.h3', 'Jugadores'),
      playersEl,
      h('div.row',
        h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => { if (st.players.length < 6) { st.players.push([null, null]); st.results = null; render(); } } }, svgIcon('i-plus'), 'Añadir jugador'),
        h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => { st.players = st.players.map(() => [null, null]); st.board = [null, null, null, null, null]; st.target = { p: 0, i: 0 }; st.results = null; render(); } }, svgIcon('i-trash'), 'Limpiar'),
      ),
      h('h2.h3', { style: { marginTop: '6px' } }, 'Tablero'),
      boardEl,
      h('div.row', h('button.btn.btn-primary', { type: 'button', onclick: run }, 'Calcular'), status),
      h('div.small.faint', 'Prueba: ',
        ...['AhAs vs KdKc', 'AsKs vs QhQd', 'AhKd vs AsQc', 'Js Ts vs 2c 2d'].map((x) => h('button.link-btn', { type: 'button', style: { marginRight: '10px' }, onclick: () => quick(x) }, x.replace(/\s/g, '').replace('vs', ' vs ')))),
    ),
    h('div.panel.stack', h('h2.h3', 'Elige cartas'), h('p.small.faint', { style: { margin: 0 } }, 'Toca un hueco y después una carta. Toca una carta ya puesta para quitarla.'), picker),
  ));
  render();
}

// ---------------- Pot odds ----------------
function oddsTool(root) {
  const pot = h('input.input', { type: 'number', min: '0', value: '1000', 'aria-label': 'Bote' });
  const bet = h('input.input', { type: 'number', min: '0', value: '500', 'aria-label': 'Apuesta a pagar' });
  const outs = h('input.input', { type: 'number', min: '0', max: '20', value: '9', 'aria-label': 'Outs' });
  let streetVal = 'flop';
  const street = segmented([{ value: 'flop', label: 'En el flop' }, { value: 'turn', label: 'En el turn' }], 'flop', (v) => { streetVal = v; calc(); });
  const out = h('div.stack');
  const calc = () => {
    const P = Math.max(0, Number(pot.value) || 0), B = Math.max(0, Number(bet.value) || 0), O = Math.max(0, Math.min(20, Number(outs.value) || 0));
    const need = B > 0 ? B / (P + 2 * B) : 0;
    const eqTurn = O / 47;
    const eqRiver = 1 - ((47 - O) / 47) * ((46 - O) / 46);
    const eqNext = streetVal === 'flop' ? eqTurn : O / 46;
    const eqAll = streetVal === 'flop' ? eqRiver : O / 46;
    const good = eqNext >= need;
    clear(out).append(
      h('div.grid-3',
        h('div', h('div.calc-out', pct(need, 1)), h('div.small.muted', 'Equity necesaria para pagar')),
        h('div', h('div.calc-out', pct(eqNext, 1)), h('div.small.muted', streetVal === 'flop' ? 'Ligar en el turn' : 'Ligar en el river')),
        h('div', h('div.calc-out', pct(eqAll, 1)), h('div.small.muted', streetVal === 'flop' ? 'Ligar hasta el river (si llegas gratis)' : 'Sólo queda el river')),
      ),
      h('div.feedback.' + (good ? 'good' : 'bad'), h('strong', good ? 'Pagar es rentable sólo con tus outs.' : 'Con tus outs no basta para pagar esta carta.'),
        good ? 'Tus probabilidades de ligar en la siguiente carta superan el precio que te ofrecen.' : `Te harían falta probabilidades implícitas: ganar unas ${fmt(Math.max(0, Math.ceil(B / Math.max(eqNext, 0.01) - (P + 2 * B))))} fichas más cuando ligues.`),
    );
  };
  [pot, bet, outs].forEach((i) => i.addEventListener('input', calc));
  root.appendChild(h('div.panel.stack', { style: { maxWidth: '760px' } },
    h('div.grid-3',
      h('div.field', h('label', 'Bote antes de la apuesta'), pot),
      h('div.field', h('label', 'Apuesta a pagar'), bet),
      h('div.field', h('label', 'Outs'), outs),
    ),
    street,
    out,
  ));
  calc();
}

// ---------------- Historial ----------------
const ACT_TXT = { sb: 'ciega pequeña', bb: 'ciega grande', ante: 'ante', fold: 'no va', check: 'pasa', call: 'iguala', bet: 'apuesta', raise: 'sube a', win: 'gana', return: 'recupera' };

function historyTool(root) {
  const list = store.history();
  if (!list.length) {
    root.appendChild(h('div.empty', h('div.big', '🂠'), h('p', 'Aún no has jugado ninguna mano. Las últimas 60 aparecerán aquí.'), h('a.btn.btn-primary', { href: '#/' }, 'Ir a las mesas')));
    return;
  }
  const box = h('div.panel');
  for (const hh of list) {
    const hero = hh.players.find((p) => p.hero);
    const date = new Date(hh.at || hh.date);
    box.appendChild(h('div.hist-item', { role: 'button', tabindex: '0', onclick: () => showHand(hh), onkeydown: (e) => { if (e.key === 'Enter') showHand(hh); } },
      h('div.card-row.tight', (hero && hero.cards ? parseCards(hero.cards.join('')) : [-1, -1]).map((c) => cardEl(c))),
      h('div', h('div.h-title', { style: { fontWeight: 700 } }, `${hh.table}${hh.online ? ' (online)' : ''}`), h('div.small.faint', `${date.toLocaleDateString('es-ES')} ${date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}, ciegas ${fmt(hh.sb)}/${fmt(hh.bb)}${hh.finalHand ? ', ' + hh.finalHand.toLowerCase() : ''}`)),
      h('div', { style: { fontWeight: 800 }, class: hh.net > 0 ? 'pos' : hh.net < 0 ? 'neg' : 'muted' }, fmtSigned(hh.net)),
    ));
  }
  root.append(h('div.row', { style: { marginBottom: '12px' } }, h('span.muted.small', `${list.length} manos guardadas en este dispositivo`), h('span.spacer'), h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => { store.clearHistory(); clear(root); historyTool(root); } }, svgIcon('i-trash'), 'Borrar historial')), box);
}

export function showHand(hh) {
  const body = h('div.hist-detail');
  body.appendChild(h('div.small.faint', `Mesa ${hh.table}, ciegas ${fmt(hh.sb)}/${fmt(hh.bb)}${hh.ante ? ', ante ' + fmt(hh.ante) : ''}`));
  const pl = h('div', { style: { margin: '10px 0' } });
  for (const p of hh.players) {
    pl.appendChild(h('div.line', h('b', `${p.position || ''} ${p.name}${p.hero ? ' (tú)' : ''}`), ` con ${fmt(p.startStack)}`, p.cards ? h('span.card-row.tight', { style: { display: 'inline-flex', marginLeft: '8px', verticalAlign: 'middle' } }, parseCards(p.cards.join('')).map((c) => cardEl(c, { cls: 'sm' }))) : null));
  }
  body.appendChild(pl);
  const board = parseCards((hh.board || []).join(''));
  const streets = [['preflop', 'Preflop', []], ['flop', 'Flop', board.slice(0, 3)], ['turn', 'Turn', board.slice(3, 4)], ['river', 'River', board.slice(4, 5)]];
  const lineText = (l) => {
    let t = ACT_TXT[l.action] || l.action;
    if (l.action === 'raise' || l.action === 'bet') t += ' ' + fmt(l.to);
    else if (l.amount) t += ' ' + fmt(l.amount);
    return h('div.line', h('b', l.name), ' ', t);
  };
  streets.forEach(([key, label, cards], i) => {
    const lines = hh.log.filter((l) => l.street === key && l.action !== 'win');
    if (!lines.length && (i === 0 || !cards.length)) return;
    body.appendChild(h('div.street', label, h('span.card-row.tight', cards.map((c) => cardEl(c)))));
    lines.forEach((l) => body.appendChild(lineText(l)));
  });
  hh.log.filter((l) => l.action === 'win').forEach((l) => body.appendChild(lineText(l)));
  body.appendChild(h('div.street', 'Resultado'));
  body.appendChild(h('div.line', h('b', hh.net > 0 ? `Ganaste ${fmt(hh.won)}` : hh.net < 0 ? `Perdiste ${fmt(-hh.net)}` : 'Recuperaste lo apostado'), hh.finalHand ? ` con ${hh.finalHand.toLowerCase()}` : ''));
  modal({ title: `Mano #${hh.number}`, body, wide: true, actions: [{ label: 'Cerrar', primary: true }] });
}
