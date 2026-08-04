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
  // El cáñamo va más tostado que el lino a propósito: el rollo de cuerda y el rollo de vendas
  // tienen la misma forma, y a 40 px lo único que los separa es el color.
  soga:       { paradas: [["#D6BE86", 0], ["#A28C54", .38], ["#6C5C30", .74], ["#3A3018", 1]] },
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
const L_MADERA = "#D8A863";
const L_CUERO = "#C89858";
const L_LINO = "#EFE9C8";
const L_LANA = "#C9CCAE";
const L_LATON = "#FFF0C0";
const L_HUESO = "#FFF8DC";
const L_PIEDRA = "#B8BEA0";
const L_PAPEL = "#F6EDC6";
const L_SEBO = "#FFFBE4";

// ── Utillaje de dibujo ────────────────────────────────────────────────────────────────────────

/** Forma rellena con contorno oscuro: la base de casi todo. */
const forma = (d, relleno, w = 2) =>
  `<path d="${d}" fill="${relleno}" stroke="${T}" stroke-width="${w}" stroke-linejoin="round"/>`;

/**
 * Trazo con contorno: uno oscuro más gordo debajo y el material encima. Es como se dibujan los
 * astiles, las cuerdas y las cadenas sin tener que cerrar un contorno a mano.
 *
 * CUIDADO con las rectas perfectamente verticales u horizontales. Los degradados van en
 * `objectBoundingBox`, y una caja de anchura o altura CERO no se pinta: el trazo del material
 * desaparecía y solo quedaba el contorno negro (así se dibujaba el símbolo sagrado, con una
 * barra negra en vez del palo). `enderezar` mete un desvío de 0,04 unidades para que la caja
 * nunca sea degenerada; no se ve, y el degradado vuelve a pintar. Aun así, para una pieza plana
 * y ancha es mejor un `forma()` con su rectángulo: se controla mejor la luz.
 */
const trazo = (d, relleno, w, extra = "") => {
  const dd = enderezar(d);
  return `<path d="${dd}" fill="none" stroke="${T}" stroke-width="${w + 2.6}"
     stroke-linecap="round" stroke-linejoin="round"/>` +
  `<path d="${dd}" fill="none" stroke="${relleno}" stroke-width="${w}" stroke-linecap="round"
     stroke-linejoin="round" ${extra}/>`;
};

/**
 * Rompe la degeneración de un path recto: si todas las x (o todas las y) son iguales, desvía la
 * última coordenada de ese eje 0,04 unidades. Da por hecho que los números del path van en pares
 * x/y, que es el caso de todo lo que se dibuja aquí (solo M, L y Q).
 */
function enderezar(d) {
  const nums = d.match(/-?\d*\.?\d+/g);
  if (!nums || nums.length < 4) return d;
  const planos = (resto) =>
    nums.every((v, i) => i % 2 !== resto || Number(v) === Number(nums[resto]));
  const eje = planos(0) ? 0 : planos(1) ? 1 : -1;
  if (eje < 0) return d;
  let ultima = nums.length - 1;
  while (ultima % 2 !== eje) ultima--;
  let i = -1;
  return d.replace(/-?\d*\.?\d+/g, (m) => (++i === ultima ? String(Number(m) + .04) : m));
}

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
    .replace(/[\u0300-\u036F]/g, "")
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
      const y = a.rr(22, 58), p = a.rr(1.2, 2.2);
      return `<path d="M44.2 ${y} l${p} ${n(p * .9)} l${n(-p)} ${n(p * .9)} Z" fill="${SOM}"/>`;
    }).join("");
    // La hoja llega al borde del lienzo: es lo que la separa de la daga a 40 px.
    return giro(-38, `
      ${forma("M50 3 L55.8 20 L55.8 65 L44.2 65 L44.2 20 Z", a.g("hierro", "h"), 1.8)}
      ${sombra("M53.6 22 L53.6 64", 2.4, .45)}
      ${luz("M44.2 20 L50 3", FILO, 1.5)}
      ${luz("M45.8 22 L45.8 63", FILO, 1.6, .75)}
      ${mellas}
      ${forma("M29 64.5 Q28 68 29 71.5 L71 71.5 Q72 68 71 64.5 Z", a.g("hierroviejo", "h"), 1.8)}
      ${luz("M30 66 L70 66", L_PIEDRA, 1.3, .6)}
      ${forma("M46.4 71 L53.6 71 L54.4 86 L45.6 86 Z", a.g("cuerooscuro", "h"), 1.8)}
      ${sombra("M47.6 73.5 L52.9 73.5 M47.7 78 L53.1 78 M47.9 82.5 L53.3 82.5", 1.6, .7)}
      ${forma("M50 85 Q57 86 56.5 90.5 Q54 94.5 50 94.5 Q46 94.5 43.5 90.5 Q43 86 50 85 Z",
              a.g("hierroviejo"), 1.8)}
      ${luz("M46 87.5 Q44.8 90 45.2 92.2", L_PIEDRA, 1.4, .6)}`);
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

  /**
   * Hacha de leñador: cabeza de hierro a un lado, astil de madera. La cabeza tiene que ser
   * grande y con la barba marcada, o a 40 px se lee como una pala.
   */
  hacha: (a) => giro(18, `
    ${forma("M46 8 L54 8 L56 92 L44 92 Z", a.g("madera", "h"), 1.9)}
    ${luz("M47.6 12 L49 90", L_MADERA, 1.6, .55)}
    ${sombra("M53 14 L54.6 90", 2, .5)}
    ${forma("M49 15 L25 9 Q6 30 29 60 Q42 50 42 35 Q42 24 49 21 Z", a.g("hierro"), 2.1)}
    ${luz("M25 11 Q8 30 28 57", FILO, 3)}
    ${sombra("M40 24 Q39 40 42 50", 2.4, .45)}
    ${sombra("M31 20 Q26 36 34 52", 2, .3)}
    ${forma("M45 14 L55 14 L55 32 L45 32 Z", a.g("hierroviejo", "h"), 1.8)}
    ${luz("M46.4 16 L46.4 30", L_PIEDRA, 1.4, .55)}
    ${remache(50, 18, 2.2)}${remache(50, 28, 2.2)}
    ${forma("M43 88 L57 88 L57.5 95 L42.5 95 Z", a.g("cuerooscuro", "h"), 1.7)}`),

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
    ${forma("M50 3 Q62 18 59 34 L41 34 Q38 18 50 3 Z", a.g("hierro", "h"), 1.9)}
    ${luz("M41.6 32 Q39 18 49.6 4.4", FILO, 2)}
    ${luz("M46 12 L46 32", FILO, 1.4, .5)}
    ${sombra("M57 32 Q59.6 19 51 6", 2.4, .45)}
    ${forma("M43 32 L57 32 L55.5 40 L44.5 40 Z", a.g("hierroviejo", "h"), 1.7)}
    ${trazo("M45 43 Q50 47 55 43", a.g("soga"), 3)}
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
        ${forma("M47.7 20 L52.3 20 L52.3 90 L47.7 90 Z", a.g("madera", "h"), 1.8)}
        ${luz("M49 24 L49 86", L_MADERA, 1, .45)}
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

  /**
   * Casco cerrado: bacinete con banda de cejas, dos ranuras de visión y nasal. El casco abierto
   * (solo la cúpula) se leía como una seta: hace falta la cara entera para que se entienda.
   */
  casco: (a) => `
    ${forma("M18 52 Q18 12 50 10 Q82 12 82 52 L80 68 Q72 82 50 84 Q28 82 20 68 Z",
            a.g("hierro"), 2.2)}
    ${luz("M22 50 Q22 17 47 13", FILO, 2.6, .9)}
    ${luz("M22 58 Q23 70 32 78", FILO, 1.8, .55)}
    ${sombra("M78 30 Q79 62 70 76", 2.8, .5)}
    ${forma("M16 46 L84 46 L84 58 L16 58 Z", a.g("hierroviejo", "h"), 2)}
    ${luz("M18 48.4 L82 48.4", L_PIEDRA, 1.6, .6)}
    <path d="M24 62 L44 62 L44 71 L27 71 Z" fill="#070804" stroke="${T}" stroke-width="1.4"/>
    <path d="M76 62 L56 62 L56 71 L73 71 Z" fill="#070804" stroke="${T}" stroke-width="1.4"/>
    ${luz("M25 62.4 L43.4 62.4", L_PIEDRA, 1.4, .55)}
    ${luz("M57 62.4 L75 62.4", L_PIEDRA, 1.4, .55)}
    ${forma("M44 57 L56 57 L54 80 Q50 84 46 80 Z", a.g("hierro", "h"), 1.9)}
    ${luz("M45.6 60 L47.4 79", FILO, 1.6, .85)}
    ${remache(26, 52)}${remache(74, 52)}${remache(50, 18)}`,

  /**
   * Capucha de cuero, la que se lleva en la turbera. Lleva pico arriba y esclavina abajo: sin
   * esas dos cosas era un huevo con un agujero. El hueco de la cara va negro del todo.
   */
  capucha: (a) => `
    ${forma("M12 92 Q16 66 34 56 L66 56 Q84 66 88 92 Z", a.g("cuerooscuro"), 2.1)}
    ${forma("M62 6 Q80 20 80 48 Q80 70 66 80 L34 80 Q20 70 20 48 Q22 18 62 6 Z",
            a.g("cuero"), 2.2)}
    ${luz("M23 48 Q25 22 59 9", L_CUERO, 2.6, .85)}
    ${sombra("M76 44 Q77 66 64 77", 2.8, .5)}
    <path d="M50 28 Q66 36 63 58 Q58 74 50 78 Q42 74 37 58 Q34 36 50 28 Z" fill="#070804"
          stroke="${T}" stroke-width="1.8"/>
    ${luz("M38.4 52 Q36.4 36 49 29.4", "#8A6636", 2, .65)}
    ${trazo("M26 62 Q22 78 26 90", a.g("cuerooscuro"), 2.6)}
    ${trazo("M74 62 Q78 78 74 90", a.g("cuerooscuro"), 2.6)}
    ${luz("M17 90 Q20 70 34 59", L_CUERO, 1.8, .5)}`,

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

  /**
   * Capa de lana con broche de latón. El bajo va ondulado y los pliegues no son simétricos: una
   * capa recta y simétrica se leía como una campana o un escudo.
   */
  capa: (a) => `
    ${forma("M50 12 L30 18 Q10 36 16 64 Q19 80 22 92 Q32 86 40 90 Q50 82 60 90 " +
            "Q70 84 80 92 Q84 76 86 62 Q90 34 70 18 Z", a.g("lana"), 2.2)}
    ${luz("M30.6 20 Q13.4 38 19 64 L24 88", L_LANA, 2.4, .8)}
    ${sombra("M69 20 Q86.6 38 82 64 L78 88", 2.8, .5)}
    ${sombra("M38 22 L32 86 M50 20 L48 84 M60 22 L66 86 M72 26 L78 84", 2.2, .35)}
    ${luz("M43 22 L38 86", L_LANA, 1.6, .3)}
    ${forma("M50 8 Q62 10 72 20 L60 26 Q50 18 40 26 L28 20 Q38 10 50 8 Z",
            a.g("cuerooscuro", "h"), 2)}
    ${luz("M30.6 20 Q39 12 49 10", L_CUERO, 1.6, .55)}
    <circle cx="50" cy="20" r="8.4" fill="${T}"/>
    <circle cx="50" cy="20" r="7" fill="${a.g("laton")}"/>
    <circle cx="50" cy="20" r="2.8" fill="#2A1B0D"/>
    ${luz("M45 16 Q42.6 19.6 43.4 23.4", L_LATON, 1.8, .85)}`,

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
    ${forma("M50 16 L61 26 L57 38 L43 38 L39 26 Z", a.g("sangre"), 1.9)}
    ${luz("M50 18.6 L41.4 26.4", "#D0724E", 2, .8)}
    ${luz("M41 28 L44 36", "#D0724E", 1.5, .5)}
    ${remache(38, 36, 1.8)}${remache(62, 36, 1.8)}`,

  /**
   * Amuleto: disco de hueso tallado colgado de un cordón de cuero. Antes era una gota estrecha y
   * a 40 px parecía un pez; un disco grande con una runa grabada se lee de golpe.
   */
  amuleto: (a) => {
    const runa = a.ri(0, 2);
    const marcas = [
      "M42 52 L58 52 M50 42 L50 68 M42 62 L58 62",
      "M40 46 L60 66 M60 46 L40 66 M50 40 L50 72",
      "M40 62 L50 42 L60 62 M44 54 L56 54",
    ][runa];
    return `
      ${trazo("M18 12 Q50 34 82 12", a.g("cuerooscuro"), 4)}
      <circle cx="50" cy="56" r="30" fill="${T}"/>
      <circle cx="50" cy="56" r="28" fill="${a.g("hueso")}"/>
      ${luz("M30 42 Q23 56 26 70", L_HUESO, 3, .9)}
      ${sombra("M70 40 Q78 56 72 72", 3, .5)}
      <circle cx="50" cy="56" r="22" fill="none" stroke="${SOM}" stroke-width="1.8" opacity=".5"/>
      <g fill="none" stroke="#5A5340" stroke-width="3.4" stroke-linecap="round" opacity=".85">
        <path d="${marcas}"/>
      </g>
      ${forma("M42 22 Q50 16 58 22 L56 32 Q50 28 44 32 Z", a.g("hueso", "h"), 1.8)}
      <circle cx="50" cy="24" r="4" fill="#070804" stroke="${T}" stroke-width="1.3"/>`;
  },

  /**
   * Símbolo sagrado de pueblo: dos ramas gordas atadas con cordel, no una cruz de orfebre. Los
   * palos van anchos (13 unidades) porque a 40 px una cruz de línea fina desaparece.
   */
  simbolo: (a) => {
    // El brazo va SIEMPRE torcido (nunca t = 0): es una cruz atada a mano, y además una caja de
    // altura cero no pintaría el degradado.
    const t = (a.r() < .5 ? -1 : 1) * a.rr(2.5, 6);
    return `
      ${forma("M44 6 L56 6 L56 94 L44 94 Z", a.g("madera", "h"), 2)}
      ${trazo(`M16 ${n(34 + t / 2)} L84 ${n(34 - t / 2)}`, a.g("madera", "h"), 9)}
      ${luz("M45.8 12 L45.8 90", L_MADERA, 2.2, .55)}
      ${luz(`M19 ${n(31 + t / 2)} L81 ${n(31 - t / 2)}`, L_MADERA, 1.8, .5)}
      ${sombra("M54.6 14 L54.6 90", 2.4, .45)}
      ${forma("M42 26 L58 26 L58 44 L42 44 Z", a.g("soga", "h"), 1.8)}
      ${sombra("M45 28 L45 42 M50 27 L50 43 M55 28 L55 42", 2, .5)}
      ${luz("M43.4 28 L43.4 42", "#EEDCA8", 1.4, .55)}
      ${trazo("M56 42 Q64 52 58 62", a.g("soga"), 2.6)}`;
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
    // Goterones: cuelgan POR FUERA del cirio, no encima. Dentro parecían burbujas.
    const gotas = Array.from({ length: 3 }, () => {
      const y = a.rr(40, 66), izq = a.r() < .5;
      const x = izq ? 38.5 : 61.5, w = a.rr(3.4, 5), h = a.rr(8, 15);
      const s = izq ? -1 : 1;
      return `<path d="M${n(x)} ${n(y)} q${n(s * w)} ${n(h * .3)} ${n(s * w * .7)} ${n(h)}
                       q${n(s * -w * .8)} ${n(h * .16)} ${n(s * -w * .7)} ${n(-h)} Z"
                fill="${a.g("sebo", izq ? "h" : "hi")}" stroke="${T}" stroke-width="1.3"/>`;
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
    ${forma("M48.4 34 L51.6 34 L51.6 74 L48.4 74 Z", a.g("hierroviejo", "h"), 1.6)}
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
      ${forma("M12 54 L30 38 L50 44 L54 68 L34 82 L16 74 Z", a.g("piedra"), 2.3)}
      ${luz("M14 54.6 L29.6 39.6 L49 45.4", L_PIEDRA, 2.4, .85)}
      ${sombra("M52 48 L52.6 67 L34 79", 2.8, .5)}
      ${sombra("M26 52 L40 62", 2, .35)}
      ${forma("M52 34 L86 34 Q92 52 88 66 Q80 80 64 80 Q76 66 74 54 Q70 42 52 44 Z",
              a.g("hierro"), 2.2)}
      ${luz("M54 36 L84 36", FILO, 2.6, .9)}
      ${luz("M54 42 Q71 41 74 54", FILO, 1.8, .6)}
      ${sombra("M86 38 Q90 54 86 65 L66 78", 2.6, .5)}`;
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

  /**
   * Vendas: rollo de lino con la venda medio desenrollada. La cinta se dibuja PLANA y de borde
   * recto (la cuerda va redonda y trenzada): es lo que distingue los dos rollos a 40 px, junto
   * con el color claro y la mancha vieja.
   */
  vendas: (a) => `
    ${forma("M44 18 Q80 14 88 32 Q94 52 74 60 L48 72 L38 52 L62 42 Q72 38 66 32 Q56 26 46 32 Z",
            a.g("lino", "v"), 2.1)}
    ${luz("M46 20.6 Q78 17 86 33", L_LINO, 2.2, .8)}
    ${sombra("M41 52 L62 43 M48 70 L74 58", 2.2, .45)}
    <path d="M60 52 Q78 46 84 56 Q74 66 58 62 Z" fill="${a.g("sangre")}" opacity=".8"/>
    <path d="M46 66 Q54 62 58 68 Q52 73 44 71 Z" fill="${a.g("sangre")}" opacity=".55"/>
    ${forma("M8 60 Q8 34 34 34 Q60 34 60 60 Q60 86 34 86 Q8 86 8 60 Z", a.g("lino"), 2.3)}
    ${luz("M12 56 Q13 39 32 38", L_LINO, 2.8, .9)}
    ${sombra("M56 56 Q56 82 34 83.4", 2.8, .5)}
    <ellipse cx="34" cy="60" rx="18" ry="18" fill="none" stroke="${SOM}" stroke-width="2.2"
             opacity=".5"/>
    <ellipse cx="34" cy="60" rx="11" ry="11" fill="none" stroke="${SOM}" stroke-width="2.2"
             opacity=".6"/>
    <ellipse cx="34" cy="60" rx="5.4" ry="5.4" fill="${a.g("lino", "di")}" stroke="${T}"
             stroke-width="1.8"/>
    ${sombra("M16 44 Q34 36 52 44", 2.2, .3)}`,

  /**
   * Hierbas: manojo atado, seco. Cuatro tallos GORDOS con hojas grandes; con seis finos era un
   * arañazo verde. La inclinación de cada tallo sale de la semilla.
   */
  hierbas: (a) => {
    const tallos = [0, 1, 2].map((i) => {
      const x = 20 + i * 30 + a.rr(-4, 4), y = a.rr(8, 18);
      const mx = n((50 + x) / 2 + (x < 50 ? -8 : 8));
      const lado = i === 1 ? 1 : x < 50 ? -1 : 1;
      // Hoja grande a media altura y capullo en la punta: a 40 px las hojas pequeñas se borran.
      const sx = n(x + (50 - x) * .34), sy = n(y + 22);
      const hoja = `<path d="M${sx} ${sy} q${n(lado * 20)} -6 ${n(lado * 23)} 12
                             q${n(lado * -19)} 5 ${n(lado * -23)} -12 Z"
                      fill="${a.g("hoja")}" stroke="${T}" stroke-width="1.6"/>`;
      return trazo(`M50 66 Q${mx} ${n(y + 28)} ${n(x)} ${n(y)}`, a.g("hoja", "v"), 6.5)
        + hoja
        + `<ellipse cx="${n(x)}" cy="${n(y)}" rx="6" ry="8" fill="${a.g("hoja")}"
             stroke="${T}" stroke-width="1.6"/>`
        + luz(`M${n(x - 3.4)} ${n(y + 2)} q1 6 2 9`, "#C4D48A", 1.6, .6);
    }).join("");
    return `
      ${tallos}
      ${forma("M40 64 L60 64 L63 86 L37 86 Z", a.g("lino", "h"), 2.1)}
      ${sombra("M42 69 L58 69 M42 76 L58 76 M42 82 L58 82", 2.2, .55)}
      ${luz("M41.6 66 L40.6 85", L_LINO, 1.6, .65)}
      ${trazo("M61 82 Q71 88 66 96", a.g("lino"), 2.4)}`;
  },

  // ── Utensilios ─────────────────────────────────────────────────────────────────────────────
  /**
   * Cuerda: rollo de cáñamo con el chicote suelto. Dos vueltas gordas y el trenzado bien marcado;
   * con tres vueltas finas parecía un caracol.
   */
  cuerda: (a) => {
    // Trenzado: marcas cruzadas sobre la vuelta de fuera, con la fase de la semilla.
    const fase = a.rr(0, 8);
    const trenza = Array.from({ length: 13 }, (_, i) => {
      const ang = ((i * 360) / 13 + fase) * Math.PI / 180;
      const x = 46 + Math.cos(ang) * 30, y = 48 + Math.sin(ang) * 25;
      const dx = Math.cos(ang) * 4.6, dy = Math.sin(ang) * 4.6;
      return `<path d="M${n(x - dx * .3 - dy * .8)} ${n(y - dy * .3 + dx * .8)}
                       L${n(x + dx * .9 + dy * .6)} ${n(y + dy * .9 - dx * .6)}"
                stroke="${SOM}" stroke-width="2" opacity=".55" stroke-linecap="round"/>`;
    }).join("");
    const vuelta = (r, dir) =>
      `<ellipse cx="46" cy="48" rx="${r}" ry="${n(r * .84)}" fill="none" stroke="${T}"
         stroke-width="14"/>` +
      `<ellipse cx="46" cy="48" rx="${r}" ry="${n(r * .84)}" fill="none"
         stroke="${a.g("soga", dir)}" stroke-width="11"/>`;
    return `
      ${trazo("M60 56 Q86 62 80 84 L76 92", a.g("soga", "v"), 11)}
      ${vuelta(30, "h")}
      ${vuelta(15, "hi")}
      ${trenza}
      ${luz("M22 38 Q16 48 18 58", "#EEDCA8", 2.4, .6)}
      ${luz("M35 40 Q31 48 32.6 55", "#EEDCA8", 1.8, .45)}
      ${forma("M70 86 L84 84 L86 96 L68 96 Z", a.g("soga", "h"), 1.8)}
      ${sombra("M72 88 L71 95 M77 87 L77 95 M82 87 L83 95", 1.6, .6)}`;
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

  /**
   * Ganzúas: tres hierros saliendo de un estuche de cuero. Van gordos (5,6) y con la punta muy
   * doblada: es la punta la que dice que son ganzúas y no agujas de tejer.
   */
  ganzuas: (a) => {
    const pico = (ang, d) => `<g transform="rotate(${ang} 50 78)">
      ${trazo(d, a.g("hierro", "v"), 5.6)}
      ${luz(d.replace(/^M50/, "M47.8"), FILO, 1.8, .6)}
    </g>`;
    return `
      ${pico(-26, "M50 72 L50 20 Q50 10 38 12")}
      ${pico(0, "M50 72 L50 8 L60 18")}
      ${pico(26, "M50 72 L50 16 Q62 18 58 28")}
      ${forma("M26 64 L74 64 L78 88 Q50 96 22 88 Z", a.g("cuero"), 2.2)}
      ${luz("M29 66.6 L25 86", L_CUERO, 2.4, .85)}
      ${sombra("M74 67 L76 86", 2.6, .45)}
      ${forma("M24 72 L76 72 L76 82 L24 82 Z", a.g("cuerooscuro", "h"), 1.9)}
      ${luz("M26 74 L74 74", L_CUERO, 1.4, .5)}
      ${remache(34, 77)}${remache(66, 77)}`;
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

  /**
   * Martillo: el genérico de «herramienta». Cabeza rectangular con oreja de uña a la izquierda,
   * que es lo que lo separa del hacha y de la maza de un vistazo.
   */
  herramienta: (a) => giro(12, `
    ${forma("M45 28 L57 28 L59 92 L44 92 Z", a.g("madera", "h"), 2)}
    ${luz("M46.6 32 L47.6 90", L_MADERA, 1.6, .55)}
    ${sombra("M56 32 L57.4 90", 1.8, .45)}
    ${forma("M40 10 L74 12 L74 32 L40 30 Z", a.g("hierro"), 2.2)}
    ${forma("M40 12 Q22 10 14 20 Q24 22 30 30 L40 30 Z", a.g("hierro"), 2)}
    ${luz("M42 12 L72 13.6", FILO, 2.4, .9)}
    ${luz("M39 12.6 Q23 11.4 16 19.4", FILO, 2, .7)}
    ${sombra("M72.6 14 L72.6 30.6 L42 29", 2.6, .5)}
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
    ${forma("M50 34 L62 50 L50 66 L38 50 Z", a.g("laton"), 1.7)}
    ${forma("M50 42 L56 50 L50 58 L44 50 Z", a.g("cuerooscuro"), 1.4)}
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
    ${trazo("M40 20 Q50 8 60 20", a.g("cuerooscuro"), 4)}
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

  /**
   * Manta enrollada, atada con dos correas. Lleva dos franjas tejidas: sin ellas el rollo se leía
   * como un tubo de metal, porque el degradado fuerte hace de reflejo.
   */
  manta: (a) => `
    ${forma("M18 30 L82 30 Q90 50 82 70 L18 70 Q10 50 18 30 Z", a.g("lana", "v"), 2.2)}
    ${luz("M20 34 L80 34", L_LANA, 2.4, .8)}
    ${sombra("M20 65 L80 65", 2.6, .5)}
    <path d="M22 40 L84 40" stroke="#3E4030" stroke-width="3.4" opacity=".8"/>
    <path d="M22 58 L84 58" stroke="#3E4030" stroke-width="2.4" opacity=".7"/>
    <ellipse cx="18" cy="50" rx="9" ry="20" fill="${a.g("lana")}" stroke="${T}"
             stroke-width="2.2"/>
    <ellipse cx="18" cy="50" rx="5" ry="11.6" fill="none" stroke="${SOM}" stroke-width="1.8"
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

  /**
   * Piedra: canto de turbera con liquen. Nueve vértices en vez de siete y sin faceta central:
   * con la faceta grande parecía un sobre de papel. El contorno lo pone la semilla.
   */
  piedra: (a) => {
    const pts = Array.from({ length: 9 }, (_, i) => {
      const ang = (i / 9) * Math.PI * 2 - .5;
      const r = a.rr(31, 39);
      return `${n(50 + Math.cos(ang) * r)} ${n(52 + Math.sin(ang) * r * .88)}`;
    });
    const liquen = Array.from({ length: 9 }, () =>
      `<circle cx="${a.rr(30, 66)}" cy="${a.rr(58, 78)}" r="${a.rr(2.4, 5)}"/>`).join("");
    return `
      ${forma(`M${pts.join(" L")} Z`, a.g("piedra"), 2.6)}
      ${luz(`M${pts[5]} L${pts[6]} L${pts[7]} L${pts[8]}`, L_PIEDRA, 3.4, .85)}
      ${sombra(`M${pts[1]} L${pts[2]} L${pts[3]} L${pts[4]}`, 3.6, .5)}
      ${sombra("M40 26 L46 48 L38 64", 2.4, .4)}
      ${sombra("M60 24 L56 44", 2, .3)}
      <g fill="#3A422C" opacity=".8">${liquen}</g>
      <g fill="#54603A" opacity=".7">
        <circle cx="${a.rr(34, 60)}" cy="${a.rr(62, 74)}" r="2.2"/>
        <circle cx="${a.rr(34, 60)}" cy="${a.rr(62, 74)}" r="1.8"/>
      </g>`;
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
    ${forma("M50 30 Q38 18 31 26 Q37 34 50 32 Z", a.g("lino", "h"), 1.8)}
    ${forma("M50 30 Q62 18 69 26 Q63 34 50 32 Z", a.g("lino", "hi"), 1.8)}
    ${forma("M50 24 Q57 27 56 33 Q50 37 44 33 Q43 27 50 24 Z", a.g("lino"), 1.8)}
    ${luz("M46 25.6 Q43.6 29 44.6 33", L_LINO, 1.4, .6)}
    ${luz("M34 25 Q40 22 47 28", L_LINO, 1.3, .5)}`,
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
  [/\bcasco|\byelmo|\bcapacete|\bbacinete|\bmorrion/, "casco"],
  [/\bgorro|\bsombrero|\bdiadema|\bcorona|\bcofia/, "casco"],
  // Sin «acero» a secas: «cota de acero» tiene que caer en coraza, y esta regla va antes.
  [/\bespada|\bestoque|\bsable|\bmandoble|\bcimitarra|\bflorete|\bespadon/, "espada"],
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
  // Aquí NO va «piedra de …»: «piedra de afilar» es una piedra, no un colgante.
  [/\bamuleto|\bcolgante|\btalisman|\bmedallon|\bdije\b|\bcamafeo|\bgema\b/, "amuleto"],
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
  const huella = hash32(normalizar(nombre) || clave);
  const semilla = opciones.semilla != null ? opciones.semilla >>> 0 : huella;

  // Prefijo de los ids: categoría + hash del nombre. Determinista a propósito (ver regla 3 de la
  // cabecera). `sufijo` se limpia porque va dentro de un id y lo pone quien llama.
  const extra = String(opciones.sufijo ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24);
  const pref = `ob-${clave}-${huella.toString(36)}${extra ? `-${extra}` : ""}`;

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
