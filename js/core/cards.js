// Representación de cartas: entero 0..51 → rango = c >> 2 (0 = Dos … 12 = As), palo = c & 3.
export const RANKS = '23456789TJQKA';
export const SUITS = 'shdc'; // picas, corazones, diamantes, tréboles
export const SUIT_NAMES = ['picas', 'corazones', 'diamantes', 'tréboles'];
export const RANK_NAMES = ['Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete', 'Ocho', 'Nueve', 'Diez', 'Jota', 'Dama', 'Rey', 'As'];
export const RANK_PLURAL = ['Doses', 'Treses', 'Cuatros', 'Cincos', 'Seises', 'Sietes', 'Ochos', 'Nueves', 'Dieces', 'Jotas', 'Damas', 'Reyes', 'Ases'];
export const RANK_LABEL = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export const rankOf = (c) => c >> 2;
export const suitOf = (c) => c & 3;
export const makeCard = (rank, suit) => (rank << 2) | suit;

export function cardToStr(c) {
  return RANKS[c >> 2] + SUITS[c & 3];
}

export function strToCard(s) {
  if (typeof s !== 'string' || s.length !== 2) return -1;
  const r = RANKS.indexOf(s[0].toUpperCase());
  const su = SUITS.indexOf(s[1].toLowerCase());
  if (r < 0 || su < 0) return -1;
  return makeCard(r, su);
}

export function parseCards(str) {
  const out = [];
  const clean = (str || '').replace(/[\s,]+/g, '');
  for (let i = 0; i + 1 < clean.length; i += 2) {
    const c = strToCard(clean.slice(i, i + 2));
    if (c >= 0) out.push(c);
  }
  return out;
}

export function isValidCard(c) {
  return Number.isInteger(c) && c >= 0 && c < 52;
}

export function fullDeck() {
  const d = new Array(52);
  for (let i = 0; i < 52; i++) d[i] = i;
  return d;
}

// Entero aleatorio uniforme en [0, n) usando el CSPRNG del navegador con rechazo para evitar sesgo de módulo.
const u32 = new Uint32Array(1);
export function secureRandomInt(n) {
  const g = globalThis.crypto;
  if (!g || !g.getRandomValues) return Math.floor(Math.random() * n);
  const limit = Math.floor(0x100000000 / n) * n;
  let x;
  do {
    g.getRandomValues(u32);
    x = u32[0];
  } while (x >= limit);
  return x % n;
}

// Fisher–Yates con aleatoriedad criptográfica.
export function shuffleSecure(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

// PRNG rápido (mulberry32) para simulaciones Monte Carlo y bots; no se usa para barajar manos reales.
export function makeRng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const fastRng = makeRng((Date.now() ^ (Math.random() * 1e9)) >>> 0);

// Clave canónica de mano inicial: "AA", "AKs", "T9o".
export function handKey(c1, c2) {
  let r1 = c1 >> 2, r2 = c2 >> 2;
  if (r1 < r2) { const t = r1; r1 = r2; r2 = t; }
  if (r1 === r2) return RANKS[r1] + RANKS[r2];
  return RANKS[r1] + RANKS[r2] + (((c1 & 3) === (c2 & 3)) ? 's' : 'o');
}

export function describeCard(c) {
  return `${RANK_NAMES[c >> 2]} de ${SUIT_NAMES[c & 3]}`;
}
