/**
 * objetos.js — iconos de objeto dibujados a mano en SVG.
 *
 * La ficha mostraba el equipo y la mochila como texto («Camisote de malla remendado» dentro de
 * una casilla de 96 px). Esto los dibuja: una casilla del inventario enseña un icono, como en el
 * inventario de Diablo III, y el nombre queda para el rótulo o el `title`.
 *
 * Reglas que se siguen en TODO el fichero:
 *
 *  1. SVG en línea y nada más: ni imágenes remotas, ni tipografías de fuera, ni librerías. La
 *     CSP de la app es estricta. Sin emoji: los emoji son justo lo que había antes.
 *  2. Es DETERMINISTA. La variación (la veta de la madera, las muescas del filo, las facetas de
 *     una piedra) sale de una semilla derivada del nombre, así que el mismo objeto se dibuja
 *     siempre igual y no «tiembla» al repintar la ficha.
 *  3. Los ids de <defs> llevan delante un prefijo que incluye la categoría y un hash del nombre.
 *     INVARIANTE: los degradados NO dependen de la semilla, solo de la categoría. Por eso dos
 *     objetos que caigan en el mismo prefijo (mismo nombre, o un choque de hash dentro de la
 *     misma categoría) definen exactamente los mismos degradados y da igual cuál gane: el dibujo
 *     sale idéntico. Si algún día un degradado pasa a depender de la semilla, esta garantía se
 *     rompe y hay que pasar `sufijo` a mano.
 *  4. El nombre del objeto NUNCA se copia a la salida. Solo se usa para deducir la categoría y la
 *     semilla, así que no hay forma de colar marcado por ahí.
 *
 * Luz siempre desde arriba a la izquierda: sombra propia abajo a la derecha y un filo claro en el
 * canto que mira a la luz. Los iconos se ven sobre piedra oscura, así que tienen que salir del
 * fondo por LUZ, no por línea fina: silueta gruesa que llene el lienzo. El tamaño de prueba es
 * 40 px — lo que mide una casilla de mochila en un tablet.
 *
 * Contrato:
 *
 *   iconoObjeto(nombre, opciones?) → string
 *     Devuelve el contenido de un SVG (un <defs> y un <g>), SIN el <svg> envolvente. Quien llama
 *     lo mete en un lienzo de 100×100 con el origen arriba a la izquierda:
 *         `<svg viewBox="0 0 100 100" aria-hidden="true">${iconoObjeto(x)}</svg>`
 *     Nunca devuelve cadena vacía: lo que no se reconoce sale como fardo atado.
 *
 *     opciones = {
 *       sufijo:  string  — se añade a los ids de <defs>. Solo hace falta si se quiere forzar que
 *                          dos iconos del MISMO objeto no compartan ids (no es necesario: ver la
 *                          regla 3). Se limpia a [A-Za-z0-9_-].
 *       sombra:  boolean — sombra proyectada del icono entero (por defecto true). Ponlo a false
 *                          si el icono va dentro de algo que ya proyecta sombra.
 *       semilla: number  — sustituye la semilla derivada del nombre. Para probar variantes.
 *     }
 *
 *   categoriaDe(nombre) → { clave, nombre, familia, color, reconocido }
 *     La categoría deducida. `nombre` es el nombre corto en español («Espada»), `familia` agrupa
 *     (arma, armadura, complemento, luz, consumible, util, tesoro, resto) y `color` es el tinte
 *     de esa familia, para el marco de la casilla o el rótulo. `reconocido` es false cuando se ha
 *     caído al fardo genérico, por si quien llama quiere marcarlo de otra forma.
 *
 *   CATEGORIAS → string[]
 *     Todas las claves, en el orden en que están definidas. Sirve para bancos de prueba y para un
 *     futuro selector de objetos.
 */

// ── Paleta de materiales ──────────────────────────────────────────────────────────────────────
// Nada de acero brillante de fantasía heroica: esto es una turbera. Hierro apagado y verdoso,
// madera húmeda, cuero engrasado, lino sucio, sebo. El latón es el único punto cálido fuerte, y
// se usa con cuentagotas (engastes, monedas, incensario) para que valga como acento.
//
// Cada material son las paradas de un degradado. La dirección la elige quien dibuja (ver DIR):
// una hoja quiere la luz a lo ancho, un mango a lo largo.
const MAT = {
  hierro:     { paradas: [["#C6CDAD", 0], ["#828B6B", .3], ["#4C5440", .66], ["#2B3122", 1]] },
  hierroviejo:{ paradas: [["#98A081", 0], ["#5E6650", .38], ["#383E2C", .74], ["#20241A", 1]] },
  madera:     { paradas: [["#B4884F", 0], ["#835F32", .34], ["#573C1F", .7], ["#31210F", 1]] },
  maderaoscura:{paradas: [["#8A6636", 0], ["#5E4322", .4], ["#3A2712", .76], ["#1E1409", 1]] },
  cuero:      { paradas: [["#A2763F", 0], ["#7B542B", .36], ["#50361B", .72], ["#2A1B0D", 1]] },
  cuerooscuro:{ paradas: [["#7A5530", 0], ["#523818", .42], ["#33200D", .78], ["#1A1007", 1]] },
  lino:       { paradas: [["#CDC8A6", 0], ["#948F70", .4], ["#605C45", .74], ["#37341F", 1]] },
  lana:       { paradas: [["#9EA184", 0], ["#6C6F56", .4], ["#454833", .76], ["#22241A", 1]] },
  laton:      { paradas: [["#F0DCA8", 0], ["#C79A3E", .3], ["#8A6A28", .62], ["#4A3714", 1]] },
  sebo:       { paradas: [["#F2EBC8", 0], ["#D2C99C", .36], ["#9C946F", .72], ["#5E5940", 1]] },
  piedra:     { paradas: [["#8E9479", 0], ["#5F6651", .38], ["#3C4232", .72], ["#20241A", 1]] },
  hueso:      { paradas: [["#EDE6C6", 0], ["#C2B995", .4], ["#8C8466", .74], ["#4E4A38", 1]] },
  papel:      { paradas: [["#E0D5AC", 0], ["#B4A87E", .38], ["#877C5C", .72], ["#4C452F", 1]] },
  hoja:       { paradas: [["#A6B266", 0], ["#6E7C3A", .42], ["#444E22", .78], ["#242A12", 1]] },
  cristal:    { paradas: [["#E4EAD8", 0], ["#A6B49C", .38], ["#616E5A", .78], ["#333B30", 1]] },
  licor:      { paradas: [["#B6C86A", 0], ["#6E8034", .4], ["#3C4A1E", .8], ["#1E2610", 1]] },
  sangre:     { paradas: [["#B8583E", 0], ["#8D3524", .5], ["#4E1A10", 1]] },
  pan:        { paradas: [["#DFB070", 0], ["#B48442", .35], ["#815726", .72], ["#4A2F12", 1]] },
  queso:      { paradas: [["#F4E5A6", 0], ["#DAC272", .4], ["#A48A42", .78], ["#5E4E20", 1]] },
  // Llama y resplandor: radiales, con el centro descentrado hacia arriba porque una llama es más
  // clara arriba que abajo. El resplandor muere en transparente, así que se puede poner detrás de
  // cualquier cosa sin tapar el fondo del nicho.
  llama:      { radial: true, cx: .5, cy: .28, r: .72,
                paradas: [["#FFF6D6", 0], ["#F0DCA8", .3], ["#D9A04A", .62], ["#A84E1E", 1]] },
  resplandor: { radial: true, cx: .5, cy: .5, r: .5,
                paradas: [["#F0DCA8", 0, .5], ["#D9A04A", .42, .26], ["#8D3524", .72, .08],
                          ["#8D3524", 1, 0]] },
};

/** Direcciones de degradado, en coordenadas de la caja del propio elemento. */
const DIR = {
  d:  [0, 0, .82, 1],    // diagonal: la luz entra por arriba a la izquierda (la de por defecto)
  di: [1, 0, .18, 1],    // diagonal espejada, para la pieza que va a la derecha de un par
  h:  [0, 0, 1, .22],    // a lo ancho: hojas, mangos verticales
  hi: [1, .1, 0, .3],    // a lo ancho con la luz por la derecha
  v:  [0, 0, .18, 1],    // a lo largo: astiles, cirios
};

const T = "#0A0C06";      // contorno; nunca negro puro, que corta demasiado sobre la piedra
const SOM = "#12150D";    // sombra interna
const FILO = "#EAEED6";   // luz de filo del hierro

// Luces de canto por material, para tenerlas a mano al dibujar. Un filo de hierro es casi
// blanco; el de la madera es miel, y el de la piedra apenas se levanta del gris.
const L_MADERA = "#d8a863";
const L_CUERO = "#c89858";
const L_LINO = "#efe9c8";
const L_LANA = "#c9ccae";
const L_LATON = "#fff0c0";
const L_HUESO = "#fff8dc";
const L_PIEDRA = "#b8bea0";
const L_PAPEL = "#f6edc6";
const L_SEBO = "#fffbe4";

// ── Utillaje de dibujo ────────────────────────────────────────────────────────────────────────

/** Forma rellena con contorno oscuro: la base de casi todo. */
const forma = (d, relleno, w = 2) =>
  `<path d="${d}" fill="${relleno}" stroke="${T}" stroke-width="${w}" stroke-linejoin="round"/>`;

/**
 * Trazo con contorno: uno oscuro más gordo debajo y el material encima. Es como se dibujan los
 * astiles, las cuerdas y las cadenas sin tener que cerrar un contorno a mano.
 */
const trazo = (d, relleno, w, extra = "") =>
  `<path d="${d}" fill="none" stroke="${T}" stroke-width="${w + 2.6}" stroke-linecap="round"
     stroke-linejoin="round"/>` +
  `<path d="${d}" fill="none" stroke="${relleno}" stroke-width="${w}" stroke-linecap="round"
     stroke-linejoin="round" ${extra}/>`;

/** Luz de canto: la línea clara del lado que mira a la luz. Es lo que da el volumen. */
const luz = (d, c = FILO, w = 1.6, op = .92) =>
  `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round"
     opacity="${op}"/>`;

/** Sombra de canto: la línea oscura del lado contrario. */
const sombra = (d, w = 2.2, op = .5) =>
  `<path d="${d}" fill="none" stroke="${SOM}" stroke-width="${w}" stroke-linecap="round"
     opacity="${op}"/>`;

/** Remache o clavo de latón: contorno, cuerpo y reflejo. Tres círculos, y a 40 px se lee. */
const remache = (x, y, r = 2.4, c = "#8A6A28") =>
  `<circle cx="${x}" cy="${y}" r="${r + .8}" fill="${T}"/>` +
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>` +
  `<circle cx="${x - r * .3}" cy="${y - r * .3}" r="${r * .42}" fill="#F0DCA8"/>`;

/** Gira todo el icono alrededor del centro del lienzo. Dibujar recto y girar sale más limpio. */
const giro = (a, s) => `<g transform="rotate(${a} 50 50)">${s}</g>`;

/** Redondea a dos decimales: los paths salen legibles y el fichero no engorda. */
const n = (v) => Math.round(v * 100) / 100;

// ── Semilla y normalización ───────────────────────────────────────────────────────────────────

/** FNV-1a de 32 bits. Solo hace de semilla y de sufijo de ids, no de nada criptográfico. */
function hash32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Nombre en texto libre → forma comparable. El DJ escribe «Cuerda de cáñamo, 15 m» o «CAPUCHA
 * de cuero», así que hay que quitar diacríticos, bajar a minúsculas y dejar solo letras, cifras
 * y espacios. La ñ se queda en n (NFD la parte en n + tilde y la tilde se cae), y por eso los
 * patrones de abajo se escriben sin ñ: «canamo», «pequeno».
 */
const normalizar = (t) =>
  String(t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Azar con semilla (mulberry32). Misma semilla, misma secuencia, mismo dibujo. */
function pincel(pref, semilla) {
  let s = semilla >>> 0;
  const r = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    /** Referencia a un degradado del material, en la dirección pedida. */
    g: (mat, dir = "d") => `url(#${pref}-${mat}-${dir})`,
    r,
    /** Número en un rango, ya redondeado: para meterlo directo en un path. */
    rr: (a, b) => n(a + r() * (b - a)),
    /** Entero en [a, b]. */
    ri: (a, b) => a + Math.floor(r() * (b - a + 1)),
  };
}

// ── Los iconos ────────────────────────────────────────────────────────────────────────────────
// Todos se dibujan en 100×100 y llenan de 8 a 92 más o menos: un icono pequeño y centrado se
// pierde en la casilla. Las armas se dibujan RECTAS (punta arriba) y se giran al final, que es
// como salen los ángulos limpios; el degradado gira con la forma, así que la luz sigue cayendo
// por el filo que toca.

const ICONOS = {
  // ── Armas ──────────────────────────────────────────────────────────────────────────────────
  /** Espada larga: hoja con vaceo, gavilanes rectos, empuñadura liada y pomo de hierro. */
  espada: (a) => {
    // Muescas del filo: esta hoja ha trabajado. Salen de la semilla, así que «Espada larga
    // mellada» se mella siempre en los mismos sitios.
    const mellas = Array.from({ length: 3 }, () => {
      const y = a.rr(26, 58), p = a.rr(1.1, 2);
      return `<path d="M44.6 ${y} l${p} ${p * .9} l-${p} ${p * .9} Z" fill="${SOM}"/>`;
    }).join("");
    return giro(-38, `
      ${forma("M50 6 L55.6 22 L55.6 63 L44.4 63 L44.4 22 Z", a.g("hierro", "h"), 1.8)}
      ${sombra("M53.4 24 L53.4 62", 2.4, .45)}
      ${luz("M44.4 22 L50 6", FILO, 1.5)}
      ${luz("M45.9 24 L45.9 61", FILO, 1.5, .7)}
      ${mellas}
      ${forma("M31 62.5 Q30 66 31 69.5 L69 69.5 Q70 66 69 62.5 Z", a.g("hierroviejo", "h"), 1.8)}
      ${luz("M32 64 L68 64", L_PIEDRA, 1.2, .55)}
      ${forma("M46.4 69 L53.6 69 L54.4 85 L45.6 85 Z", a.g("cuerooscuro", "h"), 1.8)}
      ${sombra("M47.6 71.5 L52.9 71.5 M47.7 76 L53.1 76 M47.9 80.5 L53.3 80.5", 1.6, .7)}
      ${forma("M50 84 Q57 85 56.5 89.5 Q54 93.5 50 93.5 Q46 93.5 43.5 89.5 Q43 85 50 84 Z",
              a.g("hierroviejo"), 1.8)}
      ${luz("M46 86.5 Q44.8 89 45.2 91.2", L_PIEDRA, 1.4, .6)}`);
  },

  /** Daga: hoja corta y ancha, mango de cuero con virola. */
  daga: (a) => giro(-38, `
    ${forma("M50 14 L57 32 L56 63 L44 63 L43 32 Z", a.g("hierro", "h"), 1.8)}
    ${sombra("M53.6 34 L53 62", 2.6, .45)}
    ${luz("M43.6 33 L50 14", FILO, 1.6)}
    ${luz("M45.4 35 L45 61", FILO, 1.5, .7)}
    ${forma("M36 62 L64 62 L62 68 L38 68 Z", a.g("laton", "h"), 1.7)}
    ${luz("M37.6 63.6 L61 63.6", L_LATON, 1.2, .6)}
    ${forma("M40.5 67.5 L59.5 67.5 L56.5 88 L43.5 88 Z", a.g("cuero", "h"), 1.8)}
    ${sombra("M43 73 L57 73 M43.4 79 L56.6 79", 1.8, .65)}
    ${forma("M42 87 L58 87 L58.5 92.5 L41.5 92.5 Z", a.g("hierroviejo", "h"), 1.7)}
    ${luz("M43.5 88.5 L43.2 91.5", L_PIEDRA, 1.3, .6)}`),

  /** Hacha de leñador: cabeza de hierro a un lado, astil de madera con vetas. */
  hacha: (a) => giro(16, `
    ${forma("M47 12 L53 12 L54.5 90 L45.5 90 Z", a.g("madera", "h"), 1.8)}
    ${luz("M48.4 16 L49.4 88", L_MADERA, 1.4, .55)}
    ${sombra("M52.4 18 L53.4 88", 1.8, .5)}
    ${forma("M48 14 Q26 16 15 32 Q22 43 30 46 Q40 50 49 48 Z", a.g("hierro"), 2)}
    ${luz("M47 15.6 Q28 18 17.6 32.4", FILO, 1.8)}
    ${sombra("M30 45 Q40 48.6 48 46.6", 2.2, .55)}
    ${forma("M44 12 L52 12 L52 50 L44 48 Z", a.g("hierroviejo", "h"), 1.6)}
    ${remache(48, 20, 2.2)}${remache(48, 42, 2.2)}
    ${forma("M45 88 L55 88 L55.5 94 L44.5 94 Z", a.g("cuerooscuro", "h"), 1.6)}`),

  /** Maza de armas: cabeza con aletas, astil corto. Contundente, de herrero de pueblo. */
  maza: (a) => giro(-14, `
    ${forma("M47 30 L53 30 L54 90 L46 90 Z", a.g("madera", "h"), 1.8)}
    ${luz("M48.3 34 L48.9 88", L_MADERA, 1.4, .55)}
    ${forma("M50 6 L64 14 L66 32 L50 40 L34 32 L36 14 Z", a.g("hierro"), 2)}
    ${luz("M50 7.8 L36.6 15", FILO, 1.7)}
    ${luz("M36 16 L37.4 31", FILO, 1.5, .7)}
    ${sombra("M64 16 L62.6 31 L50 38", 2.4, .5)}
    ${forma("M50 10 L58 16 L50 22 L42 16 Z", a.g("hierroviejo"), 1.5)}
    ${forma("M42 30 L58 30 L57 36 L43 36 Z", a.g("hierroviejo", "h"), 1.6)}
    ${forma("M44 88 L56 88 L56.5 94 L43.5 94 Z", a.g("cuerooscuro", "h"), 1.6)}`),

  /** Lanza: astil largo, moharra de hoja de laurel y cinta bajo la punta. */
  lanza: (a) => giro(-26, `
    ${forma("M47.5 26 L52.5 26 L53.5 94 L46.5 94 Z", a.g("madera", "h"), 1.8)}
    ${luz("M48.7 30 L49.4 92", L_MADERA, 1.4, .55)}
    ${forma("M50 5 Q59 18 57 32 L43 32 Q41 18 50 5 Z", a.g("hierro", "h"), 1.9)}
    ${luz("M43.6 30 Q42 18 49.6 6.4", FILO, 1.6)}
    ${sombra("M55.4 30 Q57 19 51 8", 2.2, .45)}
    ${forma("M44 30 L56 30 L55 38 L45 38 Z", a.g("hierroviejo", "h"), 1.7)}
    ${trazo("M45 41 Q50 45 55 41", a.g("lino"), 3)}
    ${forma("M46 92 L54 92 L54.5 96 L45.5 96 Z", a.g("hierroviejo", "h"), 1.5)}`),

  /** Bastón nudoso: madera curva, nudos y un trapo liado en el agarre. */
  baston: (a) => {
    const nudos = Array.from({ length: 3 }, (_, i) => {
      const y = 22 + i * 22 + a.rr(-3, 3), x = 49 + (i % 2 ? 2.4 : -2.4);
      return `<circle cx="${x}" cy="${y}" r="${a.rr(2.6, 3.6)}" fill="${a.g("maderaoscura")}"
                stroke="${T}" stroke-width="1.4"/>`;
    }).join("");
    return giro(-20, `
      ${trazo("M46 7 Q54 30 48 52 Q42 74 52 93", a.g("madera", "v"), 9)}
      ${luz("M43.6 9 Q51.4 30 45.6 52 Q39.8 73 49.4 91", L_MADERA, 1.8, .5)}
      ${nudos}
      ${forma("M40.5 54 Q50 50 57 55 L55 66 Q47 62 39 66 Z", a.g("lino"), 1.8)}
      ${sombra("M41 58.6 Q48 55.6 55.6 59.6", 1.8, .5)}
      ${trazo("M55 62 Q60 68 57 74", a.g("lino"), 2.4)}`);
  },

  /** Arco largo: pala de madera, cuerda de tripa y agarre liado en cuero. */
  arco: (a) => giro(-18, `
    ${trazo("M34 10 Q66 28 66 50 Q66 72 34 90", a.g("madera", "h"), 7.5)}
    ${luz("M35 12.6 Q63 29.4 63 50", L_MADERA, 1.7, .5)}
    ${sombra("M68.6 44 Q68 70 37 88", 2, .45)}
    ${forma("M30.5 7 L37.5 11 L36 15 L29 11 Z", a.g("hierroviejo"), 1.4)}
    ${forma("M30.5 93 L37.5 89 L36 85 L29 89 Z", a.g("hierroviejo"), 1.4)}
    <path d="M33 9 L33 91" stroke="${T}" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M33 9 L33 91" stroke="#D6D1AE" stroke-width="1.5" stroke-linecap="round"/>
    ${forma("M61 41 L70 42 L70 58 L61 59 Z", a.g("cuerooscuro", "h"), 1.7)}
    ${sombra("M63 45.5 L68.6 46 M63 50 L68.8 50.4 M63 54.5 L69 55", 1.5, .7)}`),

  /** Flechas: tres, en abanico, con punta de hierro y plumas de ganso sucias. */
  flechas: (a) => {
    const una = (ang, dx) => {
      const p = a.rr(-1.2, 1.2);
      return `<g transform="rotate(${ang} 50 88) translate(${dx} 0)">
        ${forma("M50 8 L55 22 L45 22 Z", a.g("hierro", "h"), 1.6)}
        ${luz("M49.6 9.6 L46 21", FILO, 1.4)}
        <path d="M50 20 L50 90" stroke="${T}" stroke-width="5.4" stroke-linecap="round"/>
        <path d="M50 20 L50 90" stroke="${a.g("madera", "h")}" stroke-width="3.2"
              stroke-linecap="round"/>
        ${luz("M48.8 24 L48.8 86", L_MADERA, 1, .45)}
        ${forma(`M50 62 Q42 66 ${41 + p} 78 Q46 76 50 72 Z`, a.g("lino"), 1.5)}
        ${forma(`M50 62 Q58 66 ${59 - p} 78 Q54 76 50 72 Z`, a.g("lana", "di"), 1.5)}
      </g>`;
    };
    return una(-15, -1) + una(15, 1) + una(0, 0);
  },

  // ── Armadura y ropa ────────────────────────────────────────────────────────────────────────
  /** Escudo en gota: tablas de madera, refuerzo y umbo de hierro, remaches de latón. */
  escudo: (a) => `
    ${forma("M16 15 Q50 8 84 15 L81 46 Q76 76 50 92 Q24 76 19 46 Z", a.g("madera"), 2.2)}
    ${sombra("M50 12 L50 90", 2.4, .4)}
    ${sombra("M32 12.4 Q31 60 50 86 M68 12.4 Q69 60 50 86", 1.8, .35)}
    ${luz("M18.6 16.6 Q50 10.4 81 16.4", L_MADERA, 2, .6)}
    ${luz("M20.6 20 Q22 50 30 68", L_MADERA, 1.6, .4)}
    <path d="M16 15 Q50 8 84 15 L81 46 Q76 76 50 92 Q24 76 19 46 Z" fill="none"
          stroke="${a.g("hierroviejo")}" stroke-width="4.4" stroke-linejoin="round"/>
    <path d="M16 15 Q50 8 84 15 L81 46 Q76 76 50 92 Q24 76 19 46 Z" fill="none"
          stroke="${T}" stroke-width="1.4" stroke-linejoin="round"/>
    ${forma("M50 34 Q62 38 62 48 Q62 58 50 62 Q38 58 38 48 Q38 38 50 34 Z", a.g("hierro"), 1.9)}
    ${luz("M42 40.6 Q39.6 46 40 52", FILO, 1.6, .8)}
    ${remache(26, 20)}${remache(74, 20)}${remache(50, 78)}`,

  /** Casco de nasal: bacinete tosco con banda de cejas y protector de nariz. */
  casco: (a) => `
    ${forma("M20 54 Q20 16 50 14 Q80 16 80 54 Z", a.g("hierro"), 2.2)}
    ${luz("M24 50 Q24 20 47 17", FILO, 2.2, .85)}
    ${sombra("M74 30 Q76 44 75.4 53", 2.6, .5)}
    ${forma("M18 52 L82 52 L82 62 L18 62 Z", a.g("hierroviejo", "h"), 2)}
    ${luz("M20 54 L80 54", L_PIEDRA, 1.4, .5)}
    ${forma("M43 61 L57 61 L55 82 Q50 86 45 82 Z", a.g("hierro", "h"), 1.9)}
    ${luz("M44.6 63 L46.4 81", FILO, 1.5, .8)}
    <path d="M23 63.5 L41 63.5 L41 71 L25 71 Z" fill="#070804"/>
    <path d="M77 63.5 L59 63.5 L59 71 L75 71 Z" fill="#070804"/>
    ${luz("M23 63.4 L41 63.4", "#8E9377", 1.2, .5)}
    ${luz("M59 63.4 L77 63.4", "#8E9377", 1.2, .5)}
    ${remache(28, 57)}${remache(72, 57)}${remache(50, 20)}`,

  /** Capucha de cuero: la que se lleva en la turbera. El hueco de la cara es negro. */
  capucha: (a) => `
    ${forma("M50 10 Q78 16 82 52 Q84 74 74 88 L26 88 Q16 74 18 52 Q22 16 50 10 Z",
            a.g("cuero"), 2.2)}
    ${luz("M22 50 Q25 20 48 13", L_CUERO, 2.2, .75)}
    ${sombra("M78 48 Q79 70 71 85", 2.6, .5)}
    <path d="M50 26 Q66 34 63 60 Q59 78 50 82 Q41 78 37 60 Q34 34 50 26 Z" fill="#070804"
          stroke="${T}" stroke-width="1.6"/>
    ${luz("M38.4 52 Q36.4 34 49 27.4", "#8A6636", 1.8, .6)}
    ${forma("M26 86 Q50 94 74 86 L76 92 Q50 99 24 92 Z", a.g("cuerooscuro", "h"), 1.8)}
    ${trazo("M31 58 Q28 74 32 86", a.g("cuerooscuro"), 2.4)}`,

  /** Cota de malla: torso con anillas. Las anillas son ruido a 40 px, así que van suaves. */
  coraza: (a) => {
    const anillas = Array.from({ length: 9 }, (_, f) => {
      const y = 28 + f * 6.2;
      return Array.from({ length: 7 }, (_, c) => {
        const x = 30 + c * 6.6 + (f % 2 ? 3.3 : 0);
        return `<circle cx="${n(x)}" cy="${n(y)}" r="2.1"/>`;
      }).join("");
    }).join("");
    return `
      ${forma("M32 20 L44 14 Q50 21 56 14 L68 20 L74 42 L69 46 L72 84 L28 84 L31 46 L26 42 Z",
              a.g("hierro"), 2.2)}
      <g fill="none" stroke="${SOM}" stroke-width="1.1" opacity=".5">${anillas}</g>
      ${luz("M34 22 L30 42", FILO, 2, .8)}
      ${luz("M35 50 L32 82", FILO, 1.6, .5)}
      ${sombra("M69 24 L72 42 M68 50 L70 82", 2.6, .5)}
      ${forma("M44 14 Q50 24 56 14 L52 28 L48 28 Z", a.g("hierroviejo"), 1.7)}
      ${forma("M26 40 L34 36 L36 48 L28 50 Z", a.g("hierroviejo"), 1.7)}
      ${forma("M74 40 L66 36 L64 48 L72 50 Z", a.g("hierroviejo", "di"), 1.7)}
      ${forma("M28 82 L72 82 L73 90 L27 90 Z", a.g("cuerooscuro", "h"), 1.8)}
      ${remache(38, 86)}${remache(62, 86)}`;
  },

  /** Guantelete: manopla de cuero con placas en los nudillos. */
  guantes: (a) => giro(-12, `
    ${forma("M32 44 Q30 24 40 18 Q46 15 50 20 L54 16 Q62 14 64 24 L66 40 Q70 46 70 58 " +
            "Q70 76 50 80 Q30 76 30 58 Z", a.g("cuero"), 2.2)}
    ${luz("M34 42 Q32 26 40 20.6", L_CUERO, 2.2, .8)}
    ${sombra("M66 44 Q68 58 64 70", 2.6, .5)}
    ${forma("M34 40 L48 34 L50 44 L36 50 Z", a.g("hierro"), 1.8)}
    ${forma("M50 34 L64 38 L64 48 L50 44 Z", a.g("hierro", "di"), 1.8)}
    ${luz("M35.6 41 L47 35.6", FILO, 1.5, .8)}
    ${forma("M30 76 Q50 84 70 76 L72 88 Q50 96 28 88 Z", a.g("cuerooscuro", "h"), 2)}
    ${sombra("M32 84 Q50 90 68 84", 1.8, .6)}
    ${remache(38, 82)}${remache(62, 82)}
    ${sombra("M42 24 L44 34 M53 22 L54 34", 1.8, .5)}`),

  /** Grebas y calzas: dos piernas de cuero con rodilleras. */
  pantalones: (a) => `
    ${forma("M28 12 L72 12 L76 34 L68 88 L54 88 L50 46 L46 88 L32 88 L24 34 Z", a.g("cuero"), 2.2)}
    ${luz("M30 16 L26.6 34 L34 84", L_CUERO, 2.2, .75)}
    ${sombra("M70 16 L73.4 34 L66 84", 2.6, .5)}
    ${sombra("M50 20 L50 44", 2.2, .4)}
    ${forma("M26 12 L74 12 L74 22 L26 22 Z", a.g("cuerooscuro", "h"), 1.9)}
    ${luz("M28 14 L72 14", L_CUERO, 1.4, .5)}
    ${forma("M28 50 Q37 46 44 52 L43 64 Q36 60 29 64 Z", a.g("hierroviejo"), 1.8)}
    ${forma("M72 50 Q63 46 56 52 L57 64 Q64 60 71 64 Z", a.g("hierroviejo", "di"), 1.8)}
    ${remache(36, 17)}${remache(64, 17)}`,

  /** Botas: dos, una detrás. Caña alta, suela clavada. */
  botas: (a) => `
    <g opacity=".85">
      ${forma("M22 22 L40 22 L42 56 L58 60 Q64 64 62 74 L20 74 L18 56 Z",
              a.g("cuerooscuro"), 2)}
    </g>
    ${forma("M34 14 L58 14 L60 52 L78 58 Q86 64 84 76 L32 76 L30 52 Z", a.g("cuero"), 2.2)}
    ${luz("M36 18 L32.6 52 L34 72", L_CUERO, 2.2, .8)}
    ${sombra("M58 18 L60 52 L78 60", 2.4, .45)}
    ${forma("M28 74 L86 74 L86 84 L26 84 Z", a.g("hierroviejo", "h"), 2)}
    ${luz("M29 76 L85 76", L_PIEDRA, 1.3, .45)}
    ${sombra("M34 46 L58 46", 2, .5)}
    ${trazo("M36 24 L57 28 M36 32 L58 36", a.g("cuerooscuro"), 1.8)}
    ${remache(32, 79, 1.8)}${remache(50, 79, 1.8)}${remache(68, 79, 1.8)}${remache(82, 79, 1.8)}`,

  /** Capa de lana con broche de latón y pliegues. */
  capa: (a) => `
    ${forma("M50 12 L32 18 Q14 34 18 62 L24 90 L38 84 L50 90 L62 84 L76 90 L82 62 " +
            "Q86 34 68 18 Z", a.g("lana"), 2.2)}
    ${luz("M32.6 20 Q17.4 36 21 62 L26 86", L_LANA, 2.2, .7)}
    ${sombra("M67 20 Q82.6 36 79 62 L74 86", 2.6, .5)}
    ${sombra("M40 22 L36 84 M50 20 L50 88 M60 22 L64 84", 2, .35)}
    ${forma("M50 10 Q60 12 66 20 L58 24 Q50 18 42 24 L34 20 Q40 12 50 10 Z",
            a.g("cuerooscuro", "h"), 1.9)}
    <circle cx="50" cy="19" r="7.4" fill="${T}"/>
    <circle cx="50" cy="19" r="6" fill="${a.g("laton")}"/>
    <circle cx="50" cy="19" r="2.4" fill="#2A1B0D"/>
    ${luz("M46 15.6 Q44 18.4 44.6 21.4", L_LATON, 1.5, .8)}`,

  // ── Complementos ───────────────────────────────────────────────────────────────────────────
  /** Anillo: aro de latón visto de canto, con engaste y piedra oscura. */
  anillo: (a) => `
    <ellipse cx="50" cy="58" rx="25" ry="27" fill="${T}"/>
    <ellipse cx="50" cy="58" rx="23.4" ry="25.6" fill="${a.g("laton")}"/>
    <ellipse cx="50" cy="59" rx="14.4" ry="16.4" fill="#0A0C06"/>
    <ellipse cx="50" cy="59" rx="14.4" ry="16.4" fill="none" stroke="${T}" stroke-width="1.6"/>
    ${luz("M32 46 Q27.6 56 29 66", L_LATON, 2.2, .85)}
    ${luz("M36.4 51 Q33.6 58 34.6 65", "#8A6A28", 1.6, .6)}
    ${sombra("M68 48 Q72 58 69 70", 2.6, .5)}
    ${forma("M39 30 Q50 22 61 30 L57 40 Q50 35 43 40 Z", a.g("laton", "h"), 1.8)}
    ${forma("M50 20 Q60 24 60 31 Q56 37 50 37 Q44 37 40 31 Q40 24 50 20 Z",
            a.g("piedra"), 1.9)}
    ${luz("M44 25 Q41.4 28.6 42 32.4", L_PIEDRA, 1.6, .7)}
    ${remache(38, 36, 1.8)}${remache(62, 36, 1.8)}`,

  /** Amuleto: colgante de hueso tallado en un cordón de cuero. */
  amuleto: (a) => {
    const rayas = Array.from({ length: 3 }, (_, i) =>
      sombra(`M${44 - i} ${50 + i * 8} L${56 + i} ${52 + i * 8}`, 1.8, .55)).join("");
    return `
      ${trazo("M24 10 Q50 30 76 10", a.g("cuerooscuro"), 3.4)}
      ${forma("M50 28 Q70 40 64 66 Q58 84 50 88 Q42 84 36 66 Q30 40 50 28 Z", a.g("hueso"), 2.1)}
      ${luz("M38.6 58 Q34 40 49 30", L_HUESO, 2.2, .85)}
      ${sombra("M62 58 Q66 42 54 31", 2.4, .45)}
      ${rayas}
      <circle cx="50" cy="34" r="4.4" fill="#070804" stroke="${T}" stroke-width="1.4"/>
      ${trazo("M43 22 Q50 18 57 22", a.g("cuero"), 2.6)}`;
    },

  /** Símbolo sagrado de pueblo: dos ramas atadas con cordel, no una cruz de orfebre. */
  simbolo: (a) => {
    const t = a.rr(-4, 4);
    return `
      ${trazo("M50 8 L50 92", a.g("madera", "h"), 8)}
      ${trazo(`M22 ${38 + t / 2} L78 ${38 - t / 2}`, a.g("madera", "h"), 7)}
      ${luz("M47.2 12 L47.2 90", L_MADERA, 1.6, .5)}
      ${luz(`M24 ${36 + t / 2} L76 ${36 - t / 2}`, L_MADERA, 1.5, .45)}
      <circle cx="24" cy="${n(38 + t / 2)}" r="3" fill="${a.g("maderaoscura")}" stroke="${T}"
              stroke-width="1.3"/>
      <circle cx="76" cy="${n(38 - t / 2)}" r="3" fill="${a.g("maderaoscura")}" stroke="${T}"
              stroke-width="1.3"/>
      ${forma("M40 30 L60 30 L60 46 L40 46 Z", a.g("lino", "h"), 1.8)}
      ${sombra("M43 32 L43 44 M50 31 L50 45 M57 32 L57 44", 1.6, .55)}
      ${trazo("M58 44 Q64 52 60 60", a.g("lino"), 2.2)}`;
  },

  // ── Luz y fuego ────────────────────────────────────────────────────────────────────────────
  /** Antorcha: palo, trapo empapado y llama. La llama lleva resplandor detrás. */
  antorcha: (a) => `
    <circle cx="50" cy="24" r="30" fill="${a.g("resplandor")}"/>
    ${forma("M44 46 L56 46 L54 94 L46 94 Z", a.g("madera", "h"), 2)}
    ${luz("M45.6 50 L47 92", L_MADERA, 1.5, .5)}
    ${forma("M34 44 Q32 26 50 24 Q68 26 66 44 Q50 50 34 44 Z", a.g("cuerooscuro"), 2)}
    ${sombra("M38 32 Q50 36 62 32 M36 38 Q50 43 64 38", 2, .55)}
    ${forma("M40 44 L60 44 L59 50 L41 50 Z", a.g("hierroviejo", "h"), 1.7)}
    ${forma("M50 2 Q64 16 60 30 Q56 40 50 42 Q44 40 40 30 Q36 16 50 2 Z", a.g("llama"), 1.6)}
    <path d="M50 12 Q57 20 55 28 Q52 34 50 35 Q48 34 45 28 Q43 20 50 12 Z" fill="#FFF6D6"
          opacity=".8"/>
    ${remache(44, 47, 1.8)}${remache(56, 47, 1.8)}`,

  /** Vela de sebo: cirio con goterones y una llama pequeña. */
  vela: (a) => {
    const gotas = Array.from({ length: 4 }, () => {
      const y = a.rr(38, 70), lado = a.r() < .5 ? 38 : 62, r = a.rr(2.4, 4);
      return `<circle cx="${lado}" cy="${y}" r="${r}" fill="${a.g("sebo")}" stroke="${T}"
                stroke-width="1.2"/>`;
    }).join("");
    return `
      <circle cx="50" cy="26" r="24" fill="${a.g("resplandor")}"/>
      ${forma("M38 32 L62 32 L64 84 L36 84 Z", a.g("sebo", "h"), 2)}
      ${luz("M40.4 36 L38.8 82", L_SEBO, 2.2, .85)}
      ${sombra("M60 36 L61.6 82", 2.6, .45)}
      ${gotas}
      ${forma("M30 82 Q50 76 70 82 Q70 92 50 92 Q30 92 30 82 Z", a.g("sebo"), 2)}
      ${luz("M34 84 Q42 80 50 79.4", L_SEBO, 1.8, .7)}
      <path d="M50 24 L50 33" stroke="${T}" stroke-width="3"/>
      <path d="M50 25 L50 32" stroke="#2A1B0D" stroke-width="1.6"/>
      ${forma("M50 8 Q58 16 56 24 Q53 30 50 31 Q47 30 44 24 Q42 16 50 8 Z", a.g("llama"), 1.4)}
      <path d="M50 16 Q54 21 53 25 Q51 28 50 28.6 Q49 28 47 25 Q46 21 50 16 Z" fill="#FFF6D6"
            opacity=".85"/>`;
  },

  /** Candil de mano: jaula de hierro, vidrio con la lumbre dentro y asa. */
  farol: (a) => `
    <circle cx="50" cy="52" r="28" fill="${a.g("resplandor")}"/>
    ${trazo("M32 22 Q50 6 68 22", a.g("hierroviejo"), 4)}
    ${forma("M34 22 L66 22 L70 34 L30 34 Z", a.g("hierro"), 2)}
    ${luz("M36 24 L64 24", FILO, 1.5, .7)}
    ${forma("M32 34 L68 34 L72 74 L28 74 Z", a.g("cristal"), 2)}
    <path d="M36 38 L64 38 L67 70 L33 70 Z" fill="${a.g("llama")}" opacity=".9"/>
    ${forma("M44 50 Q52 54 50 66 L44 66 Q40 56 44 50 Z", a.g("llama"), 1.2)}
    ${luz("M35 38.6 L38 69", L_PAPEL, 2, .6)}
    ${sombra("M65 39 L67 69", 2.4, .45)}
    <path d="M32 34 L68 34 L72 74 L28 74 Z" fill="none" stroke="${a.g("hierroviejo")}"
          stroke-width="3.4"/>
    <path d="M32 34 L68 34 L72 74 L28 74 Z" fill="none" stroke="${T}" stroke-width="1.3"/>
    <path d="M50 34 L50 74" stroke="${T}" stroke-width="3.2"/>
    <path d="M50 34 L50 74" stroke="${a.g("hierroviejo", "h")}" stroke-width="2"/>
    ${forma("M26 72 L74 72 L78 86 L22 86 Z", a.g("hierro", "h"), 2)}
    ${luz("M28 74.6 L72 74.6", FILO, 1.5, .6)}
    ${remache(30, 80)}${remache(70, 80)}`,

  /** Yesquero: pedernal, eslabón de hierro y las chispas. */
  yesquero: (a) => {
    const chispas = Array.from({ length: 5 }, () => {
      const x = a.rr(38, 70), y = a.rr(10, 30), r = a.rr(1.6, 3);
      return `<path d="M${x} ${n(y - r)} L${n(x + r)} ${y} L${x} ${n(y + r)} L${n(x - r)} ${y} Z"
                fill="#FFF6D6"/>`;
    }).join("");
    return `
      <circle cx="52" cy="24" r="22" fill="${a.g("resplandor")}"/>
      ${chispas}
      ${forma("M14 52 L34 40 L52 46 L56 66 L38 80 L18 72 Z", a.g("piedra"), 2.2)}
      ${luz("M16 52.6 L33.6 41.6 L51 47.4", L_PIEDRA, 2.2, .85)}
      ${sombra("M54 50 L54.6 65 L38 77", 2.6, .5)}
      ${sombra("M24 56 L40 50 L44 62 L30 70 Z", 1.8, .4)}
      ${forma("M58 40 Q80 36 86 52 Q88 66 74 72 Q78 58 68 52 Q62 48 58 52 Z",
              a.g("hierro"), 2.1)}
      ${luz("M60 42.6 Q78 39 84 51", FILO, 2, .85)}
      ${sombra("M74 69 Q76 58 68 51", 2.2, .5)}`;
  },

  // ── Consumibles ────────────────────────────────────────────────────────────────────────────
  /** Poción: frasco de vidrio soplado con tapón de corcho y un caldo turbio. */
  pocion: (a) => `
    ${forma("M42 16 L58 16 L58 22 L42 22 Z", a.g("cuero", "h"), 1.7)}
    ${forma("M43 20 L57 20 L56 32 L44 32 Z", a.g("cristal", "h"), 1.7)}
    ${forma("M44 30 Q30 42 30 60 Q30 82 50 86 Q70 82 70 60 Q70 42 56 30 Z", a.g("cristal"), 2.1)}
    <path d="M32 56 Q50 50 68 56 Q68 80 50 84 Q32 80 32 56 Z" fill="${a.g("licor")}"
          stroke="${T}" stroke-width="1.4"/>
    <path d="M32 56 Q50 50 68 56" fill="none" stroke="#C8DA80" stroke-width="1.6" opacity=".8"/>
    ${luz("M38 36 Q33 46 33.4 58", "#F6F9EC", 2.4, .8)}
    ${luz("M35 66 Q35 78 46 82.6", "#C8DA80", 2, .5)}
    ${sombra("M64 38 Q68 48 67.4 62", 2.6, .45)}
    <ellipse cx="41" cy="42" rx="3.4" ry="5.4" fill="#FFFFFF" opacity=".35"
             transform="rotate(-24 41 42)"/>
    ${forma("M40 12 L60 12 L59 20 L41 20 Z", a.g("cuerooscuro", "h"), 1.8)}
    ${luz("M41.6 13.6 L58 13.6", L_CUERO, 1.3, .55)}`,

  /** Raciones: hogaza con cortes y una punta de queso. */
  raciones: (a) => {
    const cortes = Array.from({ length: 3 }, (_, i) =>
      sombra(`M${28 + i * 13} ${n(34 + a.rr(-1.5, 1.5))} L${34 + i * 13} ${n(50 + a.rr(-2, 2))}`,
             2.6, .5)).join("");
    return `
      ${forma("M16 48 Q16 26 46 24 Q76 26 78 46 Q76 66 46 68 Q18 66 16 48 Z", a.g("pan"), 2.2)}
      ${luz("M20 44 Q22 29 44 27", "#F0C88A", 2.4, .8)}
      ${sombra("M74 42 Q76 60 50 65", 2.6, .5)}
      ${cortes}
      ${forma("M44 66 L86 58 L88 84 L46 90 Z", a.g("queso"), 2.1)}
      ${luz("M46 68.6 L85 61", "#FFF6C8", 2, .8)}
      ${sombra("M84 62 L86 82 L48 87", 2.4, .5)}
      <circle cx="60" cy="74" r="3.2" fill="#8B7434" opacity=".8"/>
      <circle cx="74" cy="70" r="2.4" fill="#8B7434" opacity=".8"/>
      <circle cx="70" cy="80" r="2" fill="#8B7434" opacity=".7"/>`;
  },

  /** Vendas: rollo de lino con la punta suelta y una mancha vieja. */
  vendas: (a) => `
    ${forma("M22 44 Q22 22 46 22 Q70 22 70 44 Q70 66 46 66 Q22 66 22 44 Z", a.g("lino"), 2.2)}
    ${luz("M26 40 Q26 25 44 24.6", L_LINO, 2.4, .85)}
    ${sombra("M66 40 Q66 62 46 63.4", 2.6, .45)}
    <ellipse cx="46" cy="44" rx="12" ry="12" fill="none" stroke="${SOM}" stroke-width="1.8"
             opacity=".55"/>
    <ellipse cx="46" cy="44" rx="6" ry="6" fill="${a.g("lino")}" stroke="${T}" stroke-width="1.6"/>
    ${forma("M60 58 Q80 60 84 74 Q86 86 72 90 L62 84 Q74 82 72 74 Q70 66 58 66 Z",
            a.g("lino", "di"), 2)}
    ${luz("M62 60.6 Q78 63 82 74", L_LINO, 1.8, .6)}
    <path d="M66 78 Q74 76 78 82 Q74 87 68 85 Z" fill="${a.g("sangre")}" opacity=".7"/>
    ${sombra("M30 30 Q46 20 62 30", 2, .3)}`,

  /** Hierbas: manojo atado, seco. Los tallos salen del atado con la semilla. */
  hierbas: (a) => {
    const tallos = Array.from({ length: 6 }, (_, i) => {
      const x = 20 + i * 12 + a.rr(-3, 3), y = a.rr(8, 24);
      return trazo(`M50 70 Q${n((50 + x) / 2)} ${n(y + 22)} ${n(x)} ${n(y)}`, a.g("hoja", "v"), 3.4)
        + `<path d="M${n(x)} ${n(y)} q6 3 3 9 q-6 -1 -3 -9 Z" fill="${a.g("hoja")}"
             stroke="${T}" stroke-width="1.2"/>`;
    }).join("");
    return `
      ${tallos}
      ${forma("M42 66 L58 66 L60 84 L40 84 Z", a.g("lino", "h"), 2)}
      ${sombra("M43 70 L57 70 M43 76 L57 76 M43 81 L57 81", 1.8, .55)}
      ${luz("M43.4 68 L43 83", L_LINO, 1.4, .6)}
      ${trazo("M58 80 Q66 86 62 92", a.g("lino"), 2.2)}`;
  },

  // ── Utensilios ─────────────────────────────────────────────────────────────────────────────
  /** Cuerda: rollo de cáñamo con el chicote suelto y el trenzado marcado. */
  cuerda: (a) => {
    const grosor = 8.4;
    const vueltas = [26, 19, 12].map((r, i) =>
      `<ellipse cx="48" cy="${52 + i * 2}" rx="${r}" ry="${n(r * .82)}" fill="none"
         stroke="${T}" stroke-width="${grosor + 2.4}"/>` +
      `<ellipse cx="48" cy="${52 + i * 2}" rx="${r}" ry="${n(r * .82)}" fill="none"
         stroke="${a.g("lino", i % 2 ? "hi" : "h")}" stroke-width="${grosor}"/>`).join("");
    // Trenzado: marcas cortas sobre la vuelta de fuera, con la fase de la semilla.
    const fase = a.rr(0, 6);
    const trenza = Array.from({ length: 14 }, (_, i) => {
      const ang = ((i * 360) / 14 + fase) * Math.PI / 180;
      const x = 48 + Math.cos(ang) * 26, y = 52 + Math.sin(ang) * 21.3;
      const dx = Math.cos(ang) * 3.4, dy = Math.sin(ang) * 3.4;
      return `<path d="M${n(x - dx - dy * .5)} ${n(y - dy + dx * .5)} L${n(x + dx + dy * .5)} ${n(y + dy - dx * .5)}"
                stroke="${SOM}" stroke-width="1.6" opacity=".5"/>`;
    }).join("");
    return `
      ${vueltas}
      ${trenza}
      ${luz("M26 40 Q22 48 23 58", L_LINO, 2, .55)}
      ${trazo("M70 62 Q84 70 78 86", a.g("lino", "v"), 7)}
      ${forma("M74 84 L84 84 L86 92 L72 92 Z", a.g("lino", "h"), 1.6)}
      ${sombra("M75 86 L75 91 M79 86 L79 91 M83 86 L83 91", 1.4, .6)}`;
  },

  /** Llave de hierro forjada: paletón de rombo, caña y dientes. */
  llave: (a) => giro(-14, `
    ${forma("M50 8 L66 26 L50 44 L34 26 Z", a.g("hierro"), 2.2)}
    <path d="M50 18 L58 26 L50 34 L42 26 Z" fill="#070804" stroke="${T}" stroke-width="1.4"/>
    ${luz("M36 26 L50 10", FILO, 2.2, .85)}
    ${sombra("M64 26 L50 42", 2.6, .5)}
    ${forma("M45 42 L55 42 L54 90 L46 90 Z", a.g("hierro", "h"), 2)}
    ${luz("M46.6 46 L47.4 88", FILO, 1.6, .8)}
    ${forma("M53 60 L70 60 L70 70 L53 70 Z", a.g("hierro", "h"), 1.9)}
    ${forma("M53 76 L66 76 L66 86 L53 86 Z", a.g("hierro", "h"), 1.9)}
    ${luz("M54 61.6 L69 61.6 M54 77.6 L65 77.6", FILO, 1.4, .7)}
    ${forma("M44 88 Q50 94 56 88 L56 92 Q50 96 44 92 Z", a.g("hierroviejo", "h"), 1.6)}`),

  /** Ganzúas: tres hierros finos saliendo de un estuche de cuero. */
  ganzuas: (a) => {
    const pico = (ang, d) => `<g transform="rotate(${ang} 50 76)">
      ${trazo(d, a.g("hierro", "v"), 3.6)}
      ${luz(d.replace("M50", "M48.6"), FILO, 1.2, .55)}
    </g>`;
    return `
      ${pico(-24, "M50 70 L50 18 Q50 12 44 12")}
      ${pico(0, "M50 70 L50 10 L57 16")}
      ${pico(22, "M50 70 L50 14 Q56 16 54 22")}
      ${forma("M28 66 L72 66 L76 88 Q50 96 24 88 Z", a.g("cuero"), 2.2)}
      ${luz("M30 68.6 L27 86", L_CUERO, 2.2, .8)}
      ${sombra("M72 69 L74 86", 2.4, .45)}
      ${forma("M26 74 L74 74 L74 82 L26 82 Z", a.g("cuerooscuro", "h"), 1.8)}
      ${remache(36, 78)}${remache(64, 78)}`;
  },

  /** Palanca: barra de hierro con la uña doblada. La herramienta de Bram. */
  palanca: (a) => `
    ${trazo("M78 92 L56 44 Q50 26 34 20", a.g("hierro", "d"), 9)}
    ${luz("M74.6 90 L53 44 Q47.6 28 33 22.6", FILO, 2, .7)}
    ${forma("M36 12 L44 26 L30 32 L20 22 Q24 12 36 12 Z", a.g("hierro"), 2.1)}
    <path d="M27 19 L36 22 L32 27 L24 24 Z" fill="#070804"/>
    ${luz("M35 13.6 L42.6 25.4", FILO, 2, .85)}
    ${sombra("M29 30.6 L21.4 22", 2.4, .5)}
    ${forma("M72 84 Q82 86 84 94 L74 96 Q70 90 72 84 Z", a.g("hierroviejo"), 1.8)}`,

  /** Martillo: el genérico de «herramienta». Cabeza de hierro y mango de fresno. */
  herramienta: (a) => giro(12, `
    ${forma("M45 30 L57 30 L59 92 L44 92 Z", a.g("madera", "h"), 2)}
    ${luz("M46.6 34 L47.6 90", L_MADERA, 1.6, .55)}
    ${sombra("M56 34 L57.4 90", 1.8, .45)}
    ${forma("M26 12 L74 12 L70 26 L62 34 L40 34 L30 26 Z", a.g("hierro"), 2.2)}
    ${luz("M28 14 L72 14", FILO, 2.2, .85)}
    ${luz("M27.6 14.6 L31 25", FILO, 1.6, .6)}
    ${sombra("M71.4 15 L68.6 25.4 L61 33", 2.6, .5)}
    ${forma("M40 26 L60 26 L60 34 L40 34 Z", a.g("hierroviejo", "h"), 1.7)}
    ${forma("M44 90 L58 90 L58 96 L44 96 Z", a.g("cuerooscuro", "h"), 1.6)}
    ${remache(50, 20, 2.6)}`),

  /** Libro: tapa de cuero, cantos de papel, cierre de latón y una marca ciega. */
  libro: (a) => `
    ${forma("M28 14 L82 12 L86 22 L86 82 L82 90 L28 88 Z", a.g("papel", "hi"), 2)}
    ${sombra("M82 20 L82 88 M78 18 L78 88 M74 17 L74 88", 1.6, .45)}
    ${forma("M20 12 L76 10 L80 20 L80 84 L76 92 L20 90 Z", a.g("cuero"), 2.2)}
    ${luz("M23 14 L74 12", L_CUERO, 2.2, .8)}
    ${luz("M23.4 14.6 L23.4 88", L_CUERO, 1.8, .55)}
    ${sombra("M77 20 L77 86 L74 90", 2.6, .5)}
    ${forma("M12 12 L24 11 L24 90 L12 88 Z", a.g("cuerooscuro", "h"), 2)}
    ${sombra("M13 30 L23 30 M13 40 L23 40 M13 62 L23 62 M13 72 L23 72", 2.2, .6)}
    ${forma("M40 34 L60 34 L60 38 L52 38 L52 66 L48 66 L48 38 L40 38 Z", a.g("laton"), 1.7)}
    ${forma("M76 42 L88 40 L88 58 L76 56 Z", a.g("laton", "hi"), 1.8)}
    ${luz("M77.6 43.6 L77.6 55", L_LATON, 1.3, .6)}`,

  /** Pergamino: hoja medio desenrollada, con líneas de tinta y un sello de cera. */
  pergamino: (a) => {
    const lineas = Array.from({ length: 5 }, (_, i) =>
      sombra(`M34 ${34 + i * 8} L${n(a.rr(56, 70))} ${n(33 + i * 8)}`, 2.2, .55)).join("");
    return `
      ${forma("M26 22 L74 18 L78 74 L30 80 Z", a.g("papel"), 2.1)}
      ${luz("M29 24.6 L32.6 77", L_PAPEL, 2.2, .8)}
      ${sombra("M74.6 22 L76 72", 2.4, .45)}
      ${lineas}
      ${forma("M20 12 Q50 6 80 12 Q80 22 50 26 Q20 22 20 12 Z", a.g("papel", "v"), 2.1)}
      ${luz("M23 13 Q50 8 77 13", L_PAPEL, 2, .8)}
      ${sombra("M22 18 Q50 23 78 18", 2, .45)}
      ${forma("M24 72 Q50 66 82 74 Q80 84 50 88 Q26 82 24 72 Z", a.g("papel", "v"), 2.1)}
      ${luz("M27 73 Q50 68.6 79 75", L_PAPEL, 2, .7)}
      <circle cx="66" cy="60" r="9.4" fill="${T}"/>
      <circle cx="66" cy="60" r="8" fill="${a.g("sangre")}"/>
      ${luz("M61 56 Q59.4 60 60.4 64", "#D0724E", 1.6, .7)}
      <path d="M62 57 L70 63 M70 57 L62 63" stroke="#4E1A10" stroke-width="1.8"/>`;
  },

  /** Mochila: fardel de cuero con solapa, correas y hebillas. */
  mochila: (a) => `
    ${forma("M28 26 Q22 46 24 62 Q26 86 50 88 Q74 86 76 62 Q78 46 72 26 Z", a.g("cuero"), 2.2)}
    ${luz("M31 30 Q26 48 27.4 64", L_CUERO, 2.4, .8)}
    ${sombra("M69 30 Q74 48 72.4 66", 2.6, .5)}
    ${forma("M26 24 Q50 14 74 24 Q78 38 74 48 Q50 56 26 48 Q22 38 26 24 Z",
            a.g("cuerooscuro"), 2.1)}
    ${luz("M28.6 26 Q50 17 71 26", L_CUERO, 2, .7)}
    ${sombra("M28 46 Q50 53 72 46", 2, .5)}
    ${forma("M40 46 L46 46 L46 66 L40 66 Z", a.g("cuero", "h"), 1.7)}
    ${forma("M54 46 L60 46 L60 66 L54 66 Z", a.g("cuero", "h"), 1.7)}
    ${forma("M38 58 L48 58 L48 66 L38 66 Z", a.g("laton", "h"), 1.6)}
    ${forma("M52 58 L62 58 L62 66 L52 66 Z", a.g("laton", "h"), 1.6)}
    ${trazo("M30 26 Q20 14 34 10", a.g("cuerooscuro"), 3.4)}
    ${trazo("M70 26 Q80 14 66 10", a.g("cuerooscuro"), 3.4)}
    ${sombra("M32 70 Q50 78 68 70", 2, .4)}`,

  /** Saco: costal de lino atado por el cuello. Sal, harina, grano. */
  saco: (a) => `
    ${forma("M34 34 Q20 50 22 66 Q24 88 50 90 Q76 88 78 66 Q80 50 66 34 Z", a.g("lino"), 2.2)}
    ${luz("M37 36 Q24 52 25.6 66", L_LINO, 2.4, .85)}
    ${sombra("M64 36 Q76 52 74.4 68", 2.6, .5)}
    ${sombra("M40 44 Q38 66 44 84 M60 44 Q62 66 56 84", 2, .35)}
    ${forma("M40 14 Q50 26 60 14 Q68 22 66 36 Q50 42 34 36 Q32 22 40 14 Z", a.g("lino", "hi"), 2)}
    ${sombra("M42 18 Q46 28 44 36 M58 18 Q54 28 56 36", 1.8, .45)}
    ${trazo("M32 30 Q50 38 68 30", a.g("cuerooscuro"), 3.4)}
    ${trazo("M66 32 Q76 36 72 44", a.g("cuerooscuro"), 2.6)}`,

  /** Manta enrollada, atada con dos correas. */
  manta: (a) => `
    ${forma("M18 32 L82 32 Q90 50 82 68 L18 68 Q10 50 18 32 Z", a.g("lana", "v"), 2.2)}
    ${luz("M20 36 L80 36", L_LANA, 2.4, .8)}
    ${sombra("M20 63 L80 63", 2.6, .5)}
    <ellipse cx="18" cy="50" rx="9" ry="18" fill="${a.g("lana")}" stroke="${T}"
             stroke-width="2.2"/>
    <ellipse cx="18" cy="50" rx="5" ry="11" fill="none" stroke="${SOM}" stroke-width="1.8"
             opacity=".55"/>
    <ellipse cx="18" cy="50" rx="1.8" ry="4" fill="${SOM}" opacity=".6"/>
    ${luz("M13 42 Q10.6 50 12.4 58", L_LANA, 1.8, .6)}
    ${forma("M36 30 L44 30 L44 70 L36 70 Z", a.g("cuerooscuro", "h"), 1.9)}
    ${forma("M62 30 L70 30 L70 70 L62 70 Z", a.g("cuerooscuro", "h"), 1.9)}
    ${forma("M34 44 L46 44 L46 54 L34 54 Z", a.g("laton", "h"), 1.7)}
    ${forma("M60 44 L72 44 L72 54 L60 54 Z", a.g("laton", "h"), 1.7)}
    ${luz("M35.4 45.6 L35.4 52.6 M61.4 45.6 L61.4 52.6", L_LATON, 1.3, .6)}`,

  /** Odre: pellejo de vino con tapón de madera y correa. */
  odre: (a) => `
    ${forma("M36 26 Q20 42 24 62 Q28 86 50 88 Q72 86 76 62 Q80 42 64 26 Q56 20 50 22 " +
            "Q44 20 36 26 Z", a.g("cuero"), 2.2)}
    ${luz("M39 28 Q24 44 27.4 62", L_CUERO, 2.4, .85)}
    ${sombra("M62 28 Q76 44 72.4 64", 2.6, .5)}
    ${sombra("M50 30 Q46 56 50 84", 2, .4)}
    <path d="M50 30 Q46 56 50 84" fill="none" stroke=L_CUERO stroke-width="1.2" opacity=".4"
          stroke-dasharray="3 4"/>
    ${forma("M43 12 L57 12 L56 24 L44 24 Z", a.g("madera", "h"), 1.9)}
    ${luz("M44.6 14 L45.4 23", L_MADERA, 1.4, .6)}
    ${trazo("M34 32 Q50 40 66 32", a.g("cuerooscuro"), 3.6)}
    ${trazo("M30 34 Q14 50 22 70", a.g("cuerooscuro"), 3)}`,

  /** Incensario: brasero de latón colgando de cadenas, con humo. */
  incensario: (a) => `
    ${trazo("M50 8 L30 34 M50 8 L50 32 M50 8 L70 34", a.g("laton", "v"), 2.6)}
    <circle cx="50" cy="8" r="5.4" fill="none" stroke="${T}" stroke-width="3.6"/>
    <circle cx="50" cy="8" r="5.4" fill="none" stroke="${a.g("laton")}" stroke-width="2"/>
    ${forma("M28 46 Q28 32 50 30 Q72 32 72 46 Z", a.g("laton"), 2.1)}
    ${luz("M31 44 Q32 34 48 32", L_LATON, 2, .8)}
    <circle cx="42" cy="40" r="2.4" fill="#3A2C10"/>
    <circle cx="50" cy="37" r="2.4" fill="#3A2C10"/>
    <circle cx="58" cy="40" r="2.4" fill="#3A2C10"/>
    ${forma("M26 46 L74 46 L74 52 L26 52 Z", a.g("laton", "h"), 1.9)}
    ${forma("M30 52 Q30 78 50 84 Q70 78 70 52 Z", a.g("laton"), 2.1)}
    ${luz("M33 54 Q33 74 46 81", L_LATON, 2.2, .8)}
    ${sombra("M67 54 Q67 74 54 81", 2.6, .5)}
    ${forma("M44 84 L56 84 L54 92 L46 92 Z", a.g("laton", "h"), 1.7)}
    <g fill="none" stroke="#DCD8C4" stroke-width="2" opacity=".22" stroke-linecap="round">
      <path d="M42 28 Q34 18 40 10"/><path d="M58 28 Q66 18 60 10"/>
    </g>`,

  /** Campana: bronce, badajo y asa. La de avisar, no la de la iglesia. */
  campana: (a) => `
    ${trazo("M50 10 Q42 14 44 22 M50 10 Q58 14 56 22", a.g("laton", "v"), 3)}
    ${forma("M50 20 Q28 28 24 64 L20 74 L80 74 L76 64 Q72 28 50 20 Z", a.g("laton"), 2.2)}
    ${luz("M31 62 Q34 32 48 23", L_LATON, 2.6, .85)}
    ${sombra("M69 62 Q66 34 54 24", 2.6, .5)}
    ${forma("M18 72 L82 72 L82 80 L18 80 Z", a.g("laton", "h"), 2)}
    ${luz("M20 74 L80 74", L_LATON, 1.5, .6)}
    ${forma("M44 80 Q50 94 56 80 Z", a.g("hierroviejo", "h"), 1.8)}
    <circle cx="50" cy="88" r="6" fill="${T}"/>
    <circle cx="50" cy="88" r="4.8" fill="${a.g("hierroviejo")}"/>
    ${luz("M47 85.6 Q45.6 88 46.4 90.4", L_PIEDRA, 1.4, .6)}`,

  // ── Resto ──────────────────────────────────────────────────────────────────────────────────
  /** Moneda: tres, con la de delante levantada y una marca de cuño gastada. */
  moneda: (a) => {
    const g1 = a.rr(-16, -8), g2 = a.rr(8, 18);
    return `
      <g transform="rotate(${g2} 68 70)">
        <ellipse cx="68" cy="70" rx="20" ry="7.6" fill="${T}"/>
        <ellipse cx="68" cy="69" rx="19" ry="6.8" fill="${a.g("laton")}"/>
        ${luz("M52 66.6 Q68 61.6 84 66.6", L_LATON, 1.5, .7)}
      </g>
      <g transform="rotate(${g1} 34 78)">
        <ellipse cx="34" cy="78" rx="20" ry="7.6" fill="${T}"/>
        <ellipse cx="34" cy="77" rx="19" ry="6.8" fill="${a.g("laton")}"/>
        ${luz("M18 74.6 Q34 69.6 50 74.6", L_LATON, 1.5, .7)}
      </g>
      <circle cx="46" cy="42" r="28" fill="${T}"/>
      <circle cx="46" cy="42" r="26" fill="${a.g("laton")}"/>
      <circle cx="46" cy="42" r="21" fill="none" stroke="#4A3714" stroke-width="1.8"
              opacity=".7"/>
      ${luz("M28 30 Q22 40 24 52", L_LATON, 2.6, .9)}
      ${sombra("M64 30 Q70 42 66 56", 2.8, .5)}
      <g fill="none" stroke="#4A3714" stroke-width="3.4" opacity=".8" stroke-linecap="round">
        <path d="M46 32 L46 52"/><path d="M38 42 L54 42"/>
      </g>
      ${luz("M44.6 33 L44.6 51", "#E8D090", 1.4, .55)}`;
  },

  /** Piedra: canto de turbera, facetado con la semilla, con liquen. */
  piedra: (a) => {
    const pts = Array.from({ length: 7 }, (_, i) => {
      const ang = (i / 7) * Math.PI * 2 - .4;
      const r = a.rr(28, 38);
      return `${n(50 + Math.cos(ang) * r)} ${n(54 + Math.sin(ang) * r * .86)}`;
    });
    const d = `M${pts.join(" L")} Z`;
    const liquen = Array.from({ length: 7 }, () =>
      `<circle cx="${a.rr(30, 62)}" cy="${a.rr(56, 78)}" r="${a.rr(2, 4.4)}"/>`).join("");
    return `
      ${forma(d, a.g("piedra"), 2.4)}
      ${luz(`M${pts[4]} L${pts[5]} L${pts[6]}`, L_PIEDRA, 2.6, .8)}
      ${sombra(`M${pts[1]} L${pts[2]} L${pts[3]}`, 3, .5)}
      ${forma(`M${pts[5]} L${pts[6]} L${pts[0]} L50 54 Z`, a.g("piedra", "di"), 1.6)}
      ${sombra("M42 30 L48 50 L44 66", 2, .45)}
      <g fill="#3A422C" opacity=".75">${liquen}</g>`;
  },

  /** Hueso: un fémur. Sale mucho en una turbera. */
  hueso: (a) => giro(-34, `
    ${forma("M42 26 L58 26 L57 74 L43 74 Z", a.g("hueso", "h"), 2)}
    ${forma("M50 14 Q64 12 64 22 Q64 30 54 30 Q58 36 50 36 Q42 36 46 30 " +
            "Q36 30 36 22 Q36 12 50 14 Z", a.g("hueso"), 2.1)}
    ${forma("M50 86 Q64 88 64 78 Q64 70 54 70 Q58 64 50 64 Q42 64 46 70 " +
            "Q36 70 36 78 Q36 88 50 86 Z", a.g("hueso"), 2.1)}
    ${luz("M44 30 L44.6 70", L_HUESO, 2, .8)}
    ${luz("M40 17 Q37.4 22 39.6 27", L_HUESO, 1.8, .7)}
    ${sombra("M56 30 L55.4 70", 2.4, .45)}
    ${sombra("M60 76 Q62.6 80 59 84", 2.2, .45)}`),

  /** Fardo: el genérico. Bulto de tela atado en cruz con el nudo arriba. */
  fardo: (a) => `
    ${forma("M30 32 Q18 48 22 66 Q26 88 50 90 Q74 88 78 66 Q82 48 70 32 Z", a.g("lino"), 2.2)}
    ${luz("M33 34 Q22 50 25.6 66", L_LINO, 2.4, .85)}
    ${sombra("M67 34 Q78 50 74.4 68", 2.6, .5)}
    ${sombra("M36 40 Q32 62 38 84 M64 40 Q68 62 62 84", 2, .35)}
    ${trazo("M24 52 Q50 60 76 52", a.g("cuerooscuro"), 3.6)}
    ${trazo("M50 30 Q44 58 50 88", a.g("cuerooscuro"), 3.6)}
    ${forma("M42 22 Q50 34 58 22 Q64 26 58 34 Q50 40 42 34 Q36 26 42 22 Z",
            a.g("lino", "hi"), 2)}
    ${trazo("M44 24 Q38 14 30 18", a.g("cuerooscuro"), 2.6)}
    ${trazo("M56 24 Q62 14 70 18", a.g("cuerooscuro"), 2.6)}
    ${luz("M43.6 25 Q40 20 34.6 19.4", L_CUERO, 1.3, .5)}`,
};

// ── Categorías ────────────────────────────────────────────────────────────────────────────────
/**
 * Nombre corto y familia de cada categoría. La familia da el color, que quien llama puede usar
 * para el marco de la casilla o el rótulo: en una bandeja de veinte cosas, el color separa el
 * arma de la comida antes de que el ojo llegue a leer el icono.
 */
const FAMILIA = {
  arma: "#CBD0B2",
  armadura: "#93A07C",
  complemento: "#D9A04A",
  luz: "#C8823C",
  consumible: "#9AAE5E",
  util: "#8E9377",
  tesoro: "#F0DCA8",
  resto: "#7E8468",
};

const CAT = {
  espada: ["Espada", "arma"],
  daga: ["Daga", "arma"],
  hacha: ["Hacha", "arma"],
  maza: ["Maza", "arma"],
  lanza: ["Lanza", "arma"],
  baston: ["Bastón", "arma"],
  arco: ["Arco", "arma"],
  flechas: ["Flechas", "arma"],
  escudo: ["Escudo", "armadura"],
  casco: ["Casco", "armadura"],
  capucha: ["Capucha", "armadura"],
  coraza: ["Coraza", "armadura"],
  guantes: ["Guantes", "armadura"],
  pantalones: ["Grebas", "armadura"],
  botas: ["Botas", "armadura"],
  capa: ["Capa", "armadura"],
  anillo: ["Anillo", "complemento"],
  amuleto: ["Amuleto", "complemento"],
  simbolo: ["Símbolo sagrado", "complemento"],
  antorcha: ["Antorcha", "luz"],
  vela: ["Vela", "luz"],
  farol: ["Candil", "luz"],
  yesquero: ["Yesquero", "luz"],
  pocion: ["Frasco", "consumible"],
  raciones: ["Raciones", "consumible"],
  vendas: ["Vendas", "consumible"],
  hierbas: ["Hierbas", "consumible"],
  cuerda: ["Cuerda", "util"],
  llave: ["Llave", "util"],
  ganzuas: ["Ganzúas", "util"],
  palanca: ["Palanca", "util"],
  herramienta: ["Herramienta", "util"],
  libro: ["Libro", "util"],
  pergamino: ["Pergamino", "util"],
  mochila: ["Mochila", "util"],
  saco: ["Saco", "util"],
  manta: ["Manta", "util"],
  odre: ["Odre", "util"],
  incensario: ["Incensario", "util"],
  campana: ["Campana", "util"],
  moneda: ["Monedas", "tesoro"],
  piedra: ["Piedra", "resto"],
  hueso: ["Hueso", "resto"],
  fardo: ["Fardo", "resto"],
};

/**
 * Reglas de reconocimiento, EN ORDEN: gana la primera que encaja, así que lo específico va antes
 * que lo genérico. Ejemplos que tienen que seguir funcionando y por eso están donde están:
 *
 *   «herramientas de ladrón»      → ganzuas      (antes que herramienta)
 *   «suministros de curandero»    → vendas
 *   «escudo con símbolo sagrado»  → escudo       (antes que simbolo)
 *   «capucha de cuero»            → capucha      (antes que coraza, que se queda «cuero»)
 *   «guantes de cuero»            → guantes      (idem)
 *   «bota de vino»                → odre         (antes que botas)
 *   «martillo de guerra»          → maza         (antes que herramienta, que es el martillo)
 *   «Cuerda de cáñamo, 15 m»      → cuerda       (ya normalizado a «cuerda de canamo 15 m»)
 *
 * Los patrones van sin tildes y sin ñ porque `normalizar` las quita antes de comparar.
 */
const REGLAS = [
  [/\bherramientas de ladron|\bganzua|\butiles de ladron|\bllaves falsas/, "ganzuas"],
  [/\bsuministros? de curander|\bvenda|\bhilas\b|\bbotiquin|\bgasa|\bcabestrillo/, "vendas"],
  [/\bmartillo de guerra|\bmartillo belico/, "maza"],
  [/\bbota de (vino|agua)|\bodre|\bcantimplora|\bpellejo/, "odre"],
  [/\bescudo|\brodela|\bpavesa|\badarga|\bbroquel/, "escudo"],
  [/\bsimbolo|\bicono sagrado|\brelicario|\bcruz\b|\bcrucifijo/, "simbolo"],
  [/\bcapucha|\bcapuz|\bcaperuza|\bembozo/, "capucha"],
  [/\bcasco|\byelmo|\bcapacete|\bbacinete|\bmorrion|\bgorro|\bsombrero|\bdiadema|\bcorona/, "casco"],
  [/\bespada|\bestoque|\bsable|\bmandoble|\bcimitarra|\bflorete|\bespadon|\bacero\b/, "espada"],
  [/\bdaga|\bpunal|\bcuchillo|\bnavaja|\bestilete/, "daga"],
  [/\bhacha|\bhachuela|\bsegur\b|\bdestral/, "hacha"],
  [/\bmaza\b|\bmazas\b|\bgarrote|\bporra\b|\bmangual|\bclava\b/, "maza"],
  [/\blanza|\bjabalina|\bpica\b|\bvenablo|\btridente|\barpon/, "lanza"],
  [/\bbaston|\bcayado|\bvara\b|\bbordon|\bpalo\b/, "baston"],
  [/\barcos?\b|\bballesta/, "arco"],
  [/\bflecha|\bsaeta|\bvirote|\bcarcaj|\baljaba|\bdardo/, "flechas"],
  [/\bguante|\bmanopla|\bmiton/, "guantes"],
  [/\bbotas?\b|\bborcegui|\bzapato|\bsandalia|\bescarpin|\bcalzado/, "botas"],
  [/\bpantalon|\bgreba|\bcalza|\bquijote|\bpolaina|\bbraga/, "pantalones"],
  [/\bcapas?\b|\bmanto\b|\bcapote|\besclavina|\btabardo|\bsobreveste/, "capa"],
  [/\bcota\b|\bcamisote|\bmalla\b|\bcoraza|\bpeto\b|\bbrigantina|\bloriga/, "coraza"],
  [/\bjubon|\bchaleco|\barmadura|\bcuero\b|\bpechera|\btachonad/, "coraza"],
  [/\banillo|\bsortija|\balianza\b/, "anillo"],
  [/\bamuleto|\bcolgante|\btalisman|\bmedallon|\bdije\b|\bcamafeo|\bgema\b|\bpiedra de/, "amuleto"],
  [/\bantorcha|\btea\b|\bteas\b|\bhachon/, "antorcha"],
  [/\bvelas?\b|\bcirio|\bcandela|\bpabilo/, "vela"],
  [/\bfarol|\blinterna|\bcandil|\blampara|\bquinque/, "farol"],
  [/\bcuerda|\bsoga|\bcordel|\bcabo\b|\bhilo\b|\bbramante|\bmaroma|\bsedal|\bcanamo/, "cuerda"],
  [/\byesca|\bpedernal|\beslabon|\bchisquero|\byesquero|\bmechero/, "yesquero"],
  [/\bpocion|\bfrasco|\bvial\b|\belixir|\bunguento|\bbrebaje|\bredoma|\baceite/, "pocion"],
  [/\bveneno|\bantidoto|\btinta\b|\bagua bendita|\bampolla|\bpomada/, "pocion"],
  [/\bracion|\bcomida|\bviveres|\bprovisiones|\bpan\b|\bhogaza|\bqueso/, "raciones"],
  [/\bcecina|\bcarne\b|\bvitualla|\bgalleta|\btocino|\bmanzana/, "raciones"],
  [/\bllave|\bllavin/, "llave"],
  [/\blibro|\btomo\b|\bregistro|\bdiario|\bcodice|\bbreviario|\bmisal/, "libro"],
  [/\bcuaderno|\bgrimorio|\bvolumen|\bbiblia|\bevangeli/, "libro"],
  [/\bpergamino|\brollo|\bcarta\b|\bnota\b|\bmapa\b|\bdocumento|\bpapel/, "pergamino"],
  [/\bescritura|\bmisiva|\bvitela|\bconjuro|\bcontrato|\bactas?\b/, "pergamino"],
  [/\bmoneda|\boro\b|\bplata\b|\bcobre\b|\bducado|\bflorin|\bdinero|\bmonedero/, "moneda"],
  [/\bpalanca|\bpalanqueta|\bbarra de hierro|\bpie de cabra/, "palanca"],
  [/\bmartillo|\bherramienta|\bsierra|\bpala\b|\bazada|\bhoz\b|\bcincel/, "herramienta"],
  [/\balicate|\bclavo|\baguja|\btijera|\bpiqueta|\bmazo\b|\blima\b|\bpinza/, "herramienta"],
  [/\bmochila|\bmorral|\bzurron|\bfardel/, "mochila"],
  [/\bpiedra|\broca\b|\bcanto\b|\bguijarro|\bpedrusco|\blasca/, "piedra"],
  [/\bhueso|\bcalavera|\bcraneo|\bcolmillo|\bdiente|\bcostilla|\bvertebra/, "hueso"],
  [/\bhierba|\bplanta|\braiz\b|\bmusgo|\bflor\b|\bflores|\bseta|\bhongo|\bhelecho|\bramillete/,
    "hierbas"],
  [/\bmanta|\bjergon|\bsaco de dormir|\bmanton|\bcolcha|\bfrazada|\bmanto de viaje/, "manta"],
  [/\bincensario|\bturibulo|\bsahumerio|\bincienso/, "incensario"],
  [/\bcampana|\bcencerro|\besquila/, "campana"],
  [/\bsacos?\b|\bcostal|\btalega|\bbolsa\b|\bsal\b|\bharina|\bgrano|\bsemilla|\bespecias?\b/,
    "saco"],
];

/**
 * Categoría deducida del nombre en texto libre. Nunca falla: lo que no se reconoce cae en fardo,
 * con `reconocido: false` por si quien llama quiere marcarlo.
 */
export function categoriaDe(nombre) {
  const t = normalizar(nombre);
  const clave = (t && REGLAS.find(([re]) => re.test(t))?.[1]) || "fardo";
  const [corto, familia] = CAT[clave];
  return {
    clave,
    nombre: corto,
    familia,
    color: FAMILIA[familia],
    reconocido: clave !== "fardo" || /\bfardo|\bbulto|\bpaquete|\blio\b/.test(t),
  };
}

/** Todas las claves de categoría, en el orden en que están definidas. Para bancos de prueba. */
export const CATEGORIAS = Object.keys(CAT);

/**
 * SVG del icono de un objeto: el contenido de un lienzo de 100×100 con el origen arriba a la
 * izquierda, SIN el <svg> envolvente. Ver la cabecera del fichero para las opciones.
 */
export function iconoObjeto(nombre, opciones = {}) {
  const { clave } = categoriaDe(nombre);
  const t = normalizar(nombre);
  const semilla = opciones.semilla != null ? opciones.semilla >>> 0 : hash32(t || clave);

  // Prefijo de los ids: categoría + hash del nombre. Determinista a propósito (ver regla 3 de la
  // cabecera). `sufijo` se limpia porque va dentro de un id y lo pone quien llama.
  const extra = String(opciones.sufijo ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24);
  const pref = `ob-${clave}-${hash32(t || clave).toString(36)}${extra ? `-${extra}` : ""}`;

  const cuerpo = (ICONOS[clave] ?? ICONOS.fardo)(pincel(pref, semilla));

  // Los <defs> se sacan de lo que el dibujo ha pedido de verdad: se escanea el marcado buscando
  // url(#…). Así no hay que declarar a mano qué materiales usa cada icono, y es imposible que
  // quede una referencia sin su degradado (que se pintaría de negro).
  const usados = [...new Set([...cuerpo.matchAll(/url\(#([A-Za-z0-9_-]+)\)/g)].map((m) => m[1]))];
  const defs = usados
    .map((id) => {
      const resto = id.startsWith(`${pref}-`) ? id.slice(pref.length + 1) : "";
      const i = resto.lastIndexOf("-");
      return i < 0 ? "" : defGradiente(id, resto.slice(0, i), resto.slice(i + 1));
    })
    .filter(Boolean)
    .join("");

  // La sombra proyectada del icono entero, con `filter` de CSS: es lo que lo despega de la
  // piedra del fondo. Va en un `style` porque en SVG no hay box-shadow y un <filter> propio
  // necesitaría otro id más.
  const sombraCss = opciones.sombra === false
    ? ""
    : ` style="filter:drop-shadow(1.6px 2.2px 1.6px rgba(5,6,3,.72))"`;

  return `<defs>${defs}</defs><g class="ico-objeto ico-${clave}"${sombraCss}>${cuerpo}</g>`;
}

/** Un degradado del material, en la dirección pedida. Devuelve "" si no existe el material. */
function defGradiente(id, mat, dir) {
  const m = MAT[mat];
  if (!m) return "";
  const paradas = m.paradas
    .map(([c, o, a]) =>
      `<stop offset="${o}" stop-color="${c}"${a != null ? ` stop-opacity="${a}"` : ""}/>`)
    .join("");
  if (m.radial) {
    return `<radialGradient id="${id}" cx="${m.cx}" cy="${m.cy}" r="${m.r}">${paradas}` +
      `</radialGradient>`;
  }
  const [x1, y1, x2, y2] = DIR[dir] ?? DIR.d;
  return `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${paradas}` +
    `</linearGradient>`;
}
