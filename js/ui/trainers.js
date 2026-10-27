// Entrenadores: ejercicios generados al azar con corrección inmediata.
import { h, clear, fmt, pct } from '../util.js';
import { cardEl, cardsRow } from './components.js';
import { store } from '../store.js';
import { play } from '../audio.js';
import { fullDeck, shuffleSecure, handKey, fastRng } from '../core/cards.js';
import { evalCards, describeScore, CAT_NAMES } from '../core/evaluator.js';
import { calcEquity } from '../core/equity.js';
import { openRangeSet, OPEN_RANGES, rangePercent, handPercentile, keyCombos, HAND_ORDER, POSITION_INFO } from '../core/ranges.js';

const REWARD = 50;
const rand = (n) => Math.floor(fastRng() * n);
const pick = (arr) => arr[rand(arr.length)];
function deal(n, exclude = []) {
  const ex = new Set(exclude);
  return shuffleSecure(fullDeck().filter((c) => !ex.has(c))).slice(0, n);
}
function shuffled(arr) { return shuffleSecure(arr.slice()); }

// ---------------- Generadores ----------------
const T_WHO = {
  id: 'quien-gana', icon: '🏆', title: '¿Quién gana?', desc: 'Mira el tablero y elige la mano ganadora.',
  make() {
    const n = 2 + rand(2);
    const cards = deal(5 + n * 2);
    const board = cards.slice(0, 5);
    const hands = [];
    for (let i = 0; i < n; i++) hands.push(cards.slice(5 + i * 2, 7 + i * 2));
    const scores = hands.map((hd) => evalCards(hd.concat(board)));
    const best = Math.max(...scores);
    const winners = scores.map((s, i) => (s === best ? i : -1)).filter((i) => i >= 0);
    return { board, hands, scores, winners };
  },
  render(q, answer) {
    const stage = h('div.trainer-stage', h('div.label', 'Tablero'), cardsRow(q.board));
    const hands = h('div.trainer-hands');
    q.hands.forEach((hd, i) => {
      const el = h('button.trainer-hand.pick', { type: 'button' }, h('strong', `Mano ${String.fromCharCode(65 + i)}`), cardsRow(hd));
      el.addEventListener('click', () => answer(i));
      hands.appendChild(el);
    });
    stage.appendChild(hands);
    const tie = h('div.answers', h('button.btn.btn-ghost', { type: 'button', onclick: () => answer('tie') }, 'Empate (se reparte)'));
    return h('div', stage, tie);
  },
  check(q, a) {
    if (a === 'tie') return q.winners.length > 1;
    return q.winners.length === 1 && q.winners[0] === a;
  },
  explain(q) {
    const lines = q.hands.map((hd, i) => `Mano ${String.fromCharCode(65 + i)}: ${describeScore(q.scores[i])}`);
    const w = q.winners.length > 1 ? 'Empate: se reparte el bote.' : `Gana la mano ${String.fromCharCode(65 + q.winners[0])}.`;
    return [w, ...lines];
  },
};

const T_NAME = {
  id: 'nombra', icon: '🃏', title: 'Nombra la mano', desc: 'Con tus dos cartas y el tablero, ¿qué jugada tienes?',
  make() {
    let cards, score, tries = 0;
    do {
      cards = deal(7);
      score = evalCards(cards);
      tries++;
    } while ((score >> 20) < 2 && fastRng() < 0.7 && tries < 30);
    const cat = score >> 20;
    const opts = new Set([cat]);
    const near = [cat - 1, cat + 1, cat - 2, cat + 2, cat + 3, cat - 3].filter((c) => c >= 0 && c <= 8);
    for (const c of near) { if (opts.size >= 4) break; opts.add(c); }
    return { hole: cards.slice(0, 2), board: cards.slice(2), score, cat, options: shuffled([...opts]) };
  },
  render(q, answer) {
    return h('div',
      h('div.trainer-stage', h('div.label', 'Tus cartas'), cardsRow(q.hole), h('div.label', { style: { marginTop: '14px' } }, 'Tablero'), cardsRow(q.board)),
      h('div.answers', q.options.map((c) => h('button.btn.btn-ghost', { type: 'button', onclick: () => answer(c) }, CAT_NAMES[c]))),
    );
  },
  check: (q, a) => a === q.cat,
  explain: (q) => [`Tienes ${describeScore(q.score).charAt(0).toLowerCase() + describeScore(q.score).slice(1)}.`],
};

const PF_POS = [
  { label: 'UTG', key: 'LJ' }, { label: 'HJ', key: 'HJ' }, { label: 'CO', key: 'CO' }, { label: 'BTN', key: 'BTN' }, { label: 'SB', key: 'SB' },
];
const T_PREFLOP = {
  id: 'preflop', icon: '🎯', title: '¿Abrir o tirar?', desc: 'Mesa de seis, nadie ha entrado. Decide según tu posición.',
  make() {
    const pos = pick(PF_POS);
    const set = openRangeSet(pos.key);
    const share = rangePercent(set);
    // Mitad de las veces, manos cerca del límite del rango (las difíciles)
    let key;
    if (fastRng() < 0.55) {
      const border = HAND_ORDER.filter((k) => Math.abs(handPercentile(k) - share) < 0.12);
      key = pick(border.length ? border : HAND_ORDER);
    } else key = pick(HAND_ORDER);
    const combo = pick(keyCombos(key));
    return { pos, key, cards: shuffled(combo), open: set.has(key), share };
  },
  render(q, answer) {
    return h('div',
      h('div.trainer-stage',
        h('div.big-q', `Estás en ${q.pos.label}`),
        h('div.label', POSITION_INFO[q.pos.label].desc),
        h('div', { style: { height: '10px' } }),
        cardsRow(q.cards),
      ),
      h('div.answers',
        h('button.btn.btn-ghost', { type: 'button', onclick: () => answer(false) }, 'Tirar'),
        h('button.btn.btn-primary', { type: 'button', onclick: () => answer(true) }, 'Subir'),
      ),
    );
  },
  check: (q, a) => a === q.open,
  explain: (q) => [`${q.key} ${q.open ? 'está' : 'no está'} en el rango de apertura de ${q.pos.label} (${pct(q.share, 0)} de las manos: ${OPEN_RANGES[q.pos.key].text}).`],
};

const T_ODDS = {
  id: 'pot-odds', icon: '🧮', title: 'Pot odds', desc: 'Calcula la equity que necesitas para pagar una apuesta.',
  make() {
    const pot = (2 + rand(38)) * 50;
    const frac = pick([0.25, 1 / 3, 0.5, 2 / 3, 0.75, 1, 1.5]);
    const bet = Math.max(25, Math.round((pot * frac) / 25) * 25);
    const need = bet / (pot + 2 * bet);
    const correct = Math.round(need * 100);
    const opts = new Set([correct]);
    const cand = [correct - 8, correct + 8, correct - 5, correct + 6, Math.round((bet / pot) * 100), Math.round((bet / (pot + bet)) * 100), correct + 12];
    for (const c of shuffled(cand)) { if (opts.size >= 4) break; if (c > 0 && c < 100 && !opts.has(c) && Math.abs(c - correct) >= 4) opts.add(c); }
    return { pot, bet, need, correct, options: shuffled([...opts]) };
  },
  render(q, answer) {
    return h('div',
      h('div.trainer-stage',
        h('div.big-q', `Bote: ${fmt(q.pot)}`),
        h('div.label', `Tu rival apuesta ${fmt(q.bet)}. ¿Qué equity necesitas para que pagar sea rentable?`),
      ),
      h('div.answers', q.options.map((o) => h('button.btn.btn-ghost', { type: 'button', onclick: () => answer(o) }, o + ' %'))),
    );
  },
  check: (q, a) => a === q.correct,
  explain: (q) => [`Pagas ${fmt(q.bet)} para ganar un bote final de ${fmt(q.pot + 2 * q.bet)}: ${fmt(q.bet)} ÷ ${fmt(q.pot + 2 * q.bet)} = ${pct(q.need, 1)}.`],
};

const T_OUTS = {
  id: 'outs', icon: '🔢', title: 'Cuenta los outs', desc: '¿Cuántas cartas del turn te dan escalera o algo mejor?',
  make() {
    for (let tries = 0; tries < 400; tries++) {
      const cards = deal(5);
      const hole = cards.slice(0, 2), flop = cards.slice(2);
      const now = evalCards(cards) >> 20;
      if (now >= 4 || now >= 2) continue;
      const used = new Set(cards);
      const outs = [];
      for (let c = 0; c < 52; c++) {
        if (used.has(c)) continue;
        if ((evalCards(cards.concat([c])) >> 20) >= 4) outs.push(c);
      }
      if (outs.length >= 4 && outs.length <= 15) {
        const n = outs.length;
        const opts = new Set([n]);
        for (const d of shuffled([-4, -2, -1, 1, 2, 3, 4, 6])) { if (opts.size >= 4) break; if (n + d > 0) opts.add(n + d); }
        return { hole, flop, outs, n, options: shuffled([...opts]).sort((a, b) => a - b) };
      }
    }
    return this.make();
  },
  render(q, answer) {
    return h('div',
      h('div.trainer-stage', h('div.label', 'Tus cartas'), cardsRow(q.hole), h('div.label', { style: { marginTop: '14px' } }, 'Flop'), cardsRow(q.flop),
        h('div.label', { style: { marginTop: '10px' } }, 'Cuenta las cartas que te dan escalera, color o mejor en el turn.')),
      h('div.answers', q.options.map((o) => h('button.btn.btn-ghost', { type: 'button', onclick: () => answer(o) }, `${o} outs`))),
    );
  },
  check: (q, a) => a === q.n,
  explain: (q) => [`Tienes ${q.n} outs: ${pct(q.n / 47, 1)} de ligar en el turn y unos ${q.n * 4} % hasta el river (regla del 4).`],
  extra: (q) => h('div.card-row.tight', { style: { marginTop: '8px', justifyContent: 'flex-start' } }, q.outs.map((c) => cardEl(c, { cls: 'sm' }))),
};

const EQ_BUCKETS = [[0, 0.3, 'Menos del 30 %'], [0.3, 0.45, 'Entre 30 y 45 %'], [0.45, 0.55, 'Entre 45 y 55 %'], [0.55, 0.7, 'Entre 55 y 70 %'], [0.7, 1.01, 'Más del 70 %']];
const T_EQUITY = {
  id: 'equity', icon: '⚖️', title: 'Cara a cara preflop', desc: 'Dos manos all-in antes del flop: ¿qué equity tiene la primera?',
  make() {
    let a, b;
    do {
      const k1 = pick(HAND_ORDER.slice(0, 90)), k2 = pick(HAND_ORDER.slice(0, 120));
      a = pick(keyCombos(k1)); b = pick(keyCombos(k2));
    } while (a.some((c) => b.includes(c)) || handKey(a[0], a[1]) === handKey(b[0], b[1]));
    const r = calcEquity({ hands: [a, b], board: [], iterations: 12000 });
    const eq = r.equity[0];
    const bucket = EQ_BUCKETS.findIndex(([lo, hi]) => eq >= lo && eq < hi);
    return { a, b, eq, bucket };
  },
  render(q, answer) {
    return h('div',
      h('div.trainer-stage',
        h('div.trainer-hands', h('div.trainer-hand', h('strong', 'Mano A'), cardsRow(q.a)), h('div.trainer-hand', h('strong', 'Mano B'), cardsRow(q.b))),
        h('div.label', { style: { marginTop: '12px' } }, '¿Con qué frecuencia gana la mano A?')),
      h('div.answers', EQ_BUCKETS.map((bk, i) => h('button.btn.btn-ghost', { type: 'button', onclick: () => answer(i) }, bk[2]))),
    );
  },
  check: (q, a) => a === q.bucket,
  explain: (q) => [`La mano A tiene un ${pct(q.eq, 1)} de equity (incluye la mitad de los empates).`],
};

export const TRAINERS = [T_WHO, T_NAME, T_PREFLOP, T_ODDS, T_OUTS, T_EQUITY];

export function renderTrainer(root, id, app) {
  const T = TRAINERS.find((t) => t.id === id);
  if (!T) { app.navigate('#/academia'); return; }
  const state = { correct: 0, total: 0, streak: 0, best: 0, earned: 0, q: null, answered: false };
  const scoreEl = h('div.trainer-score');
  const host = h('div');
  const fb = h('div');
  const nextBtn = h('button.btn.btn-primary', { type: 'button', hidden: true, onclick: () => next() }, 'Siguiente');
  const renderScore = () => {
    clear(scoreEl).append(
      h('span', 'Aciertos ', h('strong', `${state.correct}/${state.total}`)),
      h('span', 'Racha ', h('strong', String(state.streak))),
      h('span', 'Mejor ', h('strong', String(state.best))),
      h('span', 'Fichas ganadas ', h('strong', fmt(state.earned))),
    );
  };
  const answer = (a) => {
    if (state.answered) return;
    state.answered = true;
    const ok = T.check(state.q, a);
    state.total++;
    host.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    if (T.id === 'quien-gana') {
      host.querySelectorAll('.trainer-hand').forEach((el, i) => {
        if (state.q.winners.includes(i)) el.classList.add('correct');
        else if (i === a) el.classList.add('wrong');
      });
    }
    if (ok) {
      state.correct++; state.streak++; state.best = Math.max(state.best, state.streak);
      const got = store.trainerReward(REWARD);
      state.earned += got;
      store.progress('trainerCorrect');
      store.addXp(2);
      store.update((s) => { s.stats.trainerCorrect++; s.stats.trainerAnswered++; if (state.streak > s.stats.trainerBestStreak) s.stats.trainerBestStreak = state.streak; }, true);
      if (state.streak >= 10) store.unlock('racha-10');
      play('success');
    } else {
      state.streak = 0;
      store.update((s) => { s.stats.trainerAnswered++; }, true);
      play('error');
    }
    const lines = T.explain(state.q);
    clear(fb).appendChild(h('div.feedback.' + (ok ? 'good' : 'bad'), h('strong', ok ? '¡Correcto!' : 'No es correcto'), lines.map((l) => h('div', l)), T.extra ? T.extra(state.q) : null));
    nextBtn.hidden = false;
    nextBtn.focus({ preventScroll: true });
    renderScore();
  };
  const next = () => {
    state.answered = false;
    state.q = T.make();
    clear(fb);
    nextBtn.hidden = true;
    clear(host).appendChild(T.render(state.q, answer));
  };
  root.appendChild(h('div.trainer',
    h('div.crumbs', h('a.small', { href: '#/academia#entrenadores' }, 'Entrenadores')),
    h('h1.h1', { style: { margin: '6px 0 4px' } }, T.icon + ' ' + T.title),
    h('p.lead', T.desc),
    scoreEl,
    host,
    fb,
    h('div.row', { style: { justifyContent: 'center', marginTop: '16px' } }, nextBtn),
  ));
  document.addEventListener('keydown', function onKey(e) {
    if (!document.body.contains(nextBtn)) { document.removeEventListener('keydown', onKey); return; }
    if (e.key === 'Enter' && !nextBtn.hidden) { e.preventDefault(); next(); }
  });
  renderScore();
  next();
}
