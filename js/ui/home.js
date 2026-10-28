// Lobby: mesas contra bots, torneos, partidas privadas, bono diario y misiones.
import { h, svgIcon, fmt, fmtShort, toast, modal } from '../util.js';
import { store } from '../store.js';
import { CASH_TABLES, SNG_TABLES } from '../data/tables.js';
import { DAILY_BONUS, levelFromXp, xpForLevel, levelTitle, BAILOUT_AMOUNT, BAILOUT_COOLDOWN_MS } from '../data/progress.js';
import { LocalSession } from '../game/session.js';
import { sngPayouts } from '../game/runner.js';
import { buyInDialog } from './table.js';
import { joinBox } from './online.js';
import { pips, progressBar } from './components.js';
import { play } from '../audio.js';
import { LESSONS } from '../data/lessons.js';

function greeting() {
  const hr = new Date().getHours();
  if (hr < 6) return 'Buenas noches';
  if (hr < 14) return 'Buenos días';
  if (hr < 21) return 'Buenas tardes';
  return 'Buenas noches';
}

function miniFelt(name, seats, filled) {
  const dots = h('div.seats-dots');
  for (let i = 0; i < seats; i++) {
    const a = Math.PI / 2 + (i * 2 * Math.PI) / seats;
    const d = h('i' + (i > 0 && i <= filled ? '.full' : ''));
    d.style.left = 50 + 47 * Math.cos(a) + '%';
    d.style.top = 50 + 44 * Math.sin(a) + '%';
    dots.appendChild(d);
  }
  return h('div.mini-felt', h('div.in', h('div.name', name)), dots);
}

export function renderHome(root, app) {
  const s = store.get();
  const level = levelFromXp(s.xp);
  const cur = xpForLevel(level), next = xpForLevel(level + 1);
  root.appendChild(h('div.greet',
    h('h1.h1', h('span', greeting() + ','), s.profile.name),
    h('div.level-box',
      h('div.row', h('strong', `Nivel ${level}: ${levelTitle(level)}`), h('span.faint', `${fmt(s.xp - cur)} / ${fmt(next - cur)} XP`)),
      progressBar((s.xp - cur) / (next - cur)),
    ),
  ));

  // Bono diario
  const daily = store.dailyStatus();
  if (daily.available) {
    const days = h('div.days');
    for (let i = 0; i < 7; i++) {
      const idx = daily.streak % 7;
      days.appendChild(h('span' + (i < idx ? '.done' : i === idx ? '.today' : ''), { title: fmt(DAILY_BONUS[i]) }, `D${i + 1}`));
    }
    const amount = DAILY_BONUS[daily.streak % 7];
    const banner = h('div.daily-banner',
      h('div', { style: { flex: '1', minWidth: '200px' } }, h('strong', `Bono diario: ${fmt(amount)} fichas`), h('div.small.muted', daily.streak > 0 ? `Llevas ${daily.streak} ${daily.streak === 1 ? 'día' : 'días'} seguidos. Si fallas un día, la racha vuelve a empezar.` : 'Vuelve cada día: el premio crece con la racha.')),
      days,
      h('button.btn.btn-primary', { type: 'button', onclick: () => {
        const got = store.claimDaily(DAILY_BONUS);
        if (got) { play('success'); toast(`+${fmt(got)} fichas de bono diario`, { type: 'gold', icon: '🎁' }); banner.remove(); }
      } }, svgIcon('i-gift'), 'Recoger'),
    );
    root.appendChild(banner);
  }

  // Rescate si no hay saldo
  const minTable = Math.min(...CASH_TABLES.map((t) => t.minBuyIn));
  if (s.balance < minTable) {
    const wait = BAILOUT_COOLDOWN_MS - (Date.now() - (s.bailout.last || 0));
    root.appendChild(h('div.notice', { style: { marginBottom: '24px' } }, svgIcon('i-info'),
      h('div', { style: { flex: 1 } },
        h('strong', 'Te has quedado corto de fichas. '),
        wait <= 0 ? 'Puedes pedir un rescate de ' + fmt(BAILOUT_AMOUNT) + ' fichas.' : 'Gira la ruleta o vuelve en un rato para pedir un rescate.'),
      wait <= 0 ? h('button.btn.btn-primary.btn-sm', { type: 'button', onclick: () => {
        store.update((st) => { st.bailout.last = Date.now(); });
        store.addBalance(BAILOUT_AMOUNT, 'rescate');
        toast(`+${fmt(BAILOUT_AMOUNT)} fichas`, { type: 'gold' });
        app.rerender();
      } }, 'Pedir rescate') : h('a.btn.btn-ghost.btn-sm', { href: '#/ruleta' }, 'Ir a la ruleta'),
    ));
  }

  // Mesas de cash
  const cash = h('div.tables');
  for (const t of CASH_TABLES) {
    const locked = s.balance < t.minBuyIn;
    cash.appendChild(h('article.ttile' + (locked ? '.locked' : ''),
      miniFelt(t.name, t.maxSeats, t.bots),
      h('div.meta',
        h('div.blinds', `${fmt(t.sb)}/${fmt(t.bb)}`, h('small', `${t.maxSeats} jugadores, entrada de ${fmtShort(t.minBuyIn)} a ${fmtShort(t.maxBuyIn)}`)),
        pips(t.level + 1),
      ),
      h('p.desc', t.desc),
      locked
        ? h('button.btn.btn-ghost.btn-block', { type: 'button', disabled: true }, svgIcon('i-lock'), `Necesitas ${fmt(t.minBuyIn)}`)
        : h('button.btn.btn-primary.btn-block', { type: 'button', onclick: () => sitCash(t, app) }, 'Sentarse'),
    ));
  }
  root.appendChild(h('section.section',
    h('div.section-head', h('div', h('h2.h2', 'Mesas'), h('p', 'Cash game contra bots: entra y sal cuando quieras y llévate tu stack.'))),
    cash,
  ));

  // Torneos
  const sngs = h('div.tables');
  for (const t of SNG_TABLES) {
    const pays = sngPayouts(t.players);
    const pool = t.buyIn * t.players;
    const locked = s.balance < t.buyIn;
    sngs.appendChild(h('article.ttile' + (locked ? '.locked' : ''),
      miniFelt(t.name, t.players, t.players - 1),
      h('div.meta',
        h('div.blinds', fmt(t.buyIn), h('small', `de inscripción, ${t.players} jugadores`)),
        pips(t.level + 1),
      ),
      h('p.desc', `${t.desc} Bote de premios: ${fmt(pool)} (${pays.map((p) => Math.round(p * 100) + ' %').join(', ')}).`),
      locked
        ? h('button.btn.btn-ghost.btn-block', { type: 'button', disabled: true }, svgIcon('i-lock'), `Necesitas ${fmt(t.buyIn)}`)
        : h('button.btn.btn-felt.btn-block', { type: 'button', onclick: () => registerSng(t, app) }, 'Inscribirse'),
    ));
  }
  root.appendChild(h('section.section',
    h('div.section-head', h('div', h('h2.h2', 'Torneos Sit & Go'), h('p', 'Todos empiezan con las mismas fichas y las ciegas suben cada pocas manos. Cobran los mejores puestos.'))),
    sngs,
  ));

  // Con amigos
  root.appendChild(h('section.section',
    h('div.section-head', h('div', h('h2.h2', 'Con amigos'), h('p', 'Salas privadas online: crea una, envía el enlace de invitación y jugad desde el móvil o el ordenador.'))),
    h('div.grid-2',
      h('div.panel.stack',
        h('div.h3', 'Crear una sala'),
        h('p.muted.small', { style: { margin: 0 } }, 'Tú eres el anfitrión: eliges ciegas, asientos y quién puede entrar, y compartes un enlace con el que tus amigos se sientan con un clic.'),
        h('a.btn.btn-primary', { href: '#/online' }, svgIcon('i-users'), 'Crear sala privada'),
      ),
      h('div.panel.stack',
        h('div.h3', 'Unirse a una sala'),
        h('p.muted.small', { style: { margin: 0 } }, 'Abre el enlace de invitación que te hayan enviado, o escribe aquí el código de seis caracteres.'),
        joinBox(app),
      ),
    ),
  ));

  // Misiones y academia
  const missions = store.missions();
  const mlist = h('div');
  for (const m of missions) {
    const ready = m.progress >= m.goal && !m.claimed;
    mlist.appendChild(h('div.mission',
      h('div.grow',
        h('div', { style: { fontWeight: 700 } }, m.text),
        h('div.row', { style: { marginTop: '6px' } }, h('div', { style: { flex: 1 } }, progressBar(m.progress / m.goal)), h('span.small.faint', `${m.progress}/${m.goal}`)),
      ),
      m.claimed ? h('span.tag.ok', svgIcon('i-check'), 'Hecha')
        : ready ? h('button.btn.btn-primary.btn-sm', { type: 'button', onclick: () => { const r = store.claimMission(m.id); if (r) { play('success'); toast(`+${fmt(r)} fichas`, { type: 'gold' }); app.rerender(); } } }, `Cobrar ${fmt(m.reward)}`)
          : h('span.reward', '+' + fmt(m.reward)),
    ));
  }
  const done = Object.keys(s.academy.done).length;
  const nextLesson = LESSONS.find((l) => !s.academy.done[l.id]) || LESSONS[0];
  root.appendChild(h('section.section.grid-2',
    h('div.panel',
      h('div.section-head', { style: { marginBottom: '4px' } }, h('div', h('h2.h2', 'Misiones de hoy'), h('p', 'Se renuevan cada medianoche.'))),
      mlist,
    ),
    h('div.panel.stack',
      h('div.section-head', { style: { marginBottom: '0' } }, h('div', h('h2.h2', 'Academia'), h('p', `${done} de ${LESSONS.length} lecciones completadas.`))),
      progressBar(done / LESSONS.length),
      h('a.lesson-link', { href: '#/academia/' + nextLesson.id },
        h('span.num', String(LESSONS.indexOf(nextLesson) + 1)),
        h('div', h('h3', nextLesson.title), h('p', nextLesson.summary)),
      ),
      h('div.row', h('a.btn.btn-ghost.btn-sm', { href: '#/academia' }, svgIcon('i-book'), 'Todas las lecciones'), h('a.btn.btn-ghost.btn-sm', { href: '#/academia#entrenadores' }, svgIcon('i-target'), 'Entrenadores')),
    ),
  ));
}

async function sitCash(t, app) {
  const amt = await buyInDialog({ min: t.minBuyIn, max: t.maxBuyIn, bb: t.bb, title: `Sentarse en ${t.name}` });
  if (!amt) return;
  if (!store.spend(amt, 'entrada en mesa')) { toast('Saldo insuficiente', { type: 'error' }); return; }
  const session = new LocalSession({
    table: { name: t.name, sb: t.sb, bb: t.bb, maxSeats: t.maxSeats, mode: 'cash', minBuyIn: t.minBuyIn, maxBuyIn: t.maxBuyIn },
    buyIn: amt, bots: t.bots, botLevel: t.level,
  });
  session.start();
  app.startSession(session);
}

function registerSng(t, app) {
  const pays = sngPayouts(t.players);
  const pool = t.buyIn * t.players;
  modal({
    title: `Torneo ${t.name}`,
    body: h('div.stack',
      h('p', `Inscripción de ${fmt(t.buyIn)} fichas. Empiezas con ${fmt(t.startingStack)} fichas de torneo contra ${t.players - 1} ${t.players - 1 === 1 ? 'bot' : 'bots'}; las ciegas suben cada ${t.levelHands} manos.`),
      h('p', `Premios: ${pays.map((p, i) => `${i + 1}.º ${fmt(Math.floor(pool * p))}`).join(', ')}.`),
      h('p.small.faint', 'Si abandonas antes de terminar quedas eliminado en el puesto en el que estés.'),
    ),
    actions: [
      { label: 'Cancelar' },
      { label: `Pagar ${fmt(t.buyIn)} y jugar`, primary: true, onClick: () => {
        if (!store.spend(t.buyIn, 'inscripción torneo')) { toast('Saldo insuficiente', { type: 'error' }); return; }
        const session = new LocalSession({
          table: { name: t.name, sb: 10, bb: 20, maxSeats: t.players, mode: 'sng' },
          bots: t.players - 1, botLevel: t.level,
          sng: { buyIn: t.buyIn, startingStack: t.startingStack, levelHands: t.levelHands },
        });
        session.start();
        app.startSession(session);
      } },
    ],
  });
}
