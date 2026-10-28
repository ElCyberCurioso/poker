// Crear una sala privada y unirse a una existente.
import { h, clear, svgIcon, fmt, toast, modal, randomCode, normalizeCode, isValidCode, cleanName, confirmDialog } from '../util.js';
import { store } from '../store.js';
import { HostSession } from '../net/host.js';
import { ClientSession } from '../net/client.js';
import { transportKind } from '../net/transport.js';
import { parseInvite, isInviteKey, ACCESS_MODES } from '../net/invite.js';
import { buyInDialog } from './table.js';
import { segmented, toggleRow } from './components.js';

// Campo para unirse: acepta el código de 6 caracteres o un enlace de invitación pegado (entra al momento).
export function joinBox(app) {
  const input = h('input.input.code', { type: 'text', placeholder: 'CÓDIGO', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', 'aria-label': 'Código de sala o enlace de invitación' });
  const go = (parsed) => app.navigate('#/sala/' + parsed.code + (parsed.key ? '/' + parsed.key : ''));
  input.addEventListener('input', () => {
    const p = parseInvite(input.value);
    if (p.isLink) {
      if (isValidCode(p.code)) { input.value = p.code; go(p); }
      return;
    }
    input.value = p.code;
  });
  const join = () => {
    const p = parseInvite(input.value);
    if (!isValidCode(p.code)) { toast('Escribe el código de 6 caracteres o pega el enlace de invitación', { type: 'error' }); input.focus(); return; }
    go(p);
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
  return h('div.join-inline', input, h('button.btn.btn-felt', { type: 'button', onclick: join }, 'Entrar'));
}

const BLINDS = [[5, 10], [10, 20], [25, 50], [50, 100], [100, 200], [250, 500], [500, 1000], [1000, 2000]];

export function renderOnline(root, app) {
  const s = store.get();
  const cfg = {
    name: `Mesa de ${s.profile.name}`, mode: 'cash', blinds: 1, depth: 'normal', seats: 6, turn: 25, bots: 0, botLevel: 1, access: 'code', guestsCanInvite: true,
    sngBuyIn: 1000, startingStack: 1500, levelHands: 8,
  };
  const name = h('input.input', { type: 'text', maxlength: '30', value: cfg.name, 'aria-label': 'Nombre de la sala' });
  const pass = h('input.input', { type: 'text', maxlength: '32', placeholder: 'Contraseña para entrar con el código', autocomplete: 'off', 'aria-label': 'Contraseña' });
  const accessHint = h('span.hint');
  const renderAccess = () => {
    pass.hidden = cfg.access !== 'password';
    accessHint.textContent = ACCESS_MODES.find((a) => a.value === cfg.access).desc;
  };
  const cashBox = h('div.stack');
  const sngBox = h('div.stack', { hidden: true });
  const summary = h('p.small.muted', { style: { margin: 0 } });
  const blindSel = h('select.input', { 'aria-label': 'Ciegas' }, BLINDS.map(([a, b], i) => h('option', { value: String(i), selected: i === cfg.blinds }, `${fmt(a)}/${fmt(b)}`)));
  const depthSel = h('select.input', { 'aria-label': 'Entrada' },
    h('option', { value: 'short' }, 'Corta: 20–50 ciegas'),
    h('option', { value: 'normal', selected: true }, 'Normal: 40–100 ciegas'),
    h('option', { value: 'deep' }, 'Profunda: 100–200 ciegas'));
  const seatsSel = h('select.input', { 'aria-label': 'Asientos' }, [2, 3, 4, 5, 6, 7, 8, 9].map((n) => h('option', { value: String(n), selected: n === 6 }, `${n} asientos`)));
  const botsSel = h('select.input', { 'aria-label': 'Bots' }, Array.from({ length: 9 }, (_, n) => h('option', { value: String(n) }, n === 0 ? 'Sin bots' : `${n} ${n === 1 ? 'bot' : 'bots'}`)));
  const sngBuy = h('select.input', { 'aria-label': 'Inscripción' }, [0, 500, 1000, 2500, 5000, 10000, 25000].map((v) => h('option', { value: String(v), selected: v === 1000 }, v === 0 ? 'Gratis (sin premios)' : fmt(v))));
  const sngStack = h('select.input', { 'aria-label': 'Fichas iniciales' }, [1500, 3000, 5000].map((v) => h('option', { value: String(v) }, fmt(v))));
  const sngLevel = h('select.input', { 'aria-label': 'Subida de ciegas' }, [5, 8, 12].map((v) => h('option', { value: String(v), selected: v === 8 }, `Cada ${v} manos`)));

  const depthRange = () => (cfg.depth === 'short' ? [20, 50] : cfg.depth === 'deep' ? [100, 200] : [40, 100]);
  const refresh = () => {
    cfg.blinds = Number(blindSel.value); cfg.depth = depthSel.value; cfg.seats = Number(seatsSel.value);
    cfg.bots = Math.min(Number(botsSel.value), cfg.seats - 1);
    cfg.sngBuyIn = Number(sngBuy.value); cfg.startingStack = Number(sngStack.value); cfg.levelHands = Number(sngLevel.value);
    cashBox.hidden = cfg.mode !== 'cash';
    sngBox.hidden = cfg.mode !== 'sng';
    const bb = BLINDS[cfg.blinds][1];
    const [lo, hi] = depthRange();
    summary.textContent = cfg.mode === 'cash'
      ? `Cada jugador entra con entre ${fmt(bb * lo)} y ${fmt(bb * hi)} fichas de su saldo y se lleva su stack al salir.`
      : cfg.sngBuyIn ? `Cada jugador paga ${fmt(cfg.sngBuyIn)} de su saldo. Los premios se reparten según el número de jugadores al empezar.` : 'Torneo de práctica: sin inscripción ni premios.';
  };
  [blindSel, depthSel, seatsSel, botsSel, sngBuy, sngStack, sngLevel].forEach((el) => el.addEventListener('change', refresh));
  cashBox.append(h('div.grid-2', h('div.field', h('label', 'Ciegas'), blindSel), h('div.field', h('label', 'Entrada'), depthSel)));
  sngBox.append(h('div.grid-3', h('div.field', h('label', 'Inscripción'), sngBuy), h('div.field', h('label', 'Fichas iniciales'), sngStack), h('div.field', h('label', 'Subida de ciegas'), sngLevel)));
  const createBtn = h('button.btn.btn-primary', { type: 'button' }, svgIcon('i-users'), 'Crear sala');
  createBtn.addEventListener('click', () => {
    if (cfg.access === 'password' && !pass.value.trim()) { toast('Escribe la contraseña o elige otro modo de acceso', { type: 'error' }); pass.focus(); return; }
    createRoom(cfg, { name, pass, createBtn, depthRange }, app);
  });

  const form = h('div.panel.stack',
    h('div.field', h('label', 'Nombre de la sala'), name),
    h('div.field', h('span.label', 'Modalidad'), segmented([{ value: 'cash', label: 'Cash' }, { value: 'sng', label: 'Torneo Sit & Go' }], 'cash', (v) => { cfg.mode = v; refresh(); })),
    cashBox, sngBox,
    h('div.grid-2', h('div.field', h('label', 'Asientos'), seatsSel), h('div.field', h('label', 'Rellenar con bots'), botsSel)),
    h('div.grid-2',
      h('div.field', h('span.label', 'Tiempo por turno'), segmented([{ value: 15, label: '15 s' }, { value: 25, label: '25 s' }, { value: 40, label: '40 s' }, { value: 60, label: '60 s' }], 25, (v) => { cfg.turn = v; })),
      h('div.field', h('span.label', 'Nivel de los bots'), segmented([{ value: 0, label: 'Fácil' }, { value: 1, label: 'Medio' }, { value: 3, label: 'Difícil' }], 1, (v) => { cfg.botLevel = v; })),
    ),
    h('div.field', h('span.label', 'Quién puede entrar'),
      (() => { const sg = segmented(ACCESS_MODES.map((a) => ({ value: a.value, label: a.label })), cfg.access, (v) => { cfg.access = v; renderAccess(); if (v === 'password') pass.focus(); }, { label: 'Quién puede entrar' }); sg.classList.add('seg-col'); return sg; })(),
      pass, accessHint),
    toggleRow({ title: 'Los jugadores también pueden invitar', desc: 'Además de ti, cualquiera sentado podrá compartir el enlace de invitación', checked: cfg.guestsCanInvite, onChange: (v) => { cfg.guestsCanInvite = v; } }),
    summary,
    h('div.row', createBtn),
  );


  root.append(
    h('div.section-head', h('div', h('h1.h1', 'Salas privadas'), h('p.lead', 'Juega con tus amigos desde cualquier dispositivo. Crea la sala y envíales el enlace de invitación: con abrirlo, entran y se sientan.'))),
    h('div.grid-2', { style: { alignItems: 'start' } },
      h('div.stack', h('h2.h2', 'Crear sala'), form),
      h('div.stack',
        h('h2.h2', 'Unirse'),
        h('div.panel.stack', h('p.muted.small', { style: { margin: 0 } }, 'Lo más rápido es abrir el enlace de invitación que te hayan enviado. Si sólo tienes el código, escríbelo aquí (o pega el enlace).'), joinBox(app)),
        h('div.notice', svgIcon('i-info'), h('div',
          h('strong', 'Cómo funciona. '),
          'La mesa se ejecuta en el navegador de quien crea la sala y los demás se conectan directamente (WebRTC). Quien crea la sala debe dejar la pestaña abierta durante la partida. Algunas redes corporativas o de móvil muy restrictivas pueden bloquear la conexión.',
          transportKind() === 'local' ? h('div', { style: { marginTop: '6px', color: 'var(--warn)' } }, 'Modo de prueba local activo (?net=local): las salas sólo funcionan entre pestañas de este navegador.') : null,
        )),
      ),
    ),
  );
  refresh();
  renderAccess();
}

async function createRoom(cfg, { name, pass, createBtn, depthRange }, app) {
  const [sb, bb] = BLINDS[cfg.blinds];
  const [lo, hi] = depthRange();
  const table = cfg.mode === 'cash'
    ? { name: cleanName(name.value, 30) || 'Sala privada', sb, bb, maxSeats: cfg.seats, mode: 'cash', minBuyIn: bb * lo, maxBuyIn: bb * hi }
    : { name: cleanName(name.value, 30) || 'Torneo privado', sb: 10, bb: 20, maxSeats: cfg.seats, mode: 'sng' };
  let buyIn = 0;
  if (cfg.mode === 'cash') {
    buyIn = await buyInDialog({ min: table.minBuyIn, max: table.maxBuyIn, bb, title: 'Tus fichas para la mesa', defaultValue: table.maxBuyIn });
    if (!buyIn) return;
  } else if (store.get().balance < cfg.sngBuyIn) {
    toast('No tienes saldo para la inscripción', { type: 'error' });
    return;
  }
  createBtn.disabled = true;
  createBtn.textContent = 'Abriendo sala…';
  let host = null, lastErr = null;
  for (let attempt = 0; attempt < 3 && !host; attempt++) {
    const code = randomCode(6);
    const h0 = new HostSession({
      table, buyIn, bots: cfg.bots, botLevel: cfg.botLevel, turnTime: cfg.turn, verifiable: true,
      sng: cfg.mode === 'sng' ? { buyIn: cfg.sngBuyIn, startingStack: cfg.startingStack, levelHands: cfg.levelHands } : undefined,
      autoStartSng: false,
      room: { code, name: table.name, access: cfg.access, password: cfg.access === 'password' ? pass.value.trim().slice(0, 32) : '', guestsCanInvite: cfg.guestsCanInvite },
    });
    try { await h0.open(); host = h0; } catch (e) { lastErr = e; if (e.code !== 'taken') break; }
  }
  createBtn.disabled = false;
  clear(createBtn).append(svgIcon('i-users'), 'Crear sala');
  if (!host) {
    modal({ title: 'No se pudo crear la sala', body: h('p', (lastErr && lastErr.message) || 'Error desconocido'), actions: [{ label: 'Entendido', primary: true }] });
    return;
  }
  const charge = cfg.mode === 'cash' ? buyIn : cfg.sngBuyIn;
  if (charge && !store.spend(charge, 'sala privada')) { host.close(); toast('Saldo insuficiente', { type: 'error' }); return; }
  host.start();
  app.startSession(host, { openRoom: true });
}

// Ruta #/sala/CODIGO[/CLAVE].
// Sin clave: conecta como espectador y propone sentarse. Con clave de invitación: entra sin contraseña y se sienta solo.
export async function joinRoom(root, rawCode, app, rawKey) {
  const code = normalizeCode(rawCode);
  const key = isInviteKey(rawKey) ? rawKey : null;
  if (!isValidCode(code)) { toast('Código de sala no válido', { type: 'error' }); app.navigate('#/online'); return; }
  const cur = app.session;
  if (cur && !cur.closed) {
    const curCode = cur.code || (cur.room && cur.room.code);
    if (curCode === code) { app.navigate('#/mesa'); return; }
    const ok = await confirmDialog('¿Cambiar de mesa?',
      cur.kind === 'host'
        ? `Estás alojando «${cur.tableName}». Si te unes a esta invitación se cerrará tu sala para todos y cada jugador recuperará sus fichas.`
        : `Estás jugando en «${cur.tableName}». Si te unes a esta invitación saldrás de esa mesa y tu stack volverá a tu saldo.`,
      { ok: 'Salir y unirme', danger: cur.kind === 'host' });
    if (!ok) { app.navigate('#/mesa'); return; }
    cur.leave();
    app.session = null;
  }
  clear(root).appendChild(h('div.empty', h('div.big', '🃏'), h('p.lead', key ? `Entrando por invitación en la sala ${code}…` : `Conectando con la sala ${code}…`)));

  const attempt = async (password, invite) => {
    const c = new ClientSession({ code, password, invite, autoSit: !!invite || (!!key && !!password), spectate: !invite && !key });
    try {
      const welcome = await c.connect();
      return { client: c, welcome };
    } catch (e) {
      if (e.code === 'password') {
        const pw = await askPassword(password ? 'Contraseña incorrecta. Inténtalo de nuevo.' : e.message);
        if (!pw) return null;
        return attempt(pw, '');
      }
      throw e;
    }
  };
  try {
    const res = await attempt('', key || '');
    if (!res) { app.navigate('#/online'); return; }
    const { client, welcome } = res;
    // La clave no se queda a la vista en la barra de direcciones una vez dentro.
    if (key) { try { history.replaceState(null, '', location.pathname + location.search + '#/sala/' + code); } catch (e) { /* */ } }
    let notice = null;
    if (welcome.note) notice = { text: welcome.note, type: 'info' };
    else if (welcome.id && welcome.charge > 0) {
      notice = client.mode === 'sng'
        ? { text: `Te has inscrito en el torneo (${fmt(welcome.charge)} fichas). ¡Suerte!`, type: 'success' }
        : { text: `Te has sentado con ${fmt(welcome.charge)} fichas. Puedes recargar desde el menú ⋯`, type: 'success' };
    }
    app.startSession(client, { askSit: !key && !welcome.id, notice });
  } catch (e) {
    const dead = e.code === 'invite';
    clear(root).appendChild(h('div.empty',
      h('div.big', dead ? '🔒' : '🚪'),
      h('h2.h2', dead ? (key ? 'Invitación no válida' : 'Sala sólo con invitación') : 'No se pudo entrar en la sala'),
      h('p', e.message || 'Error de conexión'),
      h('div.row', { style: { justifyContent: 'center' } },
        dead ? null : h('button.btn.btn-primary', { type: 'button', onclick: () => joinRoom(root, code, app, key) }, svgIcon('i-refresh'), 'Reintentar'),
        h('a.btn.btn-ghost', { href: '#/' }, 'Ir al inicio'),
      ),
    ));
  }
}

function askPassword(text) {
  return new Promise((resolve) => {
    const input = h('input.input', { type: 'password', maxlength: '32', 'aria-label': 'Contraseña', autocomplete: 'off' });
    let done = false;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { done = true; m.close(); resolve(input.value); } });
    const m = modal({
      title: 'Contraseña',
      body: h('div.stack', h('p', text), input),
      actions: [{ label: 'Cancelar', onClick: () => { done = true; resolve(null); } }, { label: 'Entrar', primary: true, onClick: () => { done = true; resolve(input.value); } }],
      onClose: () => { if (!done) resolve(null); },
    });
  });
}
