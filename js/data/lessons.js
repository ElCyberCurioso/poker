// Contenido de la academia. Marcado estático propio (sin datos de usuario).
// Los marcadores <div data-w="..."></div> se sustituyen por widgets interactivos.

export const LESSONS = [
  {
    id: 'reglas',
    title: 'Cómo se juega una mano',
    summary: 'Ciegas, las cuatro rondas de apuestas y qué puedes hacer en cada turno.',
    minutes: 6,
    sections: [
      { h: 'El objetivo', body: `
<p>En Texas Hold'em cada jugador recibe <strong>dos cartas privadas</strong> y comparte <strong>cinco cartas comunitarias</strong> con el resto. Ganas el bote de dos maneras: enseñando la mejor combinación de cinco cartas al final (el <em>showdown</em>) o consiguiendo que todos los demás abandonen antes.</p>
<p>Tu mano final siempre son las <strong>cinco mejores cartas</strong> entre las siete disponibles: puedes usar tus dos cartas, una o ninguna.</p>` },
      { h: 'Las ciegas y el botón', body: `
<p>El <strong>botón</strong> (la ficha con la D) marca quién reparte y se mueve un puesto a la izquierda en cada mano. Los dos jugadores a su izquierda ponen apuestas obligatorias antes de ver las cartas:</p>
<ul><li><strong>Ciega pequeña (SB)</strong>: normalmente la mitad de la ciega grande.</li><li><strong>Ciega grande (BB)</strong>: la apuesta mínima de la mesa. En una mesa 25/50, la ciega grande es 50.</li></ul>
<p>Las ciegas garantizan que siempre haya algo por lo que pelear. En los torneos a veces se añade un <strong>ante</strong>: una pequeña aportación de todos los jugadores.</p>
<div class="callout"><p>En heads-up (dos jugadores) el botón pone la ciega pequeña y habla primero antes del flop, pero último en el resto de calles.</p></div>` },
      { h: 'Las cuatro rondas de apuestas', body: `
<ol>
<li><strong>Preflop</strong>: con tus dos cartas. Habla primero el jugador a la izquierda de la ciega grande.</li>
<li><strong>Flop</strong>: se descubren tres cartas comunitarias. Desde aquí empieza a hablar el primer jugador activo a la izquierda del botón.</li>
<li><strong>Turn</strong>: se descubre la cuarta carta.</li>
<li><strong>River</strong>: la quinta y última carta. Si quedan dos o más jugadores tras apostar, hay showdown.</li>
</ol>` },
      { h: 'Tus opciones en cada turno', body: `
<table><thead><tr><th>Acción</th><th>Cuándo</th><th>Qué hace</th></tr></thead><tbody>
<tr><td><strong>Pasar</strong> (check)</td><td>Nadie ha apostado en la ronda</td><td>Cedes el turno sin poner fichas.</td></tr>
<tr><td><strong>Apostar</strong> (bet)</td><td>Nadie ha apostado</td><td>Abres la ronda. Mínimo, una ciega grande.</td></tr>
<tr><td><strong>Igualar</strong> (call)</td><td>Hay una apuesta</td><td>Pones lo mismo que la apuesta más alta.</td></tr>
<tr><td><strong>Subir</strong> (raise)</td><td>Hay una apuesta</td><td>Aumentas la apuesta. La subida mínima es igual a la última subida.</td></tr>
<tr><td><strong>No ir</strong> (fold)</td><td>Siempre</td><td>Abandonas la mano y lo que hayas puesto se queda en el bote.</td></tr>
<tr><td><strong>All-in</strong></td><td>Siempre</td><td>Apuestas todas tus fichas.</td></tr>
</tbody></table>
<p>Una ronda termina cuando todos los jugadores que siguen en la mano han puesto lo mismo (o están all-in).</p>` },
      { h: 'Botes laterales', body: `
<p>Si un jugador va all-in con menos fichas que los demás, sólo puede ganar lo que él mismo puede cubrir de cada rival. El resto de las apuestas forma un <strong>bote lateral</strong> que se disputan sólo quienes tenían fichas para cubrirlo. La mesa los calcula automáticamente y los muestra bajo el bote principal.</p>
<p>Un detalle que mucha gente desconoce: si alguien va all-in con una subida <strong>menor que la subida mínima</strong>, los jugadores que ya habían hablado sólo pueden igualar o retirarse; no pueden volver a subir.</p>` },
    ],
    quiz: [
      { q: 'En una mesa 50/100, ¿cuánto pone la ciega grande?', options: ['50', '100', '150', 'Lo que quiera'], answer: 1, explain: 'La ciega grande es el segundo número de las ciegas.' },
      { q: '¿Quién habla primero en el flop?', options: ['El jugador a la izquierda de la ciega grande', 'El botón', 'El primer jugador activo a la izquierda del botón', 'Quien subió preflop'], answer: 2, explain: 'Después del flop siempre empieza el primer jugador que siga en la mano a la izquierda del botón.' },
      { q: 'Tienes A♠K♠ y el tablero es Q♠ J♠ T♠ 2♦ 3♣. ¿Cuántas de tus cartas usas?', options: ['Ninguna', 'Una', 'Las dos'], answer: 2, explain: 'A♠ K♠ Q♠ J♠ T♠ es una escalera real: usas tus dos cartas y tres del tablero.' },
    ],
  },
  {
    id: 'manos',
    title: 'Ranking de manos',
    summary: 'De la escalera real a la carta alta, con probabilidades reales y desempates.',
    minutes: 7,
    sections: [
      { h: 'De mejor a peor', body: `
<p>Estas son las diez categorías, de la más fuerte a la más débil. Junto a cada una verás la probabilidad de terminar con ella usando siete cartas (dos propias y cinco comunitarias).</p>
<div data-w="ladder"></div>` },
      { h: 'Desempates y kicker', body: `
<p>Cuando dos jugadores tienen la misma categoría, gana quien tenga las cartas más altas <strong>dentro de su combinación de cinco</strong>:</p>
<ul>
<li>Dos parejas iguales se deciden por el <strong>kicker</strong> (la carta acompañante más alta). A♥A♦ K♣ 7♠ 4♦ gana a A♠A♣ Q♣ 7♥ 4♦.</li>
<li>Con doble pareja se compara primero la pareja alta, luego la baja y por último el kicker.</li>
<li>En la escalera sólo importa la carta más alta. La escalera más baja es A-2-3-4-5 (la "rueda"): el as cuenta como 1.</li>
<li>Los palos <strong>nunca</strong> desempatan. Si las cinco mejores cartas son iguales, el bote se reparte.</li>
</ul>
<div class="callout"><p>Error clásico: con el tablero K♠ K♦ 9♣ 9♥ 5♠, tu mano 7♣7♦ no forma tres parejas. Tu mejor mano es K-K-9-9-7, y cualquiera con una carta más alta que el 7 te gana por kicker.</p></div>` },
      { h: 'El color y la escalera', body: `
<p>Para el <strong>color</strong> necesitas cinco cartas del mismo palo; para la <strong>escalera</strong>, cinco valores consecutivos de cualquier palo. Con tres cartas del mismo palo en la mesa, cualquier jugador con dos cartas de ese palo tiene color: vigila esos tableros.</p>` },
    ],
    quiz: [
      { q: '¿Qué gana: un color o un full?', options: ['El color', 'El full', 'Depende del palo'], answer: 1, explain: 'El full (trío + pareja) es más raro que el color y está por encima en el ranking.' },
      { q: 'Tablero: A♣ K♦ 9♥ 9♠ 2♣. Tú tienes A♥ 3♦ y tu rival K♠ Q♠. ¿Quién gana?', options: ['Tú, con doble pareja de ases y nueves', 'Tu rival, con doble pareja de reyes', 'Empate'], answer: 0, explain: 'Ases y nueves gana a reyes y nueves: se compara primero la pareja alta.' },
      { q: '¿Cuál es la escalera más baja posible?', options: ['2-3-4-5-6', 'A-2-3-4-5', '3-4-5-6-7'], answer: 1, explain: 'El as puede jugar como carta baja en la "rueda", A-2-3-4-5.' },
      { q: 'Dos jugadores tienen color al as en corazones y el resto de cartas idénticas salvo el palo de otra carta. ¿Quién gana?', options: ['El que tenga corazones más altos', 'Se reparte el bote', 'Gana picas'], answer: 1, explain: 'Los palos no tienen jerarquía en Texas Hold\'em.' },
    ],
  },
  {
    id: 'posiciones',
    title: 'Posiciones en la mesa',
    summary: 'Por qué el botón es el mejor asiento y cómo cambia tu estrategia según dónde estés.',
    minutes: 6,
    sections: [
      { h: 'La posición es información', body: `
<p>Actuar <strong>después</strong> que tus rivales es una ventaja enorme: ves lo que hacen antes de decidir. Por eso un mismo par de cartas vale más en el botón que en la primera posición. Se dice que estás <em>en posición</em> (IP) cuando hablas después de tu rival en las calles postflop, y <em>fuera de posición</em> (OOP) cuando hablas antes.</p>
<p>Pulsa cada asiento para ver qué significa y qué porcentaje de manos se suele abrir desde ahí en una mesa de seis:</p>
<div data-w="positions"></div>` },
      { h: 'Los cuatro grupos', body: `
<ul>
<li><strong>Posiciones tempranas</strong> (UTG, UTG+1): tienes a casi toda la mesa detrás. Abre sólo manos fuertes.</li>
<li><strong>Posiciones medias</strong> (MP, LJ, HJ): puedes añadir algunas manos especulativas como conectores del mismo palo.</li>
<li><strong>Posiciones tardías</strong> (CO, BTN): la mejor zona para robar las ciegas. El botón actúa el último en el flop, turn y river.</li>
<li><strong>Ciegas</strong> (SB, BB): ya has puesto dinero, pero jugarás fuera de posición toda la mano. La ciega grande defiende con un rango amplio porque recibe buen precio.</li>
</ul>` },
      { h: 'Consecuencias prácticas', body: `
<ul>
<li>Cuantos menos jugadores quedan por hablar detrás de ti, más manos puedes abrir.</li>
<li>En posición puedes controlar el tamaño del bote: pasar detrás para ver una carta gratis o apostar cuando tu rival muestra debilidad.</li>
<li>Fuera de posición, prefiere manos que jueguen bien solas (parejas altas, ases fuertes) y evita las que necesitan ver muchas cartas baratas.</li>
</ul>` },
    ],
    quiz: [
      { q: '¿Qué posición actúa la última en el flop, turn y river?', options: ['La ciega grande', 'El botón', 'UTG', 'El cutoff'], answer: 1, explain: 'El botón habla el último en todas las calles después del flop.' },
      { q: 'En una mesa de 6, ¿desde dónde abrirías más manos?', options: ['UTG', 'HJ', 'Botón'], answer: 2, explain: 'Desde el botón sólo quedan las ciegas por hablar y además tendrás posición.' },
      { q: 'Estás en la ciega grande y el botón sube. Si pagas, ¿jugarás en posición?', options: ['Sí', 'No'], answer: 1, explain: 'La ciega grande habla antes que el botón en todas las calles postflop.' },
    ],
  },
  {
    id: 'rangos',
    title: 'Rangos de apertura por posición',
    summary: 'La cuadrícula 13×13, la notación de rangos y qué manos abrir desde cada asiento.',
    minutes: 8,
    sections: [
      { h: 'Pensar en rangos', body: `
<p>Un buen jugador no piensa "mi rival tiene ases", sino "mi rival tiene <strong>uno de estos grupos de manos</strong>". Ese grupo es su <em>rango</em>. Y tú también tienes uno: las manos que abres desde cada posición.</p>
<p>Hay 1.326 combinaciones de dos cartas, que se agrupan en 169 manos distintas:</p>
<ul><li><strong>13 parejas</strong> (AA, KK…), de 6 combinaciones cada una.</li><li><strong>78 manos del mismo palo</strong> (suited, "s"), de 4 combinaciones.</li><li><strong>78 manos de palos distintos</strong> (offsuit, "o"), de 12 combinaciones.</li></ul>
<p>Por eso AKo es tres veces más frecuente que AKs.</p>` },
      { h: 'La cuadrícula', body: `
<p>En la cuadrícula las parejas forman la diagonal; por encima están las manos suited y por debajo las offsuit. Elige una posición para ver un rango de apertura estándar (para cuando nadie ha entrado antes que tú) en partidas de cash con 100 ciegas:</p>
<div data-w="ranges"></div>
<div class="callout"><p>Son rangos de referencia simplificados, parecidos a los que salen de los solvers modernos. Úsalos como punto de partida y ajústalos a la mesa: abre más si los jugadores de detrás son pasivos y menos si te resuben mucho.</p></div>` },
      { h: 'Cómo leer la notación', body: `
<table><thead><tr><th>Notación</th><th>Significa</th></tr></thead><tbody>
<tr><td>77+</td><td>Parejas de sietes o mejores: 77, 88, 99, TT, JJ, QQ, KK, AA</td></tr>
<tr><td>ATs+</td><td>As con kicker de diez o más, mismo palo: ATs, AJs, AQs, AKs</td></tr>
<tr><td>KJo+</td><td>KJo y KQo</td></tr>
<tr><td>A5s-A2s</td><td>A5s, A4s, A3s, A2s</td></tr>
<tr><td>T = 10</td><td>En notación de póker el diez se escribe T</td></tr>
</tbody></table>` },
      { h: 'Defender la ciega grande', body: `
<p>Cuando el botón abre a 2,5 ciegas, la ciega grande sólo tiene que poner 1,5 más para ver un bote de 5,5: necesita ganar algo más del 27 % de las veces. Por eso se defiende con muchas manos. En rojo, las manos para resubir (3-bet); en verde, las que se pagan:</p>
<div data-w="defense"></div>` },
    ],
    quiz: [
      { q: '¿Cuántas combinaciones hay de AKs?', options: ['4', '6', '12', '16'], answer: 0, explain: 'Una por palo: A♠K♠, A♥K♥, A♦K♦ y A♣K♣.' },
      { q: '¿Qué manos incluye "99+"?', options: ['Sólo 99', '99 y todas las parejas por encima', 'Todas las parejas'], answer: 1, explain: 'El "+" significa "y todas las mejores del mismo tipo".' },
      { q: '¿Qué abre un rango más amplio en una mesa de seis?', options: ['UTG', 'Cutoff', 'Son iguales'], answer: 1, explain: 'Desde el cutoff quedan menos jugadores por hablar y tienes más opciones de jugar en posición.' },
    ],
  },
  {
    id: 'iniciales',
    title: 'Tipos de manos iniciales',
    summary: 'Premium, parejas, ases suited, broadways y conectores: cómo se juega cada familia.',
    minutes: 7,
    sections: [
      { h: 'Familias de manos', body: `
<p>Agrupar las manos por familias te ayuda a saber qué buscar en el flop y cuánto invertir:</p>
<table><thead><tr><th>Familia</th><th>Ejemplos</th><th>Cómo ganan</th></tr></thead><tbody>
<tr><td><strong>Premium</strong></td><td>AA, KK, QQ, JJ, AK</td><td>Por valor: sube, resube y construye el bote.</td></tr>
<tr><td><strong>Parejas medias</strong></td><td>TT–66</td><td>Overpair en tableros bajos o set (trío).</td></tr>
<tr><td><strong>Parejas bajas</strong></td><td>55–22</td><td>Casi sólo ligando set: 1 de cada 8,5 flops.</td></tr>
<tr><td><strong>Ases suited</strong></td><td>A5s, A9s</td><td>Color al as, escalera con la rueda, bloquean ases.</td></tr>
<tr><td><strong>Broadways</strong></td><td>KQ, QJ, AT</td><td>Top pair con buen kicker; cuidado con quedar dominado.</td></tr>
<tr><td><strong>Conectores suited</strong></td><td>98s, 76s</td><td>Proyectos y manos ocultas; necesitan stacks profundos.</td></tr>
<tr><td><strong>Basura</strong></td><td>72o, 93o</td><td>Casi nunca: tírala.</td></tr>
</tbody></table>` },
      { h: 'Manos dominadas', body: `
<p>Una mano está <strong>dominada</strong> cuando comparte una carta con otra mejor: AQ contra AK, KJ contra KQ. Si ambos ligáis la carta común, el kicker decide y casi siempre pierdes. AK contra AQ gana alrededor del 74 % de las veces. Por eso manos como KJo o QTo son peligrosas en posiciones tempranas y contra subidas.</p>` },
      { h: 'Datos útiles', body: `
<ul>
<li>Te reparten una pareja 1 de cada 17 manos (5,9 %). Una pareja concreta, como AA, 1 de cada 221.</li>
<li>Con una pareja, ligas set o mejor en el flop el 11,8 % de las veces.</li>
<li>Con dos cartas distintas, ligas al menos una pareja en el flop el 32,4 % de las veces: dos de cada tres veces fallas.</li>
<li>Con dos cartas del mismo palo, el flop trae color hecho el 0,8 % de las veces y proyecto de color el 10,9 %.</li>
</ul>
<p>Enfrentamientos típicos antes del flop:</p>
<table><thead><tr><th>Enfrentamiento</th><th class="r">Equity aprox.</th></tr></thead><tbody>
<tr><td>AA contra KK</td><td class="r">82 % – 18 %</td></tr>
<tr><td>Pareja contra dos cartas más altas (QQ contra AK)</td><td class="r">54 % – 46 %</td></tr>
<tr><td>Pareja contra dos cartas más bajas (99 contra 87s)</td><td class="r">77 % – 23 %</td></tr>
<tr><td>Mano dominada (AK contra AQ)</td><td class="r">74 % – 26 %</td></tr>
<tr><td>Dos cartas altas contra dos bajas (AK contra 76s)</td><td class="r">60 % – 40 %</td></tr>
</tbody></table>
<p>Puedes comprobar cualquier enfrentamiento en la <a href="#/herramientas">calculadora de equity</a>.</p>` },
    ],
    quiz: [
      { q: 'Con 44, ¿qué buscas principalmente en el flop?', options: ['Top pair', 'Ligar set', 'Proyecto de color'], answer: 1, explain: 'Las parejas bajas rara vez ganan sin mejorar; su gran baza es el set.' },
      { q: 'QQ contra AK antes del flop es aproximadamente…', options: ['80/20', '54/46', '30/70'], answer: 1, explain: 'Es el famoso "coin flip": la pareja es ligera favorita.' },
      { q: '¿Por qué KJo es arriesgada contra una subida de UTG?', options: ['Porque está dominada a menudo por AK, KQ o AJ', 'Porque tiene pocas combinaciones', 'Porque es suited'], answer: 0, explain: 'Los rangos tempranos tienen muchas manos que la dominan.' },
    ],
  },
  {
    id: 'apuestas',
    title: 'Tamaños de apuesta',
    summary: 'Cuánto subir preflop, cómo resubir y qué tamaño usar después del flop.',
    minutes: 9,
    sections: [
      { h: 'Antes del flop', body: `
<table><thead><tr><th>Situación</th><th>Tamaño habitual</th></tr></thead><tbody>
<tr><td>Abrir (nadie ha entrado)</td><td>2–2,5 ciegas grandes online; 3 en partidas en vivo</td></tr>
<tr><td>Abrir desde la ciega pequeña</td><td>3 ciegas grandes</td></tr>
<tr><td>Con jugadores que sólo han igualado (limpers)</td><td>Añade 1 ciega grande por cada uno</td></tr>
<tr><td>3-bet en posición</td><td>3 veces la subida</td></tr>
<tr><td>3-bet fuera de posición (desde las ciegas)</td><td>4 veces la subida</td></tr>
<tr><td>4-bet</td><td>2,2–2,5 veces la 3-bet</td></tr>
<tr><td>Squeeze (resubida tras subida y llamadas)</td><td>4 veces la subida + 1 por cada jugador que pagó</td></tr>
</tbody></table>
<p>Fuera de posición se sube más porque quieres cobrar más por la desventaja de hablar primero y reducir el número de rivales.</p>` },
      { h: 'Después del flop', body: `
<p>No hay un único tamaño correcto, pero sí una lógica:</p>
<ul>
<li><strong>Tableros secos</strong> (K♠ 7♦ 2♣): apuestas pequeñas, del 25–33 % del bote. Tu rival rara vez tiene algo y no hay proyectos que proteger.</li>
<li><strong>Tableros húmedos</strong> (9♥ 8♥ 6♣): apuestas grandes, del 66–75 % del bote. Cobras a los proyectos y proteges tu mano.</li>
<li><strong>River</strong>: con manos muy fuertes o faroles puros, apuesta grande (75 % del bote o más, incluso overbet). Con manos medias, pasa o apuesta pequeño para sacar valor fino.</li>
</ul>
<p>Una apuesta de continuación (<em>c-bet</em>) es la que hace en el flop quien subió antes del flop. Funciona porque el rango del agresor preflop suele ser más fuerte.</p>` },
      { h: 'Qué precio das con cada tamaño', body: `
<p>Cada tamaño tiene dos caras: la equity mínima que necesita tu rival para pagar y la frecuencia con la que tiene que retirarse para que tu farol gane dinero. Muévelo:</p>
<div data-w="sizing"></div>
<div class="callout"><p><strong>MDF</strong> (frecuencia mínima de defensa) = bote ÷ (bote + apuesta). Si defiendes menos que eso contra un rival que puede farolear, cualquier farol suyo gana dinero.</p></div>` },
      { h: 'SPR: cuánto queda por apostar', body: `
<p>El <strong>SPR</strong> (stack to pot ratio) es el stack efectivo dividido por el bote en el flop. Con SPR bajo (menos de 3) una top pair suele ser suficiente para ir all-in; con SPR alto (más de 10) necesitas manos mucho más fuertes para jugarte todo. Por eso las 3-bets, que reducen el SPR, simplifican las decisiones.</p>` },
    ],
    quiz: [
      { q: 'Nadie ha entrado y abres desde el botón online. ¿Tamaño típico?', options: ['1 BB', '2–2,5 BB', '6 BB'], answer: 1, explain: 'Las aperturas pequeñas arriesgan menos para robar las ciegas.' },
      { q: 'Apuestas el tamaño del bote. ¿Con qué frecuencia debe retirarse tu rival para que un farol puro gane?', options: ['33 %', '50 %', '66 %'], answer: 1, explain: 'Arriesgas 1 bote para ganar 1 bote: 1/(1+1) = 50 %.' },
      { q: 'En un flop 9♥ 8♥ 6♣ quieres proteger tu overpair. ¿Qué tamaño encaja mejor?', options: ['25 % del bote', '70 % del bote', 'Pasar siempre'], answer: 1, explain: 'Hay muchos proyectos: una apuesta grande les cobra y protege tu mano.' },
    ],
  },
  {
    id: 'odds',
    title: 'Pot odds, equity y outs',
    summary: 'Cuenta tus outs, aplica la regla del 2 y del 4 y decide si pagar sale rentable.',
    minutes: 9,
    sections: [
      { h: 'Equity', body: `
<p>La <strong>equity</strong> es la parte del bote que te corresponde según tus probabilidades de ganar. Si ganas el 40 % de las veces un bote de 1.000, tu equity vale 400. Se calcula contra las cartas (o el rango) de tu rival, no contra cualquier mano.</p>` },
      { h: 'Pot odds', body: `
<p>Las <strong>pot odds</strong> te dicen cuánta equity necesitas para que pagar sea rentable:</p>
<div class="callout"><p>Equity necesaria = lo que tienes que pagar ÷ (bote total después de pagar)</p></div>
<p>Ejemplo: hay 100 en el bote y tu rival apuesta 50. Pagas 50 para ganar un bote final de 200 (100 + 50 + 50). Necesitas 50 ÷ 200 = <strong>25 %</strong>. Si tu proyecto gana más que eso, pagar es rentable a la larga.</p>
<p>Durante el juego, la barra de ayuda te muestra la equity que necesitas y una estimación de la que tienes contra manos aleatorias.</p>` },
      { h: 'Outs y la regla del 2 y del 4', body: `
<p>Los <strong>outs</strong> son las cartas que te convierten en ganador. Con un proyecto de color en el flop hay 13 cartas de tu palo, 4 están a la vista: te quedan <strong>9 outs</strong>.</p>
<ul>
<li>En el flop, con turn y river por venir: outs × 4 ≈ probabilidad de ligar.</li>
<li>En el turn, con una carta por venir: outs × 2 ≈ probabilidad.</li>
</ul>
<div data-w="outs"></div>
<p>Cuidado con los outs "sucios": si ligas color con la cuarta carta de corazones pero el tablero empareja, tu rival puede tener full. Y la regla del 4 exagera con más de 8 outs: resta 1 punto por cada out por encima de 8.</p>` },
      { h: 'Probabilidades implícitas', body: `
<p>Las <strong>implied odds</strong> cuentan lo que puedes ganar en calles posteriores si ligas. Con un proyecto escondido (escalera interna, set) contra un rival con stack grande puedes pagar algo más de lo que dicen las pot odds. Funcionan peor con proyectos obvios (cuatro cartas de un palo en la mesa asustan) y con stacks cortos.</p>` },
    ],
    quiz: [
      { q: 'Bote de 300, tu rival apuesta 100. ¿Qué equity necesitas para pagar?', options: ['20 %', '25 %', '33 %'], answer: 0, explain: '100 ÷ (300 + 100 + 100) = 100 ÷ 500 = 20 %.' },
      { q: 'Tienes proyecto de escalera abierto en el flop (8 outs). ¿Probabilidad aproximada de ligar hasta el river?', options: ['16 %', '32 %', '50 %'], answer: 1, explain: 'Regla del 4: 8 × 4 = 32 % (el valor exacto es 31,5 %).' },
      { q: 'En el turn tienes 9 outs. ¿Probabilidad aproximada de ligar en el river?', options: ['9 %', '18 %', '36 %'], answer: 1, explain: 'Regla del 2: 9 × 2 = 18 % (exacto: 19,6 %).' },
    ],
  },
  {
    id: 'board',
    title: 'Texturas del tablero',
    summary: 'Tableros secos, húmedos, monocolor y emparejados: quién sale favorecido.',
    minutes: 6,
    sections: [
      { h: 'Secos y húmedos', body: `
<p>Un tablero <strong>seco</strong> tiene pocas conexiones: K♠ 7♦ 2♣. Casi nadie tiene proyecto y la mejor mano en el flop suele seguir siéndolo en el river. Un tablero <strong>húmedo</strong> está lleno de posibilidades: J♥ T♥ 8♣. Las manos cambian de valor con cada carta.</p>
<table><thead><tr><th>Textura</th><th>Ejemplo</th><th>Claves</th></tr></thead><tbody>
<tr><td>Seco alto</td><td>A♦ 8♣ 3♠</td><td>Favorece a quien subió preflop. C-bet pequeña con mucha frecuencia.</td></tr>
<tr><td>Húmedo y conectado</td><td>9♥ 8♥ 6♣</td><td>Favorece a quien pagó: tiene más conectores y parejas medias. Más cautela.</td></tr>
<tr><td>Monocolor</td><td>Q♠ 7♠ 4♠</td><td>Cualquier carta de picas alta pesa. Apuestas pequeñas y controladas.</td></tr>
<tr><td>Emparejado</td><td>8♦ 8♣ 3♥</td><td>Pocas manos lo han ligado: buenos para apostar pequeño y a menudo.</td></tr>
<tr><td>Bajo y desconectado</td><td>7♣ 4♦ 2♥</td><td>Las overpairs están muy cómodas.</td></tr>
</tbody></table>` },
      { h: 'Ventaja de rango y de nuts', body: `
<p>Pregúntate qué jugador tiene <strong>más manos fuertes en este tablero</strong>. Si subiste desde UTG y el flop es A♠ K♦ 4♣, tu rango tiene muchos ases y reyes: tienes ventaja de rango y puedes apostar mucho. Si el flop es 7♠ 6♠ 5♦, quien pagó desde la ciega grande tiene más escaleras y dobles parejas: modera tu agresividad.</p>` },
      { h: 'Cartas de turn que lo cambian todo', body: `
<p>Sigue la textura carta a carta. Un tercer corazón, una carta que completa escaleras o una que empareja el tablero cambian quién está por delante. Las mejores cartas para seguir apostando son las que mejoran tu rango más que el de tu rival.</p>` },
    ],
    quiz: [
      { q: '¿Qué tablero es más seco?', options: ['J♥ T♥ 9♣', 'K♠ 7♦ 2♣', '8♠ 7♠ 6♦'], answer: 1, explain: 'K-7-2 de palos distintos casi no tiene proyectos.' },
      { q: 'Subiste desde UTG y paga la ciega grande. ¿En qué flop tienes más ventaja de rango?', options: ['A♠ K♦ 4♣', '7♠ 6♠ 5♦', '9♥ 8♥ 4♣'], answer: 0, explain: 'Tu rango de UTG tiene muchos ases y reyes fuertes.' },
    ],
  },
  {
    id: 'postflop',
    title: 'Juego postflop: valor y farol',
    summary: 'C-bet, apuesta de valor, farol, semifarol, check-raise y control del bote.',
    minutes: 8,
    sections: [
      { h: 'Por qué apuestas', body: `
<p>Toda apuesta debería tener una razón clara:</p>
<ul>
<li><strong>Valor</strong>: quieres que te paguen manos peores. Apuesta cuando, si te pagan, sueles estar por delante.</li>
<li><strong>Farol</strong>: quieres que se retiren manos mejores. Funciona mejor con cartas que bloquean las manos fuertes del rival y en tableros que favorecen tu rango.</li>
<li><strong>Semifarol</strong>: apuestas con un proyecto. Ganas si se retiran y, si pagan, aún puedes ligar.</li>
</ul>
<div class="callout"><p>Si con tu apuesta sólo te pagan manos mejores y sólo se retiran manos peores, esa apuesta no es ni de valor ni de farol: pasa.</p></div>` },
      { h: 'Líneas habituales', body: `
<table><thead><tr><th>Línea</th><th>Qué es</th><th>Cuándo</th></tr></thead><tbody>
<tr><td><strong>C-bet</strong></td><td>Apostar en el flop tras subir preflop</td><td>Tableros que favorecen tu rango, pocos rivales.</td></tr>
<tr><td><strong>Check-raise</strong></td><td>Pasar y resubir la apuesta del rival</td><td>Manos muy fuertes y proyectos fuertes fuera de posición.</td></tr>
<tr><td><strong>Float</strong></td><td>Pagar en posición para robar más tarde</td><td>Contra rivales que hacen c-bet demasiado y abandonan en el turn.</td></tr>
<tr><td><strong>Control del bote</strong></td><td>Pasar con manos medias</td><td>Top pair con kicker débil: quieres llegar barato al showdown.</td></tr>
<tr><td><strong>Slowplay</strong></td><td>Jugar pasivo una mano muy fuerte</td><td>Tableros secos donde tu rival no tiene casi nada que pagar.</td></tr>
</tbody></table>` },
      { h: 'Adaptarte a los rivales', body: `
<p>Los bots de la app tienen estilos distintos. Contra un <strong>Pescadito</strong> (paga mucho) farolea poco y apuesta grande por valor. Contra una <strong>Roca</strong> (muy cerrada) roba más y respeta sus subidas grandes. Contra un <strong>Maníaco</strong>, deja que apueste por ti y paga más ligero. Es la misma idea que en una partida real: ajusta tu juego a quien tienes delante.</p>` },
    ],
    quiz: [
      { q: 'Tienes la mejor mano posible en un tablero seco y tu rival casi nunca tendrá algo. ¿Qué línea tiene sentido?', options: ['Apostar el doble del bote', 'Slowplay: dejar que ligue algo o farolee', 'Retirarte'], answer: 1, explain: 'Si apuestas, sólo pagarían manos que ya te ganan (ninguna).' },
      { q: '¿Qué es un semifarol?', options: ['Apostar con un proyecto', 'Apostar la mitad del bote', 'Pagar con proyecto'], answer: 0, explain: 'Tienes dos formas de ganar: que se retiren o ligar.' },
    ],
  },
  {
    id: 'torneos',
    title: 'Torneos y stacks cortos',
    summary: 'Ciegas crecientes, push/fold con menos de 15 ciegas, burbuja e ICM básico.',
    minutes: 7,
    sections: [
      { h: 'Las fichas de torneo no son dinero', body: `
<p>En un torneo pagas una inscripción y recibes fichas que sólo sirven para jugar. Los premios dependen del <strong>puesto final</strong>, no de las fichas. Eso cambia las decisiones: perder todas las fichas te elimina, mientras que doblar no duplica tu premio esperado.</p>
<p>Este efecto se modela con el <strong>ICM</strong> (Independent Chip Model): cerca de los premios (la "burbuja"), paga all-ins con menos manos de las que pagarías en cash, y presiona a los rivales con stacks medios que tienen mucho que perder.</p>` },
      { h: 'Cuenta en ciegas grandes', body: `
<p>Mide tu stack en ciegas grandes (BB). Una guía práctica:</p>
<table><thead><tr><th>Stack</th><th>Estrategia</th></tr></thead><tbody>
<tr><td>Más de 40 BB</td><td>Juego normal, parecido al cash.</td></tr>
<tr><td>20–40 BB</td><td>Abre más pequeño (2–2,2 BB), evita pagar 3-bets con manos especulativas.</td></tr>
<tr><td>12–20 BB</td><td>Resube all-in (resteal) contra aperturas de posiciones tardías.</td></tr>
<tr><td>Menos de 12 BB</td><td><strong>Push/fold</strong>: all-in o retirarte. Subir y retirarte a una resubida desperdicia fichas.</td></tr>
</tbody></table>
<p>Desde el botón con 10 BB puedes ir all-in con alrededor del 40 % de las manos; desde la ciega pequeña, con más de la mitad. Desde UTG, con mucho menos.</p>` },
      { h: 'La M de Harrington', body: `
<p>La <strong>M</strong> es tu stack dividido entre lo que cuesta una vuelta de ciegas y antes. Con M por debajo de 10 tus opciones se reducen; por debajo de 5, estás en zona de push/fold. Cuanto más baja, más urgente es actuar antes de que las ciegas te devoren.</p>` },
    ],
    quiz: [
      { q: 'Tienes 8 ciegas grandes en el botón y nadie ha entrado. ¿Qué jugada es más sólida con A7o?', options: ['Subir a 2,5 BB', 'All-in', 'Igualar la ciega'], answer: 1, explain: 'Con 8 BB, ir all-in maximiza tu fold equity y evita quedar comprometido.' },
      { q: 'Cerca de la burbuja, con stack medio, contra un all-in del líder…', options: ['Pagas más ligero que en cash', 'Pagas más cerrado que en cash', 'Da igual'], answer: 1, explain: 'Perder te elimina sin premio: el ICM pide más cautela.' },
    ],
  },
  {
    id: 'mental',
    title: 'Bankroll, varianza y tilt',
    summary: 'Por qué se pierde con buenas decisiones y cómo cuidar tus fichas y tu cabeza.',
    minutes: 5,
    sections: [
      { h: 'Varianza', body: `
<p>En póker puedes jugar bien y perder durante cientos de manos. AA contra KK pierde casi una de cada cinco veces. Juzga tus decisiones por la información que tenías, no por el resultado de una mano concreta.</p>` },
      { h: 'Gestión del bankroll', body: `
<p>Aunque aquí las fichas son ficticias, practicar una buena gestión crea buenos hábitos:</p>
<ul>
<li>En cash, ten al menos <strong>20–40 entradas</strong> del nivel en el que juegas.</li>
<li>En torneos y Sit & Go, entre <strong>50 y 100 inscripciones</strong>: la varianza es mayor.</li>
<li>Baja de nivel cuando tu saldo caiga por debajo de esos márgenes. No es un fracaso, es supervivencia.</li>
</ul>` },
      { h: 'Tilt', body: `
<p>El <strong>tilt</strong> es jugar peor por frustración, tras un bad beat o una racha mala. Señales: pagas por "ver" en lugar de por pot odds, subes para recuperar, cambias a mesas más caras. Cuando lo notes, levántate. La mesa seguirá ahí.</p>
<p>Y recuerda que el póker real con dinero puede generar problemas de juego. Si alguna vez dejas de disfrutarlo, busca ayuda: en España puedes consultar <a href="https://www.jugarbien.es" rel="noopener" target="_blank">jugarbien.es</a>.</p>` },
    ],
    quiz: [
      { q: 'Pagaste un all-in con 80 % de equity y perdiste. ¿Fue un error?', options: ['Sí, porque perdiste', 'No, la decisión era buena', 'Depende del palo'], answer: 1, explain: 'A la larga, esa decisión gana dinero. La varianza es parte del juego.' },
      { q: 'Juegas cash con entradas de 1.000. ¿Bankroll recomendable?', options: ['2.000', '5.000', '20.000 o más'], answer: 2, explain: 'Entre 20 y 40 entradas: 20.000–40.000.' },
    ],
  },
  {
    id: 'glosario',
    title: 'Glosario del póker',
    summary: 'Las palabras que oirás en cualquier mesa, de la A a la Z.',
    minutes: 5,
    sections: [
      { h: 'Términos', body: `<div data-w="glossary"></div>` },
    ],
    quiz: [
      { q: '¿Qué es un "set"?', options: ['Trío con una pareja en mano', 'Trío con dos cartas del tablero', 'Una mesa de seis'], answer: 0, explain: 'Con 77 en un flop 7-K-2 tienes set. Con 7x en un flop 7-7-2 tienes "trips".' },
      { q: '¿Qué es "the nuts"?', options: ['La peor mano posible', 'La mejor mano posible en ese momento', 'Un farol'], answer: 1, explain: 'Las nuts son la mano imbatible con el tablero actual.' },
    ],
  },
];

export const GLOSSARY = [
  ['3-bet', 'La primera resubida antes del flop (la ciega grande cuenta como la primera apuesta).'],
  ['4-bet', 'Resubida a una 3-bet.'],
  ['All-in', 'Apostar todas tus fichas.'],
  ['Ante', 'Pequeña aportación obligatoria de todos los jugadores, habitual en torneos.'],
  ['Bad beat', 'Perder una mano en la que eras muy favorito.'],
  ['Bote lateral', 'Bote que se forma cuando un jugador all-in no puede cubrir todas las apuestas.'],
  ['Burbuja', 'Momento de un torneo justo antes de entrar en premios.'],
  ['C-bet', 'Apuesta de continuación: el agresor preflop apuesta en el flop.'],
  ['Check-raise', 'Pasar y, cuando el rival apuesta, resubir.'],
  ['Coin flip', 'Enfrentamiento casi al 50 %, como pareja contra dos cartas más altas.'],
  ['Conector', 'Dos cartas consecutivas, como 8-7. Si son del mismo palo, conector suited.'],
  ['Donk bet', 'Apostar fuera de posición contra quien tuvo la iniciativa en la calle anterior.'],
  ['Equity', 'Tu parte del bote según tu probabilidad de ganar.'],
  ['Fold equity', 'El valor extra que ganas cuando tu apuesta hace retirarse al rival.'],
  ['Gutshot', 'Proyecto de escalera interna: sólo una carta la completa (4 outs).'],
  ['Heads-up', 'Mano o partida entre dos jugadores.'],
  ['Kicker', 'Carta acompañante que desempata manos de la misma categoría.'],
  ['Limp', 'Entrar al bote preflop igualando la ciega grande sin subir.'],
  ['MDF', 'Frecuencia mínima de defensa: bote ÷ (bote + apuesta).'],
  ['Muck', 'Tirar tus cartas sin enseñarlas.'],
  ['Nuts', 'La mejor mano posible con el tablero actual.'],
  ['OESD', 'Proyecto de escalera abierto: dos valores la completan (8 outs).'],
  ['Outs', 'Cartas que mejoran tu mano a la probablemente ganadora.'],
  ['Overpair', 'Pareja en mano más alta que cualquier carta del tablero.'],
  ['Pot odds', 'Relación entre lo que pagas y el bote que puedes ganar.'],
  ['Rango', 'El conjunto de manos que puede tener un jugador en una situación.'],
  ['Semifarol', 'Apostar con un proyecto que puede mejorar.'],
  ['Set', 'Trío formado con una pareja en mano y una carta del tablero.'],
  ['Showdown', 'Momento final en que se enseñan las cartas para decidir el bote.'],
  ['Slowplay', 'Jugar de forma pasiva una mano muy fuerte para engañar.'],
  ['SPR', 'Stack efectivo dividido entre el bote en el flop.'],
  ['Squeeze', 'Resubir tras una subida y una o más llamadas.'],
  ['Stack efectivo', 'El menor de los stacks entre los jugadores implicados: lo máximo que se puede ganar o perder.'],
  ['Suited', 'Dos cartas del mismo palo.'],
  ['Tilt', 'Jugar peor por frustración o enfado.'],
  ['Top pair', 'Pareja con la carta más alta del tablero.'],
  ['Trips', 'Trío formado con una pareja del tablero y una carta tuya.'],
  ['Value bet', 'Apuesta para que te pague una mano peor.'],
];

export const HAND_LADDER = [
  { name: 'Escalera real', desc: 'A-K-Q-J-10 del mismo palo.', cards: 'AhKhQhJhTh', prob: '0,003 %' },
  { name: 'Escalera de color', desc: 'Cinco cartas seguidas del mismo palo.', cards: '9s8s7s6s5s', prob: '0,03 %' },
  { name: 'Póker', desc: 'Cuatro cartas del mismo valor.', cards: 'QcQdQhQs7d', prob: '0,17 %' },
  { name: 'Full', desc: 'Un trío y una pareja.', cards: 'JhJdJs4c4h', prob: '2,6 %' },
  { name: 'Color', desc: 'Cinco cartas del mismo palo, no seguidas.', cards: 'AdJd8d5d2d', prob: '3,0 %' },
  { name: 'Escalera', desc: 'Cinco valores seguidos de distintos palos.', cards: 'Th9c8d7s6h', prob: '4,6 %' },
  { name: 'Trío', desc: 'Tres cartas del mismo valor.', cards: '7c7d7hKsQd', prob: '4,8 %' },
  { name: 'Doble pareja', desc: 'Dos parejas distintas.', cards: 'KsKdTcTh5s', prob: '23,5 %' },
  { name: 'Pareja', desc: 'Dos cartas del mismo valor.', cards: 'AsAh9c6d3s', prob: '43,8 %' },
  { name: 'Carta alta', desc: 'Nada de lo anterior: juega la carta más alta.', cards: 'AdJc8s5h3c', prob: '17,4 %' },
];
