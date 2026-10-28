// Invitado de una sala privada: envía acciones al anfitrión y recibe su vista de la mesa.
import { BaseSession, recordHand, recordSngResult } from '../game/session.js';
import { connectTo, NetError } from './transport.js';
import { store } from '../store.js';
import { randomHex, cleanText } from '../util.js';
import { verifyDeck } from '../game/runner.js';
import { EMOTES } from './host.js';
import { isInviteKey, inviteLink } from './invite.js';

const PROTOCOL = 1;
const TOKENS_KEY = 'poker.tokens';

function getToken(code, rotate = false) {
  let map = {};
  try { map = JSON.parse(sessionStorage.getItem(TOKENS_KEY) || '{}'); } catch (e) { map = {}; }
  if (rotate || !map[code]) map[code] = randomHex(16);
  try { sessionStorage.setItem(TOKENS_KEY, JSON.stringify(map)); } catch (e) { /* */ }
  return map[code];
}

export function forgetToken(code) {
  try {
    const map = JSON.parse(sessionStorage.getItem(TOKENS_KEY) || '{}');
    delete map[code];
    sessionStorage.setItem(TOKENS_KEY, JSON.stringify(map));
  } catch (e) { /* */ }
}

export class ClientSession extends BaseSession {
  // invite: clave del enlace de invitación (entra sin contraseña). autoSit: sentarse al llegar con la entrada por defecto.
  constructor({ code, buyIn, password, spectate, invite, autoSit }) {
    super();
    this.kind = 'client';
    this.code = code;
    this.buyIn = autoSit ? 'auto' : buyIn;
    this.password = password || '';
    this.invite = isInviteKey(invite) ? invite : '';
    this.spectate = !!spectate && !autoSit;
    this.inviteKey = null; // clave vigente que el anfitrión nos deja compartir
    this.token = getToken(code);
    this.conn = null;
    this.myId = null;
    this.room = null;
    this.lastStack = 0;
    this.charged = 0;
    this.credited = false;
    this.mode = 'cash';
    this.reconnecting = false;
    this.deckStatus = null;
  }

  get tableName() { return this.room ? this.room.name : 'Sala ' + this.code; }

  // Conecta y espera la bienvenida del anfitrión.
  async connect() {
    const conn = await connectTo(this.code, 15000);
    this._bind(conn);
    const welcome = await new Promise((resolve, reject) => {
      this._welcomeWaiter = { resolve, reject };
      this._hello();
      setTimeout(() => reject(new NetError('timeout', 'El anfitrión no responde')), 12000);
    });
    return welcome;
  }

  _hello() {
    const s = store.get();
    this.conn.send({
      t: 'hello', v: PROTOCOL, name: s.profile.name, avatar: s.profile.avatar, token: this.token,
      password: this.password, invite: this.invite, buyIn: this.buyIn, budget: s.balance, spectate: this.spectate,
    });
  }

  _bind(conn) {
    this.conn = conn;
    conn.onMessage((m) => this._onMsg(m));
    conn.onClose(() => this._onConnClose());
    clearInterval(this.pinger);
    this.pinger = setInterval(() => { if (this.conn && this.conn.open) this.conn.send({ t: 'ping', ts: Date.now() }); }, 8000);
    this.lastMsg = Date.now();
    clearInterval(this.watch);
    this.watch = setInterval(() => {
      if (Date.now() - this.lastMsg > 35000 && this.conn && this.conn.open) this.conn.close();
    }, 5000);
  }

  _onMsg(m) {
    if (!m || typeof m.t !== 'string') return;
    this.lastMsg = Date.now();
    switch (m.t) {
      case 'welcome': return this._welcome(m);
      case 'reject':
        if (this._welcomeWaiter) { this._welcomeWaiter.reject(new NetError(m.code || 'rejected', String(m.reason || 'Rechazado'))); this._welcomeWaiter = null; }
        this.rejected = true;
        return;
      case 'state': return this._state(m);
      case 'chat':
        this.pushChat({
          name: typeof m.name === 'string' ? m.name.slice(0, 20) : '', avatar: typeof m.avatar === 'string' ? m.avatar.slice(0, 8) : '',
          text: cleanText(m.text, 200), seat: Number.isInteger(m.seat) ? m.seat : -1, ts: Date.now(), system: !!m.system, host: !!m.host,
          me: this.view && Number.isInteger(m.seat) && m.seat >= 0 && m.seat === this.view.you && !m.system,
        });
        return;
      case 'history':
        if (m.history && m.stats) { try { recordHand({ history: m.history, stats: m.stats, online: true }); } catch (e) { console.warn(e); } }
        return;
      case 'cashout': {
        const amt = Math.max(0, Math.floor(Number(m.amount) || 0));
        this._creditOnce(amt);
        this.myId = null;
        if (this.leaving) this._close('Te has levantado de la mesa');
        else this.emit({ type: 'notice', text: m.reason === 'refund' ? 'Inscripción devuelta' : 'Has dejado tu asiento' });
        return;
      }
      case 'busted': return this.emit({ type: 'busted' });
      case 'rebuyOk': {
        const amt = Math.max(0, Math.floor(Number(m.amount) || 0));
        store.spend(amt, 'recompra');
        this.charged += amt;
        return;
      }
      case 'sngResult': {
        const place = Math.max(1, Math.floor(Number(m.place) || 1));
        const prize = Math.max(0, Math.floor(Number(m.prize) || 0));
        this.credited = true;
        recordSngResult({ place, prize, entrants: m.entrants });
        store.setSession(null);
        this.myId = null;
        this.emit({ type: 'sngEnd', place, prize, entrants: m.entrants, results: Array.isArray(m.results) ? m.results : null });
        return;
      }
      case 'sngFinal': return this.emit({ type: 'sngFinal', results: Array.isArray(m.results) ? m.results : [] });
      case 'kicked': this.kicked = true; return this.emit({ type: 'notice', text: 'El anfitrión te ha expulsado de la sala' });
      case 'closed': {
        const amt = Math.max(0, Math.floor(Number(m.amount) || 0));
        this._creditOnce(amt);
        this._close(String(m.reason || 'La sala se ha cerrado'));
        return;
      }
      case 'error': return this.emit({ type: 'notice', text: String(m.text || 'Error').slice(0, 120), error: true });
      case 'pong': this.latency = Date.now() - (Number(m.ts) || Date.now()); return;
      case 'invite':
        this.inviteKey = isInviteKey(m.key) ? m.key : null;
        return this.emit({ type: 'invite' });
      default: return;
    }
  }

  _welcome(m) {
    this.room = m.room || this.room;
    this.mode = this.room && this.room.mode === 'sng' ? 'sng' : 'cash';
    this.inviteKey = isInviteKey(m.invite) ? m.invite : null;
    let seatedWith = 0;
    this.myId = typeof m.id === 'string' ? m.id : null;
    const charge = Math.max(0, Math.floor(Number(m.charge) || 0));
    if (charge > 0 && !m.reconnected) {
      if (!store.spend(charge, 'entrada en sala')) {
        // Sin saldo suficiente: nos levantamos sin coste.
        this.conn.send({ t: 'leave' });
        this.emit({ type: 'notice', text: 'No tienes saldo suficiente para sentarte', error: true });
      } else {
        this.charged += charge;
        this.credited = false;
        seatedWith = charge;
        this.lastStack = this.mode === 'cash' ? charge : 0;
        store.setSession({ kind: 'client', stack: this.mode === 'cash' ? charge : 0, label: this.tableName, code: this.code });
      }
    }
    if (this._welcomeWaiter) { this._welcomeWaiter.resolve(m); this._welcomeWaiter = null; }
    if (m.reconnected) this.emit({ type: 'notice', text: 'Conexión recuperada' });
    this.reconnecting = false;
    this.emit({ type: 'welcome', spectator: !!m.spectator, note: m.note, seatedWith, auto: !!m.auto, reconnected: !!m.reconnected });
  }

  _state(m) {
    const v = m.view;
    if (!v || !Array.isArray(v.seats)) return;
    if (v.turnRemaining) v.localDeadline = Date.now() + Number(v.turnRemaining);
    // "you" lo fija el anfitrión según nuestro id
    this.view = v;
    const events = Array.isArray(m.events) ? m.events : [];
    if (this.myId && this.mode === 'cash' && v.you >= 0 && v.seats[v.you]) {
      const st = Number(v.seats[v.you].stack) || 0;
      if (st !== this.lastStack) {
        this.lastStack = st;
        store.setSession({ kind: 'client', stack: st, label: this.tableName, code: this.code });
      }
    }
    for (const e of events) {
      if (e.type === 'handStart') { this.handCards = null; this.deckStatus = null; }
      if (e.type === 'commit') this.commitHash = e.hash;
      if (e.type === 'deckReveal' && this.lastHandView) this._verify(e, this.lastHandView);
    }
    if (v.hand && v.you >= 0 && v.seats[v.you] && v.seats[v.you].cards && v.seats[v.you].cards[0] >= 0) {
      this.lastHandView = { myCards: v.seats[v.you].cards.slice(), mySeat: v.you, board: v.hand.board.slice() };
    } else if (v.hand && this.lastHandView) {
      this.lastHandView.board = v.hand.board.slice();
    }
    this.emit({ type: 'update', view: v, events });
  }

  async _verify(reveal, hv) {
    if (typeof reveal.deck !== 'string' || typeof reveal.hash !== 'string' || typeof reveal.salt !== 'string' || !Array.isArray(reveal.order)) return;
    if (this.commitHash && reveal.hash !== this.commitHash) {
      this.deckStatus = { ok: false, reason: 'El hash revelado no es el que se comprometió al empezar la mano' };
    } else {
      this.deckStatus = await verifyDeck(reveal, hv);
    }
    this.emit({ type: 'deck', status: this.deckStatus });
  }

  _creditOnce(amount) {
    if (this.credited) return;
    this.credited = true;
    if (amount > 0) store.addBalance(amount, 'sala online');
    store.setSession(null);
  }

  async _onConnClose() {
    clearInterval(this.pinger);
    clearInterval(this.watch);
    if (this.closed || this.leaving || this.rejected) { if (!this.closed && this.leaving) this._close('Te has levantado de la mesa'); return; }
    if (this.kicked) { this._close('Te han expulsado de la sala'); return; }
    // Intentar reconectar durante ~30 s con la misma credencial
    this.reconnecting = true;
    this.emit({ type: 'reconnecting' });
    const delays = [1000, 2000, 3000, 5000, 8000, 10000];
    for (const d of delays) {
      await new Promise((r) => setTimeout(r, d));
      if (this.closed) return;
      try {
        const conn = await connectTo(this.code, 8000);
        this._bind(conn);
        this._hello();
        return;
      } catch (e) { /* reintentar */ }
    }
    // Sin éxito: recuperar las últimas fichas conocidas y olvidar la credencial (el asiento se liberará).
    if (this.mode === 'cash' && this.myId) this._creditOnce(this.lastStack);
    forgetToken(this.code);
    this._close('Se perdió la conexión con el anfitrión');
  }

  _close(reason) {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.pinger);
    clearInterval(this.watch);
    if (!this.credited && this.mode === 'cash' && this.myId) this._creditOnce(this.lastStack);
    store.setSession(null);
    try { this.conn && this.conn.close(); } catch (e) { /* */ }
    this.emit({ type: 'closed', reason });
  }

  // ---------- API de la vista ----------
  isHost() { return false; }
  act(action) {
    if (!this.conn || !this.conn.open) return { ok: false, error: 'Sin conexión' };
    this.conn.send({ t: 'act', action: { type: action.type, amount: Math.floor(action.amount || 0) } });
    return { ok: true };
  }
  showCards() { this.conn && this.conn.send({ t: 'show' }); }
  sitOut(v) { this.conn && this.conn.send({ t: 'sitout', value: !!v }); }
  chat(text) { const t = cleanText(text, 200); if (t && this.conn) this.conn.send({ t: 'chat', text: t }); }
  emote(emoji) { if (EMOTES.includes(emoji) && this.conn) this.conn.send({ t: 'emote', emoji }); }
  sit(buyIn) { this.buyIn = buyIn; this.conn && this.conn.send({ t: 'sit', buyIn, budget: store.get().balance }); }
  updateProfile(name, avatar) { if (this.conn && this.conn.open) this.conn.send({ t: 'profile', name, avatar }); }
  inviteUrl() { return this.inviteKey ? inviteLink(this.code, this.inviteKey) : null; }

  canRebuy() {
    if (this.mode !== 'cash' || !this.view || !this.myId || !this.room) return false;
    const p = this.view.seats[this.view.you];
    return !!p && !(p.inHand && this.view.hand && this.view.hand.phase !== 'done') && p.stack < this.room.maxBuyIn;
  }

  rebuy(amount) {
    const p = this.view && this.view.seats[this.view.you];
    if (!p || !this.room) return false;
    amount = Math.min(Math.floor(amount), this.room.maxBuyIn - p.stack);
    if (amount <= 0 || store.get().balance < amount) return false;
    this.conn.send({ t: 'rebuy', amount });
    return true;
  }

  leave() {
    if (this.closed) return;
    this.leaving = true;
    if (this.conn && this.conn.open && this.myId) {
      this.conn.send({ t: 'leave' });
      // Si estamos all-in, el anfitrión paga al acabar la mano; si no responde, nos vamos con el último stack conocido.
      const v = this.view;
      const me = v && v.you >= 0 ? v.seats[v.you] : null;
      const waiting = me && me.allIn && v.hand && v.hand.phase !== 'done';
      setTimeout(() => this._close('Te has levantado de la mesa'), waiting ? 30000 : 5000);
    } else {
      this._close('Has salido de la sala');
    }
  }
}
