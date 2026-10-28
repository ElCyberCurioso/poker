// Transportes P2P. PeerJS (WebRTC, señalización por el servidor público de PeerJS) para jugar entre dispositivos,
// y BroadcastChannel para probar varias pestañas del mismo navegador sin red (?net=local).
const PREFIX = 'poker-app-v1-';
const MAX_MSG = 64 * 1024;

export function transportKind() {
  try {
    const q = new URLSearchParams(location.search);
    if (q.get('net') === 'local') return 'local';
  } catch (e) { /* sin location */ }
  return 'peer';
}

let peerLoading = null;
export function loadPeerJS() {
  if (window.Peer) return Promise.resolve();
  if (peerLoading) return peerLoading;
  peerLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/peerjs.min.js';
    s.async = true;
    s.onload = () => (window.Peer ? resolve() : reject(new Error('PeerJS no se cargó')));
    s.onerror = () => { peerLoading = null; reject(new Error('No se pudo cargar el módulo de red')); };
    document.head.appendChild(s);
  });
  return peerLoading;
}

export class NetError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function friendlyPeerError(err) {
  const t = err && err.type;
  switch (t) {
    case 'unavailable-id': return new NetError('taken', 'Ese código de sala ya está en uso');
    case 'peer-unavailable': return new NetError('notfound', 'No existe ninguna sala con ese código, o el anfitrión ha cerrado la pestaña');
    case 'network': return new NetError('network', 'No hay conexión con el servidor de emparejamiento. Revisa tu conexión a internet');
    case 'server-error': case 'socket-error': case 'socket-closed': return new NetError('server', 'El servidor de emparejamiento no responde. Prueba de nuevo en unos segundos');
    case 'browser-incompatible': return new NetError('browser', 'Tu navegador no es compatible con WebRTC');
    case 'ssl-unavailable': return new NetError('ssl', 'Hace falta HTTPS para jugar online');
    default: return new NetError('unknown', (err && err.message) || 'Error de red');
  }
}

// Envoltorio común de una conexión: send(obj), onMessage(cb), onClose(cb), close().
function wrapPeerConn(conn) {
  const msgCbs = new Set(), closeCbs = new Set();
  let closed = false;
  const fireClose = () => { if (closed) return; closed = true; for (const f of closeCbs) f(); };
  conn.on('data', (data) => {
    let obj = data;
    if (typeof data === 'string') {
      if (data.length > MAX_MSG) return;
      try { obj = JSON.parse(data); } catch (e) { return; }
    }
    if (!obj || typeof obj !== 'object') return;
    for (const f of msgCbs) f(obj);
  });
  conn.on('close', fireClose);
  conn.on('error', fireClose);
  // Detección de cierre del canal ICE (desconexiones bruscas)
  try {
    const pc = conn.peerConnection;
    if (pc) pc.addEventListener('iceconnectionstatechange', () => {
      if (['failed', 'closed'].includes(pc.iceConnectionState)) fireClose();
    });
  } catch (e) { /* ignorar */ }
  return {
    id: conn.connectionId || conn.peer,
    send(obj) {
      if (closed || !conn.open) return false;
      try { conn.send(JSON.stringify(obj)); return true; } catch (e) { return false; }
    },
    onMessage(cb) { msgCbs.add(cb); },
    onClose(cb) { closeCbs.add(cb); },
    close() { try { conn.close(); } catch (e) { /* ignorar */ } fireClose(); },
    get open() { return !closed; },
  };
}

// Servidor de señalización: el público de PeerJS por defecto. Para desarrollo o redes propias se puede apuntar
// a un servidor PeerJS propio guardando en localStorage 'poker.peerServer' = {"host","port","path","secure"}.
// Deliberadamente no se acepta por URL: un enlace no debe poder desviar la señalización a un servidor ajeno.
function customServer() {
  try {
    const raw = localStorage.getItem('poker.peerServer');
    if (!raw) return {};
    const c = JSON.parse(raw);
    const out = {};
    if (typeof c.host === 'string' && /^[a-z0-9.-]{1,253}$/i.test(c.host)) out.host = c.host;
    if (Number.isInteger(c.port) && c.port > 0 && c.port < 65536) out.port = c.port;
    if (typeof c.path === 'string' && /^\/[\w/-]{0,60}$/.test(c.path)) out.path = c.path;
    if (typeof c.secure === 'boolean') out.secure = c.secure;
    return out;
  } catch (e) { return {}; }
}

const PEER_OPTS = { debug: 0, config: { iceServers: [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
] } };

class PeerHost {
  constructor(code) { this.code = code; this.peer = null; this.connCbs = new Set(); this.statusCbs = new Set(); }
  async start() {
    await loadPeerJS();
    return new Promise((resolve, reject) => {
      const peer = new window.Peer(PREFIX + this.code.toLowerCase(), { ...PEER_OPTS, ...customServer() });
      this.peer = peer;
      let opened = false;
      const timer = setTimeout(() => { if (!opened) { reject(new NetError('server', 'El servidor de emparejamiento no responde')); peer.destroy(); } }, 15000);
      peer.on('open', () => { opened = true; clearTimeout(timer); resolve(); });
      peer.on('connection', (conn) => {
        conn.on('open', () => { const w = wrapPeerConn(conn); for (const f of this.connCbs) f(w); });
      });
      peer.on('error', (err) => {
        if (!opened) { clearTimeout(timer); reject(friendlyPeerError(err)); peer.destroy(); return; }
        if (err.type !== 'peer-unavailable') for (const f of this.statusCbs) f({ type: 'error', error: friendlyPeerError(err) });
      });
      peer.on('disconnected', () => {
        // Perder el servidor de señalización no corta las conexiones ya establecidas, pero impide nuevas.
        for (const f of this.statusCbs) f({ type: 'signal-lost' });
        setTimeout(() => { try { if (!peer.destroyed) peer.reconnect(); } catch (e) { /* ignorar */ } }, 2000);
      });
    });
  }
  onConnection(cb) { this.connCbs.add(cb); }
  onStatus(cb) { this.statusCbs.add(cb); }
  close() { try { this.peer && this.peer.destroy(); } catch (e) { /* ignorar */ } }
}

async function peerConnect(code, timeoutMs = 15000) {
  await loadPeerJS();
  return new Promise((resolve, reject) => {
    const peer = new window.Peer({ ...PEER_OPTS, ...customServer() });
    let done = false;
    const fail = (e) => { if (done) return; done = true; clearTimeout(timer); try { peer.destroy(); } catch (x) { /* */ } reject(e); };
    const timer = setTimeout(() => fail(new NetError('timeout', 'No se pudo conectar con la sala (tiempo agotado). Puede que una red restrictiva bloquee WebRTC')), timeoutMs);
    peer.on('error', (err) => fail(friendlyPeerError(err)));
    peer.on('open', () => {
      const conn = peer.connect(PREFIX + code.toLowerCase(), { reliable: true, serialization: 'json' });
      conn.on('open', () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        const w = wrapPeerConn(conn);
        w.onClose(() => setTimeout(() => { try { peer.destroy(); } catch (e) { /* */ } }, 100));
        resolve(w);
      });
      conn.on('error', () => fail(new NetError('notfound', 'No se pudo abrir la conexión con la sala')));
    });
  });
}

// ---------------- Transporte local (BroadcastChannel) ----------------
const BC_NAME = 'poker-local-net';
function rid() { return Math.random().toString(36).slice(2, 10); }

function makeLocalConn(bc, self, other) {
  const msgCbs = new Set(), closeCbs = new Set();
  let closed = false;
  const conn = {
    id: other,
    send(obj) {
      if (closed) return false;
      const s = JSON.stringify(obj);
      if (s.length > MAX_MSG) return false;
      bc.postMessage({ to: other, from: self, kind: 'data', payload: s });
      return true;
    },
    onMessage(cb) { msgCbs.add(cb); },
    onClose(cb) { closeCbs.add(cb); },
    close() { if (!closed) { bc.postMessage({ to: other, from: self, kind: 'close' }); conn._closed(); } },
    _deliver(s) { let o; try { o = JSON.parse(s); } catch (e) { return; } for (const f of msgCbs) f(o); },
    _closed() { if (closed) return; closed = true; for (const f of closeCbs) f(); },
    get open() { return !closed; },
  };
  return conn;
}

class LocalHost {
  constructor(code) { this.code = code; this.addr = 'host-' + code; this.conns = new Map(); this.connCbs = new Set(); }
  async start() {
    this.bc = new BroadcastChannel(BC_NAME);
    // Comprobar que el código no está en uso
    const taken = await new Promise((resolve) => {
      const probe = rid();
      const t = setTimeout(() => { this.bc.removeEventListener('message', on); resolve(false); }, 250);
      const on = (e) => { if (e.data && e.data.to === probe && e.data.kind === 'pong') { clearTimeout(t); resolve(true); } };
      this.bc.addEventListener('message', on);
      this.bc.postMessage({ to: this.addr, from: probe, kind: 'ping' });
    });
    if (taken) { this.bc.close(); throw new NetError('taken', 'Ese código de sala ya está en uso'); }
    this.bc.onmessage = (e) => {
      const m = e.data;
      if (!m || m.to !== this.addr) return;
      if (m.kind === 'ping') { this.bc.postMessage({ to: m.from, from: this.addr, kind: 'pong' }); return; }
      if (m.kind === 'connect') {
        const c = makeLocalConn(this.bc, this.addr, m.from);
        this.conns.set(m.from, c);
        this.bc.postMessage({ to: m.from, from: this.addr, kind: 'accept' });
        c.onClose(() => this.conns.delete(m.from));
        for (const f of this.connCbs) f(c);
      } else if (m.kind === 'data') { const c = this.conns.get(m.from); if (c) c._deliver(m.payload); }
      else if (m.kind === 'close') { const c = this.conns.get(m.from); if (c) c._closed(); }
    };
    this._unload = () => { for (const c of this.conns.values()) c.close(); };
    window.addEventListener('pagehide', this._unload);
  }
  onConnection(cb) { this.connCbs.add(cb); }
  onStatus() { /* sin estado */ }
  close() {
    for (const c of this.conns.values()) c.close();
    window.removeEventListener('pagehide', this._unload);
    try { this.bc.close(); } catch (e) { /* */ }
  }
}

function localConnect(code, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const bc = new BroadcastChannel(BC_NAME);
    const self = 'cli-' + rid();
    const hostAddr = 'host-' + code;
    let conn = null;
    const t = setTimeout(() => { bc.close(); reject(new NetError('notfound', 'No existe ninguna sala con ese código en este navegador')); }, timeoutMs);
    bc.onmessage = (e) => {
      const m = e.data;
      if (!m || m.to !== self) return;
      if (m.kind === 'accept' && !conn) {
        clearTimeout(t);
        conn = makeLocalConn(bc, self, hostAddr);
        conn.onClose(() => setTimeout(() => bc.close(), 50));
        window.addEventListener('pagehide', () => conn.close());
        resolve(conn);
      } else if (conn && m.kind === 'data') conn._deliver(m.payload);
      else if (conn && m.kind === 'close') conn._closed();
    };
    bc.postMessage({ to: hostAddr, from: self, kind: 'connect' });
  });
}

export function createHost(code) {
  return transportKind() === 'local' ? new LocalHost(code) : new PeerHost(code);
}

export function connectTo(code, timeoutMs) {
  return transportKind() === 'local' ? localConnect(code, timeoutMs && Math.min(timeoutMs, 4000)) : peerConnect(code, timeoutMs);
}
