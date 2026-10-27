// Cálculo de equity: Monte Carlo o enumeración exhaustiva cuando el número de combinaciones es manejable.
import { evalCards } from './evaluator.js';
import { fastRng } from './cards.js';

function combinations(n, k) {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

function validateInput(hands, board) {
  const seen = new Set();
  for (const c of board) {
    if (seen.has(c)) throw new Error('Carta repetida en el tablero');
    seen.add(c);
  }
  for (const h of hands) {
    if (!h) continue;
    for (const c of h) {
      if (seen.has(c)) throw new Error('Carta repetida');
      seen.add(c);
    }
  }
  return seen;
}

// hands: array de [c1,c2] o null (mano aleatoria). board: 0..5 cartas.
export function createEquityJob({ hands, board = [], iterations = 20000, exhaustiveLimit = 60000, rng = fastRng }) {
  const n = hands.length;
  const dead = validateInput(hands, board);
  const deck = [];
  for (let c = 0; c < 52; c++) if (!dead.has(c)) deck.push(c);
  const missingBoard = 5 - board.length;
  const randomHands = hands.filter((h) => !h).length;
  const win = new Float64Array(n), tie = new Float64Array(n), share = new Float64Array(n);
  const cards7 = hands.map(() => new Array(7));
  const scores = new Int32Array(n);
  const boardFull = new Array(5);
  for (let i = 0; i < board.length; i++) boardFull[i] = board[i];

  let total = 0;
  const exhaustive = randomHands === 0 && combinations(deck.length, missingBoard) <= exhaustiveLimit;
  const target = exhaustive ? combinations(deck.length, missingBoard) : iterations;

  function scoreRound(holes) {
    let best = -1, nb = 0;
    for (let p = 0; p < n; p++) {
      const arr = cards7[p];
      arr[0] = holes[p][0]; arr[1] = holes[p][1];
      for (let i = 0; i < 5; i++) arr[2 + i] = boardFull[i];
      const s = evalCards(arr, 7);
      scores[p] = s;
      if (s > best) { best = s; nb = 1; } else if (s === best) nb++;
    }
    for (let p = 0; p < n; p++) {
      if (scores[p] === best) {
        if (nb === 1) win[p]++; else tie[p]++;
        share[p] += 1 / nb;
      }
    }
    total++;
  }

  // Generador de combinaciones del tablero para el modo exhaustivo.
  const idx = [];
  for (let i = 0; i < missingBoard; i++) idx.push(i);
  let exhaustedDone = missingBoard === 0 ? false : false;
  let zeroDone = false;

  function stepExhaustive(count) {
    let done = 0;
    if (missingBoard === 0) {
      if (!zeroDone) { scoreRound(hands); zeroDone = true; }
      return true;
    }
    while (done < count) {
      if (exhaustedDone) return true;
      for (let i = 0; i < missingBoard; i++) boardFull[board.length + i] = deck[idx[i]];
      scoreRound(hands);
      done++;
      // avanzar combinación
      let i = missingBoard - 1;
      while (i >= 0 && idx[i] === deck.length - missingBoard + i) i--;
      if (i < 0) { exhaustedDone = true; return true; }
      idx[i]++;
      for (let j = i + 1; j < missingBoard; j++) idx[j] = idx[j - 1] + 1;
    }
    return false;
  }

  const holes = hands.map((h) => (h ? h : [0, 0]));
  const work = deck.slice();
  function stepMonteCarlo(count) {
    const need = randomHands * 2 + missingBoard;
    for (let it = 0; it < count && total < target; it++) {
      // Fisher–Yates parcial
      const len = work.length;
      for (let i = 0; i < need; i++) {
        const j = i + Math.floor(rng() * (len - i));
        const t = work[i]; work[i] = work[j]; work[j] = t;
      }
      let k = 0;
      for (let p = 0; p < n; p++) {
        if (!hands[p]) { holes[p] = [work[k], work[k + 1]]; k += 2; }
      }
      for (let i = 0; i < missingBoard; i++) boardFull[board.length + i] = work[k++];
      scoreRound(holes);
    }
    return total >= target;
  }

  return {
    exhaustive,
    target,
    step(count = 2000) {
      return exhaustive ? stepExhaustive(count) : stepMonteCarlo(count);
    },
    result() {
      const t = Math.max(1, total);
      return {
        samples: total,
        exhaustive,
        win: Array.from(win, (v) => v / t),
        tie: Array.from(tie, (v) => v / t),
        equity: Array.from(share, (v) => v / t),
      };
    },
  };
}

export function calcEquity(opts) {
  const job = createEquityJob(opts);
  while (!job.step(5000)) { /* continuar */ }
  return job.result();
}

// Versión asíncrona por trozos para no bloquear la interfaz.
export function calcEquityAsync(opts, onProgress) {
  const job = createEquityJob(opts);
  let cancelled = false;
  const promise = new Promise((resolve) => {
    const tick = () => {
      if (cancelled) return resolve(null);
      const t0 = performance.now();
      let done = false;
      while (!done && performance.now() - t0 < 14) done = job.step(1500);
      if (onProgress) onProgress(job.result(), done);
      if (done) resolve(job.result());
      else setTimeout(tick, 0);
    };
    tick();
  });
  return { promise, cancel() { cancelled = true; } };
}

// Equity de una mano frente a N rivales cuyos rangos son listas de combos [[c1,c2],...] (o null = aleatorio).
export function equityVsRanges(hole, board, oppRanges, iterations = 500, rng = fastRng) {
  const dead = new Uint8Array(52);
  dead[hole[0]] = 1; dead[hole[1]] = 1;
  for (const c of board) dead[c] = 1;
  const nOpp = oppRanges.length;
  const missing = 5 - board.length;
  const deck = [];
  for (let c = 0; c < 52; c++) if (!dead[c]) deck.push(c);
  const used = new Uint8Array(52);
  const mine = new Array(7), theirs = new Array(7);
  const fullBoard = board.slice();
  let share = 0, count = 0;
  const oppCards = new Array(nOpp * 2);
  for (let it = 0; it < iterations; it++) {
    used.fill(0);
    let ok = true;
    for (let o = 0; o < nOpp; o++) {
      const range = oppRanges[o];
      let placed = false;
      if (range && range.length) {
        for (let tries = 0; tries < 25; tries++) {
          const combo = range[Math.floor(rng() * range.length)];
          const a = combo[0], b = combo[1];
          if (dead[a] || dead[b] || used[a] || used[b]) continue;
          used[a] = used[b] = 1;
          oppCards[o * 2] = a; oppCards[o * 2 + 1] = b;
          placed = true;
          break;
        }
      }
      if (!placed) {
        let a, b, guard = 0;
        do { a = deck[Math.floor(rng() * deck.length)]; guard++; } while (used[a] && guard < 100);
        used[a] = 1;
        guard = 0;
        do { b = deck[Math.floor(rng() * deck.length)]; guard++; } while (used[b] && guard < 100);
        used[b] = 1;
        oppCards[o * 2] = a; oppCards[o * 2 + 1] = b;
        if (guard >= 100) ok = false;
      }
    }
    if (!ok) continue;
    for (let i = 0; i < missing; i++) {
      let c, guard = 0;
      do { c = deck[Math.floor(rng() * deck.length)]; guard++; } while (used[c] && guard < 200);
      used[c] = 1;
      fullBoard[board.length + i] = c;
    }
    mine[0] = hole[0]; mine[1] = hole[1];
    for (let i = 0; i < 5; i++) { mine[2 + i] = fullBoard[i]; theirs[2 + i] = fullBoard[i]; }
    const my = evalCards(mine, 7);
    let best = my, ties = 1, iWin = true;
    for (let o = 0; o < nOpp; o++) {
      theirs[0] = oppCards[o * 2]; theirs[1] = oppCards[o * 2 + 1];
      const s = evalCards(theirs, 7);
      if (s > best) { best = s; iWin = false; ties = 1; }
      else if (s === best) { ties++; }
    }
    if (iWin && best === my) share += 1 / ties;
    count++;
  }
  return count ? share / count : 0;
}
