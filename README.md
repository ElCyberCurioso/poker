# Poker · Texas Hold'em entre amigos

Texas Hold'em No-Limit con **fichas ficticias**, pensado para desplegarse como sitio estático en **GitHub Pages**. Sin servidor propio, sin registro y sin dependencias de compilación: HTML, CSS y JavaScript con módulos ES.

## Qué incluye

**Jugar**
- Seis mesas de cash contra bots (de 5/10 a 500/1.000), incluida una mesa completa de 9 y una heads-up. Entras con parte de tu saldo y te llevas tu stack al salir.
- Cuatro torneos Sit & Go (2, 6 y 9 jugadores) con ciegas crecientes, antes y premios por puesto.
- Seis estilos de bot con personalidad propia (Roca, Regular, Agresivo, Maníaco, Pescadito, Tiburón): usan rangos de apertura por posición antes del flop y equity Monte Carlo frente a rangos estimados después. Sólo ven sus propias cartas.
- Salas privadas online (cash o torneo) con código de 6 caracteres, enlace, QR, contraseña opcional, bots de relleno, chat y reacciones. El anfitrión puede pausar, añadir/quitar bots, expulsar y empezar el torneo.

**Mesa**
- Motor completo: ciegas y antes, botes laterales, devolución de apuestas no igualadas, regla del all-in incompleto que no reabre la acción, reparto de fichas impares, heads-up con el orden correcto.
- Animaciones de reparto, apuestas que vuelan al bote, temporizador circular, resaltado de la combinación ganadora.
- Atajos de teclado (F, C, R, flechas, Intro), tamaños rápidos (2,5 BB, ⅓, ½, ⅔, bote, all-in), pre-acciones ("pasar o no ir", "igualar lo que sea").
- Ayuda de juego opcional: nombre de tu mano, equity estimada y las pot odds que necesitas.
- Diseño adaptado a escritorio, tablet, móvil en vertical y móvil en horizontal.

**Aprender**
- Academia con 12 lecciones (reglas, ranking de manos, posiciones, rangos por posición con cuadrícula 13×13, tipos de manos iniciales, tamaños de apuesta, pot odds y outs, texturas del tablero, juego postflop, torneos, bankroll y glosario) con widgets interactivos y test final que da fichas.
- Seis entrenadores: ¿quién gana?, nombra la mano, abrir o tirar por posición, pot odds, cuenta los outs y equity preflop.
- Herramientas: calculadora de equity (hasta 6 jugadores, exacta cuando es posible), calculadora de pot odds y outs, visor de rangos e historial de tus últimas 60 manos.

**Progreso**
- Saldo persistente en el navegador (empiezas con 10.000), ruleta con un giro gratis cada 4 horas y probabilidades públicas, bono diario con racha de 7 días, misiones diarias, 23 logros, niveles por experiencia, estadísticas (VPIP, PFR, bb/100…) y gráfica de saldo.
- Si cierras o recargas la pestaña en mitad de una mesa, el stack se recupera al volver.
- Exportar/importar progreso para llevarlo a otro dispositivo.
- Instalable como app (PWA) y jugable sin conexión contra bots.

## Desplegar en GitHub Pages

1. Crea un repositorio nuevo en GitHub y sube el contenido de esta carpeta a la rama `main` (incluido el archivo oculto `.nojekyll`).
2. En el repositorio ve a **Settings → Pages**.
3. Elige una de las dos opciones:
   - **GitHub Actions** (recomendado): en *Source* selecciona "GitHub Actions". El workflow incluido (`.github/workflows/pages.yml`) ejecuta los tests del motor y publica el sitio en cada push a `main`.
   - **Deploy from a branch**: selecciona la rama `main` y la carpeta `/ (root)`. No hace falta compilar nada.
4. En un par de minutos la app estará en `https://TU_USUARIO.github.io/NOMBRE_DEL_REPO/`.

Todas las rutas son relativas, así que funciona igual en un dominio propio o en una subcarpeta.

## Probar en local

```bash
python3 -m http.server 8080      # o: npm run serve
# abre http://localhost:8080
```

Los módulos ES no funcionan abriendo `index.html` con doble clic (`file://`): hace falta un servidor.

**Multijugador sin red:** añade `?net=local` a la URL (`http://localhost:8080/?net=local`). Las salas usarán `BroadcastChannel` y podrás abrir el anfitrión y los invitados en varias pestañas del mismo navegador.

**Tests del motor** (Node 18+):

```bash
npm test
```

Comprueban el evaluador de manos, la equity exacta (AA contra KK ≈ 81,9 %), los botes laterales, las reglas de subida, un fuzz de más de mil manos aleatorias con conservación exacta de fichas (incluidas desconexiones y jugadores que se levantan a mitad de mano), los perfiles de los bots, un Sit & Go completo y la verificación de barajas.

## Cómo funciona el multijugador

- La mesa se ejecuta en el navegador de quien crea la sala (anfitrión autoritativo). Los invitados se conectan directamente por **WebRTC** usando [PeerJS](https://peerjs.com/); el servidor público de PeerJS sólo pone en contacto a los navegadores y sus servidores TURN ayudan cuando la red lo necesita.
- Cada invitado recibe una vista personalizada: nunca le llegan las cartas privadas de los demás.
- El anfitrión debe dejar la pestaña abierta durante la partida. Si un invitado pierde la conexión, conserva su asiento 90 segundos (se le pasa o retira automáticamente) y se reconecta solo. Si el anfitrión cierra la sala, cada invitado recupera su stack.
- Algunas redes corporativas o de datos móviles muy restrictivas pueden bloquear WebRTC.

### Seguridad y modelo de confianza

- **Baraja verificable**: antes de repartir cada mano, el anfitrión publica `SHA-256(baraja + sal)`; al terminar revela la baraja y la sal, y cada invitado comprueba el hash, que no hay cartas repetidas y que sus propias cartas y el tablero salen de las posiciones correctas. El resultado aparece junto al título de la mesa ("verificada"). Esto impide cambiar la baraja a mitad de mano, pero el anfitrión técnicamente puede ver todas las cartas: jugad con gente de confianza.
- Las barajas se mezclan con Fisher–Yates usando `crypto.getRandomValues` con rechazo para evitar sesgo.
- Todo lo que llega por la red se valida (tipos, longitudes, acciones permitidas, cantidades enteras) y tiene límite de frecuencia; mensajes de más de 64 KB se descartan. Nombres y chat se insertan siempre como texto (`textContent`), nunca como HTML, y se eliminan caracteres de control y de control bidireccional.
- Las credenciales de reconexión de cada invitado son aleatorias y se guardan sólo en la pestaña (`sessionStorage`).
- Al ser fichas ficticias guardadas en `localStorage`, cualquiera puede editarlas desde la consola del navegador. No hay nada que ganar haciéndolo.

## Estructura

```
index.html              Shell, iconos y palos en SVG
css/app.css             Sistema visual completo (tokens, mesa, pantallas)
js/main.js              Router por hash, shell, avisos globales
js/core/                Lógica pura, sin DOM (testeada en Node)
  cards.js              Cartas, barajado criptográfico
  evaluator.js          Evaluador de 5–7 cartas con tablas precalculadas
  equity.js             Equity Monte Carlo / exhaustiva, frente a rangos
  ranges.js             Notación de rangos, tablas de apertura, posiciones
  engine.js             Máquina de estados de Texas Hold'em No-Limit
  bots.js               Decisiones de los bots por estilo
js/game/runner.js       Ritmo de juego, temporizadores, Sit & Go, baraja verificable
js/game/session.js      Sesión local y registro de estadísticas/logros
js/net/                 Transporte P2P (PeerJS / BroadcastChannel), anfitrión, invitado
js/ui/                  Pantallas: mesa, lobby, academia, entrenadores, herramientas, ruleta, perfil
js/data/                Lecciones, mesas, logros, misiones, premios de la ruleta
vendor/                 PeerJS 1.5.5 y qrcode-generator 2.0.4 (MIT)
assets/                 Iconos y fuentes (Bodoni Moda y Manrope, SIL OFL)
sw.js, manifest.webmanifest  PWA
tests/                  Tests del motor (npm test)
```

## Personalizar

- **Mesas y torneos**: `js/data/tables.js`.
- **Premios de la ruleta y tiempo entre giros**: `WHEEL_SEGMENTS` y `WHEEL_COOLDOWN_MS` en `js/data/progress.js`.
- **Saldo inicial, bono diario, logros y misiones**: también en `js/data/progress.js`.
- **Rangos de apertura**: `OPEN_RANGES` en `js/core/ranges.js` (notación estándar: `22+, A2s+, KTo+`).
- **Estilos de bot**: `BOT_STYLES` en `js/core/bots.js`.
- **Colores**: variables CSS al principio de `css/app.css`.

Si cambias archivos y quieres que los usuarios con la app instalada reciban la nueva versión sin esperar, sube el número de `CACHE` en `sw.js` (de todas formas el service worker siempre intenta primero la red).

## Créditos

- [PeerJS](https://github.com/peers/peerjs) (MIT) para WebRTC.
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) de Kazuhiko Arase (MIT).
- Tipografías [Bodoni Moda](https://github.com/indestructible-type/Bodoni) y [Manrope](https://github.com/sharanda/manrope) (SIL Open Font License), servidas desde el propio sitio.

Las fichas no tienen valor real y no se pueden comprar ni canjear. Si el juego con dinero real te genera problemas, en España puedes encontrar ayuda en [jugarbien.es](https://www.jugarbien.es).
