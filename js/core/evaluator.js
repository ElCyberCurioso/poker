// Evaluador de manos de 5 a 7 cartas. Devuelve un entero comparable: mayor = mejor.
// Codificación: categoría << 20 | r1 << 16 | r2 << 12 | r3 << 8 | r4 << 4 | r5
import { RANK_NAMES, RANK_PLURAL } from './cards.js';

export const CAT = { HIGH: 0, PAIR: 1, TWO_PAIR: 2, TRIPS: 3, STRAIGHT: 4, FLUSH: 5, FULL_HOUSE: 6, QUADS: 7, STRAIGHT_FLUSH: 8 };
export const CAT_NAMES = ['Carta alta', 'Pareja', 'Doble pareja', 'Trío', 'Escalera', 'Color', 'Full', 'Póker', 'Escalera de color'];

// Tablas precalculadas sobre máscaras de 13 bits.
const STRAIGHT_HIGH = new Int8Array(8192);
const TOP5 = new Int32Array(8192);
(function init() {
  for (let m = 0; m < 8192; m++) {
    let sh = -1;
    for (let top = 12; top >= 4; top--) {
      const w = 0x1f << (top - 4);
      if ((m & w) === w) { sh = top; break; }
    }
    if (sh < 0 && (m & 0x100f) === 0x100f) sh = 3; // rueda A-2-3-4-5
    STRAIGHT_HIGH[m] = sh;
    let v = 0, k = 0;
    for (let r = 12; r >= 0 && k < 5; r--) {
      if (m & (1 << r)) { v |= r << (16 - 4 * k); k++; }
    }
    TOP5[m] = v;
  }
})();

const counts = new Int8Array(13);
const suitCnt = new Int8Array(4);
const suitMask = new Int32Array(4);

function topKicks(mask, k, shiftStart) {
  let v = 0, n = 0;
  for (let r = 12; r >= 0 && n < k; r--) {
    if (mask & (1 << r)) { v |= r << (shiftStart - 4 * n); n++; }
  }
  return v;
}

export function evalCards(cards, n = cards.length) {
  counts.fill(0);
  suitCnt[0] = suitCnt[1] = suitCnt[2] = suitCnt[3] = 0;
  suitMask[0] = suitMask[1] = suitMask[2] = suitMask[3] = 0;
  let rankMask = 0;
  for (let i = 0; i < n; i++) {
    const c = cards[i];
    const r = c >> 2, s = c & 3;
    counts[r]++;
    suitCnt[s]++;
    suitMask[s] |= 1 << r;
    rankMask |= 1 << r;
  }
  for (let s = 0; s < 4; s++) {
    if (suitCnt[s] >= 5) {
      const sm = suitMask[s];
      const sh = STRAIGHT_HIGH[sm];
      if (sh >= 0) return (8 << 20) | (sh << 16);
      // Con 7 cartas, color excluye full y póker.
      if (n <= 7) return (5 << 20) | TOP5[sm];
    }
  }
  let quad = -1, t1 = -1, t2 = -1, p1 = -1, p2 = -1;
  for (let r = 12; r >= 0; r--) {
    const c = counts[r];
    if (c === 4) quad = r;
    else if (c === 3) { if (t1 < 0) t1 = r; else if (t2 < 0) t2 = r; }
    else if (c === 2) { if (p1 < 0) p1 = r; else if (p2 < 0) p2 = r; }
  }
  if (quad >= 0) {
    return (7 << 20) | (quad << 16) | topKicks(rankMask & ~(1 << quad), 1, 12);
  }
  if (t1 >= 0 && (t2 >= 0 || p1 >= 0)) {
    const pr = Math.max(t2, p1);
    return (6 << 20) | (t1 << 16) | (pr << 12);
  }
  const sh = STRAIGHT_HIGH[rankMask];
  if (sh >= 0) return (4 << 20) | (sh << 16);
  if (t1 >= 0) {
    return (3 << 20) | (t1 << 16) | topKicks(rankMask & ~(1 << t1), 2, 12);
  }
  if (p1 >= 0 && p2 >= 0) {
    return (2 << 20) | (p1 << 16) | (p2 << 12) | topKicks(rankMask & ~(1 << p1) & ~(1 << p2), 1, 8);
  }
  if (p1 >= 0) {
    return (1 << 20) | (p1 << 16) | topKicks(rankMask & ~(1 << p1), 3, 12);
  }
  return TOP5[rankMask];
}

export const categoryOf = (score) => score >> 20;

// Mejor combinación de 5 cartas (para resaltarla en la interfaz).
export function bestFive(cards) {
  const n = cards.length;
  if (n <= 5) return { score: evalCards(cards), cards: cards.slice() };
  let best = -1, bestCombo = null;
  const tmp = [0, 0, 0, 0, 0];
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++) {
            tmp[0] = cards[a]; tmp[1] = cards[b]; tmp[2] = cards[c]; tmp[3] = cards[d]; tmp[4] = cards[e];
            const s = evalCards(tmp, 5);
            if (s > best) { best = s; bestCombo = tmp.slice(); }
          }
  return { score: best, cards: bestCombo };
}

const nib = (score, i) => (score >> (16 - 4 * i)) & 15;

// Descripción en español: "Doble pareja, Reyes y Sietes".
export function describeScore(score) {
  const cat = score >> 20;
  const a = nib(score, 0), b = nib(score, 1);
  switch (cat) {
    case 8: return a === 12 ? 'Escalera real' : `Escalera de color al ${RANK_NAMES[a]}`;
    case 7: return `Póker de ${RANK_PLURAL[a]}`;
    case 6: return `Full de ${RANK_PLURAL[a]} y ${RANK_PLURAL[b]}`;
    case 5: return `Color al ${RANK_NAMES[a]}`;
    case 4: return `Escalera al ${RANK_NAMES[a]}`;
    case 3: return `Trío de ${RANK_PLURAL[a]}`;
    case 2: return `Doble pareja, ${RANK_PLURAL[a]} y ${RANK_PLURAL[b]}`;
    case 1: return `Pareja de ${RANK_PLURAL[a]}`;
    default: return `Carta alta: ${RANK_NAMES[a]}`;
  }
}

export function shortName(score) {
  const cat = score >> 20;
  if (cat === 8 && nib(score, 0) === 12) return 'Escalera real';
  return CAT_NAMES[cat];
}

// Evalúa la mejor mano de un jugador con el tablero dado (2 + 3..5 cartas).
export function handInfo(hole, board) {
  const all = hole.concat(board);
  if (all.length < 5) {
    // Antes del flop sólo informamos de parejas o carta alta.
    const r1 = hole[0] >> 2, r2 = hole[1] >> 2;
    if (r1 === r2) return { score: (1 << 20) | (r1 << 16), name: `Pareja de ${RANK_PLURAL[r1]}`, cat: 1, cards: hole.slice() };
    const hi = Math.max(r1, r2);
    return { score: hi << 16, name: `Carta alta: ${RANK_NAMES[hi]}`, cat: 0, cards: [] };
  }
  const bf = bestFive(all);
  return { score: bf.score, name: describeScore(bf.score), cat: bf.score >> 20, cards: bf.cards };
}
