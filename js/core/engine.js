// Motor de Texas Hold'em No-Limit. Determinista dado un mazo; sin temporizadores ni E/S.
// El "runner" controla el ritmo llamando a act() y proceed().
import { fullDeck, shuffleSecure, cardToStr } from './cards.js';
import { evalCards, describeScore, bestFive } from './evaluator.js';
import { positionLabels } from './ranges.js';

export const STREETS = ['preflop', 'flop', 'turn', 'river'];
export const STREET_NAMES = { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown' };

let handSerial = 0;

export function computePots(contribs, liveSeats) {
  // contribs: Map seat -> cantidad aportada; liveSeats: Set de asientos que no se han retirado.
  const levels = [...new Set([...contribs.entries()].filter(([s, v]) => liveSeats.has(s) && v > 0).map(([, v]) => v))].sort((a, b) => a - b);
  const pots = [];
  let prev = 0;
  for (const L of levels) {
    let amount = 0;
    for (const [, v] of contribs) amount += Math.min(v, L) - Math.min(v, prev);
    const eligible = [...liveSeats].filter((s) => (contribs.get(s) || 0) >= L);
    if (amount > 0) {
      if (pots.length && sameSet(pots[pots.length - 1].eligible, eligible)) pots[pots.length - 1].amount += amount;
      else pots.push({ amount, eligible });
    }
    prev = L;
  }
  // Restos por encima del último nivel (sólo posible en casos raros): al último bote.
  let leftover = 0;
  for (const [, v] of contribs) leftover += Math.max(0, v - prev);
  if (leftover > 0) {
    if (pots.length) pots[pots.length - 1].amount += leftover;
    else pots.push({ amount: leftover, eligible: [...liveSeats] });
  }
  return pots;
}

function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

export class Table {
  constructor(config = {}) {
    this.config = {
      name: config.name || 'Mesa',
      smallBlind: Math.max(1, Math.floor(config.smallBlind || 10)),
      bigBlind: Math.max(2, Math.floor(config.bigBlind || 20)),
      ante: Math.max(0, Math.floor(config.ante || 0)),
      maxSeats: Math.min(9, Math.max(2, Math.floor(config.maxSeats || 6))),
      mode: config.mode === 'sng' ? 'sng' : 'cash',
      minBuyIn: config.minBuyIn || 0,
      maxBuyIn: config.maxBuyIn || 0,
    };
    if (this.config.bigBlind < this.config.smallBlind) this.config.bigBlind = this.config.smallBlind * 2;
    this.seats = new Array(this.config.maxSeats).fill(null);
    this.button = -1;
    this.hand = null;
    this.handCount = 0;
    this.events = [];
    this.pendingBlinds = null;
  }

  // ---------- Gestión de asientos ----------
  // Un asiento vaciado a mitad de mano no se reutiliza hasta que la mano termina.
  seatBlocked(seat) {
    return !!(this.hand && this.hand.phase !== 'done' && this.hand.ps[seat]);
  }

  seatPlayer(seat, player) {
    if (seat < 0 || seat >= this.seats.length || this.seats[seat] || this.seatBlocked(seat)) return false;
    this.seats[seat] = {
      id: player.id,
      name: player.name,
      avatar: player.avatar || '🙂',
      stack: Math.max(0, Math.floor(player.stack || 0)),
      isBot: !!player.isBot,
      bot: player.bot || null,
      sittingOut: !!player.sittingOut,
      connected: player.connected !== false,
      leaving: false,
      timeouts: 0,
      meta: player.meta || {},
    };
    this.emit({ type: 'seat', seat, name: player.name });
    return true;
  }

  firstFreeSeat() {
    return this.seats.findIndex((s, i) => !s && !this.seatBlocked(i));
  }

  seatOf(id) {
    return this.seats.findIndex((s) => s && s.id === id);
  }

  // Devuelve el stack si el jugador sale inmediatamente, o -1 si saldrá al acabar la mano en curso.
  removePlayer(seat) {
    const p = this.seats[seat];
    if (!p) return 0;
    if (this.inHand(seat)) {
      this.forceFold(seat);
      // Si sigue all-in, se queda hasta el final de la mano para cobrar lo que gane.
      if (this.inHand(seat) && !this.hand.ps[seat].folded) { p.leaving = true; return -1; }
    }
    const stack = p.stack;
    this.seats[seat] = null;
    this.emit({ type: 'leave', seat, name: p.name });
    return stack;
  }

  // Retira a un jugador de la mano en curso (desconexión, abandono). Si está all-in sigue optando al bote.
  forceFold(seat) {
    const h = this.hand;
    if (!this.inHand(seat)) return;
    const hp = h.ps[seat];
    if (hp.folded || hp.allIn) return;
    if (h.phase === 'betting') {
      if (h.toAct === seat) { this.act(seat, { type: 'fold' }); return; }
      hp.folded = true; hp.lastAction = 'fold'; hp.acted = true;
      this.log(seat, 'fold', 0);
      this.emit({ type: 'action', seat, action: 'fold', amount: 0 });
      this._afterAction(seat, true);
    } else if (h.phase === 'between') {
      hp.folded = true; hp.lastAction = 'fold';
      this.log(seat, 'fold', 0);
      this.emit({ type: 'action', seat, action: 'fold', amount: 0 });
      if (this._liveSeats().length <= 1) this._finishUncontested();
    }
  }

  // Quita de la mesa a quienes marcaron salida; devuelve [{seat, player, stack}].
  removeLeavers() {
    const out = [];
    if (this.hand && this.hand.phase !== 'done') return out;
    for (let i = 0; i < this.seats.length; i++) {
      const p = this.seats[i];
      if (p && p.leaving) {
        out.push({ seat: i, player: p, stack: p.stack });
        this.seats[i] = null;
        this.emit({ type: 'leave', seat: i, name: p.name });
      }
    }
    return out;
  }

  setSittingOut(seat, value) {
    const p = this.seats[seat];
    if (!p) return;
    p.sittingOut = !!value; // efectivo desde la próxima mano
  }

  setBlinds(sb, bb, ante = 0) {
    this.pendingBlinds = { smallBlind: Math.max(1, Math.floor(sb)), bigBlind: Math.max(2, Math.floor(bb)), ante: Math.max(0, Math.floor(ante)) };
  }

  inHand(seat) {
    return !!(this.hand && this.hand.phase !== 'done' && this.hand.ps[seat]);
  }

  eligibleSeats() {
    const out = [];
    for (let i = 0; i < this.seats.length; i++) {
      const p = this.seats[i];
      if (p && p.stack > 0 && !p.sittingOut && !p.leaving) out.push(i);
    }
    return out;
  }

  canStartHand() {
    return (!this.hand || this.hand.phase === 'done') && this.eligibleSeats().length >= 2;
  }

  emit(ev) {
    this.events.push(ev);
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  // Siguiente asiento en sentido horario que cumpla el predicado.
  nextSeat(from, pred) {
    const n = this.seats.length;
    for (let k = 1; k <= n; k++) {
      const s = (from + k + n) % n;
      if (pred(s)) return s;
    }
    return -1;
  }

  // ---------- Inicio de mano ----------
  startHand(deck) {
    if (!this.canStartHand()) return false;
    if (this.pendingBlinds) {
      Object.assign(this.config, this.pendingBlinds);
      this.pendingBlinds = null;
      this.emit({ type: 'blinds', sb: this.config.smallBlind, bb: this.config.bigBlind, ante: this.config.ante });
    }
    // Limpiar asientos de jugadores que se marcharon.
    for (let i = 0; i < this.seats.length; i++) {
      const p = this.seats[i];
      if (p && p.leaving) { this.seats[i] = null; this.emit({ type: 'leave', seat: i, name: p.name }); }
    }
    const elig = new Set(this.eligibleSeats());
    if (elig.size < 2) return false;
    const isElig = (s) => elig.has(s);
    this.button = this.button < 0 ? [...elig][Math.floor(Math.random() * elig.size)] : this.nextSeat(this.button, isElig);
    const heads = elig.size === 2;
    const sbSeat = heads ? this.button : this.nextSeat(this.button, isElig);
    const bbSeat = this.nextSeat(sbSeat, isElig);

    const d = Array.isArray(deck) && deck.length === 52 ? deck.slice() : shuffleSecure(fullDeck());
    this.handCount++;
    const ps = {};
    const order = [];
    let s = this.button;
    for (let k = 0; k < elig.size; k++) {
      s = this.nextSeat(s, isElig);
      order.push(s);
    }
    const labels = positionLabels(elig.size);
    for (const seat of order) {
      const off = (order.indexOf(seat) - order.indexOf(this.button) + order.length) % order.length;
      ps[seat] = {
        seat,
        id: this.seats[seat].id,
        cards: [],
        bet: 0,
        total: 0,
        folded: false,
        allIn: false,
        acted: false,
        canRaise: true,
        lastAction: null,
        startStack: this.seats[seat].stack,
        position: labels[off] || '',
        vpip: false,
        pfr: false,
        threeBet: false,
        sawFlop: false,
        shown: false,
      };
    }
    this.hand = {
      id: ++handSerial,
      number: this.handCount,
      deck: d,
      deckPos: 0,
      board: [],
      street: 'preflop',
      phase: 'betting', // betting | between | done
      ps,
      order,
      button: this.button,
      sbSeat,
      bbSeat,
      sb: this.config.smallBlind,
      bb: this.config.bigBlind,
      ante: this.config.ante,
      currentBet: 0,
      minRaise: this.config.bigBlind,
      lastAggressor: -1,
      raisesThisStreet: 0,
      toAct: -1,
      log: [],
      result: null,
      runout: false,
      startedAt: Date.now(),
    };
    const h = this.hand;
    this.emit({ type: 'handStart', handId: h.id, number: h.number, button: h.button, sbSeat, bbSeat, order: order.slice() });

    // Antes
    if (h.ante > 0) {
      for (const seat of order) this._post(seat, h.ante, 'ante');
    }
    this._post(sbSeat, h.sb, 'sb');
    this._post(bbSeat, h.bb, 'bb');
    h.currentBet = h.bb;
    h.minRaise = h.bb;

    // Repartir dos cartas empezando por la izquierda del botón.
    for (let r = 0; r < 2; r++) for (const seat of order) ps[seat].cards.push(h.deck[h.deckPos++]);
    this.emit({ type: 'deal', seats: order.slice() });

    h.toAct = this._nextToAct(bbSeat);
    if (h.toAct < 0 || this._roundComplete()) this._endRound();
    else this.emit({ type: 'turn', seat: h.toAct });
    return true;
  }

  _post(seat, amount, kind) {
    const h = this.hand, p = this.seats[seat], hp = h.ps[seat];
    const amt = Math.min(p.stack, amount);
    p.stack -= amt;
    hp.total += amt;
    if (kind !== 'ante') hp.bet += amt;
    if (p.stack === 0) hp.allIn = true;
    this.log(seat, kind, amt);
    this.emit({ type: 'post', seat, kind, amount: amt });
  }

  log(seat, action, amount, to) {
    const h = this.hand;
    const p = this.seats[seat];
    h.log.push({ street: h.street, seat, name: p ? p.name : '?', action, amount, to: to ?? null, t: Date.now() });
  }

  // ---------- Acciones ----------
  _liveSeats() {
    return this.hand.order.filter((s) => !this.hand.ps[s].folded);
  }

  _canActSeats() {
    return this.hand.order.filter((s) => !this.hand.ps[s].folded && !this.hand.ps[s].allIn);
  }

  _needsToAct(seat) {
    const hp = this.hand.ps[seat];
    return hp && !hp.folded && !hp.allIn && (!hp.acted || hp.bet < this.hand.currentBet);
  }

  _nextToAct(from) {
    const h = this.hand;
    const n = this.seats.length;
    for (let k = 1; k <= n; k++) {
      const s = (from + k) % n;
      if (h.ps[s] && this._needsToAct(s)) return s;
    }
    return -1;
  }

  _roundComplete() {
    const h = this.hand;
    const live = this._liveSeats();
    if (live.length <= 1) return true;
    const canAct = this._canActSeats();
    if (canAct.length === 0) return true;
    if (canAct.length === 1 && h.ps[canAct[0]].bet >= h.currentBet) return true;
    return canAct.every((s) => h.ps[s].acted && h.ps[s].bet >= h.currentBet);
  }

  legalActions(seat) {
    const h = this.hand;
    if (!h || h.phase !== 'betting' || h.toAct !== seat) return null;
    const p = this.seats[seat], hp = h.ps[seat];
    const toCall = Math.max(0, h.currentBet - hp.bet);
    const maxTo = hp.bet + p.stack;
    const others = this._canActSeats().filter((s) => s !== seat).length;
    const canAggress = hp.canRaise && others > 0 && maxTo > h.currentBet;
    let minTo = h.currentBet === 0 ? Math.min(h.bb, maxTo) : Math.min(h.currentBet + h.minRaise, maxTo);
    if (h.currentBet === 0) minTo = Math.max(minTo, Math.min(h.bb, maxTo));
    return {
      seat,
      toCall: Math.min(toCall, p.stack),
      canCheck: toCall === 0,
      canCall: toCall > 0,
      callIsAllIn: toCall >= p.stack,
      canBet: canAggress && h.currentBet === 0,
      canRaise: canAggress && h.currentBet > 0,
      minTo,
      maxTo,
      currentBet: h.currentBet,
      myBet: hp.bet,
      stack: p.stack,
      pot: this.potTotal(),
      bb: h.bb,
      street: h.street,
    };
  }

  act(seat, action) {
    const h = this.hand;
    if (!h || h.phase !== 'betting') return { ok: false, error: 'No hay acción pendiente' };
    if (h.toAct !== seat) return { ok: false, error: 'No es tu turno' };
    const la = this.legalActions(seat);
    const p = this.seats[seat], hp = h.ps[seat];
    let type = action && action.type;
    let to = Math.floor(Number(action && action.amount) || 0);

    if (type === 'allin') {
      if (la.canBet || la.canRaise) { type = la.canBet ? 'bet' : 'raise'; to = la.maxTo; }
      else if (la.canCall) type = 'call';
      else type = 'check';
    }
    if (type === 'check' && !la.canCheck) return { ok: false, error: 'No puedes pasar' };
    if (type === 'call' && !la.canCall) type = la.canCheck ? 'check' : type;
    if ((type === 'bet' || type === 'raise') && !(la.canBet || la.canRaise)) {
      // Si no se puede subir, interpretar como igualar.
      type = la.canCall ? 'call' : 'check';
    }
    if (type === 'bet' && la.canRaise) type = 'raise';
    if (type === 'raise' && la.canBet) type = 'bet';

    switch (type) {
      case 'fold': {
        hp.folded = true;
        hp.lastAction = 'fold';
        this.log(seat, 'fold', 0);
        this.emit({ type: 'action', seat, action: 'fold', amount: 0 });
        break;
      }
      case 'check': {
        hp.lastAction = 'check';
        this.log(seat, 'check', 0);
        this.emit({ type: 'action', seat, action: 'check', amount: 0 });
        break;
      }
      case 'call': {
        const amt = Math.min(p.stack, h.currentBet - hp.bet);
        p.stack -= amt; hp.bet += amt; hp.total += amt;
        if (p.stack === 0) hp.allIn = true;
        hp.lastAction = hp.allIn ? 'allin' : 'call';
        if (h.street === 'preflop') hp.vpip = true;
        this.log(seat, 'call', amt, hp.bet);
        this.emit({ type: 'action', seat, action: hp.allIn ? 'allin' : 'call', amount: amt, to: hp.bet });
        break;
      }
      case 'bet':
      case 'raise': {
        to = Math.max(la.minTo, Math.min(la.maxTo, to));
        if (to <= h.currentBet) return { ok: false, error: 'Cantidad no válida' };
        const raiseSize = to - h.currentBet;
        const prevBet = h.currentBet;
        // Una apuesta de apertura siempre reabre la acción; una subida all-in incompleta no.
        const full = prevBet === 0 || raiseSize >= h.minRaise;
        const amt = to - hp.bet;
        p.stack -= amt; hp.bet = to; hp.total += amt;
        if (p.stack === 0) hp.allIn = true;
        h.currentBet = to;
        if (full) {
          if (prevBet === 0) h.minRaise = Math.max(to, h.bb);
          else h.minRaise = Math.max(raiseSize, h.minRaise);
          for (const s of h.order) {
            if (s === seat) continue;
            const o = h.ps[s];
            if (!o.folded && !o.allIn) { o.acted = false; o.canRaise = true; }
          }
        } else {
          for (const s of h.order) {
            if (s === seat) continue;
            const o = h.ps[s];
            if (!o.folded && !o.allIn && o.acted) o.canRaise = false;
          }
        }
        h.lastAggressor = seat;
        h.raisesThisStreet++;
        if (h.street === 'preflop') {
          hp.vpip = true;
          if (!hp.pfr) hp.pfr = true;
          if (h.raisesThisStreet === 2) hp.threeBet = true;
        }
        const act = hp.allIn ? 'allin' : (prevBet === 0 ? 'bet' : 'raise');
        hp.lastAction = act;
        this.log(seat, prevBet === 0 ? 'bet' : 'raise', amt, to);
        this.emit({ type: 'action', seat, action: act, amount: amt, to });
        break;
      }
      default:
        return { ok: false, error: 'Acción desconocida' };
    }
    hp.acted = true;
    p.timeouts = 0;
    this._afterAction(seat, false);
    return { ok: true };
  }

  _afterAction(seat, external) {
    const h = this.hand;
    if (this._liveSeats().length <= 1) {
      this._endRound();
      return;
    }
    if (this._roundComplete()) {
      this._endRound();
      return;
    }
    if (external && h.toAct !== seat) {
      // Un jugador fuera de turno se retiró: el turno sigue donde estaba salvo que ya no deba actuar.
      if (!this._needsToAct(h.toAct)) h.toAct = this._nextToAct(h.toAct);
    } else {
      h.toAct = this._nextToAct(seat);
    }
    if (h.toAct < 0) this._endRound();
    else this.emit({ type: 'turn', seat: h.toAct });
  }

  // Devuelve la parte no igualada de la apuesta más alta de la calle.
  _returnUncalled() {
    const h = this.hand;
    let maxSeat = -1, max = 0, second = 0;
    for (const s of h.order) {
      const b = h.ps[s].bet;
      if (b > max) { second = max; max = b; maxSeat = s; } else if (b > second) second = b;
    }
    // Si el dueño ya se levantó de la mesa, la apuesta se queda en el bote.
    if (maxSeat >= 0 && max > second && this.seats[maxSeat]) {
      const diff = max - second;
      const hp = h.ps[maxSeat];
      hp.bet -= diff; hp.total -= diff;
      const owner = this.seats[maxSeat];
      owner.stack += diff;
      if (hp.allIn && owner.stack > 0) hp.allIn = false;
      this.log(maxSeat, 'return', diff);
      this.emit({ type: 'return', seat: maxSeat, amount: diff });
    }
  }

  _endRound() {
    const h = this.hand;
    this._returnUncalled();
    const collected = h.order.reduce((a, s) => a + h.ps[s].bet, 0);
    for (const s of h.order) { h.ps[s].bet = 0; }
    h.toAct = -1;
    this.emit({ type: 'collect', amount: collected, pot: this.potTotal() });
    if (this._liveSeats().length <= 1) {
      this._finishUncontested();
      return;
    }
    if (h.street === 'river') {
      h.phase = 'between';
      h.next = 'showdown';
    } else {
      h.phase = 'between';
      h.next = STREETS[STREETS.indexOf(h.street) + 1];
      if (this._canActSeats().length <= 1 && !h.runout) {
        h.runout = true;
        this._revealAllIn();
      }
    }
  }

  _revealAllIn() {
    const h = this.hand;
    const reveals = [];
    for (const s of this._liveSeats()) {
      h.ps[s].shown = true;
      reveals.push({ seat: s, cards: h.ps[s].cards.slice() });
    }
    this.emit({ type: 'reveal', reveals, reason: 'allin' });
  }

  // Avanza a la siguiente calle o al showdown. Devuelve false si no había nada que hacer.
  proceed() {
    const h = this.hand;
    if (!h || h.phase !== 'between') return false;
    if (h.next === 'showdown') { this._showdown(); return true; }
    const street = h.next;
    h.street = street;
    h.deckPos++; // carta quemada
    const n = street === 'flop' ? 3 : 1;
    const cards = [];
    for (let i = 0; i < n; i++) { const c = h.deck[h.deckPos++]; h.board.push(c); cards.push(c); }
    if (street === 'flop') for (const s of this._liveSeats()) h.ps[s].sawFlop = true;
    h.currentBet = 0;
    h.minRaise = h.bb;
    h.raisesThisStreet = 0;
    for (const s of h.order) {
      const hp = h.ps[s];
      hp.acted = false;
      hp.canRaise = true;
      if (!hp.folded && !hp.allIn) hp.lastAction = null;
    }
    this.emit({ type: 'street', street, cards, board: h.board.slice() });
    if (this._canActSeats().length <= 1) {
      h.phase = 'between';
      h.next = street === 'river' ? 'showdown' : STREETS[STREETS.indexOf(street) + 1];
      if (!h.runout) { h.runout = true; this._revealAllIn(); }
      return true;
    }
    h.phase = 'betting';
    h.toAct = this._nextToAct(h.button);
    this.emit({ type: 'turn', seat: h.toAct });
    return true;
  }

  potTotal() {
    const h = this.hand;
    if (!h) return 0;
    let t = 0;
    for (const s of h.order) t += h.ps[s].total;
    return t;
  }

  _contribMap() {
    const m = new Map();
    for (const s of this.hand.order) m.set(s, this.hand.ps[s].total);
    return m;
  }

  _finishUncontested() {
    const h = this.hand;
    const winner = this._liveSeats()[0];
    const amount = this.potTotal();
    this.seats[winner].stack += amount;
    h.result = {
      showdown: false,
      pots: [{ amount, eligible: [winner], winners: [winner], shares: { [winner]: amount }, handName: null }],
      winners: [winner],
      reveals: [],
      payouts: { [winner]: amount },
    };
    this.log(winner, 'win', amount);
    this._finishHand();
  }

  _showdown() {
    const h = this.hand;
    h.street = 'showdown';
    const live = this._liveSeats();
    const pots = computePots(this._contribMap(), new Set(live));
    const scores = {};
    const reveals = [];
    for (const s of live) {
      const seven = h.ps[s].cards.concat(h.board);
      scores[s] = evalCards(seven, seven.length);
      const bf = bestFive(seven);
      h.ps[s].shown = true;
      h.ps[s].handName = describeScore(scores[s]);
      reveals.push({ seat: s, cards: h.ps[s].cards.slice(), handName: h.ps[s].handName, best: bf.cards });
    }
    const payouts = {};
    const outPots = [];
    const seatsFromButton = [];
    for (let k = 1; k <= this.seats.length; k++) seatsFromButton.push((h.button + k) % this.seats.length);
    for (const pot of pots) {
      let best = -1;
      for (const s of pot.eligible) if (scores[s] > best) best = scores[s];
      const winners = seatsFromButton.filter((s) => pot.eligible.includes(s) && scores[s] === best);
      const share = Math.floor(pot.amount / winners.length);
      let rem = pot.amount - share * winners.length;
      const shares = {};
      for (const w of winners) {
        let amt = share;
        if (rem > 0) { amt++; rem--; }
        shares[w] = amt;
        payouts[w] = (payouts[w] || 0) + amt;
      }
      outPots.push({ amount: pot.amount, eligible: pot.eligible, winners, shares, handName: describeScore(best) });
    }
    for (const [s, amt] of Object.entries(payouts)) {
      this.seats[s].stack += amt;
      this.log(Number(s), 'win', amt);
    }
    h.result = {
      showdown: true,
      pots: outPots,
      winners: Object.keys(payouts).map(Number),
      reveals,
      payouts,
    };
    this.emit({ type: 'reveal', reveals, reason: 'showdown' });
    this._finishHand();
  }

  _finishHand() {
    const h = this.hand;
    h.phase = 'done';
    h.toAct = -1;
    h.endedAt = Date.now();
    this.emit({ type: 'handEnd', handId: h.id, result: h.result });
  }

  // Mostrar cartas voluntariamente tras ganar sin showdown.
  showCards(seat) {
    const h = this.hand;
    if (!h || h.phase !== 'done' || !h.ps[seat] || h.ps[seat].shown) return false;
    h.ps[seat].shown = true;
    this.emit({ type: 'show', seat, cards: h.ps[seat].cards.slice() });
    return true;
  }

  // ---------- Vista serializable ----------
  view(viewerSeat = -1, opts = {}) {
    const h = this.hand;
    const seats = this.seats.map((p, i) => {
      if (!p) return null;
      const hp = h && h.ps[i];
      let cards = null;
      if (hp && hp.cards.length) {
        const visible = opts.revealAll || i === viewerSeat || hp.shown;
        cards = visible ? hp.cards.slice() : hp.cards.map(() => -1);
      }
      return {
        seat: i,
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        stack: p.stack,
        isBot: p.isBot,
        botStyle: p.bot ? p.bot.style : null,
        sittingOut: p.sittingOut,
        connected: p.connected,
        leaving: p.leaving,
        inHand: !!hp,
        folded: hp ? hp.folded : false,
        allIn: hp ? hp.allIn : false,
        bet: hp ? hp.bet : 0,
        total: hp ? hp.total : 0,
        lastAction: hp ? hp.lastAction : null,
        position: hp ? hp.position : '',
        cards,
        handName: hp && hp.shown && h.phase === 'done' && h.result && h.result.showdown ? hp.handName : null,
      };
    });
    const v = {
      config: { ...this.config },
      button: this.button,
      seats,
      handNumber: this.handCount,
    };
    if (h) {
      const live = new Set(this._liveSeats());
      const collected = new Map();
      for (const s of h.order) collected.set(s, h.ps[s].total - h.ps[s].bet);
      v.hand = {
        id: h.id,
        street: h.street,
        phase: h.phase,
        board: h.board.slice(),
        toAct: h.toAct,
        currentBet: h.currentBet,
        minRaise: h.minRaise,
        sbSeat: h.sbSeat,
        bbSeat: h.bbSeat,
        sb: h.sb,
        bb: h.bb,
        ante: h.ante,
        pot: this.potTotal(),
        potCollected: [...collected.values()].reduce((a, b) => a + b, 0),
        sidePots: h.phase === 'done' ? [] : computePots(collected, live).map((p) => ({ amount: p.amount, eligible: p.eligible })),
        result: h.result ? JSON.parse(JSON.stringify(h.result)) : null,
        runout: h.runout,
        log: h.log.slice(-40),
      };
      if (viewerSeat >= 0 && h.toAct === viewerSeat) v.legal = this.legalActions(viewerSeat);
    }
    return v;
  }

  // Historial completo de la mano para el visor.
  handHistory(viewerSeat = -1) {
    const h = this.hand;
    if (!h) return null;
    return {
      id: h.id,
      number: h.number,
      table: this.config.name,
      sb: h.sb,
      bb: h.bb,
      ante: h.ante,
      button: h.button,
      board: h.board.map(cardToStr),
      players: h.order.map((s) => ({
        seat: s,
        name: this.seats[s] ? this.seats[s].name : '?',
        position: h.ps[s].position,
        startStack: h.ps[s].startStack,
        cards: (s === viewerSeat || h.ps[s].shown) ? h.ps[s].cards.map(cardToStr) : null,
        hero: s === viewerSeat,
      })),
      log: h.log.map((l) => ({ ...l })),
      result: h.result ? JSON.parse(JSON.stringify(h.result)) : null,
      date: h.startedAt,
    };
  }
}
