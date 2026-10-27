// Arranque: shell, router por hash, avisos globales y recuperación de fichas.
import { h, clear, svgIcon, fmt, toast, modal, duration, cleanName } from './util.js';
import { store, AVATAR_CHOICES } from './store.js';
import { chipIcon } from './ui/components.js';
import { renderHome } from './ui/home.js';
import { renderAcademy, renderLesson } from './ui/academy.js';
import { renderTrainer } from './ui/trainers.js';
import { renderTools } from './ui/tools.js';
import { renderWheel, wheelReadyIn, settlePendingWheel } from './ui/wheel.js';
import { renderProfile } from './ui/profile.js';
import { renderOnline, joinRoom } from './ui/online.js';
import { TableView } from './ui/table.js';
import { play } from './audio.js';
import { forgetToken } from './net/client.js';

const appEl = document.getElementById('app');

const NAV = [
  { href: '#/', icon: 'i-play', label: 'Jugar', match: (r) => r === '' || r === 'online' || r === 'sala' || r === 'mesa' },
  { href: '#/academia', icon: 'i-book', label: 'Academia', match: (r) => r === 'academia' || r === 'entrenar' },
  { href: '#/herramientas', icon: 'i-tools', label: 'Herramientas', match: (r) => r === 'herramientas' },
  { href: '#/ruleta', icon: 'i-wheel', label: 'Ruleta', match: (r) => r === 'ruleta' },
  { href: '#/perfil', icon: 'i-user', label: 'Perfil', match: (r) => r === 'perfil' },
];

const TITLES = { '': 'Mesas', online: 'Salas privadas', sala: 'Sala privada', academia: 'Academia', entrenar: 'Entrenador', herramientas: 'Herramientas', ruleta: 'Ruleta', perfil: 'Perfil' };

export const app = {
  session: null,
  sessionOpts: null,
  tableView: null,
  navigate(hash) {
    if (location.hash === hash || (hash === '#/' && (location.hash === '' || location.hash === '#'))) route();
    else location.hash = hash;
  },
  rerender() { route(); },
  startSession(session, opts = {}) {
    if (app.session && !app.session.closed && app.session !== session) {
      try { app.session.leave(); } catch (e) { /* */ }
    }
    app.session = session;
    app.sessionOpts = opts;
    session.on((ev) => {
      if (ev.type === 'closed' && app.session === session && session.kind !== 'client') {
        // Las sesiones locales y de anfitrión se cierran al salir: volver al lobby si seguimos en la mesa.
        app.session = null;
        if (parseRoute().name === 'mesa' && !(app.tableView && app.tableView.exiting)) app.navigate('#/');
      }
    });
    app.navigate('#/mesa');
  },
  applySettings() {
    const s = store.get().settings;
    document.body.classList.toggle('four-color', !!s.fourColor);
    document.body.classList.toggle('reduce-motion', !!s.reducedMotion);
    document.body.dataset.felt = s.felt || 'petroleo';
    document.body.dataset.back = s.cardBack || 'burdeos';
  },
};
window.poker = app; // útil para depurar desde la consola

function parseRoute() {
  const raw = (location.hash || '#/').replace(/^#\/?/, '');
  const [path, anchor] = raw.split('#');
  const parts = path.split('/').filter(Boolean);
  return { name: parts[0] || '', arg: parts[1] || '', anchor: anchor || '' };
}

// ---------------- Shell ----------------
let shell = null;
function buildShell() {
  const rail = h('nav.rail-nav', { 'aria-label': 'Navegación principal' }, h('a.rail-logo', { href: '#/' }, 'Poker'), NAV.map((n) => navLink(n)));
  const tabbar = h('nav.tabbar', { 'aria-label': 'Navegación principal' }, NAV.map((n) => navLink(n)));
  const balance = h('a.balance-pill', { href: '#/perfil', title: 'Tu saldo' }, chipIcon(26), h('span.num', fmt(store.get().balance)));
  const wheelPill = h('a.wheel-pill', { href: '#/ruleta' }, svgIcon('i-wheel'), h('span.lbl', ''));
  const backToTable = h('a.btn.btn-felt.btn-sm', { href: '#/mesa', hidden: true }, svgIcon('i-play'), 'Volver a la mesa');
  const avatar = h('a.avatar-btn', { href: '#/perfil', 'aria-label': 'Perfil' }, store.get().profile.avatar);
  const title = h('h1.page-title', '');
  const topbar = h('header.topbar', h('a.topbar-logo', { href: '#/' }, 'Poker'), title, h('div.grow'), backToTable, wheelPill, balance, avatar);
  const content = h('main.content', { id: 'content', tabindex: '-1' });
  const root = h('div.shell', rail, h('div.main', topbar, content), tabbar);
  shell = { root, content, balance, wheelPill, avatar, title, backToTable, rail, tabbar };
  return shell;
}

function navLink(n) {
  const a = h('a.nav-link', { href: n.href }, svgIcon(n.icon), h('span', n.label));
  a.dataset.match = n.label;
  return a;
}

function updateShell(r) {
  if (!shell) return;
  const s = store.get();
  shell.balance.querySelector('.num').textContent = fmt(s.balance);
  shell.avatar.textContent = s.profile.avatar;
  shell.title.textContent = TITLES[r.name] || '';
  for (const nav of [shell.rail, shell.tabbar]) {
    nav.querySelectorAll('.nav-link').forEach((a) => {
      const n = NAV.find((x) => x.label === a.dataset.match);
      if (n && n.match(r.name)) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
      if (n && n.label === 'Ruleta') {
        let dot = a.querySelector('.dot');
        if (wheelReadyIn() === 0 && !dot) a.appendChild(h('span.dot'));
        else if (wheelReadyIn() > 0 && dot) dot.remove();
      }
    });
  }
  shell.backToTable.hidden = !(app.session && !app.session.closed);
  updateWheelPill();
}

function updateWheelPill() {
  if (!shell) return;
  const wait = wheelReadyIn();
  const lbl = shell.wheelPill.querySelector('.lbl');
  shell.wheelPill.classList.toggle('ready', wait === 0);
  lbl.textContent = wait === 0 ? 'Ruleta lista' : duration(wait).replace(/ \d+ s$/, '');
  shell.wheelPill.setAttribute('aria-label', wait === 0 ? 'La ruleta está lista' : `Ruleta disponible en ${duration(wait)}`);
}

// ---------------- Router ----------------
function route() {
  const r = parseRoute();
  if (app.tableView && r.name !== 'mesa') {
    app.tableView.destroy();
    app.tableView = null;
  }
  if (r.name === 'mesa') return showTable();
  document.body.classList.remove('in-table');
  if (!shell || !appEl.contains(shell.root)) {
    buildShell();
    clear(appEl).appendChild(shell.root);
  }
  updateShell(r);
  const c = clear(shell.content);
  try {
    switch (r.name) {
      case '': renderHome(c, app); break;
      case 'online': renderOnline(c, app); break;
      case 'sala': joinRoom(c, r.arg, app); break;
      case 'academia': if (r.arg) renderLesson(c, r.arg, app); else renderAcademy(c, app); break;
      case 'entrenar': renderTrainer(c, r.arg, app); break;
      case 'herramientas': renderTools(c, r.arg, app); break;
      case 'ruleta': renderWheel(c, app); break;
      case 'perfil': renderProfile(c, app); break;
      default: renderHome(c, app);
    }
  } catch (e) {
    console.error(e);
    c.appendChild(h('div.empty', h('div.big', '⚠️'), h('p', 'Algo ha fallado al mostrar esta página.'), h('a.btn.btn-ghost', { href: '#/' }, 'Ir al inicio')));
  }
  if (r.anchor) requestAnimationFrame(() => document.getElementById(r.anchor)?.scrollIntoView({ behavior: 'smooth' }));
  else window.scrollTo(0, 0);
}

function showTable() {
  const s = app.session;
  if (!s || s.closed) { app.navigate('#/'); return; }
  document.body.classList.add('in-table');
  if (app.tableView) return;
  const host = h('div');
  clear(appEl).appendChild(host);
  shell = null;
  const view = new TableView(s, {
    onExit: () => {
      if (app.session === s) app.session = null;
      app.navigate('#/');
    },
  });
  app.tableView = view;
  view.mount(host);
  const opts = app.sessionOpts || {};
  app.sessionOpts = null;
  if (opts.openRoom) setTimeout(() => view.openRoomPanel(), 400);
  if (opts.askSit) setTimeout(() => { if (s.view && s.view.seats.some((x) => !x)) view.askSit(); }, 500);
}

// ---------------- Avisos globales ----------------
store.onEvent((ev) => {
  if (ev.type === 'achievement') {
    play('success');
    toast(`Logro: ${ev.achievement.name}${ev.achievement.reward ? ` (+${fmt(ev.achievement.reward)})` : ''}`, { type: 'gold', icon: ev.achievement.icon, ms: 4200 });
  } else if (ev.type === 'levelUp') {
    toast(`¡Subes al nivel ${ev.level}!`, { type: 'gold', icon: '⭐' });
  } else if (ev.type === 'missionReady') {
    toast(`Misión completada: ${ev.mission.text}. Cóbrala en el lobby.`, { type: 'success', icon: '✅', ms: 4200 });
  } else if (ev.type === 'balance' && shell) {
    shell.balance.classList.remove('bump'); void shell.balance.offsetWidth; shell.balance.classList.add('bump');
  } else if (ev.type === 'settings') {
    app.applySettings();
  }
});
store.subscribe(() => {
  if (shell) {
    shell.balance.querySelector('.num').textContent = fmt(store.get().balance);
    shell.avatar.textContent = store.get().profile.avatar;
  }
});
setInterval(() => { if (shell) updateShell(parseRoute()); }, 1000);

window.addEventListener('beforeunload', (e) => {
  const s = app.session;
  if (s && !s.closed && (s.kind === 'host' || (s.view && s.view.you >= 0))) {
    e.preventDefault();
    e.returnValue = '';
  }
});

function welcome() {
  const s = store.get();
  let avatar = s.profile.avatar;
  const name = h('input.input', { type: 'text', maxlength: '18', value: s.profile.name, 'aria-label': 'Tu nombre' });
  const grid = h('div.avatar-grid', AVATAR_CHOICES.slice(0, 12).map((a) => {
    const b = h('button', { type: 'button', 'aria-pressed': String(a === avatar), 'aria-label': 'Avatar ' + a }, a);
    b.addEventListener('click', () => { avatar = a; grid.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); });
    return b;
  }));
  modal({
    title: 'Bienvenido a Poker',
    body: h('div.stack',
      h('p', `Te regalamos ${fmt(s.balance)} fichas para empezar. Son ficticias: no se compran ni se cobran, sólo sirven para jugar, aprender y presumir.`),
      h('div.field', h('label', '¿Cómo te llamamos en la mesa?'), name),
      h('div.field', h('span.label', 'Elige avatar'), grid),
    ),
    actions: [{ label: 'Empezar', primary: true, onClick: () => {
      const n = cleanName(name.value);
      store.update((st) => { if (n.length >= 2) st.profile.name = n; st.profile.avatar = avatar; });
      route();
    } }],
  });
}

// ---------------- Inicio ----------------
app.applySettings();
const rec = store.recoverSessions();
for (const info of rec.recovered) if (info.code) forgetToken(info.code);
window.addEventListener('hashchange', route);
route();
if (rec.total > 0) toast(`Recuperaste ${fmt(rec.total)} fichas de una mesa que quedó abierta`, { type: 'gold', icon: '♻️', ms: 5000 });
settlePendingWheel();
if (store.isFresh()) setTimeout(welcome, 300);

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { /* sin PWA */ }));
}
