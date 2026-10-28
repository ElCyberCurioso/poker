import { newInviteKey, isInviteKey, safeEqual, parseInvite } from '../js/net/invite.js';

export function run(assert) {
  // Toda clave generada debe validarse (y no repetirse).
  const seen = new Set();
  for (let i = 0; i < 5000; i++) {
    const k = newInviteKey();
    assert.ok(isInviteKey(k), 'clave generada no válida: ' + k);
    seen.add(k);
  }
  assert.equal(seen.size, 5000, 'claves repetidas');
  assert.ok(!isInviteKey('abcdefghijklmnop'), 'contiene l y o, ambiguas');
  assert.ok(!isInviteKey('ABCDEFGHJKMNPQRS'), 'mayúsculas');
  assert.ok(!isInviteKey('abc'), 'longitud');
  assert.ok(!isInviteKey(null));
  assert.ok(safeEqual('abc', 'abc'));
  assert.ok(!safeEqual('abc', 'abd'));
  assert.ok(!safeEqual('abc', 'abcd'));
  assert.ok(!safeEqual('abc', undefined));
  const k = newInviteKey();
  assert.deepEqual(parseInvite(`https://x.github.io/poker/#/sala/ABC234/${k}`), { code: 'ABC234', key: k, isLink: true });
  assert.deepEqual(parseInvite('https://x.github.io/poker/?net=local#/sala/abc234'), { code: 'ABC234', key: null, isLink: true });
  assert.deepEqual(parseInvite(' abc-234 '), { code: 'ABC234', key: null, isLink: false });
  assert.equal(parseInvite(`https://x/#/sala/ABC234/${'l'.repeat(16)}`).key, null, 'clave inválida se descarta');
}
