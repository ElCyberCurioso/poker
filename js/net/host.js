// Anfitrión de una sala privada: ejecuta la mesa en este navegador y sincroniza a los invitados por P2P.
// Todos los mensajes entrantes se validan; el contenido de usuario se trata siempre como texto.
import { LocalSession } from '../game/session.js';
import { createHost } from './transport.js';
import { cleanName, cleanText, randomHex } from '../util.js';
import { sngPayouts } from '../game/runner.js';
import { store } from '../store.js';

export const EMOTES = ['👍', '😂', '😮', '😎', '🤔', '😤', '🙏', '🔥', '🍀', '👏', '😭', '🤡'];
const MAX_CLIENTS_EXTRA = 8; // espectadores además de los asientos
const GRACE_MS = 90000;
const PROTOCOL = 1;

const isInt = (x) => Number.isInteger(x);
const isStr = (x, max) => typeof x === 'string' && x.length <= max;

function validAvatar(a) {
  return typeof a === 'string' && a.length > 0 && a.length <= 8 && !/[<>&"'`\\]/.test(a);
}

export class HostSession extends LocalSession {
  constructor(opts) {
    super(opts);
    this.kind = 'host';
    this.room = {
      code: opts.room.code,
      name: cleanName(opts.room.name || opts.table.name, 30) || 'Sala privada',
      password: opts.room.password || '',
    };
    this.clients = new Set();
    this.byToken = new Map(); // token -> client
    this.banned = new Set();
    this.pending = [];
    this.flushTimer = null;
    this.transport = null;
    this.status = 'closed';
  }

  get tableName() { return this.room ? this.room.name : this.opts.table.name; }

  async open() {
    this.transport = createHost(this.room.code);
    await this.transport.start();
    this.status = 'open';
    this.transport.onConnection((conn) => this._onConn(conn));
    this.transport.onStatus((st) => this.emit({ type: 'netStatus', status: st }));
    this.watchdog = setInterval(() => this._checkClients(), 5000);
    store.unlock('anfitrion');
  }

  roomInfo() {
    const t = this.opts.table;
    return {
      code: this.room.code,
      name: this.room.name,
      hostName: store.get().profile.name,
      mode: this.mode,
      sb: t.sb, bb: t.bb, ante: t.ante || 0,
      minBuyIn: t.minBuyIn, maxBuyIn: t.maxBuyIn,
      maxSeats: t.maxSeats,
      turnTime: this.runner.opts.turnTime,
      hasPassword: !!this.room.password,
      sngBuyIn: this.mode === 'sng' ? this.opts.sng.buyIn : 0,
      startingStack: this.mode === 'sng' ? this.opts.sng.startingStack : 0,
      levelHands: this.mode === 'sng' ? this.opts.sng.levelHands : 0,
    };
  }

  // ---------- Conexiones ----------
  _onConn(conn) {
    const client = { conn, id: null, token: null, authed: false, spectator: false, name: '', avatar: '', lastSeen: Date.now(), chatTimes: [], strikes: 0, msgCount: 0, msgWindow: Date.now() };
    if (this.clients.size >= this.opts.table.maxSeats + MAX_CLIENTS_EXTRA) {
      conn.send({ t: 'reject', reason: 'La sala está llena' });
      setTimeout(() => conn.close(), 300);
      return;
    }
    this.clients.add(client);
    conn.onMessage((msg) => this._onMsg(client, msg));
    conn.onClose(() => this._onClose(client));
    client.authTimer = setTimeout(() => { if (!client.authed) conn.close(); }, 15000);
  }

  _send(client, msg) {
    if (client.conn && client.conn.open) client.conn.send(msg);
  }

  _broadcast(msg, except) {
    for (const c of this.clients) if (c.authed && c !== except) this._send(c, msg);
  }

  _system(text) {
    const msg = { system: true, text, ts: Date.now() };
    this.pushChat(msg);
    this._broadcast({ t: 'chat', ...msg });
  }

  _onMsg(client, msg) {
    if (!msg || typeof msg.t !== 'string') return;
    // Límite de mensajes por segundo
    const now = Date.now();
    if (now - client.msgWindow > 1000) { client.msgWindow = now; client.msgCount = 0; }
    if (++client.msgCount > 25) { client.strikes++; if (client.strikes > 5) client.conn.close(); return; }
    client.lastSeen = now;
    if (!client.authed && msg.t !== 'hello' && msg.t !== 'ping') return;
    switch (msg.t) {
      case 'hello': return this._hello(client, msg);
      case 'ping': return this._send(client, { t: 'pong', ts: isInt(msg.ts) ? msg.ts : 0 });
      case 'act': return this._act(client, msg);
      case 'chat': return this._chat(client, msg);
      case 'emote': return this._emote(client, msg);
      case 'sitout': if (client.id) this.runner.setSittingOut(client.id, !!msg.value); return;
      case 'rebuy': return this._rebuy(client, msg);
      case 'sit': return this._sit(client, msg);
      case 'show': if (client.id) this.runner.showCards(client.id); return;
      case 'leave': return this._leave(client);
      default: return;
    }
  }

  _hello(client, msg) {
    if (client.authed) return;
    if (msg.v !== PROTOCOL) { this._send(client, { t: 'reject', reason: 'Versión incompatible: recarga la página' }); return this._drop(client); }
    const token = isStr(msg.token, 64) && /^[a-f0-9]{16,64}$/.test(msg.token) ? msg.token : null;
    const name = cleanName(msg.name) || 'Invitado';
    const avatar = validAvatar(msg.avatar) ? msg.avatar : '🙂';
    if (!token) { this._send(client, { t: 'reject', reason: 'Identificador no válido' }); return this._drop(client); }
    if (this.banned.has(token)) { this._send(client, { t: 'reject', reason: 'El anfitrión te ha expulsado de esta sala' }); return this._drop(client); }
    if (this.room.password && (!isStr(msg.password, 64) || msg.password !== this.room.password)) {
      this._send(client, { t: 'reject', reason: 'Contraseña incorrecta', code: 'password' });
      return this._drop(client, 1200);
    }
    clearTimeout(client.authTimer);
    client.token = token;
    client.name = name;
    client.avatar = avatar;
    client.authed = true;

    // Reconexión: misma credencial que un jugador ya sentado
    const prev = this.byToken.get(token);
    if (prev && prev !== client) {
      client.id = prev.id;
      client.spectator = prev.spectator;
      clearTimeout(prev.graceTimer);
      prev.replaced = true;
      this.clients.delete(prev);
      try { prev.conn.close(); } catch (e) { /* */ }
      this.byToken.set(token, client);
      if (client.id && this.runner.seatOf(client.id) >= 0) {
        this.runner.setConnected(client.id, true);
        this._send(client, { t: 'welcome', id: client.id, charge: 0, reconnected: true, spectator: false, room: this.roomInfo() });
        this._system(`${name} ha vuelto a conectarse`);
        this._sendState(client, []);
        return;
      }
      client.id = null;
    }
    this.byToken.set(token, client);
    const wantsSeat = !msg.spectate;
    if (wantsSeat) {
      const res = this._seat(client, msg.buyIn);
      if (res.ok) return;
      client.spectator = true;
      this._send(client, { t: 'welcome', id: null, charge: 0, spectator: true, note: res.reason, room: this.roomInfo() });
    } else {
      client.spectator = true;
      this._send(client, { t: 'welcome', id: null, charge: 0, spectator: true, room: this.roomInfo() });
    }
    this._system(`${name} está mirando la mesa`);
    this._sendState(client, []);
  }

  // Si la mesa está llena de bots, uno cede su asiento a un invitado humano.
  _freeSeatFromBot() {
    const t = this.runner.table;
    if (t.firstFreeSeat() >= 0) return true;
    for (let i = 0; i < t.seats.length; i++) {
      const p = t.seats[i];
      if (p && p.isBot && !t.inHand(i)) {
        this.runner.removeBot(i);
        this.runner.opts.targetBots = Math.max(0, this.runner.opts.targetBots - 1);
        return true;
      }
    }
    return false;
  }

  _seat(client, buyInRaw) {
    const t = this.opts.table;
    if (this.mode === 'sng' && this.runner.sng.started) return { ok: false, reason: 'El torneo ya ha empezado' };
    if (!this._freeSeatFromBot()) return { ok: false, reason: 'Mesa llena: podrás sentarte cuando termine la mano o quede un asiento libre' };
    let charge;
    if (this.mode === 'sng') {
      charge = this.opts.sng.buyIn;
    } else {
      const b = isInt(buyInRaw) ? buyInRaw : t.minBuyIn;
      charge = Math.max(t.minBuyIn, Math.min(t.maxBuyIn, b));
    }
    const id = 'u-' + randomHex(4);
    const seat = this.runner.addHuman({ id, name: client.name, avatar: client.avatar, stack: charge });
    if (seat < 0) return { ok: false, reason: 'No quedan asientos libres' };
    client.id = id;
    client.spectator = false;
    client.charge = charge;
    this._send(client, { t: 'welcome', id, charge, spectator: false, room: this.roomInfo() });
    this._system(`${client.name} se ha sentado`);
    this._sendState(client, []);
    return { ok: true };
  }

  _sit(client, msg) {
    if (client.id) return;
    const res = this._seat(client, msg.buyIn);
    if (!res.ok) this._send(client, { t: 'error', text: res.reason });
  }

  _act(client, msg) {
    if (!client.id) return;
    const a = msg.action;
    if (!a || !['fold', 'check', 'call', 'bet', 'raise', 'allin'].includes(a.type)) return;
    const amount = isInt(a.amount) && a.amount >= 0 && a.amount < 1e12 ? a.amount : 0;
    const res = this.runner.act(client.id, { type: a.type, amount });
    if (!res.ok) this._send(client, { t: 'error', text: res.error });
  }

  _chat(client, msg) {
    const text = cleanText(msg.text, 200);
    if (!text) return;
    const now = Date.now();
    client.chatTimes = client.chatTimes.filter((t) => now - t < 10000);
    if (client.chatTimes.length >= 6) { this._send(client, { t: 'error', text: 'Vas demasiado rápido en el chat' }); return; }
    client.chatTimes.push(now);
    const seat = client.id ? this.runner.seatOf(client.id) : -1;
    const m = { name: client.name, avatar: client.avatar, text, seat, ts: now, spectator: !client.id };
    this.pushChat(m);
    this._broadcast({ t: 'chat', ...m });
  }

  _emote(client, msg) {
    if (!EMOTES.includes(msg.emoji) || !client.id) return;
    const now = Date.now();
    if (client.lastEmote && now - client.lastEmote < 1500) return;
    client.lastEmote = now;
    const seat = this.runner.seatOf(client.id);
    if (seat < 0) return;
    this._queue([{ type: 'emote', seat, emoji: msg.emoji }]);
  }

  _rebuy(client, msg) {
    if (!client.id || this.mode !== 'cash') return;
    const t = this.opts.table;
    const seat = this.runner.seatOf(client.id);
    if (seat < 0) return;
    const p = this.runner.table.seats[seat];
    const amount = isInt(msg.amount) ? msg.amount : 0;
    const max = t.maxBuyIn - p.stack;
    if (amount <= 0 || amount > max) { this._send(client, { t: 'error', text: 'Cantidad de recompra no válida' }); return; }
    if (this.runner.rebuy(client.id, amount)) this._send(client, { t: 'rebuyOk', amount });
    else this._send(client, { t: 'error', text: 'Sólo puedes recargar entre manos' });
  }

  _leave(client) {
    if (!client.id) { this._drop(client, 100); return; }
    const id = client.id;
    if (this.mode === 'sng') {
      const started = this.runner.sng.started;
      this.runner.removeHuman(id);
      if (!started) this._send(client, { t: 'cashout', amount: client.charge || 0, reason: 'refund' });
      client.id = null;
      this.byToken.delete(client.token);
      this._system(`${client.name} ha dejado la mesa`);
      this._drop(client, 400);
      return;
    }
    const r = this.runner.removeHuman(id);
    if (r >= 0) {
      this._send(client, { t: 'cashout', amount: r });
      client.id = null;
      this.byToken.delete(client.token);
      this._system(`${client.name} se ha levantado`);
      this._drop(client, 400);
    } else {
      client.leavingPending = true; // all-in: se pagará al terminar la mano
    }
  }

  _drop(client, delay = 300) {
    setTimeout(() => { try { client.conn.close(); } catch (e) { /* */ } }, delay);
  }

  _onClose(client) {
    if (client.replaced) return;
    this.clients.delete(client);
    clearTimeout(client.authTimer);
    if (!client.authed) return;
    if (client.id && this.runner.seatOf(client.id) >= 0) {
      this.runner.setConnected(client.id, false);
      this.runner.table.forceFold(this.runner.seatOf(client.id));
      this.runner.afterChange();
      this._system(`${client.name} se ha desconectado`);
      // Período de gracia para reconectar; después se libera el asiento.
      client.graceTimer = setTimeout(() => {
        if (this.byToken.get(client.token) === client) {
          this.byToken.delete(client.token);
          if (client.id) this.runner.removeHuman(client.id);
        }
      }, GRACE_MS);
      this.clients.add(client); // se mantiene como "fantasma" hasta que expire la gracia
      client.ghost = true;
    } else {
      this.byToken.delete(client.token);
    }
  }

  _checkClients() {
    const now = Date.now();
    for (const c of this.clients) {
      if (c.ghost) continue;
      if (c.authed && now - c.lastSeen > 30000) { try { c.conn.close(); } catch (e) { /* */ } }
    }
  }

  // ---------- Difusión de estado ----------
  _afterEvents(events) {
    // Mensajes individuales derivados de los eventos
    for (const e of events) {
      if (e.type === 'histories') {
        for (const hh of e.histories) {
          const c = this._clientById(hh.id);
          if (c) this._send(c, { t: 'history', history: hh.history, stats: hh.stats });
        }
      } else if (e.type === 'cashout' && e.id !== this.heroId) {
        const c = this._clientById(e.id);
        if (c) {
          this._send(c, { t: 'cashout', amount: e.stack });
          c.id = null;
          this.byToken.delete(c.token);
          if (c.leavingPending) this._drop(c, 400);
        }
      } else if (e.type === 'busted' && e.id !== this.heroId) {
        const c = this._clientById(e.id);
        if (c) this._send(c, { t: 'busted' });
      } else if (e.type === 'eliminated' && e.id !== this.heroId) {
        const c = this._clientById(e.id);
        if (c) {
          const sng = this.runner.sng;
          const pays = sngPayouts(sng.entrants);
          const prize = e.place <= pays.length ? Math.floor(sng.buyIn * sng.entrants * pays[e.place - 1]) : 0;
          this._send(c, { t: 'sngResult', place: e.place, prize, entrants: sng.entrants });
          c.id = null;
          c.spectator = true;
        }
      } else if (e.type === 'sngEnd') {
        const w = e.results.find((r) => r.place === 1);
        const c = w && this._clientById(w.id);
        if (c) { this._send(c, { t: 'sngResult', place: 1, prize: w.prize, entrants: e.results.length, results: e.results }); c.id = null; c.spectator = true; }
        this._broadcast({ t: 'sngFinal', results: e.results, pool: e.pool });
      }
    }
    this._queue(events.filter((e) => !['histories', 'cashout', 'busted'].includes(e.type)));
  }

  _clientById(id) {
    for (const c of this.clients) if (c.id === id) return c;
    return null;
  }

  _queue(events) {
    this.pending.push(...events);
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      const evs = this.pending;
      this.pending = [];
      for (const c of this.clients) if (c.authed && !c.ghost) this._sendState(c, evs);
      // El propio anfitrión también ve los emotes de los invitados
      const emotes = evs.filter((e) => e.type === 'emote');
      if (emotes.length && this.view) this.emit({ type: 'update', view: this.view, events: emotes });
    }, 0);
  }

  _sendState(client, events) {
    const view = this.runner.view(client.id);
    this._send(client, { t: 'state', view, events });
  }

  // ---------- Controles del anfitrión ----------
  chat(text) {
    const s = store.get();
    const t = cleanText(text, 200);
    if (!t) return;
    const m = { name: s.profile.name, avatar: s.profile.avatar, text: t, seat: this.view ? this.view.you : -1, ts: Date.now(), host: true };
    this.pushChat({ ...m, me: true });
    this._broadcast({ t: 'chat', ...m });
  }

  emote(emoji) {
    if (!EMOTES.includes(emoji) || !this.view) return;
    this._queue([{ type: 'emote', seat: this.view.you, emoji }]);
  }

  addBot(level) {
    const seat = this.runner.addBot({ level });
    if (seat >= 0 && this.mode === 'cash') this.runner.opts.targetBots++;
    return seat;
  }
  removeBot(seat) {
    const ok = this.runner.removeBot(seat);
    if (ok && this.mode === 'cash') this.runner.opts.targetBots = Math.max(0, this.runner.opts.targetBots - 1);
    return ok;
  }

  kick(seat) {
    const p = this.runner.table.seats[seat];
    if (!p || p.isBot || p.id === this.heroId) return;
    for (const c of this.clients) {
      if (c.id === p.id) {
        this.banned.add(c.token);
        this._send(c, { t: 'kicked' });
        this._leave(c);
        this._system(`${c.name} ha sido expulsado`);
      }
    }
  }

  startSng() {
    const ok = this.runner.startSng();
    if (ok) this._system('¡Empieza el torneo! Suerte a todos');
    return ok;
  }

  setPaused(v) {
    this.runner.setPaused(v);
    this._system(v ? 'El anfitrión ha pausado la partida' : 'La partida continúa');
  }

  setBlinds(sb, bb) {
    if (this.mode !== 'cash') return;
    this.runner.table.setBlinds(sb, bb, 0);
    this.opts.table.sb = sb; this.opts.table.bb = bb;
    this._system(`Nuevas ciegas a partir de la próxima mano: ${sb}/${bb}`);
  }

  playerList() {
    const out = [];
    for (const c of this.clients) if (c.authed) out.push({ name: c.name, avatar: c.avatar, seated: !!c.id, connected: !c.ghost, seat: c.id ? this.runner.seatOf(c.id) : -1 });
    return out;
  }

  // Cerrar la sala: cada invitado recibe sus fichas actuales (o su inscripción si el torneo no había terminado).
  close(reason = 'El anfitrión ha cerrado la sala') {
    if (this.status === 'closed') return;
    this.status = 'closed';
    for (const c of this.clients) {
      if (!c.authed) continue;
      let amount = 0;
      if (c.id) {
        if (this.mode === 'cash') {
          const seat = this.runner.seatOf(c.id);
          amount = seat >= 0 ? this.runner.table.seats[seat].stack : 0;
        } else if (this.runner.sng && !this.runner.sng.finished) amount = c.charge || 0;
      }
      this._send(c, { t: 'closed', reason, amount });
      this._drop(c, 500);
    }
    clearInterval(this.watchdog);
    setTimeout(() => { if (this.transport) this.transport.close(); }, 700);
  }

  leave() {
    // Si el torneo no ha terminado, el anfitrión recupera su inscripción igual que el resto.
    if (this.mode === 'sng' && this.runner.sng && !this.runner.sng.finished && !this.sngDone) {
      this.sngDone = true;
      store.addBalance(this.opts.sng.buyIn, 'torneo cancelado');
      this.close();
      this._finish();
      return;
    }
    this.close();
    super.leave();
  }

  _finish() {
    if (this.status !== 'closed') this.close();
    super._finish();
  }
}
