import { Table } from '../js/core/engine.js';
import { decide, BOT_STYLES } from '../js/core/bots.js';

export function run(assert) {
  const styles = Object.keys(BOT_STYLES);
  const t = new Table({ smallBlind: 10, bigBlind: 20, maxSeats: 6 });
  styles.forEach((st, i) => t.seatPlayer(i, { id: st, name: st, stack: 2000, isBot: true, bot: { style: st } }));
  const vpip = Object.fromEntries(styles.map((s) => [s, 0]));
  const dealt = Object.fromEntries(styles.map((s) => [s, 0]));
  let decisions = 0, totalMs = 0, maxMs = 0;
  const expected = 2000 * styles.length;
  for (let k = 0; k < 400; k++) {
    // recompras para mantener la mesa llena
    for (const p of t.seats) if (p && p.stack < 400) p.stack += 2000;
    const exp = t.seats.reduce((a, p) => a + p.stack, 0);
    if (!t.startHand()) break;
    let guard = 0;
    while (t.hand.phase !== 'done' && guard++ < 300) {
      if (t.hand.phase === 'between') { t.proceed(); continue; }
      const seat = t.hand.toAct;
      const t0 = performance.now();
      const a = decide(t, seat);
      const dt = performance.now() - t0;
      totalMs += dt; maxMs = Math.max(maxMs, dt); decisions++;
      const res = t.act(seat, a);
      assert.ok(res.ok, JSON.stringify(a) + ' ' + res.error);
    }
    assert.equal(t.hand.phase, 'done');
    assert.equal(t.seats.reduce((a, p) => a + p.stack, 0), exp);
    for (const s of t.hand.order) {
      const st = t.seats[s].id;
      dealt[st]++;
      if (t.hand.ps[s].vpip) vpip[st]++;
    }
  }
  const report = styles.map((s) => `${s}:${Math.round((vpip[s] / dealt[s]) * 100)}%`).join(' ');
  console.log('   VPIP por estilo →', report, `| decisión media ${(totalMs / decisions).toFixed(2)} ms, máx ${maxMs.toFixed(1)} ms`);
  assert.ok(vpip.roca / dealt.roca < vpip.maniaco / dealt.maniaco, 'la roca juega menos que el maníaco');
  assert.ok(totalMs / decisions < 15, 'decisiones rápidas');
  void expected;
}
