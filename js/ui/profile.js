// Perfil: identidad, evolución del saldo, estadísticas, logros y ajustes.
import { h, svgIcon, fmt, fmtSigned, pct, toast, modal, confirmDialog, cleanName, copyText } from '../util.js';
import { store, AVATAR_CHOICES } from '../store.js';
import { ACHIEVEMENTS, levelFromXp, xpForLevel, levelTitle } from '../data/progress.js';
import { toggleRow, segmented, progressBar } from './components.js';
import { CAT_NAMES } from '../core/evaluator.js';
import { play } from '../audio.js';

export function renderProfile(root, app) {
  const s = store.get();
  const level = levelFromXp(s.xp);
  const cur = xpForLevel(level), next = xpForLevel(level + 1);
  const avatarBtn = h('button.big-avatar', { type: 'button', 'aria-label': 'Cambiar avatar', onclick: () => editProfile(app) }, s.profile.avatar);
  root.appendChild(h('div.profile-head',
    avatarBtn,
    h('div', { style: { flex: 1, minWidth: '220px' } },
      h('h1.h1', s.profile.name),
      h('div.muted', `Nivel ${level}: ${levelTitle(level)}`),
      h('div', { style: { maxWidth: '320px', marginTop: '8px' } }, progressBar((s.xp - cur) / (next - cur)), h('div.tiny.faint', { style: { marginTop: '4px' } }, `${fmt(next - s.xp)} XP para el nivel ${level + 1}`)),
    ),
    h('button.btn.btn-ghost', { type: 'button', onclick: () => editProfile(app) }, 'Editar perfil'),
  ));

  // Evolución del saldo
  const chart = h('canvas.chart-box', { role: 'img', 'aria-label': 'Evolución del saldo' });
  root.appendChild(h('section.section.panel',
    h('div.section-head', h('div', h('h2.h2', 'Tu saldo'), h('p', `Máximo histórico: ${fmt(s.stats.maxBalance)} fichas`)), h('div.h2', fmt(s.balance))),
    chart,
  ));
  requestAnimationFrame(() => drawChart(chart, s.balanceHistory));

  // Estadísticas
  const st = s.stats;
  const hands = Math.max(1, st.hands);
  const items = [
    ['Manos jugadas', fmt(st.hands)],
    ['Resultado neto', fmtSigned(Math.round(st.net))],
    ['bb/100', st.hands ? (st.bbWon / hands * 100).toFixed(1).replace('.', ',') : '0'],
    ['VPIP', pct(st.vpip / hands, 0)],
    ['PFR', pct(st.pfr / hands, 0)],
    ['3-bet', pct(st.threeBet / hands, 1)],
    ['Botes ganados', fmt(st.won)],
    ['Ves el flop', pct(st.sawFlop / hands, 0)],
    ['Ganas en showdown', st.showdowns ? pct(st.showdownsWon / st.showdowns, 0) : '—'],
    ['Bote más grande', fmt(st.biggestPot)],
    ['Robos de ciegas', fmt(st.steals)],
    ['Sit & Go jugados', fmt(st.sngPlayed)],
    ['Sit & Go ganados', fmt(st.sngWon)],
    ['Premios en torneos', fmt(st.sngPrizes)],
    ['Manos online', fmt(st.onlineHands)],
    ['Aciertos en entrenadores', st.trainerAnswered ? `${fmt(st.trainerCorrect)} (${pct(st.trainerCorrect / st.trainerAnswered, 0)})` : '0'],
    ['Mejor mano', st.bestHandName || '—'],
  ];
  const grid = h('div.stats', items.map(([k, v]) => h('div.stat' + (k === 'Mejor mano' ? '.wide' : ''), h('div.v', v), h('div.k', k))));
  const cats = h('div.stats', { style: { marginTop: '12px' } }, CAT_NAMES.map((n, i) => h('div.stat', h('div.v', fmt(st.cats[i] || 0)), h('div.k', n + ' en showdown'))).reverse().slice(0, 9));
  root.appendChild(h('section.section',
    h('div.section-head', h('div', h('h2.h2', 'Estadísticas'), h('p', 'VPIP: manos en las que pones fichas voluntariamente antes del flop. PFR: manos en las que subes antes del flop. Un jugador sólido suele estar entre 20–28 % de VPIP y 15–22 % de PFR en mesas de seis.'))),
    grid, cats,
  ));

  // Logros
  const achs = h('div.achs');
  let unlocked = 0;
  for (const a of ACHIEVEMENTS) {
    const on = !!s.achievements[a.id];
    if (on) unlocked++;
    achs.appendChild(h('div.ach' + (on ? '.on' : ''), h('span.i', a.icon), h('div', h('strong', a.name), h('span', a.desc + (a.reward ? ` Premio: ${fmt(a.reward)}.` : '')))));
  }
  root.appendChild(h('section.section',
    h('div.section-head', h('div', h('h2.h2', 'Logros'), h('p', `${unlocked} de ${ACHIEVEMENTS.length} desbloqueados.`))),
    achs,
  ));

  // Ajustes
  root.appendChild(renderSettings(app));
}

function drawChart(canvas, hist) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(100, rect.width * dpr);
  canvas.height = Math.max(60, rect.height * dpr);
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, pad = 8 * dpr;
  ctx.clearRect(0, 0, W, H);
  const pts = (hist || []).slice(-120);
  if (pts.length < 2) {
    ctx.fillStyle = 'rgba(174,186,179,.7)';
    ctx.font = `${13 * dpr}px Manrope, sans-serif`;
    ctx.fillText('Juega unas manos para ver tu evolución.', pad, H / 2);
    return;
  }
  const vals = pts.map((p) => p.v);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (max - min < 1) { max += 1; min -= 1; }
  const x = (i) => pad + (i / (pts.length - 1)) * (W - pad * 2);
  const y = (v) => H - pad - ((v - min) / (max - min)) * (H - pad * 2);
  ctx.strokeStyle = 'rgba(232,220,190,.08)';
  ctx.lineWidth = 1;
  for (let k = 0; k <= 3; k++) { const yy = pad + (k / 3) * (H - pad * 2); ctx.beginPath(); ctx.moveTo(pad, yy); ctx.lineTo(W - pad, yy); ctx.stroke(); }
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(200,162,78,.35)');
  grad.addColorStop(1, 'rgba(200,162,78,0)');
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(x(i), y(p.v)) : ctx.moveTo(x(i), y(p.v))));
  ctx.lineTo(x(pts.length - 1), H - pad); ctx.lineTo(x(0), H - pad); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(x(i), y(p.v)) : ctx.moveTo(x(i), y(p.v))));
  ctx.strokeStyle = '#E8CB84'; ctx.lineWidth = 2 * dpr; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.fillStyle = '#E8CB84';
  ctx.beginPath(); ctx.arc(x(pts.length - 1), y(vals[vals.length - 1]), 3.5 * dpr, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(174,186,179,.8)';
  ctx.font = `${11 * dpr}px Manrope, sans-serif`;
  ctx.fillText(fmt(max), pad, pad + 10 * dpr);
  ctx.fillText(fmt(min), pad, H - pad - 2 * dpr);
}

function editProfile(app) {
  const s = store.get();
  let avatar = s.profile.avatar;
  const name = h('input.input', { type: 'text', maxlength: '18', value: s.profile.name, 'aria-label': 'Nombre' });
  const grid = h('div.avatar-grid', AVATAR_CHOICES.map((a) => {
    const b = h('button', { type: 'button', 'aria-pressed': String(a === avatar), 'aria-label': 'Avatar ' + a }, a);
    b.addEventListener('click', () => { avatar = a; grid.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); });
    return b;
  }));
  modal({
    title: 'Editar perfil',
    body: h('div.stack', h('div.field', h('label', 'Nombre en la mesa'), name, h('span.hint', 'Lo verán los demás jugadores en las salas online.')), h('div.field', h('span.label', 'Avatar'), grid)),
    actions: [
      { label: 'Cancelar' },
      { label: 'Guardar', primary: true, onClick: () => {
        const n = cleanName(name.value);
        if (n.length < 2) { toast('El nombre necesita al menos 2 caracteres', { type: 'error' }); return false; }
        store.update((st) => { st.profile.name = n; st.profile.avatar = avatar; });
        app.rerender();
      } },
    ],
  });
}

export function renderSettings(app) {
  const s = store.get().settings;
  const set = (k, v) => { store.setting(k, v); app.applySettings(); };
  const felts = [['petroleo', '#0F4A45', 'Petróleo'], ['clasico', '#1F5A36', 'Clásico'], ['noche', '#143A5C', 'Noche'], ['burdeos', '#5A1A22', 'Burdeos'], ['grafito', '#2C3333', 'Grafito']];
  const backs = [['burdeos', '#5E1A24', 'Burdeos'], ['petroleo', '#0F4A45', 'Petróleo'], ['laton', '#C8A24E', 'Latón']];
  const swatches = (list, cur, key) => {
    const w = h('div.swatches', { style: { paddingBottom: '20px' } });
    for (const [v, color, label] of list) {
      const b = h('button.swatch', { type: 'button', 'aria-pressed': String(cur === v), 'aria-label': label, style: { background: color } }, h('span', label));
      b.addEventListener('click', () => { set(key, v); w.querySelectorAll('.swatch').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); });
      w.appendChild(b);
    }
    return w;
  };
  const vol = h('input.range', { type: 'range', min: '0', max: '1', step: '0.05', value: String(s.volume), 'aria-label': 'Volumen' });
  vol.style.setProperty('--fill', s.volume * 100 + '%');
  vol.addEventListener('input', () => { vol.style.setProperty('--fill', vol.value * 100 + '%'); store.setting('volume', Number(vol.value)); });
  vol.addEventListener('change', () => play('chips'));
  const sec = h('section.section',
    h('div.section-head', h('div', h('h2.h2', 'Ajustes'))),
    h('div.grid-2', { style: { alignItems: 'start' } },
      h('div.panel',
        h('div.h3', 'Mesa'),
        toggleRow({ title: 'Ayuda de juego', desc: 'Muestra tu mano, tu equity aproximada y las pot odds', checked: s.showOdds, onChange: (v) => { set('showOdds', v); set('showHandName', v); } }),
        toggleRow({ title: 'Baraja de cuatro colores', desc: 'Diamantes azules y tréboles verdes', checked: s.fourColor, onChange: (v) => set('fourColor', v) }),
        toggleRow({ title: 'Confirmar all-in', desc: 'Pide confirmación antes de jugarte más de 25 ciegas', checked: s.confirmAllIn, onChange: (v) => set('confirmAllIn', v) }),
        toggleRow({ title: 'Vibración', desc: 'Aviso en el móvil cuando te toca', checked: s.haptics, onChange: (v) => set('haptics', v) }),
        toggleRow({ title: 'Reducir animaciones', checked: s.reducedMotion, onChange: (v) => set('reducedMotion', v) }),
        h('div.field', { style: { marginTop: '12px' } }, h('span.label', 'Tiempo por turno contra bots'),
          segmented([{ value: 15, label: '15 s' }, { value: 25, label: '25 s' }, { value: 45, label: '45 s' }, { value: 0, label: 'Sin límite' }], s.turnTime, (v) => set('turnTime', v))),
        h('div.field', { style: { marginTop: '12px' } }, h('span.label', 'Velocidad de los bots'),
          segmented([{ value: 0.6, label: 'Pausada' }, { value: 1, label: 'Normal' }, { value: 1.8, label: 'Rápida' }], s.speed, (v) => set('speed', v))),
      ),
      h('div.panel',
        h('div.h3', 'Aspecto y sonido'),
        h('div.field', { style: { marginTop: '10px' } }, h('span.label', 'Tapete'), swatches(felts, s.felt, 'felt')),
        h('div.field', h('span.label', 'Dorso de las cartas'), swatches(backs, s.cardBack, 'cardBack')),
        toggleRow({ title: 'Sonido', checked: s.sound, onChange: (v) => set('sound', v) }),
        h('div.field', h('span.label', 'Volumen'), vol),
      ),
    ),
    h('div.panel', { style: { marginTop: '16px' } },
      h('div.h3', 'Tus datos'),
      h('p.small.muted', 'Todo se guarda en este navegador. Exporta una copia para llevarte tu progreso a otro dispositivo.'),
      h('div.row',
        h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: async () => { const code = store.exportData(); if (await copyText(code)) toast('Copia de seguridad copiada al portapapeles', { type: 'success' }); else modal({ title: 'Copia de seguridad', body: h('textarea.input', { rows: '6', readonly: true }, code) }); } }, svgIcon('i-download'), 'Exportar progreso'),
        h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => importDialog(app) }, svgIcon('i-upload'), 'Importar progreso'),
        h('button.btn.btn-danger.btn-sm', { type: 'button', onclick: async () => { if (await confirmDialog('¿Borrar todo?', 'Se perderán tu saldo, estadísticas, logros e historial en este navegador.', { ok: 'Borrar todo', danger: true })) { store.reset(); app.applySettings(); app.navigate('#/'); toast('Progreso reiniciado'); } } }, svgIcon('i-trash'), 'Empezar de cero'),
      ),
    ),
    h('div.panel', { style: { marginTop: '16px' } },
      h('div.h3', 'Juego limpio y privacidad'),
      h('p.small.muted', 'Las fichas de la app son ficticias: no se pueden comprar ni canjear por dinero. Las barajas se mezclan con el generador criptográfico del navegador. En las salas online la mesa la ejecuta el navegador del anfitrión y los datos viajan directamente entre jugadores (WebRTC); un servidor público de PeerJS sólo pone en contacto a los navegadores. Al terminar cada mano, los invitados verifican que la baraja coincide con el hash SHA-256 que el anfitrión publicó antes de repartir.'),
    ),
  );
  return sec;
}

function importDialog(app) {
  const ta = h('textarea.input', { rows: '6', placeholder: 'Pega aquí tu copia de seguridad', 'aria-label': 'Copia de seguridad' });
  modal({
    title: 'Importar progreso',
    body: h('div.stack', h('p', 'Esto sustituirá el progreso actual de este navegador.'), ta),
    actions: [
      { label: 'Cancelar' },
      { label: 'Importar', primary: true, onClick: () => {
        try { store.importData(ta.value); app.applySettings(); toast('Progreso importado', { type: 'success' }); app.navigate('#/perfil'); app.rerender(); }
        catch (e) { toast('No se pudo importar: ' + e.message, { type: 'error' }); return false; }
      } },
    ],
  });
}
