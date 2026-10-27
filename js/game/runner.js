// Orquesta una mesa: ritmo de juego, bots, temporizadores, recompras, Sit & Go y baraja verificable.
// Se usa igual para partidas locales contra bots y como anfitrión de salas online.
import { Table } from '../core/engine.js';
import { decide, thinkTime, randomBotIdentity, pickStyle } from '../core/bots.js';
import { fullDeck, shuffleSecure, cardToStr, fastRng } from '../core/cards.js';

export const SNG_LEVELS = [
  [10, 20, 0], [15, 30, 0], [25, 50, 0], [40, 80, 5], [60, 120, 10], [80, 160, 15], [100, 200, 20],
  [150, 300, 30], [200, 400, 40], [300, 600, 60], [400, 800, 80], [600, 1200, 120], [800, 1600, 160], [1000, 2000, 200],
];

export function sngPayouts(n) {
  if (n <= 4) return [1];
  if (n <= 6) return [0.65, 0.35];
  return [0.5, 0.3, 0.2];
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomHex(bytes) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

let botSerial = 0;

export class GameRunner {
  constructor(opts) {
    this.opts = {
      turnTime: 25, // segundos; 0 = sin límite
      speed: 1,
      botLevel: 1,
      targetBots: 0,
      botRebuy: true,
      verifiable: false,
      autoStart: true,
      ...opts,
    };
    this.table = new Table(opts.config);
    this.mode = this.table.config.mode;
    this.listeners = new Set();
    this.timers = new Set();
    this.turnTimer = null;
    this.turnDeadline = 0;
    this.paused = false;
    this.stopped = false;
    this.humans = new Map(); // id -> {seat, name}
    this.commit = null;
    this.sng = null;
    this.handsPlayed = 0;
    this.busy = false;
    if (this.mode === 'sng') {
      this.sng = {
        started: false,
        finished: false,
        level: 0,
        levelHands: opts.sng?.levelHands || 8,
        startingStack: opts.sng?.startingStack || 1500,
        buyIn: opts.sng?.buyIn || 0,
        entrants: 0,
        places: [], // [{id, name, place}]
        handsAtLevel: 0,
      };
      const [sb, bb, ante] = SNG_LEVELS[0];
      this.table.config.smallBlind = sb;
      this.table.config.bigBlind = bb;
      this.table.config.ante = ante;
    }
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  emit(extra = []) {
    const events = this.table.drainEvents().concat(extra);
    for (const fn of this.listeners) {
      try { fn(events); } catch (e) { console.error(e); }
    }
  }

  later(fn, ms) {
    const id = setTimeout(() => { this.timers.delete(id); if (!this.stopped) fn(); }, ms);
    this.timers.add(id);
    return id;
  }

  clearTimers() {
    for (const id of this.timers) clearTimeout(id);
    this.timers.clear();
    this.clearTurnTimer();
    this._startPending = false;
    this._betweenTimer = null;
  }

  clearTurnTimer() {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = null;
    this.turnDeadline = 0;
  }

  // ---------- Jugadores ----------
  addHuman({ id, name, avatar, stack, seat = -1, meta }) {
    const t = this.table;
    if (this.humans.has(id)) return this.humans.get(id).seat;
    let s = seat >= 0 && !t.seats[seat] ? seat : t.firstFreeSeat();
    if (s < 0) return -1;
    const st = this.mode === 'sng' ? this.sng.startingStack : stack;
    t.seatPlayer(s, { id, name, avatar, stack: st, isBot: false, meta });
    this.humans.set(id, { seat: s, name });
    this.emit();
    this.maybeStart();
    return s;
  }

  addBot({ style, stack, level } = {}) {
    const t = this.table;
    const s = t.firstFreeSeat();
    if (s < 0) return -1;
    const used = new Set(t.seats.filter(Boolean).map((p) => p.name));
    const ident = randomBotIdentity(used);
    const bb = t.config.bigBlind;
    const st = this.mode === 'sng' ? this.sng.startingStack : (stack || Math.round(bb * (70 + fastRng() * 80)));
    const bot = { style: style || pickStyle(level ?? this.opts.botLevel) };
    t.seatPlayer(s, { id: 'bot-' + (++botSerial) + '-' + Date.now().toString(36), name: ident.name, avatar: ident.avatar, stack: st, isBot: true, bot });
    this.emit();
    this.maybeStart();
    return s;
  }

  removeBot(seat) {
    const p = this.table.seats[seat];
    if (!p || !p.isBot) return false;
    this.table.removePlayer(seat);
    this.emit();
    return true;
  }

  // Devuelve las fichas a acreditar (o -1 si se acreditarán al acabar la mano).
  removeHuman(id) {
    const h = this.humans.get(id);
    if (!h) return 0;
    const seat = this.table.seatOf(id);
    if (seat < 0) { this.humans.delete(id); return 0; }
    if (this.mode === 'sng') {
      // En torneo, abandonar = quedar eliminado; las fichas de torneo no se devuelven.
      const p = this.table.seats[seat];
      this.humans.delete(id);
      if (this.sng.started && !this.sng.finished) {
        p.leaving = true;
        this.table.forceFold(seat);
        if (!this.table.inHand(seat)) {
          const events = [];
          this.eliminate(seat, events);
          this.checkSngWinner(events);
          this.emit(events);
        }
      } else {
        this.table.removePlayer(seat);
      }
      this.afterChange();
      return 0;
    }
    const res = this.table.removePlayer(seat);
    if (res >= 0) this.humans.delete(id);
    else this.humans.get(id).pendingLeave = true;
    this.afterChange();
    return res;
  }

  seatOf(id) { return this.table.seatOf(id); }

  setConnected(id, connected) {
    const seat = this.table.seatOf(id);
    if (seat < 0) return;
    this.table.seats[seat].connected = connected;
    this.emit();
  }

  setSittingOut(id, value) {
    const seat = this.table.seatOf(id);
    if (seat < 0) return;
    this.table.setSittingOut(seat, value);
    if (!value) this.table.seats[seat].timeouts = 0;
    this.emit();
    if (!value) this.maybeStart();
  }

  rebuy(id, amount) {
    if (this.mode !== 'cash') return false;
    const seat = this.table.seatOf(id);
    if (seat < 0) return false;
    if (this.table.inHand(seat)) return false;
    const p = this.table.seats[seat];
    p.stack += Math.max(0, Math.floor(amount));
    p.sittingOut = false;
    this.emit([{ type: 'rebuy', seat, amount }]);
    this.maybeStart();
    return true;
  }

  // ---------- Acciones ----------
  act(id, action) {
    const seat = this.table.seatOf(id);
    if (seat < 0) return { ok: false, error: 'No estás sentado' };
    if (this.paused) return { ok: false, error: 'Partida en pausa' };
    const h = this.table.hand;
    if (!h || h.toAct !== seat) return { ok: false, error: 'No es tu turno' };
    this.clearTurnTimer();
    const res = this.table.act(seat, action);
    if (res.ok) this.afterChange();
    else this.scheduleTurn();
    return res;
  }

  showCards(id) {
    const seat = this.table.seatOf(id);
    if (seat >= 0 && this.table.showCards(seat)) this.emit();
  }

  view(id) {
    const seat = id ? this.table.seatOf(id) : -1;
    const v = this.table.view(seat);
    v.you = seat;
    v.turnDeadline = this.turnDeadline;
    v.turnRemaining = this.turnDeadline ? Math.max(0, this.turnDeadline - Date.now()) : 0;
    v.turnTotal = this.opts.turnTime * 1000;
    v.paused = this.paused;
    v.mode = this.mode;
    if (this.sng) {
      const lvl = SNG_LEVELS[Math.min(this.sng.level, SNG_LEVELS.length - 1)];
      const next = SNG_LEVELS[Math.min(this.sng.level + 1, SNG_LEVELS.length - 1)];
      v.sng = {
        started: this.sng.started,
        finished: this.sng.finished,
        level: this.sng.level + 1,
        blinds: lvl,
        nextBlinds: next,
        handsToNext: Math.max(0, this.sng.levelHands - this.sng.handsAtLevel),
        places: this.sng.places.slice(),
        entrants: this.sng.entrants,
        buyIn: this.sng.buyIn,
        payouts: sngPayouts(this.sng.entrants || this.table.seats.filter(Boolean).length),
      };
    }
    if (this.commit) v.commitHash = this.commit.hash;
    return v;
  }

  // ---------- Ciclo de juego ----------
  start() {
    this.stopped = false;
    this.maybeStart();
  }

  stop() {
    this.stopped = true;
    this.clearTimers();
  }

  setPaused(p) {
    this.paused = !!p;
    if (this.paused) this.clearTimers();
    this.emit([{ type: 'pause', paused: this.paused }]);
    if (!this.paused) this.afterChange();
  }

  startSng() {
    if (!this.sng || this.sng.started) return false;
    const players = this.table.seats.filter(Boolean);
    if (players.length < 2) return false;
    this.sng.started = true;
    this.sng.entrants = players.length;
    for (const p of players) p.stack = this.sng.startingStack;
    this.emit([{ type: 'sngStart', entrants: players.length }]);
    this.maybeStart(true);
    return true;
  }

  maybeStart(force = false) {
    if (this.stopped || this.paused || this.busy) return;
    if (this.mode === 'sng' && (!this.sng.started || this.sng.finished)) return;
    const h = this.table.hand;
    if (h && h.phase !== 'done') return;
    if (!this.opts.autoStart && !force) return;
    if (!this.table.canStartHand()) return;
    if (this._startPending) return;
    this._startPending = true;
    this.later(() => { this._startPending = false; this.startNextHand(); }, force ? 300 : 900);
  }

  async startNextHand() {
    if (this.stopped || this.paused) return;
    if (!this.table.canStartHand()) return;
    this.busy = true;
    let deck = shuffleSecure(fullDeck());
    let commitEvent = [];
    if (this.opts.verifiable && globalThis.crypto && crypto.subtle) {
      try {
        const salt = randomHex(16);
        const deckStr = deck.map(cardToStr).join('');
        const hash = await sha256Hex(deckStr + ':' + salt);
        this.commit = { hash, salt, deckStr };
        commitEvent = [{ type: 'commit', hash }];
      } catch (e) { this.commit = null; }
    }
    this.busy = false;
    if (this.stopped) return;
    if (!this.table.startHand(deck)) { this.emit(); return; }
    this.emit(commitEvent);
    this.afterChange();
  }

  afterChange() {
    if (this.stopped) return;
    const h = this.table.hand;
    this.emit();
    if (!h) { this.maybeStart(); return; }
    if (this.paused) return;
    if (h.phase === 'betting') this.scheduleTurn();
    else if (h.phase === 'between') {
      const delay = (h.runout ? 1500 : 750) / this.opts.speed;
      this.later(() => { if (this.table.proceed()) this.afterChange(); }, Math.max(250, delay));
    } else if (h.phase === 'done') {
      if (!h._handled) { h._handled = true; this.onHandDone(); }
      else if (h._between) this.maybeStart();
      else if (!this._betweenTimer) this._betweenTimer = this.later(() => this.betweenHands(), 600);
    }
  }

  scheduleTurn() {
    const h = this.table.hand;
    if (!h || h.phase !== 'betting' || h.toAct < 0) return;
    const seat = h.toAct;
    const p = this.table.seats[seat];
    this.clearTurnTimer();
    if (p.isBot) {
      const handId = h.id;
      this.later(() => {
        const hh = this.table.hand;
        if (!hh || hh.id !== handId || hh.toAct !== seat || hh.phase !== 'betting') return;
        const a = decide(this.table, seat);
        const res = this.table.act(seat, a);
        if (!res.ok) this.table.act(seat, { type: this.table.legalActions(seat)?.canCheck ? 'check' : 'fold' });
        this.afterChange();
      }, thinkTime(this.table, seat, this.opts.speed));
      return;
    }
    // Humano: desconectado o ausente → acción automática rápida.
    const auto = !p.connected || p.sittingOut || p.leaving;
    const ms = auto ? 1200 : (this.opts.turnTime > 0 ? this.opts.turnTime * 1000 : 0);
    if (!ms) { this.emit(); return; }
    this.turnDeadline = Date.now() + ms;
    const handId = h.id;
    const street = h.street;
    this.turnTimer = setTimeout(() => {
      this.turnTimer = null;
      this.turnDeadline = 0;
      const hh = this.table.hand;
      if (!hh || hh.id !== handId || hh.toAct !== seat || hh.street !== street) return;
      const la = this.table.legalActions(seat);
      if (!la) return;
      this.table.act(seat, { type: la.canCheck ? 'check' : 'fold' });
      if (!auto) {
        p.timeouts = (p.timeouts || 0) + 1;
        if (p.timeouts >= 2) { p.sittingOut = true; this.table.emit({ type: 'sitout', seat, reason: 'timeout' }); }
      }
      this.afterChange();
    }, ms);
    this.emit([{ type: 'timer', seat, ms }]);
  }

  onHandDone() {
    const t = this.table;
    const h = t.hand;
    this.handsPlayed++;
    const extra = [];
    if (this.commit) {
      extra.push({ type: 'deckReveal', hash: this.commit.hash, salt: this.commit.salt, deck: this.commit.deckStr, order: h.order.slice() });
      this.commit = null;
    }
    // Reacciones de los bots
    const res = h.result;
    if (res) {
      for (const w of res.winners) {
        const p = t.seats[w];
        if (p && p.isBot && res.payouts[w] > h.bb * 25 && fastRng() < 0.35) extra.push({ type: 'emote', seat: w, emoji: ['😎', '🤑', '😏', '🍀', '🔥', '💪'][Math.floor(fastRng() * 6)] });
      }
      for (const s of h.order) {
        const p = t.seats[s];
        if (p && p.isBot && !res.winners.includes(s) && h.ps[s].total > h.bb * 30 && fastRng() < 0.3) extra.push({ type: 'emote', seat: s, emoji: ['😤', '🤦', '😭', '🙄', '😩'][Math.floor(fastRng() * 5)] });
      }
    }
    // Historial para cada humano
    const histories = [];
    for (const [id] of this.humans) {
      const seat = t.seatOf(id);
      if (seat >= 0 && h.ps[seat]) histories.push({ id, seat, history: t.handHistory(seat), stats: { ...h.ps[seat], cards: undefined } });
    }
    this.emit([...extra, { type: 'histories', histories }]);

    const showdown = res && res.showdown;
    const delay = (showdown ? 4200 : 2200) / Math.max(0.5, this.opts.speed);
    this._betweenTimer = this.later(() => this.betweenHands(), delay);
  }

  betweenHands() {
    const t = this.table;
    const h = t.hand;
    this._betweenTimer = null;
    if (h && h._between) { this.maybeStart(); return; }
    if (h) h._between = true;
    const events = [];
    if (this.mode === 'sng') {
      this.sngAfterHand(events);
    } else {
      // Salidas pendientes
      for (const { player, stack } of t.removeLeavers()) {
        if (!player.isBot) {
          this.humans.delete(player.id);
          events.push({ type: 'cashout', id: player.id, stack });
        }
      }
      this.cashAfterHand(events);
    }
    this.emit(events);
    if (this.mode !== 'sng' || !this.sng.finished) this.maybeStart();
  }

  eliminate(seat, events) {
    const t = this.table;
    const p = t.seats[seat];
    if (!p) return;
    const remaining = t.seats.filter(Boolean).length;
    this.sng.places.push({ id: p.id, name: p.name, avatar: p.avatar, place: remaining, isBot: p.isBot });
    t.seats[seat] = null;
    events.push({ type: 'eliminated', seat, id: p.id, name: p.name, place: remaining });
    if (!p.isBot) this.humans.delete(p.id);
  }

  checkSngWinner(events) {
    const t = this.table;
    const sng = this.sng;
    const alive = t.seats.filter(Boolean);
    if (alive.length !== 1 || sng.finished) return false;
    const w = alive[0];
    sng.places.push({ id: w.id, name: w.name, avatar: w.avatar, place: 1, isBot: w.isBot });
    sng.finished = true;
    sng.places.sort((a, b) => a.place - b.place);
    const pays = sngPayouts(sng.entrants);
    const pool = sng.buyIn * sng.entrants;
    const results = sng.places.map((pl) => ({ ...pl, prize: pl.place <= pays.length ? Math.floor(pool * pays[pl.place - 1]) : 0 }));
    events.push({ type: 'sngEnd', results, pool });
    this.clearTimers();
    return true;
  }

  cashAfterHand(events) {
    const t = this.table;
    for (let i = 0; i < t.seats.length; i++) {
      const p = t.seats[i];
      if (!p) continue;
      if (p.stack === 0) {
        if (p.isBot) {
          if (this.opts.botRebuy && fastRng() < 0.6) {
            p.stack = Math.round(t.config.bigBlind * (60 + fastRng() * 60));
            events.push({ type: 'rebuy', seat: i, amount: p.stack, bot: true });
          } else {
            t.seats[i] = null;
            events.push({ type: 'leave', seat: i, name: p.name });
          }
        } else if (!p.sittingOut) {
          p.sittingOut = true;
          events.push({ type: 'busted', id: p.id, seat: i });
        }
      }
    }
    // Mantener el número de bots deseado
    const bots = t.seats.filter((p) => p && p.isBot).length;
    if (bots < this.opts.targetBots && t.firstFreeSeat() >= 0 && fastRng() < 0.7) {
      const used = new Set(t.seats.filter(Boolean).map((p) => p.name));
      const ident = randomBotIdentity(used);
      const s = t.firstFreeSeat();
      const bb = t.config.bigBlind;
      t.seatPlayer(s, { id: 'bot-' + (++botSerial) + '-' + Date.now().toString(36), name: ident.name, avatar: ident.avatar, stack: Math.round(bb * (70 + fastRng() * 80)), isBot: true, bot: { style: pickStyle(this.opts.botLevel) } });
    }
  }

  sngAfterHand(events) {
    const t = this.table;
    const sng = this.sng;
    if (!sng.started) return;
    // Eliminaciones (los que se quedaron a cero en la misma mano: mejor puesto al que empezó con más fichas)
    const h = t.hand;
    const busted = [];
    for (let i = 0; i < t.seats.length; i++) {
      const p = t.seats[i];
      if (p && (p.stack === 0 || p.leaving)) busted.push({ i, p, start: h && h.ps[i] ? h.ps[i].startStack : 0 });
    }
    busted.sort((a, b) => a.start - b.start);
    for (const b of busted) this.eliminate(b.i, events);
    if (this.checkSngWinner(events)) return;
    sng.handsAtLevel++;
    if (sng.handsAtLevel >= sng.levelHands && sng.level < SNG_LEVELS.length - 1) {
      sng.level++;
      sng.handsAtLevel = 0;
      const [sb, bb, ante] = SNG_LEVELS[sng.level];
      t.setBlinds(sb, bb, ante);
      events.push({ type: 'levelUp', level: sng.level + 1, sb, bb, ante });
    }
  }
}

// Verificación del lado del cliente: el hash coincide y las cartas vistas están en las posiciones correctas del mazo.
export async function verifyDeck({ hash, salt, deck, order }, { myCards, mySeat, board }) {
  try {
    const calc = await sha256Hex(deck + ':' + salt);
    if (calc !== hash) return { ok: false, reason: 'El hash de la baraja no coincide' };
    const cards = [];
    for (let i = 0; i < deck.length; i += 2) cards.push(deck.slice(i, i + 2));
    if (cards.length !== 52 || new Set(cards).size !== 52) return { ok: false, reason: 'La baraja revelada no es válida' };
    const N = order.length;
    if (mySeat >= 0 && myCards && myCards.length === 2) {
      const idx = order.indexOf(mySeat);
      if (idx >= 0 && (cards[idx] !== cardToStr(myCards[0]) || cards[N + idx] !== cardToStr(myCards[1]))) return { ok: false, reason: 'Tus cartas no coinciden con la baraja comprometida' };
    }
    const pos = [2 * N + 1, 2 * N + 2, 2 * N + 3, 2 * N + 5, 2 * N + 7];
    for (let i = 0; i < (board || []).length; i++) {
      if (cards[pos[i]] !== cardToStr(board[i])) return { ok: false, reason: 'El tablero no coincide con la baraja comprometida' };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'No se pudo verificar' };
  }
}
