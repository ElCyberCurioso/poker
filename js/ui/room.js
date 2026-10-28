// Panel de la sala privada para el anfitrión: enlace de invitación, QR, acceso, jugadores y controles.
import { h, svgIcon, fmt, toast, copyText, clear, confirmDialog } from '../util.js';
import { segmented, toggleRow } from './components.js';
import { ACCESS_MODES, roomLink } from '../net/invite.js';
import qrcode from '../../vendor/qrcode.module.js';

export { roomLink };

export function qrImage(text, cell = 4) {
  try {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return h('img', { src: qr.createDataURL(cell, 2), alt: 'Código QR del enlace de invitación', width: '148', height: '148' });
  } catch (e) {
    return h('span.small.faint', 'QR no disponible');
  }
}

// Comparte el enlace con la hoja nativa del sistema (móvil) o lo copia al portapapeles.
export async function shareInvite(url, roomName) {
  if (!url) return false;
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ title: `Poker: ${roomName}`, text: `Te invito a jugar al póker en «${roomName}». Abre el enlace y te sientas directamente:`, url });
      return true;
    } catch (e) {
      if (e && e.name === 'AbortError') return false;
    }
  }
  if (await copyText(url)) { toast('Enlace de invitación copiado. Pégalo donde quieras: con abrirlo, entran y se sientan.', { type: 'success', ms: 4200 }); return true; }
  toast('No se pudo copiar el enlace', { type: 'error' });
  return false;
}

export function roomPanel(session) {
  const room = session.room;
  const wrap = h('div.stack');

  // ----- Enlace de invitación -----
  const linkInput = h('input.input.invite-url', { type: 'text', readonly: true, 'aria-label': 'Enlace de invitación', spellcheck: 'false' });
  linkInput.addEventListener('focus', () => linkInput.select());
  const qrBox = h('div.qr');
  const codeEl = h('div.room-code', room.code);
  const renderLink = () => {
    const url = session.inviteUrl();
    linkInput.value = url;
    clear(qrBox).appendChild(qrImage(url));
  };
  const renew = async () => {
    const ok = await confirmDialog('¿Renovar el enlace?', 'Los enlaces de invitación que ya hayas enviado dejarán de funcionar. Quien ya esté en la sala no se verá afectado.', { ok: 'Renovar' });
    if (!ok) return;
    session.regenerateInvite();
    renderLink();
    toast('Nuevo enlace de invitación listo', { type: 'success' });
  };
  wrap.appendChild(h('div.invite-block',
    h('div.stack', { style: { flex: '1', minWidth: '0' } },
      h('div.h3', 'Enlace de invitación'),
      h('p.small.muted', { style: { margin: 0 } }, 'Quien lo abra entra en la sala y se sienta automáticamente, sin código ni contraseña.'),
      linkInput,
      h('div.row',
        h('button.btn.btn-primary.btn-sm', { type: 'button', autofocus: true, onclick: () => shareInvite(session.inviteUrl(), room.name) }, svgIcon('i-share'), 'Compartir invitación'),
        h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: async () => { if (await copyText(session.inviteUrl())) toast('Enlace copiado', { type: 'success' }); } }, svgIcon('i-copy'), 'Copiar'),
        h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: renew, title: 'Invalida los enlaces enviados hasta ahora' }, svgIcon('i-refresh'), 'Renovar enlace'),
      ),
    ),
    qrBox,
  ));
  renderLink();

  // ----- Acceso -----
  const pwInput = h('input.input', { type: 'text', maxlength: '32', value: room.password || '', placeholder: 'Contraseña', autocomplete: 'off', 'aria-label': 'Contraseña de la sala' });
  const pwRow = h('div.join-inline', pwInput, h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => applyAccess('password') }, 'Guardar'));
  const accessDesc = h('p.small.faint', { style: { margin: 0 } });
  let access = room.access;
  const renderAccess = () => {
    pwRow.hidden = access !== 'password';
    accessDesc.textContent = ACCESS_MODES.find((a) => a.value === access).desc;
  };
  const applyAccess = (val) => {
    const res = session.setAccess(val, pwInput.value);
    if (!res.ok) { toast(res.error, { type: 'error' }); pwInput.focus(); return false; }
    toast(val === 'password' ? 'Contraseña guardada' : 'Acceso actualizado', { type: 'success' });
    return true;
  };
  const accessSeg = segmented(ACCESS_MODES.map((a) => ({ value: a.value, label: a.label })), access, (val) => {
    access = val;
    renderAccess();
    if (val === 'password' && !pwInput.value.trim()) { pwInput.focus(); return; }
    applyAccess(val);
  }, { label: 'Quién puede entrar' });
  accessSeg.classList.add('seg-col');
  pwInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyAccess('password'); });
  wrap.appendChild(h('div.stack',
    h('div.h3', 'Quién puede entrar'),
    accessSeg,
    accessDesc,
    pwRow,
    h('div.row', { style: { gap: '8px', alignItems: 'baseline' } },
      h('span.small.muted', 'Código de la sala:'),
      codeEl,
      h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: async () => { if (await copyText(room.code)) toast('Código copiado', { type: 'success' }); } }, svgIcon('i-copy'), 'Copiar código'),
    ),
    toggleRow({ title: 'Los jugadores también pueden invitar', desc: 'Les aparece el botón Invitar con el enlace vigente', checked: room.guestsCanInvite, onChange: (v) => session.setGuestsCanInvite(v) }),
  ));
  renderAccess();

  // ----- Jugadores -----
  const players = h('div');
  const renderPlayers = () => {
    clear(players);
    const v = session.view;
    const list = session.playerList();
    players.appendChild(h('div.h3', { style: { margin: '6px 0' } }, 'En la sala'));
    const me = v && v.seats[v.you];
    if (me) players.appendChild(h('div.player-line', h('span.dotst'), h('span.grow', `${me.avatar} ${me.name} (tú, anfitrión)`), h('span.small.faint', fmt(me.stack))));
    for (const p of list) players.appendChild(h('div.player-line', h('span.dotst' + (p.connected ? '' : '.off')), h('span.grow', `${p.avatar} ${p.name}`), h('span.small.faint', p.seated ? 'Sentado' : 'Mirando')));
    const bots = v ? v.seats.filter((x) => x && x.isBot) : [];
    for (const b of bots) players.appendChild(h('div.player-line', h('span.dotst'), h('span.grow', `${b.avatar} ${b.name} (bot)`), h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => { session.removeBot(b.seat); setTimeout(renderPlayers, 50); } }, 'Quitar')));
    if (!list.length && !bots.length) players.appendChild(h('p.small.faint', 'Todavía no se ha unido nadie. Envía el enlace de invitación.'));
  };
  renderPlayers();
  wrap.appendChild(players);
  const controls = h('div.row');
  controls.appendChild(h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => { if (session.addBot() < 0) toast('No quedan asientos libres'); setTimeout(renderPlayers, 50); } }, svgIcon('i-bot'), 'Añadir bot'));
  if (session.mode === 'sng' && !session.runner.sng.started) {
    controls.appendChild(h('button.btn.btn-primary.btn-sm', { type: 'button', onclick: () => { if (!session.startSng()) toast('Hacen falta al menos 2 jugadores'); } }, 'Empezar torneo'));
  }
  wrap.appendChild(controls);
  wrap.appendChild(h('div.notice', svgIcon('i-info'),
    h('span', 'La mesa se ejecuta en tu navegador: mantén esta pestaña abierta mientras jugáis. La clave de la invitación va tras el símbolo #, así que nunca llega al servidor que aloja la web. Si expulsas a alguien que conocía el enlace, se renueva solo.')));
  const timer = setInterval(() => { if (!document.body.contains(wrap)) clearInterval(timer); else renderPlayers(); }, 3000);
  return wrap;
}
