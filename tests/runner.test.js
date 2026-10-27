import { GameRunner, verifyDeck } from '../js/game/runner.js';

function fastRunner(opts) {
  const r = new GameRunner(opts);
  r.later = (fn) => { const id = setTimeout(() => { if (!r.stopped) fn(); }, 0); r.timers.add(id); return id; };
  return r;
}

function waitFor(cond, ms = 20000) {
  return new Promise((res, rej) => {
    const t0 = Date.now();
    const tick = () => {
      if (cond()) return res();
      if (Date.now() - t0 > ms) return rej(new Error('timeout'));
      setTimeout(tick, 5);
    };
    tick();
  });
}

export async function run(assert) {
  // Sit & Go de 6 bots hasta el final.
  {
    const r = fastRunner({ config: { mode: 'sng', maxSeats: 6, name: 'Test SNG' }, sng: { startingStack: 1500, levelHands: 5, buyIn: 1000 }, speed: 1000 });
    for (let i = 0; i < 6; i++) r.addBot({});
    let end = null;
    r.on((evs) => {
      for (const e of evs) if (e.type === 'sngEnd') end = e;
      const t = r.table;
      const chips = t.seats.reduce((a, p) => a + (p ? p.stack : 0), 0) + (t.hand && t.hand.phase !== 'done' ? t.potTotal() : 0);
      if (!end) assert.equal(chips, 9000, 'fichas de torneo conservadas');
    });
    r.startSng();
    await waitFor(() => end);
    r.stop();
    assert.equal(end.results.length, 6);
    assert.deepEqual(end.results.map((x) => x.place), [1, 2, 3, 4, 5, 6]);
    assert.equal(end.pool, 6000);
    assert.equal(end.results[0].prize + end.results[1].prize, 6000);
    console.log(`   SNG terminado en ${r.handsPlayed} manos, ganador ${end.results[0].name}`);
  }
  // Cash con un humano que juega y se va: recibe su stack.
  {
    const r = fastRunner({ config: { mode: 'cash', maxSeats: 6, smallBlind: 5, bigBlind: 10 }, targetBots: 4, speed: 1000, verifiable: true });
    r.addHuman({ id: 'yo', name: 'Yo', stack: 1000 });
    for (let i = 0; i < 4; i++) r.addBot({});
    let hands = 0, cashout = null, verified = 0, lastView = null;
    r.on(async (evs) => {
      for (const e of evs) {
        if (e.type === 'handEnd') hands++;
        if (e.type === 'cashout' && e.id === 'yo') cashout = e;
        if (e.type === 'deckReveal' && lastView) {
          const v = lastView;
          const res = await verifyDeck(e, { myCards: v.seats[v.you]?.cards, mySeat: v.you, board: v.hand?.board || [] });
          assert.ok(res.ok, res.reason);
          verified++;
        }
      }
      const v = r.view('yo');
      if (v.hand && v.hand.phase === 'done') lastView = v;
      if (v.legal && !cashout) setTimeout(() => r.act('yo', { type: v.legal.canCheck ? 'check' : (Math.random() < 0.5 ? 'call' : 'fold') }), 0);
    });
    r.start();
    await waitFor(() => hands >= 25);
    const res = r.removeHuman('yo');
    if (res >= 0) cashout = { stack: res };
    await waitFor(() => cashout);
    r.stop();
    assert.ok(cashout.stack >= 0);
    assert.ok(verified >= 20, 'barajas verificadas: ' + verified);
    console.log(`   Cash: ${hands} manos, retirada con ${cashout.stack}, ${verified} barajas verificadas`);
  }
}
