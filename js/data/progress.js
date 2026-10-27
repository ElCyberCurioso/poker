// Logros, misiones diarias, niveles y premios de la ruleta.

export const ACHIEVEMENTS = [
  { id: 'primera-mano', icon: '🂠', name: 'Bienvenido a la mesa', desc: 'Juega tu primera mano.', reward: 500 },
  { id: 'primer-bote', icon: '🪙', name: 'Primer bote', desc: 'Gana tu primer bote.', reward: 500 },
  { id: 'cien-manos', icon: '💯', name: 'Cien manos', desc: 'Juega 100 manos.', reward: 2000 },
  { id: 'mil-manos', icon: '🏛️', name: 'Mil manos', desc: 'Juega 1.000 manos.', reward: 10000 },
  { id: 'ladron', icon: '🥷', name: 'Ladrón de ciegas', desc: 'Sube preflop y gana sin que nadie pague.', reward: 750 },
  { id: 'doblar', icon: '⚡', name: 'Doblar', desc: 'Gana un bote en el que estabas all-in.', reward: 1500 },
  { id: 'bote-grande', icon: '🏆', name: 'Bote de leyenda', desc: 'Gana un bote de más de 100 ciegas grandes.', reward: 3000 },
  { id: 'full', icon: '🏠', name: 'Casa llena', desc: 'Gana una mano con full.', reward: 1500 },
  { id: 'poker', icon: '🎯', name: 'Póker', desc: 'Gana una mano con póker (cuatro iguales).', reward: 4000 },
  { id: 'escalera-color', icon: '🌈', name: 'Escalera de color', desc: 'Gana una mano con escalera de color.', reward: 10000 },
  { id: 'escalera-real', icon: '👑', name: 'Escalera real', desc: 'Gana con la mejor mano posible.', reward: 50000 },
  { id: 'itm', icon: '🎟️', name: 'En premios', desc: 'Cobra en un Sit & Go.', reward: 1000 },
  { id: 'sng-ganado', icon: '🥇', name: 'Campeón', desc: 'Gana un Sit & Go.', reward: 3000 },
  { id: 'online', icon: '🌐', name: 'Mesa de amigos', desc: 'Juega una mano online.', reward: 1000 },
  { id: 'anfitrion', icon: '🗝️', name: 'Anfitrión', desc: 'Crea una sala privada.', reward: 500 },
  { id: 'estudiante', icon: '📘', name: 'Estudiante', desc: 'Completa 3 lecciones de la academia.', reward: 1500 },
  { id: 'erudito', icon: '🎓', name: 'Erudito', desc: 'Completa todas las lecciones.', reward: 10000 },
  { id: 'racha-10', icon: '🧠', name: 'Cabeza fría', desc: 'Acierta 10 seguidas en un entrenador.', reward: 2000 },
  { id: 'ruleta-10', icon: '🎡', name: 'Fiel a la ruleta', desc: 'Gira la ruleta 10 veces.', reward: 2000 },
  { id: 'jackpot', icon: '💎', name: 'Premio gordo', desc: 'Consigue el premio máximo de la ruleta.', reward: 0 },
  { id: 'racha-7', icon: '📅', name: 'Semana completa', desc: 'Recoge el bono diario 7 días seguidos.', reward: 5000 },
  { id: 'cien-mil', icon: '💰', name: 'Cien mil', desc: 'Alcanza 100.000 fichas.', reward: 5000 },
  { id: 'millonario', icon: '🏦', name: 'Millonario', desc: 'Alcanza 1.000.000 de fichas.', reward: 25000 },
];

export const MISSION_POOL = [
  { id: 'hands20', event: 'hand', goal: 20, reward: 1500, text: 'Juega 20 manos' },
  { id: 'hands50', event: 'hand', goal: 50, reward: 3500, text: 'Juega 50 manos' },
  { id: 'win5', event: 'win', goal: 5, reward: 2000, text: 'Gana 5 botes' },
  { id: 'sd3', event: 'showdownWin', goal: 3, reward: 2000, text: 'Gana 3 manos en el showdown' },
  { id: 'trainer10', event: 'trainerCorrect', goal: 10, reward: 1500, text: 'Acierta 10 preguntas en los entrenadores' },
  { id: 'lesson1', event: 'lessonView', goal: 1, reward: 1000, text: 'Repasa una lección de la academia' },
  { id: 'spin1', event: 'spin', goal: 1, reward: 500, text: 'Gira la ruleta' },
  { id: 'twopair', event: 'winTwoPairPlus', goal: 2, reward: 2000, text: 'Gana 2 botes con doble pareja o mejor' },
  { id: 'steal2', event: 'steal', goal: 2, reward: 1500, text: 'Roba las ciegas 2 veces' },
  { id: 'online10', event: 'onlineHand', goal: 10, reward: 2500, text: 'Juega 10 manos online' },
  { id: 'equity3', event: 'equityCalc', goal: 3, reward: 800, text: 'Usa la calculadora de equity 3 veces' },
];

// Selección determinista de 3 misiones por día.
export function missionsForDay(dayKey) {
  let seed = 0;
  for (const ch of dayKey) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const pool = MISSION_POOL.slice();
  const out = [];
  while (out.length < 3 && pool.length) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    out.push(pool.splice(seed % pool.length, 1)[0]);
  }
  return out;
}

export function levelFromXp(xp) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 60)) + 1;
}
export function xpForLevel(level) {
  return (level - 1) * (level - 1) * 60;
}
export function levelTitle(level) {
  if (level >= 30) return 'Leyenda';
  if (level >= 20) return 'Tiburón';
  if (level >= 15) return 'Profesional';
  if (level >= 10) return 'Habitual';
  if (level >= 5) return 'Aficionado';
  return 'Novato';
}

// Ruleta: segmentos iguales en pantalla; la probabilidad real de cada premio se muestra al jugador.
export const WHEEL_SEGMENTS = [
  { amount: 500, weight: 16, color: '#5E1A24' },
  { amount: 1500, weight: 12, color: '#0F4A45' },
  { amount: 750, weight: 15, color: '#3A2E1F' },
  { amount: 5000, weight: 4, color: '#5E1A24' },
  { amount: 1000, weight: 14, color: '#0F4A45' },
  { amount: 25000, weight: 1, color: '#C8A24E', jackpot: true },
  { amount: 600, weight: 15, color: '#3A2E1F' },
  { amount: 2500, weight: 8, color: '#5E1A24' },
  { amount: 1200, weight: 13, color: '#0F4A45' },
  { amount: 10000, weight: 2, color: '#3A2E1F' },
  { amount: 800, weight: 14, color: '#5E1A24' },
  { amount: 2000, weight: 10, color: '#0F4A45' },
];
export const WHEEL_COOLDOWN_MS = 4 * 60 * 60 * 1000;

export const DAILY_BONUS = [500, 750, 1000, 1500, 2000, 3000, 5000];

export const STARTING_BALANCE = 10000;
export const BAILOUT_AMOUNT = 2000;
export const BAILOUT_COOLDOWN_MS = 30 * 60 * 1000;
export const TRAINER_DAILY_CAP = 3000;
