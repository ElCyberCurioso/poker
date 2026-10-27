// Panel de la sala privada para el anfitrión: código, enlace, QR, jugadores y controles.
import { h, svgIcon, fmt, toast, copyText, clear } from '../util.js';
import qrcode from '../../vendor/qrcode.module.js';

export function roomLink(code) {
  return `${location.origin}${location.pathname}${location.search}#/sala/${code}`;
}

export function qrImage(text, cell = 4) {
  try {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return h('img', { src: qr.createDataURL(cell, 2), alt: 'Código QR para unirse a la sala', width: '148', height: '148' });
  } catch (e) {
    return h('span.small.faint', 'QR no disponible');
  }
}

export function roomPanel(session) {
  const code = session.room.code;
  const link = roomLink(code);
  const wrap = h('div.stack');
  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: 'Poker: únete a mi mesa', text: `Juega al póker conmigo. Código de sala: ${code}`, url: link }); return; } catch (e) { /* cancelado */ }
    }
    if (await copyText(link)) toast('Enlace copiado', { type: 'success' });
  };
  wrap.appendChild(h('div.row', { style: { alignItems: 'flex-start', gap: '20px' } },
    h('div.stack', { style: { flex: '1', minWidth: '220px' } },
      h('div.muted.small', 'Código de la sala'),
      h('div.room-code', code),
      h('div.row',
        h('button.btn.btn-primary.btn-sm', { type: 'button', onclick: share }, svgIcon('i-share'), 'Compartir enlace'),
        h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: async () => { if (await copyText(code)) toast('Código copiado', { type: 'success' }); } }, svgIcon('i-copy'), 'Copiar código'),
      ),
      session.room.password ? h('div.small.faint', h('span', 'Contraseña: '), h('strong', session.room.password)) : h('div.small.faint', 'Sala sin contraseña: cualquiera con el código puede entrar.'),
    ),
    h('div.qr', qrImage(link)),
  ));
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
    if (!list.length && !bots.length) players.appendChild(h('p.small.faint', 'Todavía no se ha unido nadie. Comparte el código o el enlace.'));
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
    h('span', 'La mesa se ejecuta en tu navegador: mantén esta pestaña abierta mientras jugáis. Cada mano se compromete con un hash SHA-256 de la baraja que los invitados verifican al terminar.')));
  const timer = setInterval(() => { if (!document.body.contains(wrap)) clearInterval(timer); else renderPlayers(); }, 3000);
  return wrap;
}
