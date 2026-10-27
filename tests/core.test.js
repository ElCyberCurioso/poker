import { parseCards, cardToStr } from '../js/core/cards.js';
import { evalCards, describeScore, bestFive, CAT } from '../js/core/evaluator.js';
import { calcEquity } from '../js/core/equity.js';
import { parseRange, rangePercent, OPEN_RANGES, positionLabels, gridKey, ALL_KEYS } from '../js/core/ranges.js';

export function run(assert) {
  const ev = (s) => evalCards(parseCards(s));
  const d = (s) => describeScore(ev(s));
  assert.equal(d('AsKsQsJsTs2h3d'), 'Escalera real');
  assert.equal(d('9h8h7h6h5h Ac Ad'), 'Escalera de color al Nueve');
  assert.equal(d('As2s3d4c5h KdQd'), 'Escalera al Cinco');
  assert.equal(d('KhKdKsKc 2h 3d 9c'), 'Póker de Reyes');
  assert.equal(d('QhQdQs 3c 3h 3d 9c'), 'Full de Damas y Treses');
  assert.equal(d('Ah 9h 7h 4h 2h Kd Kc'), 'Color al As');
  assert.equal(d('7h7d7s Ac Kd 2c 4h'), 'Trío de Sietes');
  assert.equal(d('KhKd 7s7c Ac Ad 2h'), 'Doble pareja, Ases y Reyes');
  assert.equal(d('Jh Jd 9s 8c 4d 3h 2c'), 'Pareja de Jotas');
  assert.equal(d('Ah Qd 9s 8c 4d 3h 2c'), 'Carta alta: As');
  // desempates
  assert.ok(ev('AhAd Kc 7s 4d 3h 2c') > ev('AsAc Qc 7h 4d 3h 2c'), 'kicker de pareja');
  assert.ok(ev('KhKd 7s7c Qc 3d 2h') > ev('KsKc 7h7d Jc 3d 2h'), 'kicker doble pareja');
  assert.equal(ev('AhKd 7s7c 2c 2d 2h'), ev('AsKc 7h7d 2c 2d 2h'), 'empate exacto');
  assert.ok(ev('6h5h 2s 3c 4d Kd Qs') > ev('Ah5d 2s 3c 4d Kd Qs'), 'escalera al 6 > rueda');
  assert.ok(ev('2c2d 2h 3s 3d 4c 4h') > ev('Ac Ad Ah Kc Qd Jc 9h'), 'full > trío');
  assert.equal(evalCards(parseCards('KhKdKs 7c7h 7d 2s')) >> 20, CAT.FULL_HOUSE);
  const bf = bestFive(parseCards('AsKsQsJsTs2h3d'));
  assert.equal(bf.cards.map(cardToStr).sort().join(''), ['As','Ks','Qs','Js','Ts'].sort().join(''));
  // equity exacta conocida: AA vs KK preflop ≈ 81.9%
  const r = calcEquity({ hands: [parseCards('AhAs'), parseCards('KdKc')], board: [], iterations: 60000 });
  assert.ok(Math.abs(r.equity[0] - 0.819) < 0.01, 'AA vs KK ' + r.equity[0]);
  // en el turn es exhaustivo
  const r2 = calcEquity({ hands: [parseCards('AhKh'), parseCards('QsQd')], board: parseCards('2h7hJc3s') });
  assert.ok(r2.exhaustive && r2.samples === 44, 'river exhaustivo');
  // rangos
  const s = parseRange('22+, A2s+, KTo+');
  assert.ok(s.has('22') && s.has('AA') && s.has('A2s') && s.has('AKs') && s.has('KTo') && s.has('KQo') && !s.has('K9o'));
  assert.equal(parseRange('A5s-A3s').size, 3);
  for (const [k, v] of Object.entries(OPEN_RANGES)) {
    const pct = rangePercent(parseRange(v.text));
    assert.ok(pct > 0.05 && pct < 0.9, k + ' ' + pct);
  }
  assert.deepEqual(positionLabels(6), ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO']);
  assert.equal(gridKey(0, 1), 'AKs');
  assert.equal(gridKey(1, 0), 'AKo');
  assert.equal(new Set(ALL_KEYS).size, 169);
}
