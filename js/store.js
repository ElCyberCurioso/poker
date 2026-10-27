// Estado persistente en localStorage: saldo, perfil, estadísticas, progreso y ajustes.
// Cada mutación relee el almacenamiento para que varias pestañas no se pisen el saldo.
import { todayKey, daysBetween, randomHex } from './util.js';
import { ACHIEVEMENTS, missionsForDay, STARTING_BALANCE, levelFromXp, TRAINER_DAILY_CAP } from './data/progress.js';

const KEY = 'poker.v1';
const HIST_KEY = 'poker.history.v1';
const MAX_HISTORY = 60;

const AVATARS = ['🦊', '🐯', '🦁', '🐼', '🐸', '🦉', '🐙', '🦄', '🐺', '🐻', '🐨', '🦅', '🐉', '🦈', '🃏', '🎩', '👑', '🌵', '🍀', '🔥'];
export const AVATAR_CHOICES = AVATARS;

function defaults() {
  return {
    v: 1,
    profile: { name: 'Jugador ' + Math.floor(100 + Math.random() * 900), avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)], createdAt: Date.now(), id: randomHex(8) },
    balance: STARTING_BALANCE,
    xp: 0,
    stats: {
      hands: 0, vpip: 0, pfr: 0, threeBet: 0, won: 0, sawFlop: 0, showdowns: 0, showdownsWon: 0, biggestPot: 0, net: 0,
      bestHandScore: 0, bestHandName: '', sngPlayed: 0, sngWon: 0, sngItm: 0, sngPrizes: 0, wheelSpins: 0, wheelTotal: 0,
      trainerCorrect: 0, trainerAnswered: 0, trainerBestStreak: 0, onlineHands: 0, maxBalance: STARTING_BALANCE, bbWon: 0, steals: 0,
      cats: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
    balanceHistory: [{ t: Date.now(), v: STARTING_BALANCE }],
    wheel: { last: 0 },
    daily: { lastClaim: null, streak: 0 },
    missions: { date: null, progress: {}, claimed: {} },
    achievements: {},
    academy: { done: {}, quiz: {}, trainerDay: null, trainerEarned: 0 },
    bailout: { last: 0 },
    sessions: {},
    rooms: {},
    settings: {
      sound: true, volume: 0.6, fourColor: false, felt: 'petroleo', cardBack: 'burdeos', speed: 1, turnTime: 25,
      showOdds: true, showHandName: true, haptics: true, confirmAllIn: true, autoRebuy: false, reducedMotion: false,
    },
  };
}

function merge(base, saved) {
  if (!saved || typeof saved !== 'object') return base;
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const k of Object.keys(saved)) {
    const b = base[k], s = saved[k];
    if (b && typeof b === 'object' && !Array.isArray(b) && s && typeof s === 'object' && !Array.isArray(s)) out[k] = merge(b, s);
    else if (s !== undefined) out[k] = s;
  }
  return out;
}

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return merge(defaults(), parsed);
  } catch (e) {
    return null;
  }
}

let state = read();
let fresh = false;
if (!state) { state = defaults(); fresh = true; write(state); }

function write(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { console.warn('No se pudo guardar', e); }
}

const subs = new Set();
const eventSubs = new Set();
function notify() { for (const f of subs) { try { f(state); } catch (e) { console.error(e); } } }
function fire(ev) { for (const f of eventSubs) { try { f(ev); } catch (e) { console.error(e); } } }

window.addEventListener('storage', (e) => {
  if (e.key === KEY) {
    const s = read();
    if (s) { state = s; notify(); }
  }
});

export const store = {
  isFresh: () => fresh,
  get: () => state,
  subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  onEvent(fn) { eventSubs.add(fn); return () => eventSubs.delete(fn); },

  update(fn, silent = false) {
    const latest = read() || state;
    const r = fn(latest);
    state = latest;
    write(state);
    if (!silent) notify();
    return r;
  },

  addBalance(delta, reason = '') {
    delta = Math.round(delta);
    if (!delta) return state.balance;
    let unlocked = [];
    this.update((s) => {
      s.balance = Math.max(0, s.balance + delta);
      if (s.balance > s.stats.maxBalance) s.stats.maxBalance = s.balance;
      pushHistory(s);
    });
    if (state.balance >= 100000) unlocked.push('cien-mil');
    if (state.balance >= 1000000) unlocked.push('millonario');
    for (const a of unlocked) this.unlock(a);
    fire({ type: 'balance', delta, reason, balance: state.balance });
    return state.balance;
  },

  // Cobra si hay saldo suficiente; devuelve true/false.
  spend(amount, reason = '') {
    amount = Math.round(amount);
    let ok = false;
    this.update((s) => {
      if (s.balance >= amount) { s.balance -= amount; ok = true; pushHistory(s); }
    });
    if (ok) fire({ type: 'balance', delta: -amount, reason, balance: state.balance });
    return ok;
  },

  addXp(n) {
    const before = levelFromXp(state.xp);
    this.update((s) => { s.xp += n; });
    const after = levelFromXp(state.xp);
    if (after > before) fire({ type: 'levelUp', level: after });
  },

  unlock(id) {
    if (state.achievements[id]) return false;
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) return false;
    let did = false;
    this.update((s) => {
      if (!s.achievements[id]) { s.achievements[id] = Date.now(); did = true; }
    });
    if (did) {
      if (a.reward) this.addBalance(a.reward, 'logro');
      this.addXp(40);
      fire({ type: 'achievement', achievement: a });
    }
    return did;
  },

  // ---------- Misiones diarias ----------
  missions() {
    const day = todayKey();
    if (state.missions.date !== day) {
      this.update((s) => { s.missions = { date: day, progress: {}, claimed: {} }; }, true);
    }
    return missionsForDay(day).map((m) => ({ ...m, progress: Math.min(m.goal, state.missions.progress[m.event] || 0), claimed: !!state.missions.claimed[m.id] }));
  },

  progress(event, n = 1) {
    const day = todayKey();
    const active = missionsForDay(day);
    if (!active.some((m) => m.event === event)) return;
    const before = this.missions();
    this.update((s) => {
      if (s.missions.date !== day) s.missions = { date: day, progress: {}, claimed: {} };
      s.missions.progress[event] = (s.missions.progress[event] || 0) + n;
    });
    const after = this.missions();
    for (const m of after) {
      const b = before.find((x) => x.id === m.id);
      if (!m.claimed && m.progress >= m.goal && b && b.progress < m.goal) fire({ type: 'missionReady', mission: m });
    }
  },

  claimMission(id) {
    const m = this.missions().find((x) => x.id === id);
    if (!m || m.claimed || m.progress < m.goal) return 0;
    this.update((s) => { s.missions.claimed[id] = true; });
    this.addBalance(m.reward, 'misión');
    this.addXp(25);
    return m.reward;
  },

  // ---------- Bono diario ----------
  dailyStatus() {
    const today = todayKey();
    const last = state.daily.lastClaim;
    const available = last !== today;
    let streak = state.daily.streak;
    if (last && daysBetween(last, today) > 1) streak = 0;
    return { available, streak, nextIndex: available ? streak % 7 : (streak - 1) % 7 };
  },

  claimDaily(amounts) {
    const st = this.dailyStatus();
    if (!st.available) return 0;
    const amount = amounts[st.streak % amounts.length];
    const today = todayKey();
    this.update((s) => {
      s.daily.streak = st.streak + 1;
      s.daily.lastClaim = today;
    });
    this.addBalance(amount, 'bono diario');
    if (state.daily.streak >= 7) this.unlock('racha-7');
    return amount;
  },

  // ---------- Entrenadores ----------
  trainerReward(amount) {
    const day = todayKey();
    let given = 0;
    this.update((s) => {
      if (s.academy.trainerDay !== day) { s.academy.trainerDay = day; s.academy.trainerEarned = 0; }
      given = Math.max(0, Math.min(amount, TRAINER_DAILY_CAP - s.academy.trainerEarned));
      s.academy.trainerEarned += given;
    });
    if (given) this.addBalance(given, 'entrenador');
    return given;
  },

  // ---------- Sesiones activas (recuperación de fichas tras recargar o cerrar) ----------
  tabId: (() => {
    try {
      let t = sessionStorage.getItem('poker.tab');
      if (!t) { t = randomHex(6); sessionStorage.setItem('poker.tab', t); }
      return t;
    } catch (e) { return randomHex(6); }
  })(),

  setSession(info) {
    const id = this.tabId;
    this.update((s) => {
      if (info) s.sessions[id] = { ...info, at: Date.now() };
      else delete s.sessions[id];
    }, true);
  },

  // Recupera sesiones huérfanas: la de esta pestaña (recarga) o las de pestañas sin latido reciente.
  recoverSessions() {
    let total = 0;
    const recovered = [];
    this.update((s) => {
      for (const [id, info] of Object.entries(s.sessions || {})) {
        const stale = Date.now() - (info.at || 0) > 20000;
        if (id === this.tabId || stale) {
          const amt = Math.max(0, Math.floor(info.stack || 0));
          total += amt;
          recovered.push(info);
          delete s.sessions[id];
        }
      }
    }, true);
    if (total > 0) this.addBalance(total, 'recuperación');
    return { total, recovered };
  },

  heartbeat() {
    const id = this.tabId;
    if (!state.sessions[id]) return;
    this.update((s) => { if (s.sessions[id]) s.sessions[id].at = Date.now(); }, true);
  },

  // ---------- Historial de manos ----------
  history() {
    try { return JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); } catch (e) { return []; }
  },
  pushHistory(entry) {
    const list = this.history();
    list.unshift(entry);
    try { localStorage.setItem(HIST_KEY, JSON.stringify(list.slice(0, MAX_HISTORY))); } catch (e) { /* lleno */ }
  },
  clearHistory() { localStorage.removeItem(HIST_KEY); },

  setting(key, value) {
    this.update((s) => { s.settings[key] = value; });
    fire({ type: 'settings', key, value });
  },

  exportData() {
    const payload = { app: 'poker', v: 1, at: Date.now(), state: { ...state, sessions: {} } };
    return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  },

  importData(text) {
    const payload = JSON.parse(decodeURIComponent(escape(atob(String(text).trim()))));
    if (!payload || payload.app !== 'poker' || !payload.state) throw new Error('Formato no reconocido');
    const s = merge(defaults(), payload.state);
    s.sessions = {};
    s.balance = Math.max(0, Math.floor(Number(s.balance) || 0));
    state = s;
    write(state);
    notify();
  },

  reset() {
    state = defaults();
    write(state);
    this.clearHistory();
    notify();
  },
};

function pushHistory(s) {
  const last = s.balanceHistory[s.balanceHistory.length - 1];
  const now = Date.now();
  if (last && now - last.t < 30000) last.v = s.balance;
  else s.balanceHistory.push({ t: now, v: s.balance });
  if (s.balanceHistory.length > 200) s.balanceHistory.splice(0, s.balanceHistory.length - 200);
}

export const ACH_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
