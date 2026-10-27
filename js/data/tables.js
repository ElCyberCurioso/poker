// Catálogo de mesas contra bots. Los nombres son barrios y calles de Madrid.
export const CASH_TABLES = [
  { id: 'lavapies', name: 'Lavapiés', sb: 5, bb: 10, maxSeats: 6, bots: 5, level: 0, desc: 'Ciegas pequeñas y rivales que pagan demasiado. Ideal para empezar.' },
  { id: 'malasana', name: 'Malasaña', sb: 25, bb: 50, maxSeats: 6, bots: 5, level: 1, desc: 'Mezcla de habituales y jugadores sueltos.' },
  { id: 'gran-via', name: 'Gran Vía', sb: 10, bb: 20, maxSeats: 9, bots: 8, level: 1, desc: 'Mesa completa de nueve: la posición pesa todavía más.' },
  { id: 'cara-a-cara', name: 'Cara a cara', sb: 25, bb: 50, maxSeats: 2, bots: 1, level: 2, desc: 'Heads-up contra un solo rival. Aquí se juega casi todo.' },
  { id: 'chamberi', name: 'Chamberí', sb: 100, bb: 200, maxSeats: 6, bots: 5, level: 2, desc: 'Regulares agresivos que castigan los errores.' },
  { id: 'salamanca', name: 'Salamanca', sb: 500, bb: 1000, maxSeats: 6, bots: 5, level: 3, desc: 'Alta apuesta contra los mejores bots de la casa.' },
].map((t) => ({ ...t, mode: 'cash', minBuyIn: t.bb * 40, maxBuyIn: t.bb * 100 }));

export const SNG_TABLES = [
  { id: 'relampago', name: 'Relámpago', players: 6, buyIn: 1000, startingStack: 1500, levelHands: 6, level: 1, desc: 'Seis jugadores, ciegas rápidas. Cobran los dos primeros.' },
  { id: 'duelo', name: 'Duelo', players: 2, buyIn: 2500, startingStack: 1500, levelHands: 6, level: 2, desc: 'Torneo heads-up: el ganador se lo lleva todo.' },
  { id: 'mesa-final', name: 'Mesa final', players: 9, buyIn: 5000, startingStack: 2000, levelHands: 8, level: 2, desc: 'Nueve jugadores, premios para los tres primeros.' },
  { id: 'castellana', name: 'Castellana', players: 6, buyIn: 25000, startingStack: 3000, levelHands: 8, level: 3, desc: 'Torneo de alto nivel con stacks profundos.' },
].map((t) => ({ ...t, mode: 'sng' }));

export function findTable(id) {
  return CASH_TABLES.find((t) => t.id === id) || SNG_TABLES.find((t) => t.id === id) || null;
}
