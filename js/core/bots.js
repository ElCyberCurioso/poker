// Inteligencia de los bots: rangos por posición preflop y equity Monte Carlo frente a rangos estimados postflop.
// Sólo leen sus propias cartas: nunca miran las de los rivales.
import { handKey, fastRng, RANKS } from './cards.js';
import { handPercentile, rangeKeyFor, openRangeSet, rangePercent, combosForTopPercent } from './ranges.js';
import { equityVsRanges } from './equity.js';
import { evalCards } from './evaluator.js';

export const BOT_STYLES = {
  roca: { label: 'Roca', desc: 'Muy cerrado y pasivo. Si apuesta fuerte, cree que tiene algo.', looseness: 0.7, aggression: 0.35, bluff: 0.03, sticky: 0.85, threeBet: 0.5, cbet: 0.45, noise: 0.04, caution: 1.2 },
  regular: { label: 'Regular', desc: 'Cerrado y agresivo, juega de libro.', looseness: 1.0, aggression: 0.7, bluff: 0.12, sticky: 1.0, threeBet: 1.0, cbet: 0.65, noise: 0.03, caution: 1.05 },
  agresivo: { label: 'Agresivo', desc: 'Abre muchas manos y presiona en cada calle.', looseness: 1.35, aggression: 0.85, bluff: 0.22, sticky: 1.05, threeBet: 1.6, cbet: 0.75, noise: 0.04, caution: 1.0 },
  maniaco: { label: 'Maníaco', desc: 'Sube con casi cualquier cosa. Paga con manos medias.', looseness: 2.1, aggression: 0.95, bluff: 0.38, sticky: 1.2, threeBet: 2.6, cbet: 0.85, noise: 0.06, caution: 0.9 },
  pescadito: { label: 'Pescadito', desc: 'Juega demasiadas manos y paga hasta el final.', looseness: 1.8, aggression: 0.2, bluff: 0.04, sticky: 1.6, threeBet: 0.4, cbet: 0.35, noise: 0.08, caution: 0.75 },
  tiburon: { label: 'Tiburón', desc: 'Equilibrado y difícil de leer.', looseness: 1.1, aggression: 0.75, bluff: 0.16, sticky: 1.0, threeBet: 1.25, cbet: 0.6, noise: 0.015, caution: 1.02 },
};

export const BOT_NAMES = [
  ['Lola', '💃'], ['Paco', '🧔'], ['Carmen', '👩‍🦰'], ['Manolo', '👨‍🦳'], ['Pilar', '👵'], ['Javi', '🧑‍🎤'], ['Rocío', '🌹'],
  ['Toni', '🕶️'], ['Marisa', '🦊'], ['Curro', '🐂'], ['Nacho', '🎩'], ['Inma', '🦉'], ['Quique', '🎲'], ['Bea', '🐱'],
  ['Ramiro', '🃏'], ['Elena', '🌙'], ['Fermín', '🍷'], ['Sole', '☀️'], ['Rafa', '🎾'], ['Charo', '💎'], ['Luis', '🐺'],
  ['Maite', '🌶️'], ['Germán', '⚓'], ['Nuria', '🦋'], ['Óscar', '🐻'], ['Vero', '🍀'], ['Dani', '🚀'], ['Amparo', '🐞'],
];

const r = () => fastRng();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function roundChips(x, unit) {
  return Math.max(unit, Math.round(x / unit) * unit);
}

// Tamaño final de una apuesta "a" (to), ajustado a fichas, límites legales y all-in si queda poco.
function sized(la, to, unit) {
  let t = roundChips(to, unit);
  t = clamp(t, la.minTo, la.maxTo);
  if (la.maxTo - t < (t - la.myBet) * 0.3) t = la.maxTo;
  return t;
}

function boardTexture(board) {
  if (board.length < 3) return { wet: 0, paired: false, monotone: false };
  const suits = [0, 0, 0, 0];
  const ranks = board.map((c) => c >> 2).sort((a, b) => a - b);
  for (const c of board) suits[c & 3]++;
  const maxSuit = Math.max(...suits);
  let connected = 0;
  for (let i = 1; i < ranks.length; i++) if (ranks[i] - ranks[i - 1] <= 2 && ranks[i] !== ranks[i - 1]) connected++;
  const paired = new Set(ranks).size < ranks.length;
  let wet = 0;
  if (maxSuit >= 2) wet += 0.35;
  if (maxSuit >= 3) wet += 0.25;
  wet += connected * 0.18;
  if (paired) wet -= 0.15;
  return { wet: clamp(wet, 0, 1), paired, monotone: maxSuit >= 3 };
}

// Estimación de la amplitud del rango de un rival según lo que hizo antes del flop.
function opponentWidth(hp, style) {
  if (hp.threeBet) return 0.07;
  if (hp.pfr) return 0.2;
  if (hp.vpip) return 0.38;
  return style === 'pescadito' ? 0.8 : 0.65;
}

function pushPct(offsetFromButton, nPlayers, stackBB) {
  // Porcentaje aproximado de manos con las que ir all-in cuando se abre el bote con stack corto.
  const late = offsetFromButton === 0 ? 0.42 : offsetFromButton === 1 ? 0.55 : 0;
  const base = late || clamp(0.16 + 0.04 * (9 - nPlayers) - 0.02 * (nPlayers - offsetFromButton), 0.08, 0.35);
  return clamp(base * Math.pow(10 / Math.max(stackBB, 1), 0.65), 0.04, 0.95);
}

export function decide(table, seat) {
  const h = table.hand;
  const la = table.legalActions(seat);
  if (!la) return null;
  const me = table.seats[seat];
  const style = (me.bot && me.bot.style) || 'regular';
  const S = BOT_STYLES[style] || BOT_STYLES.regular;
  const unit = Math.max(1, h.sb);
  const bb = h.bb;
  try {
    return h.street === 'preflop' ? preflop(table, seat, la, S, style, unit, bb) : postflop(table, seat, la, S, style, unit, bb);
  } catch (e) {
    console.warn('bot error', e);
    return { type: la.canCheck ? 'check' : 'fold' };
  }
}

function passiveOrFold(la) {
  return { type: la.canCheck ? 'check' : 'fold' };
}

function preflop(table, seat, la, S, style, unit, bb) {
  const h = table.hand;
  const hp = h.ps[seat];
  const me = table.seats[seat];
  const key = handKey(hp.cards[0], hp.cards[1]);
  const pct = clamp(handPercentile(key) + (r() - 0.5) * S.noise * 2, 0, 1);
  const n = h.order.length;
  const offset = (h.order.indexOf(seat) - h.order.indexOf(h.button) + n) % n;
  const live = h.order.filter((s) => !h.ps[s].folded && s !== seat);
  const effStack = Math.min(me.stack + hp.bet, Math.max(...live.map((s) => table.seats[s].stack + h.ps[s].bet), 0));
  const effBB = effStack / bb;
  const raises = h.raisesThisStreet;
  const limpers = h.order.filter((s) => s !== seat && h.ps[s].vpip && !h.ps[s].pfr).length;
  const inPosition = offset === 0 || (offset >= 3 && offset === n - 1);

  // Sin subidas todavía
  if (raises === 0) {
    if (effBB <= 13 && (la.canRaise || la.canBet)) {
      if (pct <= pushPct(offset, n, effBB) * S.looseness) return { type: 'allin' };
      return passiveOrFold(la);
    }
    const rk = rangeKeyFor(hp.position, n);
    const openPct = rk ? rangePercent(openRangeSet(rk)) : 0.4;
    let threshold = openPct * S.looseness;
    if (limpers > 0) threshold *= 0.75;
    const inChart = rk && openRangeSet(rk).has(key);
    const wantsRaise = pct <= threshold || (inChart && S.looseness >= 1 && r() < 0.9);
    if (wantsRaise && la.canRaise) {
      if (S.aggression < 0.3 && pct > 0.08 && r() < 0.6) return la.canCheck ? { type: 'check' } : { type: 'call' };
      let mult = offset === 0 || offset >= n - 2 ? 2.5 : 3;
      if (hp.position === 'SB') mult = 3;
      if (style === 'maniaco' && r() < 0.4) mult += 1.5;
      const to = bb * mult + limpers * bb;
      return { type: 'raise', amount: sized(la, to, unit) };
    }
    if (la.canCheck) return { type: 'check' };
    // Completar desde la SB o pagar limps con perfiles pasivos
    if (hp.position === 'SB' && pct < 0.55 * S.looseness && S.aggression < 0.6) return { type: 'call' };
    if (style === 'pescadito' && pct < 0.6 && la.toCall <= bb) return { type: 'call' };
    return { type: 'fold' };
  }

  const toCallBB = la.toCall / bb;
  const commitRatio = la.toCall / Math.max(1, me.stack);
  const raiser = h.lastAggressor;
  const raiserPos = raiser >= 0 ? h.ps[raiser].position : '';
  const raiserRk = rangeKeyFor(raiserPos, n);
  const raiserWidth = raiserRk ? rangePercent(openRangeSet(raiserRk)) : 0.25;

  if (raises === 1) {
    // Stack corto contra subida: all-in o fuera.
    if (effBB <= 18) {
      if (pct <= clamp(raiserWidth * 0.45 * S.looseness, 0.04, 0.3)) return { type: 'allin' };
      if (la.canCheck) return { type: 'check' };
      return { type: 'fold' };
    }
    const valueTB = 0.03 * Math.max(0.6, S.threeBet * 0.8) + (raiserWidth > 0.35 ? 0.03 : 0);
    const suited = key.length === 3 && key[2] === 's';
    const bluffCandidate = suited && (key[0] === 'A' || Math.abs(RANKS.indexOf(key[0]) - RANKS.indexOf(key[1])) === 1) && pct > 0.12 && pct < 0.45;
    const tbSize = (inPosition ? 3 : 4) * h.currentBet;
    if (la.canRaise && (pct <= valueTB || (bluffCandidate && r() < 0.07 * S.threeBet * S.aggression))) {
      return { type: 'raise', amount: sized(la, tbSize, unit) };
    }
    let callPct = raiserWidth * 0.55 * S.looseness * S.sticky;
    if (hp.position === 'BB') callPct += toCallBB <= 2.5 ? 0.18 : 0.08;
    if (inPosition) callPct += 0.04;
    if (toCallBB > 4) callPct *= 0.7;
    if (commitRatio > 0.3) callPct = Math.min(callPct, 0.05);
    callPct = clamp(callPct, 0.03, 0.6);
    if (pct <= callPct) return { type: 'call' };
    return passiveOrFold(la);
  }

  // Frente a 3-bet o más
  const shove = 0.02 * Math.max(0.7, S.threeBet * 0.7);
  if (pct <= shove || (raises >= 3 && pct <= 0.012)) {
    if (la.canRaise) {
      const to = h.currentBet * 2.3;
      if (to > (me.stack + hp.bet) * 0.4 || raises >= 3) return { type: 'allin' };
      return { type: 'raise', amount: sized(la, to, unit) };
    }
    return { type: 'call' };
  }
  let callPct = 0.045 * S.sticky * (style === 'maniaco' ? 2 : 1);
  if (commitRatio > 0.4) callPct = Math.min(callPct, 0.035);
  if (pct <= callPct) return { type: 'call' };
  return passiveOrFold(la);
}

function postflop(table, seat, la, S, style, unit, bb) {
  const h = table.hand;
  const hp = h.ps[seat];
  const me = table.seats[seat];
  const opps = h.order.filter((s) => s !== seat && !h.ps[s].folded);
  const nOpp = opps.length;
  const ranges = opps.map((s) => combosForTopPercent(opponentWidth(h.ps[s], style)));
  const iters = nOpp >= 4 ? 220 : nOpp >= 2 ? 320 : 420;
  let equity = equityVsRanges(hp.cards, h.board, ranges, iters);
  equity = clamp(equity + (r() - 0.5) * S.noise * 2, 0, 1);
  const pot = table.potTotal();
  const tex = boardTexture(h.board);
  const made = evalCards(hp.cards.concat(h.board)) >> 20;
  const street = h.street;
  const preflopAggressor = (() => {
    for (let i = h.log.length - 1; i >= 0; i--) {
      const l = h.log[i];
      if (l.street === 'preflop' && l.action === 'raise') return l.seat;
    }
    return -1;
  })();
  const multi = nOpp - 1;
  const stackLeft = me.stack;

  if (la.canCheck) {
    const valueLine = 0.6 + 0.06 * multi;
    if (equity >= valueLine && (la.canBet || la.canRaise)) {
      const slow = equity > 0.9 && street !== 'river' && r() < 0.18;
      if (!slow && r() < 0.55 + S.aggression * 0.45) {
        let frac = tex.wet > 0.45 ? 0.7 : 0.45;
        if (street === 'river') frac = equity > 0.85 ? 0.8 : 0.55;
        if (style === 'maniaco') frac += 0.25;
        return { type: 'bet', amount: sized(la, pot * frac, unit) };
      }
      return { type: 'check' };
    }
    if (street === 'flop' && preflopAggressor === seat && nOpp <= 2 && (la.canBet || la.canRaise)) {
      const p = S.cbet * (tex.wet < 0.35 ? 1.15 : 0.75) * (nOpp === 2 ? 0.6 : 1);
      if (r() < p) return { type: 'bet', amount: sized(la, pot * (tex.wet < 0.35 ? 0.33 : 0.6), unit) };
    }
    if (street !== 'river' && equity > 0.3 && equity < valueLine && (la.canBet || la.canRaise) && r() < S.aggression * 0.35) {
      return { type: 'bet', amount: sized(la, pot * 0.55, unit) };
    }
    if (equity < 0.3 && nOpp <= 2 && (la.canBet || la.canRaise) && r() < S.bluff * (nOpp === 1 ? 1 : 0.35) * (street === 'river' ? 0.9 : 0.7)) {
      return { type: 'bet', amount: sized(la, pot * (street === 'river' ? 0.7 : 0.5), unit) };
    }
    return { type: 'check' };
  }

  // Frente a una apuesta
  const potOdds = la.toCall / (pot + la.toCall);
  const bigCommit = la.toCall / Math.max(1, stackLeft) > 0.45;
  let need = potOdds * S.caution + 0.03 * multi;
  if (bigCommit) need += style === 'roca' ? 0.12 : 0.05;
  if (street === 'flop' && la.toCall < stackLeft * 0.12) need *= 0.88; // probabilidades implícitas
  const raiseLine = 0.74 + 0.04 * multi - (S.aggression - 0.7) * 0.1;
  if (equity >= raiseLine && la.canRaise) {
    if (r() < 0.35 + S.aggression * 0.6) {
      const to = h.currentBet * (2.6 + r() * 0.6) + (pot - h.currentBet) * 0.15;
      return { type: 'raise', amount: sized(la, to, unit) };
    }
    return { type: 'call' };
  }
  if (equity >= need) {
    if (made <= 1 && equity < 0.45 && street === 'river' && style === 'roca') return { type: 'fold' };
    return { type: 'call' };
  }
  if (la.canRaise && nOpp === 1 && street !== 'river' && equity > 0.18 && r() < S.bluff * 0.25 && !bigCommit) {
    return { type: 'raise', amount: sized(la, h.currentBet * 2.7, unit) };
  }
  // Los "pescaditos" pagan con cualquier pareja si la apuesta no es enorme.
  if (style === 'pescadito' && made >= 1 && potOdds < 0.4 && r() < 0.6) return { type: 'call' };
  return { type: 'fold' };
}

// Tiempo de reflexión simulado (ms) según dificultad de la decisión.
export function thinkTime(table, seat, speed = 1) {
  const h = table.hand;
  const la = table.legalActions(seat);
  let base = 650 + fastRng() * 900;
  if (la && la.toCall > la.stack * 0.3) base += 900;
  if (h.street === 'river') base += 300;
  return Math.round(base / Math.max(0.25, speed));
}

export function randomBotIdentity(usedNames = new Set()) {
  const pool = BOT_NAMES.filter(([n]) => !usedNames.has(n));
  const [name, avatar] = pool.length ? pool[Math.floor(fastRng() * pool.length)] : ['Bot ' + Math.floor(fastRng() * 100), '🤖'];
  return { name, avatar };
}

// Mezcla de estilos según el nivel de la mesa (0 = fácil … 3 = difícil).
export function pickStyle(level = 1) {
  const pools = [
    ['pescadito', 'pescadito', 'roca', 'maniaco', 'regular', 'pescadito'],
    ['pescadito', 'roca', 'regular', 'agresivo', 'maniaco', 'regular'],
    ['regular', 'agresivo', 'tiburon', 'roca', 'pescadito', 'regular'],
    ['tiburon', 'tiburon', 'agresivo', 'regular', 'regular', 'maniaco'],
  ];
  const p = pools[clamp(level, 0, 3)];
  return p[Math.floor(fastRng() * p.length)];
}
