// Enlaces de invitación a salas privadas.
// Formato: <app>#/sala/CODIGO/CLAVE. La clave va en el fragmento (#), que el navegador nunca envía al servidor
// que aloja la página, y sustituye a la contraseña: quien abre el enlace entra y se sienta sin teclear nada.

const KEY_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'; // 32 símbolos sin caracteres ambiguos
const KEY_LEN = 16; // 16 × 5 bits = 80 bits de entropía

export function newInviteKey() {
  const a = new Uint8Array(KEY_LEN);
  crypto.getRandomValues(a);
  return [...a].map((b) => KEY_ALPHABET[b & 31]).join('');
}

export function isInviteKey(s) {
  return typeof s === 'string' && s.length === KEY_LEN && [...s].every((ch) => KEY_ALPHABET.includes(ch));
}

// Comparación en tiempo constante (no filtra por cuánto tarda en fallar).
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function base() {
  return `${location.origin}${location.pathname}${location.search}`;
}

export function roomLink(code) {
  return `${base()}#/sala/${code}`;
}

export function inviteLink(code, key) {
  return key ? `${base()}#/sala/${code}/${key}` : roomLink(code);
}

// Acepta un código suelto ("ABC234"), un enlace de sala o un enlace de invitación completo.
export function parseInvite(text) {
  const s = String(text || '').trim();
  const m = s.match(/#\/sala\/([A-Za-z0-9]{6})(?:\/([a-z0-9]{16}))?/);
  if (m) {
    const code = m[1].toUpperCase();
    const key = m[2] && isInviteKey(m[2]) ? m[2] : null;
    return { code, key, isLink: true };
  }
  const code = s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  return { code, key: null, isLink: false };
}

export const ACCESS_MODES = [
  { value: 'code', label: 'Código o invitación', desc: 'Entra cualquiera que tenga el código o un enlace de invitación.' },
  { value: 'password', label: 'Contraseña o invitación', desc: 'Con el código hace falta la contraseña; el enlace de invitación entra directamente.' },
  { value: 'invite', label: 'Sólo invitación', desc: 'Sólo se entra con un enlace de invitación vigente. El código por sí solo no sirve.' },
];
