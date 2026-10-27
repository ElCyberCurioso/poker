// Vista de la mesa. Funciona igual con una sesión local, de anfitrión o de invitado.
import { h, clear, svgIcon, fmt, toast, modal, confirmDialog, confetti, vibrate, pct, copyText, prefersReducedMotion } from '../util.js';
import { cardEl, chipStack, chipIcon, toggleRow, segmented } from './components.js';
import { play } from '../audio.js';
import { store } from '../store.js';
import { handInfo } from '../core/evaluator.js';
import { equityVsRanges } from '../core/equity.js';
import { EMOTES } from '../net/host.js';
import { BOT_STYLES } from '../core/bots.js';
import { roomPanel } from './room.js';

const ACTION_TEXT = { fold: 'No va', check: 'Pasa', call: 'Iguala', bet: 'Apuesta', raise: 'Sube a', allin: 'All-in', sb: 'Ciega pequeña', bb: 'Ciega grande' };

function seatPoints(n, portrait) {
  const rx = portrait ? 40 : 44, ry = portrait ? 43 : 40, cy = portrait ? 50 : 50.5;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = Math.PI / 2 + (i * 2 * Math.PI) / n;
    let x = 50 + rx * Math.cos(a), y = cy + ry * Math.sin(a);
    x = portrait ? Math.min(87, Math.max(13, x)) : Math.min(94, Math.max(6, x));
    pts.push({ x, y });
  }
  return pts;
}
const lerp = (a, b, t) => a + (b - a) * t;

export class TableView {
  constructor(session, { onExit }) {
    this.session = session;
    this.onExit = onExit;
    this.seatEls = [];
    this.layout = null;
    this.preact = null;
    this.raiseTo = 0;
    this.eqCache = { key: '', value: null };
    this.unread = 0;
    this.timers = new Set();
    this.lastHandId = null;
    this.dealAnim = false;
    this.revealedSeats = new Set();
    this.lastLegalKey = '';
    this.drawerTab = session.kind === 'local' ? 'log' : 'chat';
    this.logHands = [];
  }

  later(fn, ms) {
    const id = setTimeout(() => { this.timers.delete(id); fn(); }, ms);
    this.timers.add(id);
    return id;
  }

  // ---------------------------------------------------------------------
  mount(root) {
    this.root = root;
    const s = this.session;
    this.el = h('div.tscreen');
    // Barra superior
    this.titleEl = h('strong', s.tableName || 'Mesa');
    this.subEl = h('span', '');
    this.shieldEl = h('span');
    this.soundBtn = h('button.icon-btn', { type: 'button', 'aria-label': 'Sonido', title: 'Sonido', onclick: () => this.toggleSound() });
    this.chatBadge = h('span.badge', { hidden: true }, '0');
    this.chatBtn = h('button.icon-btn', { type: 'button', 'aria-label': s.kind === 'local' ? 'Registro de la mano' : 'Chat y registro', title: 'Chat y registro', onclick: () => this.toggleDrawer() }, svgIcon(s.kind === 'local' ? 'i-history' : 'i-chat'), this.chatBadge);
    const bar = h('header.tbar',
      h('button.icon-btn', { type: 'button', 'aria-label': 'Salir de la mesa', title: 'Salir de la mesa', onclick: () => this.confirmLeave() }, svgIcon('i-back')),
      h('div.title', this.titleEl, h('span', this.subEl, ' ', this.shieldEl)),
      this.soundBtn,
      this.chatBtn,
      h('button.icon-btn', { type: 'button', 'aria-label': 'Menú de la mesa', title: 'Menú', onclick: () => this.openMenu() }, svgIcon('i-more')),
    );
    this.infoEl = h('div.tinfo');
    // Mesa
    this.table = h('div.ttable');
    this.railEl = h('div.rail', h('div.felt', h('div.felt-mark', 'Poker')));
    this.boardEl = h('div.board');
    this.potEl = h('div.pot');
    this.seatsLayer = h('div');
    this.betsLayer = h('div');
    this.dealerEl = h('div.dealer-btn', { 'aria-label': 'Botón del crupier' }, 'D');
    this.table.append(this.railEl, this.boardEl, this.potEl, this.betsLayer, this.seatsLayer, this.dealerEl);
    this.stage = h('div.tstage', this.table);
    // Dock
    this.heroCards = h('div.hero-cards');
    this.helperEl = h('div.helper');
    this.actionsEl = h('div.actions');
    this.dock = h('div.tdock', h('div.hero-zone', this.heroCards, this.helperEl), this.actionsEl);
    // Cajón
    this.drawer = this.buildDrawer();
    this.reconnectEl = null;
    this.el.append(bar, this.infoEl, this.stage, this.dock, this.drawer);
    clear(root).appendChild(this.el);

    this.ro = new ResizeObserver(() => this.relayout());
    this.ro.observe(this.stage);
    this.onKey = (e) => this.handleKey(e);
    document.addEventListener('keydown', this.onKey);
    this.unsub = s.on((ev) => this.onSessionEvent(ev));
    this.unsubStore = store.onEvent((ev) => {
      if (ev.type === 'settings') this.render(this.session.view, []);
    });
    this.updateSoundBtn();
    if (s.view) this.render(s.view, []);
  }

  destroy() {
    if (this.unsub) this.unsub();
    if (this.unsubStore) this.unsubStore();
    if (this.ro) this.ro.disconnect();
    document.removeEventListener('keydown', this.onKey);
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    clearTimeout(this.ringLowTimer);
    clearInterval(this.tickTimer);
  }

  // ---------------------------------------------------------------------
  onSessionEvent(ev) {
    switch (ev.type) {
      case 'update': this.render(ev.view, ev.events || []); break;
      case 'chat': this.onChat(ev.msg); break;
      case 'busted': this.later(() => this.showRebuy(true), 900); break;
      case 'sngEnd': this.later(() => this.showSngEnd(ev), 1200); break;
      case 'closed': this.onClosed(ev.reason); break;
      case 'notice': toast(ev.text, { type: ev.error ? 'error' : 'info' }); break;
      case 'reconnecting': this.showReconnecting(true); break;
      case 'welcome': this.showReconnecting(false); if (ev.note) toast(ev.note); break;
      case 'deck': this.updateShield(ev.status); break;
      case 'netStatus':
        if (ev.status.type === 'signal-lost') toast('Conexión con el servidor de emparejamiento perdida: la partida sigue, pero nadie nuevo podrá unirse hasta que se recupere', { type: 'error', ms: 5000 });
        break;
      default: break;
    }
  }

  // ---------------------------------------------------------------------
  relayout() {
    const r = this.stage.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    const portrait = r.width / r.height < 0.95;
    const aspect = portrait ? 0.64 : 1.78;
    let w = Math.min(r.width * 0.99, r.height * (portrait ? 0.98 : 0.93) * aspect);
    const hgt = w / aspect;
    const s = portrait ? w / 400 : w / 1000;
    this.table.style.width = w + 'px';
    this.table.style.height = hgt + 'px';
    this.table.style.setProperty('--s', s.toFixed(4));
    this.el.dataset.layout = portrait ? 'portrait' : 'landscape';
    const inset = portrait ? { t: 8, b: 9, l: 11, r: 11 } : { t: 11, b: 12, l: 8, r: 8 };
    Object.assign(this.railEl.style, { top: inset.t + '%', bottom: inset.b + '%', left: inset.l + '%', right: inset.r + '%' });
    this.portrait = portrait;
    this.scale = s;
    this.layoutKey = null; // fuerza recolocar asientos
    if (this.session.view) this.render(this.session.view, []);
  }

  anchorSeat(view) {
    return view.you >= 0 ? view.you : 0;
  }

  placeSeats(view) {
    const n = view.seats.length;
    const anchor = this.anchorSeat(view);
    const key = `${n}|${anchor}|${this.portrait}`;
    if (key === this.layoutKey) return;
    this.layoutKey = key;
    const pts = seatPoints(n, this.portrait);
    this.points = [];
    while (this.seatEls.length > n) { const e = this.seatEls.pop(); e.root.remove(); e.bet.remove(); }
    for (let i = 0; i < n; i++) {
      const disp = (i - anchor + n) % n;
      const p = pts[disp];
      this.points[i] = p;
      if (!this.seatEls[i]) this.seatEls[i] = this.makeSeat(i);
      const se = this.seatEls[i];
      se.root.style.left = p.x + '%';
      se.root.style.top = p.y + '%';
      let bx, by;
      if (this.portrait) {
        // En vertical, las apuestas de los laterales se desplazan sobre todo en horizontal para no tapar las placas
        const side = Math.abs(p.x - 50) > 10;
        bx = lerp(p.x, 50, side ? 0.52 : 0.3);
        by = lerp(p.y, 48, side ? 0.12 : 0.32);
      } else {
        bx = lerp(p.x, 50, 0.42);
        by = lerp(p.y, 48, 0.42);
      }
      se.betPos = { x: bx, y: by };
      se.bet.style.left = bx + '%';
      se.bet.style.top = by + '%';
      se.side = p.x > 52 ? 'side-r' : '';
      se.root.classList.toggle('side-r', !!se.side);
    }
  }

  makeSeat(i) {
    const root = h('div.seat', { dataset: { seat: String(i) } });
    const bet = h('div.bet', { hidden: true });
    this.seatsLayer.appendChild(root);
    this.betsLayer.appendChild(bet);
    root.addEventListener('click', () => this.onSeatClick(i));
    return { root, bet, sig: '', cardsSig: '', betAmt: 0 };
  }

  // Construye el contenido de un asiento cuando cambia su "firma".
  renderSeat(i, p, view) {
    const se = this.seatEls[i];
    const h0 = view.hand;
    const isTurn = h0 && h0.phase === 'betting' && h0.toAct === i;
    const result = h0 && h0.result;
    const winner = result && h0.phase === 'done' && result.winners && result.winners.includes(i);
    if (!p) {
      const canSit = this.session.kind === 'client' && view.you < 0 && !this.session.myId;
      const sig = 'empty|' + canSit;
      if (se.sig !== sig) {
        se.sig = sig;
        se.cardsSig = '';
        se.root.className = 'seat empty';
        clear(se.root).appendChild(canSit
          ? h('button.seat-empty-btn', { type: 'button', 'aria-label': 'Sentarse aquí' }, 'Sentarse')
          : h('div.seat-empty-btn', 'Libre'));
      }
      return;
    }
    const me = i === view.you;
    const cls = ['seat'];
    if (se.side) cls.push(se.side);
    if (me) cls.push('me');
    if (p.folded) cls.push('folded');
    if (p.sittingOut) cls.push('out');
    if (!p.connected && !p.isBot) cls.push('offline');
    if (isTurn) cls.push('turn');
    if (winner) cls.push('winner');
    const pos = p.inHand && p.position ? p.position : '';
    const sig = [p.id, p.name, p.avatar, pos, p.isBot, p.botStyle].join('|');
    if (se.sig !== sig) {
      se.sig = sig;
      se.cardsSig = '';
      clear(se.root);
      se.ringFg = null;
      const ns = 'http://www.w3.org/2000/svg';
      const ring = document.createElementNS(ns, 'svg');
      ring.setAttribute('class', 'ring');
      ring.setAttribute('viewBox', '0 0 64 64');
      const bg = document.createElementNS(ns, 'circle');
      bg.setAttribute('class', 'bg'); bg.setAttribute('cx', '32'); bg.setAttribute('cy', '32'); bg.setAttribute('r', '30');
      const fg = document.createElementNS(ns, 'circle');
      fg.setAttribute('class', 'fg'); fg.setAttribute('cx', '32'); fg.setAttribute('cy', '32'); fg.setAttribute('r', '30');
      fg.style.strokeDasharray = String(2 * Math.PI * 30);
      fg.style.strokeDashoffset = String(2 * Math.PI * 30);
      ring.append(bg, fg);
      se.ringFg = fg;
      se.hole = h('div.hole');
      se.avatar = h('div.avatar', { 'aria-hidden': 'true' }, p.avatar || '🙂');
      se.nameEl = h('div.pname', p.name);
      se.stackEl = h('div.pstack');
      se.handNameEl = h('div.hand-name', { hidden: true });
      se.posTag = pos ? h('span.ptag', pos) : null;
      const botTag = p.isBot ? h('span.ptag.bot', { title: BOT_STYLES[p.botStyle] ? BOT_STYLES[p.botStyle].label + ': ' + BOT_STYLES[p.botStyle].desc : 'Bot' }, BOT_STYLES[p.botStyle] ? BOT_STYLES[p.botStyle].label : 'Bot') : null;
      se.plate = h('div.plate' + (botTag ? '.has-bot' : ''), se.nameEl, se.stackEl, botTag);
      se.root.append(se.hole, h('div.avatar-wrap', se.avatar, ring, se.posTag), se.plate, se.handNameEl);
      se.root.setAttribute('aria-label', `${p.name}${p.isBot ? ' (bot)' : ''}`);
    }
    se.root.className = cls.join(' ');
    const stackTxt = p.allIn && p.inHand && !(h0 && h0.phase === 'done') ? 'All-in' : fmt(p.stack);
    if (se.stackEl.textContent !== stackTxt) se.stackEl.textContent = stackTxt;
    // Nombre de la mano en el showdown
    if (p.handName && h0 && h0.phase === 'done' && !me) { se.handNameEl.hidden = false; se.handNameEl.textContent = p.handName; }
    else se.handNameEl.hidden = true;
    // Cartas
    const cards = p.cards || null;
    const shown = cards && cards.length && cards[0] >= 0;
    const csig = cards ? cards.join(',') + (p.folded ? 'f' : '') : '';
    if (se.cardsSig !== csig) {
      const prev = se.cardsSig;
      se.cardsSig = csig;
      clear(se.hole);
      se.hole.className = 'hole' + (shown ? ' shown' : '');
      if (cards && !(p.folded && !shown)) {
        const reveal = shown && prev && prev.startsWith('-1');
        cards.forEach((c, k) => {
          const el = cardEl(c, { anim: reveal ? 'anim-reveal' : (this.dealAnim && !shown ? 'anim-deal' : '') });
          if (this.dealAnim && !shown) this.setDealVector(el, i, k);
          se.hole.appendChild(el);
        });
        if (reveal) play('flip');
      }
    }
  }

  setDealVector(el, seat, k) {
    const p = this.points[seat];
    if (!p) return;
    const rect = this.table.getBoundingClientRect();
    const dx = ((50 - p.x) / 100) * rect.width;
    const dy = ((45 - p.y) / 100) * rect.height;
    el.style.setProperty('--fx', dx + 'px');
    el.style.setProperty('--fy', dy + 'px');
    const order = this.dealOrder ? this.dealOrder.indexOf(seat) : 0;
    const n = this.dealOrder ? this.dealOrder.length : 1;
    el.style.animationDelay = ((k * n + Math.max(0, order)) * 70) + 'ms';
  }

  // ---------------------------------------------------------------------
  render(view, events) {
    if (!view || !this.el) return;
    if (!this.scale) {
      // Primer render antes de medir: relayout() fija la escala y vuelve a llamar a render().
      if (this.stage.getBoundingClientRect().width) this.relayout();
      return;
    }
    this.view = view;
    this.placeSeats(view);
    this.processEvents(view, events);
    this.syncHeader(view);
    view.seats.forEach((p, i) => this.renderSeat(i, p, view));
    this.syncBets(view);
    this.syncBoard(view);
    this.syncPot(view);
    this.syncDealer(view);
    this.syncTurn(view);
    this.syncHero(view);
    this.syncHelper(view);
    this.syncActions(view);
    this.dealAnim = false;
  }

  processEvents(view, events) {
    for (const e of events) {
      switch (e.type) {
        case 'handStart':
          this.lastHandId = e.handId;
          this.dealOrder = e.order || [];
          this.clearHandVisuals();
          this.preact = null;
          this.logHands.push({ number: e.number, lines: [] });
          if (this.logHands.length > 8) this.logHands.shift();
          break;
        case 'deal':
          this.dealAnim = !prefersReducedMotion();
          this.dealOrder = e.seats || this.dealOrder;
          for (let k = 0; k < Math.min(6, (e.seats || []).length * 2); k++) this.later(() => play('card'), k * 70);
          break;
        case 'post':
          play('chip');
          this.logLine(view, e.seat, e.kind === 'ante' ? 'ante' : e.kind, e.amount);
          break;
        case 'action': {
          const se = this.seatEls[e.seat];
          let txt = ACTION_TEXT[e.action] || e.action;
          if (e.action === 'call') txt += ' ' + fmt(e.amount);
          if (e.action === 'bet') txt += ' ' + fmt(e.to);
          if (e.action === 'raise') txt += ' ' + fmt(e.to);
          if (e.action === 'allin') txt = 'All-in ' + fmt(e.to || e.amount);
          if (se) this.bubble(se, txt, e.action);
          play(e.action === 'fold' ? 'fold' : e.action === 'check' ? 'check' : e.action === 'allin' ? 'allin' : 'chip');
          this.logLine(view, e.seat, e.action, e.amount, e.to);
          break;
        }
        case 'collect':
          this.animateCollect();
          break;
        case 'street':
          this.newBoardCards = new Set(e.cards);
          this.logStreet(e.street, e.board);
          break;
        case 'return':
          this.logLine(view, e.seat, 'return', e.amount);
          break;
        case 'reveal':
          if (e.reason === 'allin') toast('¡All-in! Se muestran las cartas', { ms: 1800 });
          break;
        case 'handEnd':
          this.onHandEnd(view, e.result);
          break;
        case 'emote': {
          const se = this.seatEls[e.seat];
          if (se) { const em = h('div.emote', e.emoji); se.root.appendChild(em); this.later(() => em.remove(), 2500); }
          break;
        }
        case 'levelUp':
          toast(`Nivel ${e.level}: ciegas ${fmt(e.sb)}/${fmt(e.bb)}${e.ante ? ' · ante ' + fmt(e.ante) : ''}`, { icon: '⏫' });
          break;
        case 'blinds':
          toast(`Ciegas ${fmt(e.sb)}/${fmt(e.bb)}`);
          break;
        case 'eliminated':
          if (e.seat !== view.you) toast(`${e.name} queda eliminado (${e.place}.º)`, { ms: 2500 });
          break;
        case 'sitout':
          if (e.seat === view.you) toast('Te hemos marcado como ausente por inactividad', { type: 'error' });
          break;
        case 'rebuy':
          play('chips');
          break;
        case 'pause':
          toast(e.paused ? 'Partida en pausa' : 'La partida continúa');
          break;
        case 'sngStart':
          toast('¡Empieza el torneo!', { icon: '🏁' });
          break;
        case 'commit':
          this.commitShown = true;
          break;
        default: break;
      }
    }
  }

  clearHandVisuals() {
    clear(this.boardEl);
    this.boardSig = '';
    this.hlCards = null;
    this.table.querySelectorAll('.result-banner, .win-amt, .flyer').forEach((e) => e.remove());
    for (const se of this.seatEls) { se.cardsSig = '___'; se.betAmt = 0; }
    this.heroSig = '';
    this.eqCache = { key: '', value: null };
  }

  bubble(se, text, kind) {
    se.root.querySelectorAll('.bubble').forEach((b) => b.remove());
    const b = h('div.bubble.' + kind, text);
    se.root.appendChild(b);
    this.later(() => b.remove(), 1900);
  }

  // Mueve visualmente las apuestas hacia el bote.
  animateCollect() {
    const potRect = this.potEl.getBoundingClientRect();
    const tRect = this.table.getBoundingClientRect();
    if (!tRect.width) return;
    let any = false;
    for (const se of this.seatEls) {
      if (!se.bet || se.bet.hidden || !se.betAmt) continue;
      any = true;
      const clone = se.bet.cloneNode(true);
      clone.classList.remove('pop');
      clone.classList.add('flyer');
      this.table.appendChild(clone);
      se.bet.hidden = true;
      se.betAmt = 0;
      const tx = ((potRect.left + potRect.width / 2 - tRect.left) / tRect.width) * 100;
      const ty = ((potRect.top + potRect.height / 2 - tRect.top) / tRect.height) * 100;
      requestAnimationFrame(() => {
        clone.style.left = tx + '%';
        clone.style.top = ty + '%';
        clone.style.opacity = '0';
      });
      this.later(() => clone.remove(), 600);
    }
    if (any) play('chips');
  }

  onHandEnd(view, result) {
    if (!result) return;
    const potRect = this.potEl.getBoundingClientRect();
    const tRect = this.table.getBoundingClientRect();
    const you = view.you;
    let heroWon = 0;
    for (const [seatStr, amt] of Object.entries(result.payouts || {})) {
      const seat = Number(seatStr);
      const se = this.seatEls[seat];
      if (!se) continue;
      if (seat === you) heroWon += amt;
      // Fichas volando del bote al ganador
      if (tRect.width) {
        const fly = h('div.flyer', chipStack(amt, view.hand ? view.hand.bb : 20));
        fly.style.left = ((potRect.left + potRect.width / 2 - tRect.left) / tRect.width) * 100 + '%';
        fly.style.top = ((potRect.top + potRect.height / 2 - tRect.top) / tRect.height) * 100 + '%';
        fly.style.transform = 'translate(-50%,-50%)';
        fly.style.transition = 'left .7s var(--ease-out), top .7s var(--ease-out), opacity .7s';
        this.table.appendChild(fly);
        const p = this.points[seat];
        this.later(() => { fly.style.left = p.x + '%'; fly.style.top = p.y + '%'; }, 450);
        this.later(() => { fly.style.opacity = '0'; }, 1100);
        this.later(() => fly.remove(), 1900);
      }
      this.later(() => {
        const w = h('div.win-amt', '+' + fmt(amt));
        se.root.appendChild(w);
        this.later(() => w.remove(), 2700);
      }, 900);
    }
    // Pancarta con el resultado del bote principal
    const main = result.pots && result.pots[0];
    if (main) {
      const names = main.winners.map((s) => (view.seats[s] ? view.seats[s].name : '?'));
      const total = result.pots.reduce((a, p) => a + p.amount, 0);
      let text;
      if (main.winners.length > 1) text = `Bote dividido: ${names.join(' y ')}`;
      else text = `${names[0]} gana ${fmt(total)}`;
      if (result.showdown && main.handName) text += ` con ${main.handName.charAt(0).toLowerCase() + main.handName.slice(1)}`;
      const banner = h('div.result-banner', text);
      this.later(() => this.table.appendChild(banner), 500);
      this.later(() => banner.remove(), 4200);
      this.logResult(view, result);
    }
    // Resaltar la mejor combinación del ganador del bote principal
    if (result.showdown && result.reveals && main) {
      const rv = result.reveals.find((r) => r.seat === main.winners[0]);
      if (rv && rv.best) this.hlCards = new Set(rv.best);
    }
    if (heroWon > 0) {
      play('win');
      vibrate([30, 40, 30]);
      if (view.hand && heroWon >= view.hand.bb * 60) confetti(120);
    } else if (you >= 0 && view.seats[you] && view.seats[you].inHand && !view.seats[you].folded && result.showdown) {
      play('lose');
    }
  }

  // ---------------------------------------------------------------------
  syncHeader(view) {
    const hd = view.hand;
    const cfg = view.config;
    const parts = [];
    const sb = hd ? hd.sb : cfg.smallBlind, bb = hd ? hd.bb : cfg.bigBlind;
    parts.push(`Ciegas ${fmt(sb)}/${fmt(bb)}`);
    if (hd && hd.ante) parts.push(`ante ${fmt(hd.ante)}`);
    if (view.handNumber) parts.push(`mano ${view.handNumber}`);
    this.subEl.textContent = parts.join(', ');
    this.titleEl.textContent = this.session.tableName || cfg.name;
    // Etiquetas informativas
    const tags = [];
    if (view.sng) {
      const sng = view.sng;
      if (!sng.started) tags.push(h('span.tag.brass', 'Torneo por empezar'));
      else {
        tags.push(h('span.tag.brass', `Nivel ${sng.level}`));
        tags.push(h('span.tag', sng.handsToNext > 0 ? `Sube en ${sng.handsToNext} ${sng.handsToNext === 1 ? 'mano' : 'manos'}` : 'Último nivel'));
        tags.push(h('span.tag', `Quedan ${view.seats.filter(Boolean).length} de ${sng.entrants}`));
      }
    }
    if (this.session.kind !== 'local' && this.session.room) tags.push(h('span.tag', 'Sala ' + this.session.room.code));
    if (view.paused) tags.push(h('span.tag.bad', 'En pausa'));
    const sig = tags.map((t) => t.textContent).join('|');
    if (sig !== this.infoSig) { this.infoSig = sig; clear(this.infoEl).append(...tags); }
  }

  updateShield(status) {
    clear(this.shieldEl);
    if (!status) return;
    this.shieldEl.className = 'shield' + (status.ok ? '' : ' bad');
    this.shieldEl.title = status.ok ? 'La baraja de la última mano coincide con el compromiso SHA-256 publicado antes de repartir' : status.reason;
    this.shieldEl.append(svgIcon('i-shield'), status.ok ? 'verificada' : 'no verificada');
    if (!status.ok) toast('Atención: ' + status.reason, { type: 'error', ms: 6000 });
  }

  syncBets(view) {
    const hd = view.hand;
    view.seats.forEach((p, i) => {
      const se = this.seatEls[i];
      const amt = p && hd && hd.phase !== 'done' ? p.bet : 0;
      if (amt === se.betAmt) return;
      const grew = amt > se.betAmt;
      se.betAmt = amt;
      if (!amt) { se.bet.hidden = true; return; }
      se.bet.hidden = false;
      clear(se.bet).append(chipStack(amt, hd.bb), h('span.amt', fmt(amt)));
      se.bet.style.left = se.betPos.x + '%';
      se.bet.style.top = se.betPos.y + '%';
      se.bet.style.opacity = '';
      if (grew) { se.bet.classList.remove('pop'); void se.bet.offsetWidth; se.bet.classList.add('pop'); }
    });
  }

  syncBoard(view) {
    const board = view.hand ? view.hand.board : [];
    const hl = this.hlCards;
    const sig = board.join(',') + '|' + (hl ? [...hl].join(',') : '');
    if (sig === this.boardSig) return;
    this.boardSig = sig;
    clear(this.boardEl);
    let k = 0;
    for (let i = 0; i < 5; i++) {
      const c = board[i];
      if (c === undefined) { this.boardEl.appendChild(cardEl(null)); continue; }
      const isNew = this.newBoardCards && this.newBoardCards.has(c);
      const cls = hl ? (hl.has(c) ? 'hl' : 'dim') : '';
      const el = cardEl(c, { anim: isNew ? 'anim-flip' : '', cls });
      if (isNew) { el.style.animationDelay = (k++ * 110) + 'ms'; this.later(() => play('flip'), (k - 1) * 110); }
      this.boardEl.appendChild(el);
    }
    this.newBoardCards = null;
    // Resaltar también en las manos mostradas
    if (hl) {
      for (const se of this.seatEls) {
        se.hole && se.hole.querySelectorAll('.pcard[data-card]').forEach((el) => {
          el.classList.toggle('hl', hl.has(Number(el.dataset.card)));
        });
      }
    }
  }

  syncPot(view) {
    const hd = view.hand;
    const sig = hd && hd.phase !== 'done' ? `${hd.pot}|${(hd.sidePots || []).map((p) => p.amount).join(',')}` : '';
    if (sig === this.potSig) return;
    this.potSig = sig;
    clear(this.potEl);
    if (!sig || !hd.pot) return;
    this.potEl.appendChild(h('div.pot-main', chipIcon(), h('span.lbl', 'Bote'), fmt(hd.pot)));
    if (hd.sidePots && hd.sidePots.length > 1) {
      this.potEl.appendChild(h('div.side-pots', hd.sidePots.map((p, i) => h('span', (i === 0 ? 'Principal ' : 'Lateral ') + fmt(p.amount)))));
    }
  }

  syncDealer(view) {
    const b = view.button;
    if (b < 0 || !this.points[b]) { this.dealerEl.hidden = true; return; }
    this.dealerEl.hidden = false;
    const p = this.points[b];
    // Junto al asiento, hacia el centro y ligeramente desplazado para no tapar las cartas
    const x = lerp(p.x, 50, this.portrait ? 0.3 : 0.2) + (p.x > 52 ? -1 : 1) * (this.portrait ? 4 : 5);
    const y = lerp(p.y, 48, this.portrait ? 0.3 : 0.24) + (this.portrait ? 3 : 4);
    this.dealerEl.style.left = x + '%';
    this.dealerEl.style.top = y + '%';
  }

  syncTurn(view) {
    const hd = view.hand;
    const seat = hd && hd.phase === 'betting' ? hd.toAct : -1;
    const deadline = view.localDeadline || 0;
    const key = `${hd ? hd.id : ''}|${hd ? hd.street : ''}|${seat}|${deadline}`;
    if (key === this.turnKey) return;
    this.turnKey = key;
    clearTimeout(this.ringLowTimer);
    clearInterval(this.tickTimer);
    for (const se of this.seatEls) {
      if (se.ringFg) { se.ringFg.style.transition = 'none'; se.ringFg.style.strokeDashoffset = String(2 * Math.PI * 30); se.ringFg.classList.remove('low'); }
    }
    if (seat < 0) return;
    const se = this.seatEls[seat];
    if (seat === view.you) {
      play('turn');
      if (store.get().settings.haptics) vibrate(60);
    }
    if (!se || !se.ringFg || !deadline || !view.turnTotal) return;
    const C = 2 * Math.PI * 30;
    const remaining = Math.max(0, deadline - Date.now());
    const total = view.turnTotal;
    const frac = Math.min(1, remaining / total);
    const fg = se.ringFg;
    fg.style.transition = 'none';
    fg.style.strokeDashoffset = String(C * (1 - frac));
    void fg.getBoundingClientRect();
    fg.style.transition = `stroke-dashoffset ${remaining}ms linear`;
    fg.style.strokeDashoffset = String(C);
    const lowAt = remaining - total * 0.3;
    this.ringLowTimer = setTimeout(() => fg.classList.add('low'), Math.max(0, lowAt));
    if (seat === view.you) {
      this.tickTimer = setInterval(() => {
        const left = deadline - Date.now();
        if (left <= 0) { clearInterval(this.tickTimer); return; }
        if (left < 5500) play('tickSoft');
      }, 1000);
    }
  }

  syncHero(view) {
    const you = view.you;
    const p = you >= 0 ? view.seats[you] : null;
    const cards = p && p.cards && p.cards[0] >= 0 ? p.cards : null;
    const hl = this.hlCards;
    const sig = (cards ? cards.join(',') : '') + '|' + (p && p.folded ? 'f' : '') + '|' + (hl ? [...hl].join(',') : '');
    if (sig === this.heroSig) return;
    const isNew = cards && (!this.heroSig || !this.heroSig.startsWith(cards.join(',')));
    this.heroSig = sig;
    clear(this.heroCards);
    this.heroCards.classList.toggle('folded', !!(p && p.folded));
    if (!cards) return;
    cards.forEach((c, k) => {
      const el = cardEl(c, { anim: isNew && !prefersReducedMotion() ? 'anim-deal' : '', cls: hl ? (hl.has(c) ? 'hl' : '') : '' });
      if (isNew) { el.style.setProperty('--fy', '-160px'); el.style.setProperty('--fx', '0px'); el.style.animationDelay = (k * 120 + 150) + 'ms'; }
      this.heroCards.appendChild(el);
    });
  }

  syncHelper(view) {
    const st = store.get().settings;
    const you = view.you;
    const p = you >= 0 ? view.seats[you] : null;
    const hd = view.hand;
    clear(this.helperEl);
    if (!p || !hd || !p.cards || p.cards[0] < 0 || p.folded) return;
    const board = hd.board;
    if (st.showHandName) {
      const info = handInfo(p.cards, board);
      this.helperEl.appendChild(h('span.hand', info.name));
    }
    if (!st.showOdds || hd.phase === 'done') return;
    const opps = view.seats.filter((s, i) => s && i !== you && s.inHand && !s.folded).length;
    if (!opps) return;
    const key = `${hd.id}|${board.length}|${opps}|${p.cards.join(',')}`;
    if (this.eqCache.key !== key) {
      this.eqCache = { key, value: null };
      this.later(() => {
        if (this.eqCache.key !== key) return;
        const eq = equityVsRanges(p.cards, board, Array(opps).fill(null), board.length >= 4 ? 1500 : 1000);
        this.eqCache.value = eq;
        this.syncHelper(this.view);
      }, 60);
    }
    const eq = this.eqCache.value;
    if (eq == null) return;
    const bar = h('span.eqbar', h('span'));
    bar.firstChild.style.width = Math.round(eq * 100) + '%';
    this.helperEl.appendChild(h('span.eq', { title: `Probabilidad de ganar contra ${opps} ${opps === 1 ? 'mano aleatoria' : 'manos aleatorias'} (estimación Monte Carlo)` }, 'Equity ≈ ' + pct(eq, 0), bar));
    const la = view.legal;
    if (la && la.toCall > 0) {
      const need = la.toCall / (la.pot + la.toCall);
      let cls = 'meh', txt = 'Decisión ajustada';
      if (eq > need * 1.15) { cls = 'good'; txt = 'Pagar es rentable'; }
      else if (eq < need * 0.85) { cls = 'bad'; txt = 'Las cuentas no salen'; }
      this.helperEl.appendChild(h('span.eq', { title: 'Equity mínima para que pagar sea rentable: apuesta a pagar ÷ (bote + apuesta a pagar)' }, 'Necesitas ' + pct(need, 0)));
      this.helperEl.appendChild(h('span.advice.' + cls, txt));
    }
  }

  // ---------------------------------------------------------------------
  syncActions(view) {
    const you = view.you;
    const p = you >= 0 ? view.seats[you] : null;
    const hd = view.hand;
    const la = view.legal;
    const s = this.session;
    let mode;
    if (s.kind === 'client' && (view.you < 0 || !s.myId)) mode = 'spectator';
    else if (!p) mode = 'spectator';
    else if (view.sng && !view.sng.started) mode = 'sng-wait';
    else if (la) mode = 'act';
    else if (p.stack === 0 && !(hd && hd.phase !== 'done' && p.inHand)) mode = 'busted';
    else if (p.sittingOut) mode = 'out';
    else if (hd && hd.phase !== 'done' && p.inHand && !p.folded && !p.allIn) mode = 'pre';
    else if (hd && hd.phase === 'done' && hd.result && !hd.result.showdown && hd.result.winners.includes(you) && p.cards && p.cards[0] >= 0 && !this.showedCards) mode = 'show';
    else mode = 'wait';
    const legalKey = la ? `${hd.id}|${hd.street}|${la.toCall}|${la.minTo}|${la.maxTo}|${la.canRaise}|${la.canBet}` : '';
    const playersSeated = view.seats.filter(Boolean).length;
    const sig = mode + '|' + legalKey + '|' + (mode === 'pre' ? `${hd.street}|${hd.currentBet}|${this.preact}` : '') + '|' + (mode === 'wait' ? `${playersSeated}|${hd ? hd.phase : ''}` : '') + '|' + (mode === 'sng-wait' ? playersSeated : '');
    if (sig === this.actionsSig) return;
    this.actionsSig = sig;
    if (mode !== 'show') this.showedCards = false;
    const box = clear(this.actionsEl);

    if (mode === 'act') {
      // Pre-acción programada
      if (this.preact) {
        const pa = this.preact;
        this.preact = null;
        let act = null;
        if (pa === 'checkfold') act = la.canCheck ? { type: 'check' } : { type: 'fold' };
        else if (pa === 'check' && la.canCheck) act = { type: 'check' };
        else if (pa === 'callany') act = la.canCheck ? { type: 'check' } : { type: 'call' };
        if (act) { this.later(() => this.doAction(act), 250); box.appendChild(h('div.waiting-msg', 'Acción automática…')); return; }
      }
      this.buildActButtons(box, view, la);
      return;
    }
    if (mode === 'pre') {
      // Si la apuesta sube, "Pasar" deja de tener sentido
      const opts = [
        { k: 'checkfold', label: 'Pasar o no ir' },
        { k: 'check', label: 'Pasar' },
        { k: 'callany', label: 'Igualar lo que sea' },
      ];
      if (this.preactBet !== undefined && this.preactBet !== hd.currentBet && this.preact === 'check') this.preact = null;
      this.preactBet = hd.currentBet;
      const row = h('div.preacts');
      for (const o of opts) {
        const b = h('button.preact', { type: 'button', 'aria-pressed': String(this.preact === o.k) }, h('span.box'), o.label);
        b.addEventListener('click', () => { this.preact = this.preact === o.k ? null : o.k; this.actionsSig = ''; this.syncActions(this.view); });
        row.appendChild(b);
      }
      box.appendChild(row);
      return;
    }
    const msg = (t) => box.appendChild(h('div.waiting-msg', t));
    const btns = h('div.dock-buttons');
    if (mode === 'spectator') {
      msg('Estás mirando la mesa');
      if (s.kind === 'client' && view.seats.some((x) => !x) && !(view.sng && view.sng.started)) {
        btns.appendChild(h('button.btn.btn-primary', { type: 'button', onclick: () => this.askSit() }, 'Sentarme'));
      }
    } else if (mode === 'sng-wait') {
      const n = playersSeated;
      if (s.isHost()) {
        msg(n < 2 ? 'Esperando jugadores. Comparte el código o añade bots.' : `${n} jugadores sentados. Empieza cuando estéis todos.`);
        btns.appendChild(h('button.btn.btn-ghost', { type: 'button', onclick: () => { if (s.addBot() < 0) toast('No quedan asientos'); } }, svgIcon('i-bot'), 'Añadir bot'));
        btns.appendChild(h('button.btn.btn-primary', { type: 'button', disabled: n < 2, onclick: () => s.startSng() }, 'Empezar torneo'));
      } else msg('Esperando a que el anfitrión empiece el torneo…');
    } else if (mode === 'busted') {
      msg(this.session.mode === 'sng' ? 'Te has quedado sin fichas' : 'Te has quedado sin fichas');
      if (this.session.mode === 'cash') btns.appendChild(h('button.btn.btn-primary', { type: 'button', onclick: () => this.showRebuy(true) }, 'Recargar fichas'));
    } else if (mode === 'out') {
      msg('Estás ausente: no recibirás cartas');
      btns.appendChild(h('button.btn.btn-primary', { type: 'button', onclick: () => s.sitOut(false) }, 'Volver a jugar'));
    } else if (mode === 'show') {
      msg('Has ganado sin enseñar tus cartas');
      btns.appendChild(h('button.btn.btn-ghost', { type: 'button', onclick: () => { this.showedCards = true; s.showCards(); this.actionsSig = ''; } }, svgIcon('i-eye'), 'Enseñar cartas'));
    } else {
      if (playersSeated < 2) {
        msg(s.isHost() ? 'Esperando jugadores. Comparte el código de la sala o añade bots.' : 'Esperando a más jugadores…');
        if (s.isHost()) btns.appendChild(h('button.btn.btn-ghost', { type: 'button', onclick: () => { if (s.addBot() < 0) toast('No quedan asientos'); } }, svgIcon('i-bot'), 'Añadir bot'));
      } else if (hd && hd.phase !== 'done' && p && p.inHand && p.allIn) msg('Estás all-in. ¡Suerte!');
      else if (hd && hd.phase !== 'done') msg(p && p.folded ? 'Esperando a la siguiente mano…' : 'Entras en la próxima mano');
      else msg('Barajando…');
    }
    if (btns.childNodes.length) box.appendChild(btns);
  }

  buildActButtons(box, view, la) {
    const hd = view.hand;
    const bb = hd.bb;
    const canAgg = la.canBet || la.canRaise;
    // Valor por defecto de la subida
    let def;
    if (la.canBet) def = hd.street === 'preflop' ? 2.5 * bb : Math.round(la.pot * 0.5);
    else if (hd.street === 'preflop' && la.currentBet <= bb) def = 2.5 * bb + view.seats.filter((x, i) => x && x.inHand && !x.folded && x.bet === bb && i !== hd.bbSeat && i !== view.you).length * bb;
    else def = la.currentBet * 3;
    const unit = Math.max(1, hd.sb);
    const snap = (v) => Math.max(la.minTo, Math.min(la.maxTo, Math.round(v / unit) * unit));
    this.raiseTo = snap(def);

    const foldBtn = h('button.act-btn.act-fold', { type: 'button', onclick: () => this.doAction({ type: 'fold' }) }, h('span', 'No ir', h('span.kbd', 'F')));
    const callBtn = h('button.act-btn.act-call', { type: 'button', onclick: () => this.doAction({ type: la.canCheck ? 'check' : 'call' }) },
      la.canCheck ? h('span', 'Pasar', h('span.kbd', 'C')) : [h('span', la.callIsAllIn ? 'All-in' : 'Igualar', h('span.kbd', 'C')), h('small', fmt(la.toCall))]);
    const row = h('div.act-row');
    row.append(foldBtn, callBtn);
    if (!canAgg) {
      row.style.gridTemplateColumns = '1fr 1fr';
      box.appendChild(row);
      return;
    }
    const raiseLbl = h('span');
    const raiseAmt = h('small');
    const raiseBtn = h('button.act-btn.act-raise', { type: 'button', onclick: () => this.doRaise() }, raiseLbl, raiseAmt);
    row.appendChild(raiseBtn);
    const range = h('input.range', { type: 'range', min: String(la.minTo), max: String(la.maxTo), step: String(unit), 'aria-label': 'Cantidad de la apuesta' });
    const amount = h('input.input.amount', { type: 'text', inputmode: 'numeric', 'aria-label': 'Cantidad exacta' });
    const update = (v, from) => {
      this.raiseTo = snap(v);
      if (from !== 'range') range.value = String(this.raiseTo);
      if (from !== 'input') amount.value = fmt(this.raiseTo);
      const f = la.maxTo > la.minTo ? ((this.raiseTo - la.minTo) / (la.maxTo - la.minTo)) * 100 : 100;
      range.style.setProperty('--fill', f + '%');
      const allIn = this.raiseTo >= la.maxTo;
      raiseBtn.classList.toggle('allin', allIn);
      raiseLbl.textContent = allIn ? 'All-in' : la.canBet ? 'Apostar' : 'Subir a';
      raiseLbl.appendChild(h('span.kbd', 'R'));
      raiseAmt.textContent = fmt(this.raiseTo);
    };
    range.addEventListener('input', () => update(Number(range.value), 'range'));
    amount.addEventListener('change', () => update(Number(amount.value.replace(/\D/g, '')) || la.minTo, 'input'));
    amount.addEventListener('keydown', (e) => { if (e.key === 'Enter') { update(Number(amount.value.replace(/\D/g, '')) || la.minTo, 'input'); this.doRaise(); } });
    this.adjustRaise = (dir) => update(this.raiseTo + dir * (hd.street === 'preflop' ? bb : Math.max(unit, Math.round(la.pot / 10 / unit) * unit)), 'key');
    const presets = h('div.presets');
    const potTo = (frac) => la.currentBet + frac * (la.pot + la.toCall);
    const list = [];
    if (hd.street === 'preflop' && la.currentBet <= bb) {
      list.push(['2,5 BB', 2.5 * bb], ['3 BB', 3 * bb], ['4 BB', 4 * bb], ['Bote', potTo(1)]);
    } else if (hd.street === 'preflop') {
      list.push(['×2,5', la.currentBet * 2.5], ['×3', la.currentBet * 3], ['×4', la.currentBet * 4], ['Bote', potTo(1)]);
    } else if (la.canBet) {
      list.push(['⅓', la.pot / 3], ['½', la.pot / 2], ['⅔', (la.pot * 2) / 3], ['Bote', la.pot]);
    } else {
      list.push(['×2,5', la.currentBet * 2.5], ['×3', la.currentBet * 3], ['Bote', potTo(1)]);
    }
    list.push(['All-in', la.maxTo]);
    for (const [lbl, v] of list) presets.appendChild(h('button', { type: 'button', onclick: () => update(v, 'preset') }, lbl));
    const sizer = h('div.sizer', presets, range, amount);
    if (la.minTo >= la.maxTo) sizer.hidden = true;
    box.append(sizer, row);
    update(this.raiseTo);
  }

  async doRaise() {
    const la = this.view && this.view.legal;
    if (!la) return;
    const to = this.raiseTo;
    if (to >= la.maxTo && store.get().settings.confirmAllIn && la.maxTo - la.myBet > la.bb * 25) {
      const ok = await confirmDialog('¿Ir all-in?', `Vas a jugarte ${fmt(la.maxTo - la.myBet)} fichas.`, { ok: 'All-in', danger: true });
      if (!ok) return;
    }
    this.doAction({ type: la.canBet ? 'bet' : 'raise', amount: to });
  }

  doAction(action) {
    const res = this.session.act(action);
    if (res && !res.ok && res.error) toast(res.error, { type: 'error' });
    this.actionsSig = '';
  }

  handleKey(e) {
    if (!this.view || !this.view.legal) return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'TEXTAREA' || (tag === 'INPUT' && e.target.type !== 'range')) return;
    if (document.querySelector('.overlay')) return;
    const la = this.view.legal;
    const k = e.key.toLowerCase();
    if (k === 'f') { e.preventDefault(); this.doAction({ type: 'fold' }); }
    else if (k === 'c' || k === ' ') { e.preventDefault(); this.doAction({ type: la.canCheck ? 'check' : 'call' }); }
    else if ((k === 'r' || k === 'enter') && (la.canBet || la.canRaise)) { e.preventDefault(); this.doRaise(); }
    else if ((k === 'arrowup' || k === 'arrowright') && this.adjustRaise && tag !== 'INPUT') { e.preventDefault(); this.adjustRaise(1); }
    else if ((k === 'arrowdown' || k === 'arrowleft') && this.adjustRaise && tag !== 'INPUT') { e.preventDefault(); this.adjustRaise(-1); }
  }

  // ---------------------------------------------------------------------
  // Registro de acciones
  logLine(view, seat, action, amount, to) {
    const cur = this.logHands[this.logHands.length - 1];
    if (!cur) return;
    const name = view.seats[seat] ? view.seats[seat].name : '?';
    let t;
    switch (action) {
      case 'sb': t = `pone la ciega pequeña (${fmt(amount)})`; break;
      case 'bb': t = `pone la ciega grande (${fmt(amount)})`; break;
      case 'ante': t = `pone el ante (${fmt(amount)})`; return;
      case 'fold': t = 'no va'; break;
      case 'check': t = 'pasa'; break;
      case 'call': t = `iguala ${fmt(amount)}`; break;
      case 'bet': t = `apuesta ${fmt(to)}`; break;
      case 'raise': t = `sube a ${fmt(to)}`; break;
      case 'allin': t = `va all-in (${fmt(to || amount)})`; break;
      case 'return': t = `recupera ${fmt(amount)} no igualados`; break;
      default: t = action;
    }
    cur.lines.push({ name, t });
    if (this.drawer.classList.contains('open') && this.drawerTab === 'log') this.renderDrawerBody();
  }

  logStreet(street, board) {
    const cur = this.logHands[this.logHands.length - 1];
    if (cur) cur.lines.push({ street, board: board.slice() });
  }

  logResult(view, result) {
    const cur = this.logHands[this.logHands.length - 1];
    if (!cur) return;
    for (const pot of result.pots) {
      const names = pot.winners.map((s) => (view.seats[s] ? view.seats[s].name : '?')).join(' y ');
      cur.lines.push({ name: names, t: `gana ${fmt(pot.amount)}${result.showdown && pot.handName ? ' con ' + pot.handName.toLowerCase() : ''}`, win: true });
    }
  }

  // ---------------------------------------------------------------------
  buildDrawer() {
    const d = h('aside.drawer', { 'aria-label': 'Chat y registro' });
    this.drawerTabs = h('div.seg');
    this.drawerBody = h('div.drawer-body');
    this.drawerFoot = h('div.drawer-foot');
    d.append(
      h('div.drawer-head', this.drawerTabs, h('div.spacer'), h('button.icon-btn', { type: 'button', 'aria-label': 'Cerrar', onclick: () => this.toggleDrawer(false) }, svgIcon('i-x'))),
      this.drawerBody,
      this.drawerFoot,
    );
    return d;
  }

  toggleDrawer(force) {
    const open = force ?? !this.drawer.classList.contains('open');
    this.drawer.classList.toggle('open', open);
    if (open) {
      this.unread = 0;
      this.chatBadge.hidden = true;
      this.renderDrawer();
    }
  }

  renderDrawer() {
    const s = this.session;
    clear(this.drawerTabs);
    const tabs = s.kind === 'local' ? [['log', 'Registro']] : [['chat', 'Chat'], ['log', 'Registro']];
    for (const [k, label] of tabs) {
      const b = h('button', { type: 'button', 'aria-pressed': String(this.drawerTab === k) }, label);
      b.addEventListener('click', () => { this.drawerTab = k; this.renderDrawer(); });
      this.drawerTabs.appendChild(b);
    }
    this.renderDrawerBody();
    clear(this.drawerFoot);
    const emotes = h('div.emote-bar', EMOTES.map((e) => h('button', { type: 'button', 'aria-label': 'Reacción ' + e, onclick: () => s.emote(e) }, e)));
    this.drawerFoot.appendChild(emotes);
    if (this.drawerTab === 'chat' && s.kind !== 'local') {
      const input = h('input.input', { type: 'text', maxlength: '200', placeholder: 'Escribe un mensaje', 'aria-label': 'Mensaje de chat' });
      const send = () => { const t = input.value.trim(); if (t) { s.chat(t); input.value = ''; } };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
      this.drawerFoot.appendChild(h('div.join-inline', input, h('button.btn.btn-primary', { type: 'button', onclick: send }, 'Enviar')));
    }
  }

  renderDrawerBody() {
    const body = clear(this.drawerBody);
    if (this.drawerTab === 'chat') {
      const log = this.session.chatLog || [];
      if (!log.length) body.appendChild(h('p.faint.small', 'Todavía no hay mensajes. Saluda a la mesa.'));
      for (const m of log) {
        if (m.system) body.appendChild(h('div.chat-msg.system', m.text));
        else body.appendChild(h('div.chat-msg' + (m.me ? '.me' : ''), h('span.who', (m.avatar ? m.avatar + ' ' : '') + m.name + (m.host ? ' (anfitrión)' : '')), m.text));
      }
    } else {
      if (!this.logHands.length) body.appendChild(h('p.faint.small', 'El registro empieza con la próxima mano.'));
      for (const hand of this.logHands) {
        body.appendChild(h('div.log-hand', `Mano ${hand.number}`));
        for (const l of hand.lines) {
          if (l.street) body.appendChild(h('div.log-line', h('span.st', l.street.toUpperCase()), h('div.card-row.tight', l.board.map((c) => cardEl(c, { cls: 'sm' })))));
          else body.appendChild(h('div.log-line', h('span', h('b', l.name), ' ', l.t)));
        }
      }
    }
    body.scrollTop = body.scrollHeight;
  }

  onChat(msg) {
    if (this.drawer.classList.contains('open') && this.drawerTab === 'chat') this.renderDrawerBody();
    else if (!msg.system && !msg.me) {
      this.unread++;
      this.chatBadge.hidden = false;
      this.chatBadge.textContent = String(Math.min(9, this.unread));
      play('notify');
    }
    // Burbuja sobre el asiento
    if (!msg.system && msg.seat >= 0 && this.seatEls[msg.seat]) this.bubble(this.seatEls[msg.seat], msg.text.length > 40 ? msg.text.slice(0, 40) + '…' : msg.text, 'chat');
  }

  // ---------------------------------------------------------------------
  toggleSound() {
    const v = !store.get().settings.sound;
    store.setting('sound', v);
    this.updateSoundBtn();
  }
  updateSoundBtn() {
    const on = store.get().settings.sound;
    clear(this.soundBtn).appendChild(svgIcon(on ? 'i-sound' : 'i-mute'));
    this.soundBtn.setAttribute('aria-label', on ? 'Silenciar' : 'Activar sonido');
  }

  onSeatClick(i) {
    const v = this.view;
    if (!v) return;
    const p = v.seats[i];
    const s = this.session;
    if (!p) {
      if (s.kind === 'client' && v.you < 0 && !s.myId) this.askSit();
      return;
    }
    if (!s.isHost() || i === v.you) return;
    const body = h('div.stack', h('p', p.isBot ? `${p.name} es un bot ${BOT_STYLES[p.botStyle] ? '(' + BOT_STYLES[p.botStyle].label.toLowerCase() + ')' : ''}.` : `${p.name} es un invitado.`));
    modal({
      title: p.name,
      body,
      actions: [
        { label: 'Cerrar' },
        p.isBot
          ? { label: 'Quitar bot', danger: true, onClick: () => { s.removeBot(i); } }
          : { label: 'Expulsar', danger: true, onClick: () => { s.kick(i); } },
      ],
    });
  }

  askSit() {
    const s = this.session;
    const room = s.room;
    if (!room) return;
    if (room.mode === 'sng') {
      if (store.get().balance < room.sngBuyIn) { toast('No tienes saldo suficiente para la inscripción', { type: 'error' }); return; }
      s.sit(room.sngBuyIn);
      return;
    }
    buyInDialog({ min: room.minBuyIn, max: room.maxBuyIn, bb: room.bb, title: 'Sentarte en la mesa' }).then((amt) => { if (amt) s.sit(amt); });
  }

  showRebuy(fromBust) {
    const s = this.session;
    if (s.mode !== 'cash') return;
    const v = this.view;
    const p = v && v.seats[v.you];
    if (!p) return;
    const t = s.kind === 'client' ? s.room : s.opts.table;
    const maxAdd = t.maxBuyIn - p.stack;
    const minAdd = p.stack === 0 ? Math.min(t.minBuyIn, maxAdd) : Math.min(t.bb * 10, maxAdd);
    if (maxAdd <= 0) { toast('Ya tienes el máximo permitido en la mesa'); return; }
    if (!s.canRebuy()) { toast('Podrás recargar al terminar la mano'); return; }
    buyInDialog({ min: minAdd, max: maxAdd, bb: t.bb, title: fromBust ? 'Te has quedado sin fichas' : 'Recargar fichas', note: fromBust ? '¿Recargas para seguir jugando?' : null, defaultValue: maxAdd }).then((amt) => {
      if (!amt) return;
      if (!s.rebuy(amt)) toast('No se pudo recargar', { type: 'error' });
      else if (p.sittingOut) s.sitOut(false);
    });
  }

  showSngEnd(ev) {
    const prize = ev.prize || 0;
    const place = ev.place;
    if (place === 1) confetti(180);
    if (prize > 0) play('win');
    const body = h('div.stack',
      h('div.place-medal', `${place}.º`),
      h('p', { style: { textAlign: 'center', margin: 0 } }, place === 1 ? '¡Has ganado el torneo!' : prize > 0 ? 'Has cobrado premio.' : 'Esta vez no ha habido premio.'),
      prize > 0 ? h('p', { style: { textAlign: 'center', fontWeight: 800, color: 'var(--brass-hi)', fontSize: '1.3rem', margin: 0 } }, '+' + fmt(prize) + ' fichas') : null,
    );
    if (ev.results && ev.results.length) {
      const tbl = h('table.sng-results');
      for (const r of ev.results) tbl.appendChild(h('tr' + (r.id && this.session.heroId === r.id ? '.me' : ''), h('td', `${r.place}.º`), h('td', `${r.avatar || ''} ${r.name}`), h('td', { style: { textAlign: 'right' } }, r.prize ? fmt(r.prize) : '')));
      body.appendChild(tbl);
    }
    const local = this.session.kind === 'local';
    modal({
      title: 'Resultado del torneo',
      body,
      dismissable: !local,
      actions: local
        ? [{ label: 'Volver al lobby', primary: true, onClick: () => { this.session.leave(); this.exit(); } }]
        : [{ label: 'Seguir mirando' }, { label: 'Salir de la sala', primary: true, onClick: () => { this.session.leave(); this.exit(); } }],
    });
  }

  onClosed(reason) {
    if (this.exiting) return;
    if (this.session.kind === 'local' || this.session.kind === 'host') return;
    modal({
      title: 'Fin de la partida',
      body: h('p', reason || 'La sala se ha cerrado.'),
      dismissable: false,
      actions: [{ label: 'Volver al lobby', primary: true, onClick: () => this.exit() }],
    });
  }

  showReconnecting(on) {
    if (on && !this.reconnectEl) {
      this.reconnectEl = h('div.result-banner', { style: { top: '50%', zIndex: 20 } }, 'Reconectando con la sala…');
      this.table.appendChild(this.reconnectEl);
    } else if (!on && this.reconnectEl) {
      this.reconnectEl.remove();
      this.reconnectEl = null;
    }
  }

  async confirmLeave() {
    const s = this.session;
    const v = this.view;
    const p = v && v.you >= 0 ? v.seats[v.you] : null;
    let text = '';
    if (s.kind === 'host') text = 'Eres el anfitrión: al salir se cerrará la sala para todos y cada jugador recuperará sus fichas.';
    else if (s.mode === 'sng' && v && v.sng && v.sng.started && p) text = 'Si abandonas el torneo quedarás eliminado en el puesto actual.';
    else if (p && p.inHand && v.hand && v.hand.phase !== 'done' && !p.folded) text = 'Estás en mitad de una mano: perderás lo que hayas apostado en ella. El resto de tu stack vuelve a tu saldo.';
    else if (p) text = `Tu stack de ${fmt(p.stack)} fichas volverá a tu saldo.`;
    else text = '¿Salir de la sala?';
    const ok = await confirmDialog('¿Salir de la mesa?', text, { ok: 'Salir', danger: s.kind === 'host' });
    if (!ok) return;
    s.leave();
    this.exit();
  }

  exit() {
    if (this.exiting) return;
    this.exiting = true;
    this.onExit();
  }

  openMenu() {
    const s = this.session;
    const v = this.view;
    const p = v && v.you >= 0 ? v.seats[v.you] : null;
    const st = store.get().settings;
    const items = h('div.stack');
    const close = () => m.close();
    const menuBtn = (icon, label, fn, cls = '.btn-ghost') => h('button.btn.btn-block' + cls, { type: 'button', style: { justifyContent: 'flex-start' }, onclick: () => { close(); fn(); } }, svgIcon(icon), label);
    if (s.isHost()) items.appendChild(menuBtn('i-users', 'Sala: código, jugadores y bots', () => this.openRoomPanel(), '.btn-felt'));
    if (p && s.mode === 'cash') items.appendChild(menuBtn('i-chip', 'Recargar fichas', () => this.showRebuy(false)));
    if (p && !(v.sng)) items.appendChild(menuBtn(p.sittingOut ? 'i-resume' : 'i-pause', p.sittingOut ? 'Volver a jugar' : 'Ausentarme desde la próxima mano', () => s.sitOut(!p.sittingOut)));
    if (s.isHost()) items.appendChild(menuBtn(v && v.paused ? 'i-resume' : 'i-pause', v && v.paused ? 'Reanudar la partida' : 'Pausar la partida', () => s.setPaused(!(v && v.paused))));
    items.appendChild(menuBtn('i-history', 'Registro de manos', () => { this.drawerTab = 'log'; this.toggleDrawer(true); }));
    const quick = h('div', { style: { marginTop: '6px' } },
      toggleRow({ title: 'Ayuda de juego', desc: 'Nombre de tu mano, equity y probabilidades del bote', checked: st.showOdds, onChange: (val) => { store.setting('showOdds', val); store.setting('showHandName', val); } }),
      toggleRow({ title: 'Baraja de cuatro colores', desc: 'Diamantes azules y tréboles verdes', checked: st.fourColor, onChange: (val) => { store.setting('fourColor', val); document.body.classList.toggle('four-color', val); } }),
      toggleRow({ title: 'Sonido', checked: st.sound, onChange: (val) => { store.setting('sound', val); this.updateSoundBtn(); } }),
    );
    items.appendChild(quick);
    if (s.kind !== 'client') {
      items.appendChild(h('div.field', { style: { marginTop: '8px' } }, h('span.label', 'Velocidad de los bots'),
        segmented([{ value: 0.6, label: 'Pausada' }, { value: 1, label: 'Normal' }, { value: 1.8, label: 'Rápida' }], s.runner.opts.speed, (val) => { s.runner.opts.speed = val; store.setting('speed', val); })));
    }
    items.appendChild(menuBtn('i-exit', 'Salir de la mesa', () => this.confirmLeave(), '.btn-danger'));
    const m = modal({ title: 'Mesa', body: items });
  }

  openRoomPanel() {
    modal({ title: 'Sala privada', body: roomPanel(this.session), wide: true });
  }
}

// Diálogo para elegir la cantidad de fichas con la que sentarse o recargar.
export function buyInDialog({ min, max, bb, title, note, defaultValue }) {
  return new Promise((resolve) => {
    const balance = store.get().balance;
    const hardMax = Math.min(max, balance);
    if (hardMax < min) {
      modal({
        title: 'Saldo insuficiente',
        body: h('p', `Necesitas al menos ${fmt(min)} fichas y tienes ${fmt(balance)}. Gira la ruleta o reclama el bono diario para conseguir más.`),
        actions: [{ label: 'Entendido', primary: true }],
        onClose: () => resolve(0),
      });
      return;
    }
    let value = Math.min(hardMax, Math.max(min, defaultValue ?? Math.min(hardMax, bb * 100)));
    const out = h('div.calc-out', fmt(value));
    const sub = h('div.muted.small', `${Math.round(value / bb)} ciegas grandes`);
    const range = h('input.range', { type: 'range', min: String(min), max: String(hardMax), step: String(Math.max(1, Math.round(bb / 2))), value: String(value), 'aria-label': 'Fichas' });
    const upd = () => {
      value = Number(range.value);
      out.textContent = fmt(value);
      sub.textContent = `${Math.round(value / bb)} ciegas grandes`;
      range.style.setProperty('--fill', hardMax > min ? ((value - min) / (hardMax - min)) * 100 + '%' : '100%');
    };
    range.addEventListener('input', upd);
    upd();
    const body = h('div.stack',
      note ? h('p', note) : null,
      h('div', out, sub),
      range,
      h('div.row.small.faint', h('span', 'Mín. ' + fmt(min)), h('span.spacer'), h('span', 'Máx. ' + fmt(hardMax))),
      h('p.small.faint', `Tu saldo: ${fmt(balance)} fichas`),
    );
    let done = false;
    modal({
      title,
      body,
      actions: [
        { label: 'Cancelar', onClick: () => { done = true; resolve(0); } },
        { label: 'Confirmar', primary: true, onClick: () => { done = true; resolve(value); } },
      ],
      onClose: () => { if (!done) resolve(0); },
    });
  });
}

export { copyText };
