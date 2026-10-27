// Rangos de manos iniciales, notación estándar y tablas de apertura por posición.
import { RANKS, makeCard } from './cards.js';

// Orden de fuerza de las 169 manos (mezcla de equity heads-up y a 4 bandas, calculada con el propio motor).
export const HAND_ORDER = 'AA KK QQ JJ TT 99 AKs 88 AQs AJs AKo ATs KQs AQo 77 KJs AJo A9s KTs ATo KQo QJs A8s 66 QTs KJo A7s K9s KTo A9o A5s JTs A6s Q9s A8o QJo A4s 55 K8s QTo A3s A7o K9o A2s K7s JTo J9s A5o Q8s A6o K6s T9s K5s A4o K8o Q9o 44 J8s Q7s A3o K4s J9o K7o Q6s T8s A2o K6o Q8o K3s J7s K2s Q5s 98s T9o 33 K5o Q4s J8o T7s K4o 97s Q7o Q3s J6s K3o J5s Q6o T8o 87s Q2s T6s J7o K2o 98o Q5o J4s 22 96s 86s T5s J3s J2s Q4o T7o 76s T4s J6o Q3o 95s T6o 97o T3s Q2o 87o 85s J5o T2s J4o 75s 65s 96o 94s J3o 84s 93s 86o T5o 76o 74s 54s J2o T4o 92s 64s 95o 53s 75o 85o 83s 73s 82s 65o T3o 63s T2o 43s 94o 52s 93o 84o 72s 62s 54o 74o 42s 92o 64o 32s 83o 53o 73o 63o 43o 82o 52o 62o 72o 42o 32o'.split(' ');

// Equity frente a una mano aleatoria (heads-up, %), útil para la academia.
export const EQUITY_VS_RANDOM = { AA: 85.3, KK: 82.5, QQ: 80, JJ: 77.5, TT: 75.1, 99: 72.3, 88: 69.4, 77: 66.2, 66: 63.2, 55: 59.9, 44: 56.7, 33: 53.5, 22: 50.5, AKs: 66.7, AKo: 64.9, AQs: 66, AQo: 64.2, AJs: 65.7, AJo: 63.6, ATs: 64.4, ATo: 62.2, KQs: 63.3, KQo: 61.7, KJs: 63, KJo: 60.3, QJs: 60.4, QJo: 58.1, JTs: 58.1, JTo: 55.8, T9s: 54, '98s': 50.7, '87s': 47.6, '76s': 45.4, '65s': 43, '54s': 41.4, A5s: 60.3, A2s: 57.4, '72o': 34.2, '32o': 32.2 };

export const comboCount = (key) => (key.length === 2 ? 6 : key[2] === 's' ? 4 : 12);

const rIdx = (ch) => RANKS.indexOf(ch);

// Posición en la cuadrícula 13x13: fila = primera carta, columna = segunda (A arriba-izquierda). Suited sobre la diagonal.
export function gridKey(row, col) {
  const a = 12 - row, b = 12 - col;
  if (a === b) return RANKS[a] + RANKS[b];
  if (row < col) return RANKS[a] + RANKS[b] + 's';
  return RANKS[b] + RANKS[a] + 'o';
}

export const ALL_KEYS = (() => {
  const out = [];
  for (let r = 0; r < 13; r++) for (let c = 0; c < 13; c++) out.push(gridKey(r, c));
  return out;
})();

const ORDER_INDEX = Object.fromEntries(HAND_ORDER.map((k, i) => [k, i]));
export const handRankIndex = (key) => ORDER_INDEX[key] ?? 168;

// Percentil (0 = mejor, 1 = peor) acumulado por combos.
const PERCENTILE = (() => {
  const m = {};
  let cum = 0;
  for (const k of HAND_ORDER) {
    m[k] = (cum + comboCount(k) / 2) / 1326;
    cum += comboCount(k);
  }
  return m;
})();
export const handPercentile = (key) => PERCENTILE[key] ?? 1;

export function topPercentKeys(p) {
  const out = new Set();
  let cum = 0;
  for (const k of HAND_ORDER) {
    if (cum / 1326 >= p) break;
    out.add(k);
    cum += comboCount(k);
  }
  return out;
}

// Parser de notación: "22+, A2s+, KTo+, 76s, A5s-A3s, AK".
export function parseRange(text) {
  const out = new Set();
  const parts = (text || '').split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  for (const raw of parts) {
    const p = raw.replace(/^(\w)(\w)/, (m, a, b) => a.toUpperCase() + b.toUpperCase());
    let m;
    if ((m = p.match(/^([2-9TJQKA])\1\+$/))) {
      for (let r = rIdx(m[1]); r <= 12; r++) out.add(RANKS[r] + RANKS[r]);
    } else if ((m = p.match(/^([2-9TJQKA])\1-([2-9TJQKA])\2$/))) {
      const a = rIdx(m[1]), b = rIdx(m[2]);
      for (let r = Math.min(a, b); r <= Math.max(a, b); r++) out.add(RANKS[r] + RANKS[r]);
    } else if ((m = p.match(/^([2-9TJQKA])\1$/))) {
      out.add(m[1] + m[1]);
    } else if ((m = p.match(/^([2-9TJQKA])([2-9TJQKA])([so])\+$/))) {
      const hi = rIdx(m[1]), lo = rIdx(m[2]);
      for (let r = lo; r < hi; r++) out.add(m[1] + RANKS[r] + m[3]);
    } else if ((m = p.match(/^([2-9TJQKA])([2-9TJQKA])([so])-([2-9TJQKA])([2-9TJQKA])\3$/))) {
      const hi = rIdx(m[1]);
      const a = rIdx(m[2]), b = rIdx(m[5]);
      for (let r = Math.min(a, b); r <= Math.max(a, b); r++) if (r < hi) out.add(m[1] + RANKS[r] + m[3]);
    } else if ((m = p.match(/^([2-9TJQKA])([2-9TJQKA])([so])$/))) {
      const a = rIdx(m[1]), b = rIdx(m[2]);
      if (a !== b) out.add(RANKS[Math.max(a, b)] + RANKS[Math.min(a, b)] + m[3]);
    } else if ((m = p.match(/^([2-9TJQKA])([2-9TJQKA])$/))) {
      const a = rIdx(m[1]), b = rIdx(m[2]);
      const hi = RANKS[Math.max(a, b)], lo = RANKS[Math.min(a, b)];
      out.add(hi + lo + 's');
      out.add(hi + lo + 'o');
    }
  }
  return out;
}

export function rangePercent(keys) {
  let c = 0;
  for (const k of keys) c += comboCount(k);
  return c / 1326;
}

// Todas las combinaciones concretas de un conjunto de claves.
export function keyCombos(key) {
  const a = rIdx(key[0]), b = rIdx(key[1]);
  const out = [];
  if (key.length === 2) {
    for (let s1 = 0; s1 < 4; s1++) for (let s2 = s1 + 1; s2 < 4; s2++) out.push([makeCard(a, s1), makeCard(a, s2)]);
  } else if (key[2] === 's') {
    for (let s = 0; s < 4; s++) out.push([makeCard(a, s), makeCard(b, s)]);
  } else {
    for (let s1 = 0; s1 < 4; s1++) for (let s2 = 0; s2 < 4; s2++) if (s1 !== s2) out.push([makeCard(a, s1), makeCard(b, s2)]);
  }
  return out;
}

const comboCache = new Map();
export function combosForTopPercent(p) {
  const key = Math.round(Math.min(1, Math.max(0.02, p)) * 100);
  if (comboCache.has(key)) return comboCache.get(key);
  const list = [];
  for (const k of topPercentKeys(key / 100)) list.push(...keyCombos(k));
  comboCache.set(key, list);
  return list;
}

// ---------------- Posiciones ----------------
const EARLY = {
  2: [], 3: [], 4: ['CO'], 5: ['HJ', 'CO'], 6: ['UTG', 'HJ', 'CO'], 7: ['UTG', 'LJ', 'HJ', 'CO'],
  8: ['UTG', 'UTG+1', 'LJ', 'HJ', 'CO'], 9: ['UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO'],
};

// Etiquetas por desplazamiento desde el botón (0 = BTN, 1 = SB, 2 = BB, …).
export function positionLabels(n) {
  if (n <= 2) return ['BTN', 'BB'];
  return ['BTN', 'SB', 'BB', ...(EARLY[n] || EARLY[9])];
}

export const POSITION_INFO = {
  UTG: { name: 'Under the Gun', group: 'Temprana', desc: 'Primero en hablar antes del flop. Con todos los jugadores detrás, abre sólo manos fuertes.' },
  'UTG+1': { name: 'UTG+1', group: 'Temprana', desc: 'Segunda posición temprana. Rango casi tan estrecho como UTG.' },
  MP: { name: 'Middle Position', group: 'Media', desc: 'Posición media: puedes añadir algunas manos especulativas.' },
  LJ: { name: 'Lojack', group: 'Media', desc: 'Tres puestos antes del botón. En 6-max equivale a UTG.' },
  HJ: { name: 'Hijack', group: 'Media', desc: 'Dos antes del botón. El rango empieza a abrirse.' },
  CO: { name: 'Cutoff', group: 'Tardía', desc: 'Justo antes del botón. Puedes robar ciegas con frecuencia.' },
  BTN: { name: 'Botón (Dealer)', group: 'Tardía', desc: 'La mejor posición: actúas el último en el flop, turn y river.' },
  SB: { name: 'Ciega pequeña', group: 'Ciegas', desc: 'Pones media ciega y juegas fuera de posición después del flop.' },
  BB: { name: 'Ciega grande', group: 'Ciegas', desc: 'Pones la ciega completa: defiendes con un rango amplio porque ya tienes dinero en el bote.' },
};

// Rangos de apertura (RFI) aproximados, al estilo de las tablas de solver simplificadas.
export const OPEN_RANGES = {
  UTG9: { label: 'UTG (9 jugadores)', text: '66+, A9s+, A5s, KTs+, QTs+, JTs, T9s, AJo+, KQo' },
  UTG1: { label: 'UTG+1', text: '55+, A8s+, A5s-A4s, K9s+, Q9s+, J9s+, T9s, 98s, ATo+, KJo+' },
  MP: { label: 'MP', text: '44+, A2s+, K9s+, Q9s+, J9s+, T9s, 98s, 87s, ATo+, KJo+, QJo' },
  LJ: { label: 'LJ / UTG 6-max', text: '44+, A2s+, K9s+, Q9s+, J9s+, T8s+, 98s, 87s, 76s, ATo+, KJo+, QJo' },
  HJ: { label: 'Hijack', text: '22+, A2s+, K6s+, Q8s+, J8s+, T8s+, 97s+, 87s, 76s, 65s, A9o+, KTo+, QTo+, JTo' },
  CO: { label: 'Cutoff', text: '22+, A2s+, K5s+, Q7s+, J7s+, T7s+, 97s+, 86s+, 75s+, 65s, 54s, A8o+, A5o, KTo+, QTo+, JTo' },
  BTN: { label: 'Botón', text: '22+, A2s+, K2s+, Q4s+, J6s+, T6s+, 96s+, 85s+, 75s+, 64s+, 54s, 43s, A2o+, K8o+, Q9o+, J9o+, T8o+, 98o, 87o' },
  SB: { label: 'Ciega pequeña', text: '22+, A2s+, K2s+, Q5s+, J7s+, T7s+, 96s+, 86s+, 75s+, 65s, 54s, A2o+, K9o+, Q9o+, J9o+, T9o' },
  HU: { label: 'Botón heads-up', text: '22+, A2s+, K2s+, Q2s+, J2s+, T2s+, 92s+, 82s+, 72s+, 62s+, 52s+, 42s+, 32s, A2o+, K2o+, Q2o+, J4o+, T6o+, 96o+, 85o+, 75o+, 64o+, 54o' },
};

export const DEFENSE_RANGES = {
  BB_VS_BTN: {
    label: 'Ciega grande contra apertura del botón',
    threeBet: 'TT+, AJs+, KQs, AQo+, A5s-A4s, K9s, Q9s, 76s, 65s',
    call: '22-99, A2s-ATs, K2s-KJs, Q2s-QJs, J4s+, T6s+, 96s+, 85s+, 74s+, 63s+, 53s+, 43s, A2o-AJo, K5o+, Q8o+, J8o+, T8o+, 97o+, 87o, 76o, 65o',
  },
  BTN_VS_CO: {
    label: 'Botón contra apertura del cutoff',
    threeBet: 'JJ+, AQs+, AKo, A5s-A4s, K9s, QTs, T9s',
    call: '22-TT, A9s-AJs, KTs+, QJs, J9s+, T8s+, 98s, 87s, 76s, 65s, AJo-AQo, KQo',
  },
};

export function rangeKeyFor(label, n) {
  switch (label) {
    case 'UTG': return n >= 8 ? 'UTG9' : n === 7 ? 'UTG1' : 'LJ';
    case 'UTG+1': return 'UTG1';
    case 'MP': return 'MP';
    case 'LJ': return 'LJ';
    case 'HJ': return 'HJ';
    case 'CO': return 'CO';
    case 'BTN': return n === 2 ? 'HU' : 'BTN';
    case 'SB': return 'SB';
    default: return null;
  }
}

const parsedCache = {};
export function openRangeSet(rangeKey) {
  if (!rangeKey || !OPEN_RANGES[rangeKey]) return new Set();
  if (!parsedCache[rangeKey]) parsedCache[rangeKey] = parseRange(OPEN_RANGES[rangeKey].text);
  return parsedCache[rangeKey];
}

// Categorías de manos iniciales para la academia.
export function handCategory(key) {
  const a = rIdx(key[0]), b = rIdx(key[1]);
  const suited = key[2] === 's';
  if (a === b) {
    if (a >= 10) return 'premium';
    if (a >= 6) return 'pareja-media';
    return 'pareja-baja';
  }
  if ((key === 'AKs' || key === 'AKo')) return 'premium';
  if (a === 12 && suited) return 'as-suited';
  if (a >= 9 && b >= 9) return 'broadway';
  if (suited && a - b === 1) return 'conector-suited';
  if (suited && a - b === 2) return 'gapper-suited';
  if (a === 12) return 'as-offsuit';
  if (suited) return 'suited';
  return 'basura';
}
