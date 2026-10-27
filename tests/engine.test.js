import { Table, computePots } from '../js/core/engine.js';
import { parseCards, makeRng } from '../js/core/cards.js';

// Construye un mazo que reparte las cartas indicadas: holes[seatOrderIndex] y board de 5.
function stackedDeck(order, holes, board) {
  const used = new Set([...holes.flat(), ...board]);
  const rest = [];
  for (let c = 0; c < 52; c++) if (!used.has(c)) rest.push(c);
  const deck = [];
  for (let r = 0; r < 2; r++) for (let i = 0; i < order.length; i++) deck.push(holes[i][r]);
  deck.push(rest.pop(), board[0], board[1], board[2], rest.pop(), board[3], rest.pop(), board[4]);
  while (rest.length) deck.push(rest.pop());
  return deck;
}

function makeTable(stacks, opts = {}) {
  const t = new Table({ smallBlind: 10, bigBlind: 20, maxSeats: Math.max(stacks.length, opts.maxSeats || 0), ...opts });
  stacks.forEach((s, i) => t.seatPlayer(i, { id: 'p' + i, name: 'P' + i, stack: s }));
  return t;
}

function total(t) {
  return t.seats.reduce((a, p) => a + (p ? p.stack : 0), 0) + (t.hand && t.hand.phase !== 'done' ? t.potTotal() : 0);
}

function runToEnd(t) {
  let guard = 0;
  while (t.hand.phase !== 'done' && guard++ < 50) {
    if (t.hand.phase === 'between') t.proceed();
    else break;
  }
}

export function run(assert) {
  // 1) Side pots con tres all-in de distinto tamaño.
  {
    const t = makeTable([1000, 500, 200]);
    t.button = 2; // botón pasará al asiento 0
    // orden de reparto: empieza a la izquierda del botón (asiento 1 = SB, 2 = BB, 0 = BTN)
    const order = [1, 2, 0];
    const holes = [parseCards('KhKd'), parseCards('AhAd'), parseCards('2c7d')];
    const deck = stackedDeck(order, holes, parseCards('3s 8h 9c Jd 4s'));
    t.startHand(deck);
    assert.equal(t.hand.button, 0);
    assert.equal(t.hand.toAct, 0, 'BTN habla primero en 3-handed');
    const start = 1700;
    t.act(0, { type: 'allin' });
    t.act(1, { type: 'allin' });
    t.act(2, { type: 'allin' });
    runToEnd(t);
    assert.equal(t.hand.phase, 'done');
    // AA (asiento 2) gana el principal 600; KK (asiento 1) el lateral 600; BTN recupera 500 no igualados.
    assert.equal(t.seats[2].stack, 600);
    assert.equal(t.seats[1].stack, 600);
    assert.equal(t.seats[0].stack, 500);
    assert.equal(total(t), start);
  }
  // 2) Bote dividido con ficha impar al primero a la izquierda del botón.
  {
    const t = makeTable([1000, 1000, 1000]);
    t.button = 2;
    const order = [1, 2, 0];
    const holes = [parseCards('2c3d'), parseCards('2h3h'), parseCards('4c5d')];
    const deck = stackedDeck(order, holes, parseCards('Ah Kd Qs Jc Ts'));
    t.startHand(deck);
    t.act(0, { type: 'fold' }); // BTN no aporta
    t.act(1, { type: 'raise', amount: 55 }); // SB sube a 55
    t.act(2, { type: 'call' });
    // Bote 110: escalera en mesa, se divide 55/55.
    for (let k = 0; k < 3; k++) { t.proceed(); t.act(1, { type: 'check' }); t.act(2, { type: 'check' }); }
    runToEnd(t);
    assert.equal(t.seats[1].stack, 1000);
    assert.equal(t.seats[2].stack, 1000);
  }
  {
    // Ficha impar: bote 3-way de 30 + 15 = 45 dividido entre dos → 23/22
    const pots = computePots(new Map([[0, 15], [1, 15], [2, 15]]), new Set([0, 1, 2]));
    assert.equal(pots.length, 1);
    assert.equal(pots[0].amount, 45);
  }
  // 3) Subida all-in incompleta no reabre la acción a quien ya actuó.
  {
    const t = makeTable([1000, 1000, 1000, 70]);
    t.button = 3; // BTN = 0, SB = 1, BB = 2, UTG = 3
    t.startHand();
    assert.equal(t.hand.toAct, 3);
    t.act(3, { type: 'call' }); // UTG iguala 20
    t.act(0, { type: 'raise', amount: 60 }); // BTN sube a 60 (subida de 40)
    t.act(1, { type: 'fold' });
    t.act(2, { type: 'fold' });
    // UTG (stack 50 restante) all-in a 70: subida incompleta (10 < 40)
    t.act(3, { type: 'allin' });
    const la = t.legalActions(0);
    assert.ok(la, 'BTN debe responder');
    assert.equal(la.canRaise, false, 'no puede volver a subir');
    assert.ok(la.canCall);
  }
  // 4) Heads-up: el botón pone la ciega pequeña y habla primero preflop, último postflop.
  {
    const t = makeTable([1000, 1000]);
    t.button = 1;
    t.startHand();
    assert.equal(t.hand.button, 0);
    assert.equal(t.hand.sbSeat, 0);
    assert.equal(t.hand.bbSeat, 1);
    assert.equal(t.hand.toAct, 0);
    t.act(0, { type: 'call' });
    assert.equal(t.hand.toAct, 1, 'opción de la ciega grande');
    t.act(1, { type: 'check' });
    t.proceed();
    assert.equal(t.hand.street, 'flop');
    assert.equal(t.hand.toAct, 1, 'postflop habla primero la BB');
  }
  // 5) Apuesta no igualada se devuelve cuando todos se retiran.
  {
    const t = makeTable([1000, 1000, 1000]);
    t.button = 2;
    t.startHand();
    t.act(0, { type: 'raise', amount: 100 });
    t.act(1, { type: 'fold' });
    t.act(2, { type: 'fold' });
    assert.equal(t.hand.phase, 'done');
    assert.equal(t.seats[0].stack, 1030); // gana ciegas 10 + 20
    assert.equal(total(t), 3000);
  }
  // 6) Fuzz: conservación de fichas e invariantes con acciones aleatorias.
  {
    const rng = makeRng(12345);
    let hands = 0;
    for (let game = 0; game < 300; game++) {
      const n = 2 + Math.floor(rng() * 8);
      const stacks = Array.from({ length: n }, () => 1 + Math.floor(rng() * 3000));
      const t = makeTable(stacks, { maxSeats: 9, ante: rng() < 0.3 ? 5 : 0 });
      const expected = stacks.reduce((a, b) => a + b, 0);
      let removed = 0;
      const total2 = () => total(t) + removed;
      for (let k = 0; k < 15 && t.canStartHand(); k++) {
        t.startHand();
        hands++;
        let guard = 0;
        while (t.hand.phase !== 'done' && guard++ < 500) {
          if (t.hand.phase === 'between') { t.proceed(); continue; }
          const seat = t.hand.toAct;
          const la = t.legalActions(seat);
          assert.ok(la, 'acciones legales');
          const r = rng();
          let res;
          if (rng() < 0.03) {
            // Desconexión aleatoria de otro jugador
            const others = t.hand.order.filter((s) => s !== seat);
            t.forceFold(others[Math.floor(rng() * others.length)]);
            continue;
          }
          if (rng() < 0.02) {
            // Un jugador se levanta a mitad de mano
            const cand = t.hand.order.filter((s) => t.seats[s]);
            const r2 = t.removePlayer(cand[Math.floor(rng() * cand.length)]);
            if (r2 > 0) removed += r2;
            continue;
          }
          if (r < 0.15 && !la.canCheck) res = t.act(seat, { type: 'fold' });
          else if (r < 0.55) res = t.act(seat, { type: la.canCheck ? 'check' : 'call' });
          else if (r < 0.9 && (la.canBet || la.canRaise)) {
            const amt = la.minTo + Math.floor(rng() * (la.maxTo - la.minTo + 1));
            res = t.act(seat, { type: la.canBet ? 'bet' : 'raise', amount: amt });
          } else res = t.act(seat, { type: 'allin' });
          assert.ok(res.ok, res.error);
          for (const p of t.seats) if (p) assert.ok(p.stack >= 0, 'stack negativo');
          assert.equal(total2(), expected, 'conservación durante la mano');
        }
        assert.equal(t.hand.phase, 'done', 'la mano termina');
        for (const l of t.removeLeavers()) removed += l.stack;
        assert.equal(total2(), expected, 'conservación al final');
      }
    }
    assert.ok(hands > 1000, 'manos simuladas: ' + hands);
  }
}
