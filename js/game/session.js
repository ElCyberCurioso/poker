// Sesión de juego local (contra bots) y registro de estadísticas/logros de cada mano.
import { GameRunner, sngPayouts } from './runner.js';
import { store } from '../store.js';
import { parseCards } from '../core/cards.js';
import { handInfo } from '../core/evaluator.js';

export class BaseSession {
  constructor() {
    this.listeners = new Set();
    this.view = null;
    this.chatLog = [];
    this.closed = false;
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(ev) { for (const f of this.listeners) { try { f(ev); } catch (e) { console.error(e); } } }
  pushChat(msg) {
    this.chatLog.push(msg);
    if (this.chatLog.length > 120) this.chatLog.shift();
    this.emit({ type: 'chat', msg });
  }
}

// Registra una mano terminada del jugador local: estadísticas, historial, logros y misiones.
export function recordHand({ history, stats: hp, online = false }) {
  if (!history || !hp) return;
  const hero = history.players.find((p) => p.hero);
  if (!hero) return;
  const result = history.result || { payouts: {}, showdown: false };
  const won = Number(result.payouts && result.payouts[hero.seat]) || 0;
  const invested = Number(hp.total) || 0;
  const net = won - invested;
  const bb = history.bb || 1;
  let finalInfo = null;
  if (hero.cards && hero.cards.length === 2 && history.board.length === 5 && !hp.folded) {
    finalInfo = handInfo(parseCards(hero.cards.join('')), parseCards(history.board.join('')));
  }
  const showdownSeen = !!(result.showdown && !hp.folded);
  const steal = won > 0 && !result.showdown && history.board.length === 0 && hp.pfr;
  store.update((s) => {
    const st = s.stats;
    st.hands++;
    if (hp.vpip) st.vpip++;
    if (hp.pfr) st.pfr++;
    if (hp.threeBet) st.threeBet++;
    if (hp.sawFlop) st.sawFlop++;
    if (won > 0) st.won++;
    if (showdownSeen) { st.showdowns++; if (won > 0) st.showdownsWon++; }
    if (won > st.biggestPot) st.biggestPot = won;
    st.net += net;
    st.bbWon += net / bb;
    if (steal) st.steals++;
    if (online) st.onlineHands++;
    if (finalInfo && showdownSeen) {
      st.cats[finalInfo.cat] = (st.cats[finalInfo.cat] || 0) + 1;
      if (finalInfo.score > st.bestHandScore) { st.bestHandScore = finalInfo.score; st.bestHandName = finalInfo.name; }
    }
  }, true);
  store.pushHistory({ ...history, net, won, online, heroSeat: hero.seat, finalHand: finalInfo ? finalInfo.name : null, at: Date.now() });
  store.addXp(1 + (won > 0 ? 4 : 0));
  // Logros
  const s = store.get().stats;
  store.unlock('primera-mano');
  if (s.hands >= 100) store.unlock('cien-manos');
  if (s.hands >= 1000) store.unlock('mil-manos');
  if (won > 0) store.unlock('primer-bote');
  if (won > 0 && net > 0 && won >= bb * 100) store.unlock('bote-grande');
  if (won > 0 && hp.allIn && net > 0) store.unlock('doblar');
  if (steal) store.unlock('ladron');
  if (online) store.unlock('online');
  if (finalInfo && showdownSeen && won > 0) {
    if (finalInfo.cat === 6) store.unlock('full');
    if (finalInfo.cat === 7) store.unlock('poker');
    if (finalInfo.cat === 8) store.unlock(finalInfo.name === 'Escalera real' ? 'escalera-real' : 'escalera-color');
    if (finalInfo.name === 'Escalera real') store.unlock('escalera-color');
  }
  // Misiones
  store.progress('hand');
  if (online) store.progress('onlineHand');
  if (won > 0) store.progress('win');
  if (showdownSeen && won > 0) store.progress('showdownWin');
  if (showdownSeen && won > 0 && finalInfo && finalInfo.cat >= 2) store.progress('winTwoPairPlus');
  if (steal) store.progress('steal');
}

export function recordSngResult({ place, prize }) {
  store.update((s) => {
    s.stats.sngPlayed++;
    if (place === 1) s.stats.sngWon++;
    if (prize > 0) { s.stats.sngItm++; s.stats.sngPrizes += prize; }
  }, true);
  if (prize > 0) { store.addBalance(prize, 'premio torneo'); store.unlock('itm'); }
  if (place === 1) store.unlock('sng-ganado');
  store.addXp(place === 1 ? 60 : prize > 0 ? 30 : 10);
}

export class LocalSession extends BaseSession {
  constructor(opts) {
    super();
    this.kind = 'local';
    this.opts = opts;
    this.mode = opts.table.mode === 'sng' ? 'sng' : 'cash';
    const s = store.get();
    this.heroId = 'h-' + s.profile.id;
    this.runner = new GameRunner({
      config: {
        name: opts.table.name,
        smallBlind: opts.table.sb,
        bigBlind: opts.table.bb,
        ante: opts.table.ante || 0,
        maxSeats: opts.table.maxSeats,
        mode: this.mode,
        minBuyIn: opts.table.minBuyIn,
        maxBuyIn: opts.table.maxBuyIn,
      },
      turnTime: opts.turnTime ?? s.settings.turnTime,
      speed: opts.speed ?? s.settings.speed,
      botLevel: opts.botLevel ?? 1,
      targetBots: this.mode === 'cash' ? (opts.bots ?? 0) : 0,
      sng: opts.sng,
      verifiable: !!opts.verifiable,
    });
    this.lastStack = -1;
    this.pendingCashout = false;
    this.unsub = this.runner.on((evs) => this._onEvents(evs));
    this.heartbeat = setInterval(() => store.heartbeat(), 5000);
  }

  get tableName() { return this.opts.table.name; }

  start() {
    const s = store.get();
    const seat = this.runner.addHuman({ id: this.heroId, name: s.profile.name, avatar: s.profile.avatar, stack: this.opts.buyIn || 0 });
    this.heroSeat = seat;
    const bots = this.opts.bots ?? 0;
    for (let i = 0; i < bots; i++) this.runner.addBot({ level: this.opts.botLevel });
    if (this.mode === 'cash') store.setSession({ kind: this.kind, stack: this.opts.buyIn, label: this.tableName });
    if (this.mode === 'sng' && this.opts.autoStartSng !== false) this.runner.startSng();
    this.runner.start();
    this._refresh([]);
  }

  _refresh(events) {
    this.view = this.runner.view(this.heroId);
    if (this.view.turnDeadline) this.view.localDeadline = Date.now() + this.view.turnRemaining;
    this.emit({ type: 'update', view: this.view, events });
  }

  _onEvents(events) {
    for (const e of events) {
      if (e.type === 'histories') {
        for (const hh of e.histories) if (hh.id === this.heroId) recordHand({ history: hh.history, stats: hh.stats, online: this.kind !== 'local' });
      } else if (e.type === 'cashout' && e.id === this.heroId) {
        this._credit(e.stack);
        this._finish();
      } else if (e.type === 'busted' && e.id === this.heroId) {
        this.emit({ type: 'busted' });
      } else if (e.type === 'eliminated' && e.id === this.heroId) {
        this._heroEliminated(e.place);
      } else if (e.type === 'sngEnd') {
        const me = e.results.find((r) => r.id === this.heroId);
        if (me && !this.sngDone) this._heroEliminated(me.place, e.results);
      }
    }
    this._afterEvents(events);
    if (this.closed) return;
    this._refresh(events.filter((e) => e.type !== 'histories'));
    // Guardar el stack actual para recuperarlo si se cierra la pestaña.
    if (this.mode === 'cash' && !this.pendingCashout) {
      const p = this.view.seats[this.view.you];
      const st = p ? p.stack : 0;
      if (st !== this.lastStack) { this.lastStack = st; store.setSession({ kind: this.kind, stack: st, label: this.tableName }); }
    }
  }

  _afterEvents() { /* para subclases */ }

  _heroEliminated(place, results) {
    if (this.sngDone) return;
    this.sngDone = true;
    const sng = this.runner.sng;
    const entrants = sng.entrants;
    const pays = sngPayouts(entrants);
    const prize = place <= pays.length ? Math.floor(sng.buyIn * entrants * pays[place - 1]) : 0;
    recordSngResult({ place, prize, entrants });
    const pool = sng.buyIn * entrants;
    const list = (results || sng.places.slice()).map((r) => ({ ...r, prize: r.prize ?? (r.place <= pays.length ? Math.floor(pool * pays[r.place - 1]) : 0) }));
    this.emit({ type: 'sngEnd', place, prize, entrants, results: list });
    // En local el torneo termina para ti: se detiene la mesa, pero la sesión sigue abierta hasta que cierres el resultado.
    if (this.kind === 'local') this.runner.stop();
  }

  _credit(amount) {
    if (amount > 0) store.addBalance(amount, 'mesa');
  }

  _finish() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.heartbeat);
    store.setSession(null);
    this.runner.stop();
    if (this.unsub) this.unsub();
    this.emit({ type: 'closed' });
  }

  // ---------- API usada por la vista de mesa ----------
  isHost() { return this.kind === 'host'; }

  act(action) { return this.runner.act(this.heroId, action); }
  showCards() { this.runner.showCards(this.heroId); }
  sitOut(v) { this.runner.setSittingOut(this.heroId, v); }

  canRebuy() {
    if (this.mode !== 'cash' || !this.view) return false;
    const p = this.view.seats[this.view.you];
    return !!p && !(p.inHand && this.view.hand && this.view.hand.phase !== 'done') && p.stack < this.opts.table.maxBuyIn;
  }

  rebuy(amount) {
    const p = this.view && this.view.seats[this.view.you];
    if (!p) return false;
    const max = this.opts.table.maxBuyIn - p.stack;
    amount = Math.min(Math.floor(amount), max);
    if (amount <= 0) return false;
    if (!store.spend(amount, 'recompra')) return false;
    if (!this.runner.rebuy(this.heroId, amount)) { store.addBalance(amount, 'devolución'); return false; }
    return true;
  }

  leave() {
    if (this.closed || this.leaving) return;
    this.leaving = true;
    if (this.mode === 'sng') {
      if (this.runner.sng && this.runner.sng.finished) { this._finish(); return; }
      if (!this.sngDone) {
        // Abandonar el torneo cuenta como eliminación en el puesto actual.
        const remaining = this.runner.table.seats.filter(Boolean).length;
        this._heroEliminated(remaining);
      }
      this._finish();
      return;
    }
    const r = this.runner.removeHuman(this.heroId);
    if (r >= 0) { this._credit(r); this._finish(); }
    else this.pendingCashout = true; // all-in en la mano en curso: se acreditará al terminar
  }

  chat(text) {
    const s = store.get();
    this.pushChat({ name: s.profile.name, avatar: s.profile.avatar, text, seat: this.view ? this.view.you : -1, ts: Date.now(), me: true });
  }

  updateProfile(name, avatar) {
    if (!this.closed) this.runner.updatePlayer(this.heroId, { name, avatar });
  }

  emote(emoji) {
    this.emit({ type: 'update', view: this.view, events: [{ type: 'emote', seat: this.view.you, emoji }] });
  }
}
