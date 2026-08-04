/**
 * figura.js — el muñeco de equipo: una figura humana dibujada y once marcos de hierro.
 *
 * La pantalla de equipo tenía una silueta de líneas finas con once aros alrededor. Esto la
 * sustituye por lo que se pidió: un CUERPO dibujado —de frente, de pie, con volumen— y los huecos
 * en MARCOS CUADRADOS alineados en dos columnas, como el inventario del Diablo III.
 *
 * Reglas que se siguen en todo el fichero (las mismas que en `objetos.js`):
 *
 *  1. SVG en línea y nada más: ni imágenes remotas, ni tipografías de fuera, ni librerías. La CSP
 *     de la app es estricta. Todo son <path>, degradados y un par de filtros de desenfoque.
 *  2. DETERMINISTA: ni `Math.random()` ni `Date.now()`. Todas las coordenadas están escritas a
 *     mano, así que el dibujo sale idéntico en cada repintado y no «tiembla».
 *  3. Los ids de <defs> llevan delante un prefijo con el `sufijo` que pase quien llama, para que
 *     dos figuras en la misma página no se pisen los degradados. INVARIANTE: los degradados
 *     dependen SOLO del sufijo, no de la geometría, así que los once marcos de una misma figura
 *     definen exactamente los mismos <defs> y da igual cuál gane.
 *  4. Aquí no se escribe TEXTO. Los rótulos («Cabeza», el nombre del objeto, el bono de CA) los
 *     pone quien llama, fuera del marco.
 *
 * Luz siempre desde ARRIBA A LA IZQUIERDA. Sobre fondo de turba, el cuerpo tiene que salir por
 * LUZ y no por línea: de ahí que no haya contorno negro alrededor de la figura, sino tiza sucia
 * en el canto que mira a la luz y sombra verdosa en el otro. Es un dibujo anatómico viejo, no un
 * héroe brillante.
 *
 * ── Contrato ──────────────────────────────────────────────────────────────────────────────────
 *
 *   LIENZO → { ancho, alto }
 *     El lienzo en el que está dibujado TODO (figura y huecos). Quien llama lo envuelve así:
 *         `<svg viewBox="0 0 ${LIENZO.ancho} ${LIENZO.alto}">…</svg>`
 *     En pantalla se ve a 420-480 px de ancho; el alto sale de la proporción.
 *
 *   figura(opciones?) → string
 *     El dibujo del cuerpo: contenido de un SVG (un <defs> y un <g>), SIN el <svg> envolvente.
 *     Va PRIMERO en el marcado, porque el SVG pinta en orden y la figura queda DEBAJO de los
 *     huecos.
 *         opciones = {
 *           sufijo:    string  — se añade a los ids de <defs>. Distinto por instancia.
 *           defs:      boolean — emitir el <defs> de la figura (por defecto true). A false si
 *                                quien llama ya los tiene puestos con el MISMO sufijo.
 *           halo:      boolean — resplandor tenue detrás del cuerpo y sombra en el suelo (true).
 *           opacidad:  number  — opacidad del grupo entero (1). Para atenuar la figura.
 *         }
 *
 *   HUECOS_FIGURA → [{ k, x, y, w, h, grande }]
 *     Los once huecos, en las unidades de LIENZO; `x,y` es la esquina SUPERIOR IZQUIERDA y
 *     `grande` distingue los marcos altos (torso, armas) de los pequeños (anillos, amuleto,
 *     guantes). Van en orden de lectura: arriba abajo, izquierda derecha. Las claves son las
 *     once del estado guardado y NO se pueden cambiar.
 *
 *   marcoHueco(x, y, w, h, opciones?) → string
 *     El marco vacío de un hueco: plancha de hierro remachada con el interior hundido y oscuro.
 *     Sirve para cualquier tamaño, así todos los huecos salen iguales.
 *         opciones = {
 *           sufijo:    string  — como en figura(); usa el MISMO para toda la figura.
 *           defs:      boolean — emitir el <defs> del marco (por defecto true). Son idénticos
 *                                para el mismo sufijo, así que repetirlos once veces no rompe
 *                                nada; ponerlo a false solo ahorra marcado.
 *           acento:    string|null — color del filo interior, para marcar un hueco (destino de
 *                                un arrastre, hueco ocupado…). Por defecto null.
 *           remaches:  boolean — los cuatro remaches de latón de las esquinas (true).
 *         }
 *
 *   interiorHueco(hueco, margen?) → { x, y, w, h }
 *     El rectángulo LIBRE de dentro del marco, donde quien llama pinta el icono. `hueco` es un
 *     objeto con `{x,y,w,h}` (vale un elemento de HUECOS_FIGURA). Un icono de `objetos.js` se
 *     encaja así:
 *         const c = interiorHueco(h);
 *         const k = Math.min(c.w, c.h) / 100;
 *         `<g transform="translate(${c.x + (c.w - 100 * k) / 2} ${c.y + (c.h - 100 * k) / 2})
 *            scale(${k})">${iconoObjeto(nombre, { sufijo, sombra: false })}</g>`
 *
 *   BORDE_HUECO(w, h) → number
 *     Lo que come el marco por cada lado. Lo usa `interiorHueco`; se exporta por si quien llama
 *     quiere medir sin construir el rectángulo.
 */

// ── El lienzo y la retícula de huecos ─────────────────────────────────────────────────────────
//
// 440 × 524 son las unidades del dibujo, elegidas para que a los 440 px de pantalla una unidad
// sea un píxel: los marcos pequeños miden 52 px y los grandes 76 × 96, que es lo que hace falta
// para que dentro quepa un icono reconocible en un tablet.
//
// La disposición son DOS COLUMNAS de marcos en cinco bandas horizontales, más el yelmo suelto
// arriba en el centro:
//
//        [ amuleto ]        [ cabeza ]        [ capa   ]     ← cuello y hombros
//        [ pecho   ]         (cuerpo)         [ manos  ]     ← torso
//        [ diestra ]         (cuerpo)         [ zurda  ]     ← a la altura de las manos
//        [ piernas ]         (cuerpo)         [ pies   ]     ← piernas y pies
//        [ anillo1 ]                          [ anillo2]     ← lo pequeño, abajo
//
// Las bandas están alineadas a izquierda y derecha para que se lean como dos columnas y no como
// once cajas sueltas. La única banda con tamaños distintos a los dos lados es la del torso
// (`pecho` grande contra `manos` pequeño): hay cinco marcos grandes y cinco pequeños, así que una
// banda tiene que ser mixta; el pequeño va CENTRADO en la banda para que se vea intencionado.
export const LIENZO = { ancho: 440, alto: 524 };

/** Eje de simetría del cuerpo. Todo el dibujo se construye alrededor. */
const EJE = LIENZO.ancho / 2;

/** Columnas: `x` de los marcos grandes y de los pequeños (centrados en la misma columna). */
const COL = {
  izqG: 14, izqP: 26,
  derG: 350, derP: 362,
};

export const HUECOS_FIGURA = [
  { k: "cabeza",  x: 186,       y:   8, w: 68, h: 62, grande: false },
  { k: "amuleto", x: COL.izqP,  y:  80, w: 52, h: 52, grande: false },
  { k: "capa",    x: COL.derP,  y:  80, w: 52, h: 52, grande: false },
  { k: "pecho",   x: COL.izqG,  y: 144, w: 76, h: 96, grande: true  },
  { k: "manos",   x: COL.derP,  y: 166, w: 52, h: 52, grande: false },
  { k: "diestra", x: COL.izqG,  y: 252, w: 76, h: 96, grande: true  },
  { k: "zurda",   x: COL.derG,  y: 252, w: 76, h: 96, grande: true  },
  { k: "piernas", x: COL.izqG,  y: 360, w: 76, h: 88, grande: true  },
  { k: "pies",    x: COL.derG,  y: 360, w: 76, h: 88, grande: true  },
  { k: "anillo1", x: COL.izqP,  y: 460, w: 52, h: 52, grande: false },
  { k: "anillo2", x: COL.derP,  y: 460, w: 52, h: 52, grande: false },
];

// ── Paleta ────────────────────────────────────────────────────────────────────────────────────
// Tiza sucia para la carne iluminada, verde de liquen para la sombra: un dibujo a lápiz y
// sanguina que ha cogido humedad, no piel rosada. Los valores salen de las variables de `:root`
// en index.html (--tiza, --tiza-baja, --liquen, --musgo, --turba), estiradas a las paradas que
// necesita un degradado.
//
// Tres rampas de carne, según de qué lado del cuerpo esté la pieza. Cada una va del canto que
// mira a la luz al que queda en sombra; que la pieza de la derecha arranque ya apagada es lo que
// hace que el cuerpo se lea como UNA cosa iluminada de lado y no como piezas sueltas, cada una
// con su propio brillo.
//
// El recorrido es LARGO a propósito, de la tiza casi blanca al verde de turba: con rampas cortas
// —todo en el tercio claro— la figura salía plana, como un muñeco de plástico. El lado en sombra
// muere casi en el color del fondo, que es lo que hace que el cuerpo aparezca por la luz.
const CARNE_LUZ = ["#F3EEDA", "#D4CFB2", "#A5AB88", "#727A59", "#464E36"];  // lado iluminado
const CARNE_MED = ["#E2DDC4", "#B7B399", "#8B9170", "#5C6445", "#383F2A"];  // eje del cuerpo
const CARNE_SOM = ["#ABAC8F", "#8A9070", "#697152", "#484F37", "#2C3321"];  // lado en sombra
const HIERRO = [["#A9AF90", 0], ["#7C8464", .28], ["#4A5139", .62], ["#2A2F1F", 1]];
const HONDO = [["#080A05", 0], ["#101408", .45], ["#1B2011", .8], ["#242A17", 1]];

const LUZ_ALTA = "#F4EFDA";   // tiza levantada: el canto que mira a la luz
const LUZ_MEDIA = "#D6D1B6";
const SOMBRA = "#151A0A";     // sombra de la carne; verdosa, nunca negra
const OSCURO = "#0A0C06";     // contorno de los marcos
const LATON = "#8A6A28";

/** Redondea a dos decimales: los paths salen legibles y el fichero no engorda. */
const n = (v) => Math.round(v * 100) / 100;

/** Prefijo de ids. Se limpia porque va dentro de un id y lo pone quien llama. */
const prefijo = (sufijo) => {
  const s = String(sufijo ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24);
  return `fg${s ? `-${s}` : ""}`;
};

/**
 * Refleja un path respecto al eje del cuerpo. La mitad del cuerpo se escribe una vez y la otra
 * sale de aquí, que es como se mantienen simétricas las dos piernas sin repetir los números.
 *
 * Da por hecho que el path solo tiene M, L, C y Z y que los números van en pares x/y — que es el
 * caso de todo lo que se dibuja aquí. Se refleja la COORDENADA, no con un `transform`, para no
 * tener que pensar dos veces en qué sistema está cada cosa.
 */
function esp(d) {
  let i = -1;
  return d.replace(/-?\d*\.?\d+/g, (m) => (++i % 2 === 0 ? String(n(2 * EJE - Number(m))) : m));
}

// ── Utillaje de dibujo ────────────────────────────────────────────────────────────────────────

/** Sombra blanda: una forma oscura desenfocada. Es lo que hunde una zona del cuerpo. */
const som = (d, pref, op = .5, borroso = "b2") =>
  `<path d="${d}" fill="${SOMBRA}" opacity="${op}" filter="url(#${pref}-${borroso})"/>`;

/** Trazo de sombra: un pliegue, un surco, la raya entre dos músculos. */
const surco = (d, pref, w = 3, op = .45, borroso = "b1") =>
  `<path d="${d}" fill="none" stroke="${SOMBRA}" stroke-width="${w}" stroke-linecap="round"
     opacity="${op}" filter="url(#${pref}-${borroso})"/>`;

/** Luz de canto: la línea clara del lado que mira a la luz. Es lo que da el volumen. */
const filo = (d, pref, w = 3, op = .45, borroso = "b1", color = LUZ_ALTA) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round"
     opacity="${op}" filter="url(#${pref}-${borroso})"/>`;

/** Mancha de luz: un brillo blando sobre un músculo. */
const brillo = (d, pref, op = .28, color = LUZ_MEDIA) =>
  `<path d="${d}" fill="${color}" opacity="${op}" filter="url(#${pref}-b2)"/>`;

/** Remache de latón: contorno, cuerpo y reflejo. Tres círculos, y a 40 px se lee. */
const remache = (x, y, r) =>
  `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r + .7)}" fill="${OSCURO}"/>` +
  `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${LATON}"/>` +
  `<circle cx="${n(x - r * .3)}" cy="${n(y - r * .3)}" r="${n(r * .4)}" fill="#E8D49E"/>`;

/** Degradado lineal con las paradas de un material, en la caja del elemento que lo usa. */
const grad = (id, paradas, [x1, y1, x2, y2]) =>
  `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">` +
  paradas.map(([c, o]) => `<stop offset="${o}" stop-color="${c}"/>`).join("") +
  `</linearGradient>`;

/**
 * Degradado en coordenadas del LIENZO, no de la caja de la forma. Todo el cuerpo va así: las
 * coordenadas del degradado son las del dibujo, y por tanto la luz cae siempre desde el mismo
 * sitio, esté la forma donde esté. Con degradados en la caja de cada forma pasaba lo contrario —
 * cada brazo se iluminaba por su cuenta y la figura se leía como piezas de maniquí.
 */
const gradLienzo = (id, paradas, [x1, y1, x2, y2]) =>
  `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" ` +
  `y2="${y2}">` +
  paradas.map(([c, o, a]) =>
    `<stop offset="${o}" stop-color="${c}"${a != null ? ` stop-opacity="${a}"` : ""}/>`).join("") +
  `</linearGradient>`;

/**
 * Cilindro: la rampa de carne cruzando de lado a lado la pieza, en coordenadas del lienzo. Un
 * brazo, un muslo y un cuello son cilindros, y esto es lo que les da la vuelta.
 *
 * `x1` es el canto que mira a la luz y `x2` el que queda en sombra. La luz no se pone justo en el
 * borde (`.06`) porque un cilindro tiene su máximo un poco por dentro del canto.
 */
const cilindro = (id, x1, x2, rampa) =>
  gradLienzo(id, [[rampa[0], .05], [rampa[1], .28], [rampa[2], .55], [rampa[3], .8],
                  [rampa[4], 1]], [x1, 0, x2, 0]);

/** Desenfoque. Tres fuerzas: `b1` para surcos y filos, `b2` para masas, `b3` para el suelo. */
const desenfoque = (id, r) =>
  `<filter id="${id}" x="-40%" y="-40%" width="180%" height="180%">` +
  `<feGaussianBlur stdDeviation="${r}"/></filter>`;

// ── El cuerpo ─────────────────────────────────────────────────────────────────────────────────
//
// Figura de pie, de frente, brazos algo separados del cuerpo. Proporciones de siempre: siete
// cabezas y media, de la coronilla (y=76) a la planta (y=508). La cabeza mide 58 de alto, y de
// ahí salen los puntos de referencia:
//
//   mentón 134 · hombros 152 · pectorales 190 · cintura 256 · ingle 302
//   punta de los dedos 344 · rodilla 390 · tobillo 484 · planta 508
//
// CÓMO ESTÁ MONTADO, que es lo que importa si hay que retocarlo:
//
//   1. `PIEZAS` son los trozos del cuerpo (piernas, pies, cuello, tronco, brazos, manos, cabeza),
//      cada uno con su cilindro: un degradado en coordenadas del LIENZO que cruza la pieza del
//      canto iluminado al canto en sombra. Al estar todos en el mismo sistema de coordenadas y
//      con rampas emparejadas por lado, el cuerpo se lee como una sola cosa iluminada de lado.
//   2. La misma lista hace de <clipPath>. Todo el sombreado se pinta DENTRO del recorte, y por
//      eso se puede sombrear a brochazos anchos y desenfocados sin que se salga del cuerpo.
//   3. Encima van dos velos (uno hacia los pies, porque la luz viene de arriba, y otro hacia la
//      derecha) y el modelado: pectorales, esternón, rodillas, ingles… lo justo. Cada raya de más
//      convierte el dibujo en un mapa.
//
// Solo se escribe la mitad izquierda del lienzo (que es el lado DERECHO de la figura, porque nos
// mira); la otra sale de `esp()`. Los contornos de los que cuelgan los filos de luz repiten unos
// cuantos números de las siluetas a propósito: son las mismas curvas, y tenerlas suelto es lo que
// permite iluminar un canto y no el otro.

/** Cráneo y mandíbula: un huevo con los pómulos como parte más ancha y el mentón estrechado. */
const D_CABEZA =
  "M220 78 C233 78 243 89 243 103 C243 114 240 123 236 130 C232 137 227 141 220 141 " +
  "C213 141 208 137 204 130 C200 123 197 114 197 103 C197 89 207 78 220 78 Z";

/**
 * Cuello y trapecios. Baja hasta y=166 y se abre a 64 de ancho: tiene que meterse POR DEBAJO del
 * tronco con holgura, o entre los dos queda una muesca negra a los lados del cuello.
 */
const D_CUELLO =
  "M209 118 C208 130 206 141 199 150 C194 155 190 160 188 166 L252 166 C250 160 246 155 241 150 " +
  "C234 141 232 130 231 118 Z";

/**
 * Tronco, de la clavícula a la ingle. La cintura entra a 72 de ancho entre unos hombros de 90 y
 * unas caderas de 84: sin ese estrechamiento el cuerpo se lee como un tablón.
 */
const D_TRONCO =
  "M220 146 C204 146 191 150 184 158 C177 166 174 176 175 190 C176 208 182 226 185 244 " +
  "C187 254 186 264 183 276 C180 288 177 296 178 303 C179 309 184 313 191 311 L220 306 " +
  "L249 311 C256 313 261 309 262 303 C263 296 260 288 257 276 C254 264 253 254 255 244 " +
  "C258 226 264 208 265 190 C266 176 263 166 256 158 C249 150 236 146 220 146 Z";

/**
 * Brazo derecho de la figura (a nuestra izquierda). Del hombro al puño.
 *
 * La esquina de (164,154) es el ACROMION, y está ahí por algo: sin ella, el trapecio y el
 * deltoides forman una sola cuesta continua del cuello al codo y la figura parece llevar una
 * capa puesta. El hombro tiene que ir casi plano y romper de golpe.
 *
 * El canto de dentro se mete por encima del tronco arriba (el brazo va DELANTE) y se separa a
 * partir del codo: es la postura del inventario del Diablo, brazos algo abiertos.
 */
const D_BRAZO =
  "M190 145 C179 146 170 149 164 154 C158 160 156 168 157 177 C155 186 153 193 152 201 " +
  "C148 217 143 235 139 251 C136 270 131 292 129 311 C128 316 130 319 134 319 L147 319 " +
  "C148 306 149 300 151 293 C154 278 155 272 157 265 C159 258 161 254 164 250 " +
  "C168 240 170 232 174 225 C178 214 181 208 184 200 C187 190 189 183 190 177 " +
  "C190 166 190 155 190 145 Z";

/** Mano derecha de la figura: dedos juntos y algo doblados, pulgar hacia dentro. */
const D_MANO =
  "M129 314 C125 320 124 331 128 340 C131 346 138 349 143 345 C147 341 149 331 148 320 " +
  "L147 313 Z";

/**
 * Pierna derecha de la figura: muslo, rodilla estrecha y gemelo por fuera. La cara de dentro cae
 * casi recta y la de fuera hace las dos curvas — es lo que la separa de un tubo.
 */
const D_PIERNA =
  "M177 296 C172 310 171 330 171 346 C172 360 175 368 177 376 C178 384 179 388 179 392 " +
  "C180 400 179 408 180 416 C181 428 184 442 186 458 C186 470 186 480 186 490 L206 490 " +
  "C206 480 206 470 206 458 C206 444 208 430 209 418 C209 410 209 404 209 392 " +
  "C209 386 210 382 210 376 C211 366 213 344 212 320 L212 296 Z";

/** Pie derecho de la figura: empeine en escorzo, talón estrecho y los dedos hacia el que mira. */
const D_PIE =
  "M186 480 C182 487 179 494 178 499 C177 504 181 507 188 507 L207 507 C212 507 214 503 213 498 " +
  "C211 491 208 485 207 480 Z";

/**
 * Las piezas del cuerpo, en el orden en que se pintan: primero lo que va detrás. `g` es el
 * cilindro con el que se rellena cada una (ver TONOS).
 */
const PIEZAS = [
  { d: D_PIERNA,       g: "pierna-i" },
  { d: esp(D_PIERNA),  g: "pierna-d" },
  { d: D_PIE,          g: "pie-i" },
  { d: esp(D_PIE),     g: "pie-d" },
  { d: D_CUELLO,       g: "cuello" },
  { d: D_TRONCO,       g: "tronco" },
  { d: D_BRAZO,        g: "brazo-i" },
  { d: esp(D_BRAZO),   g: "brazo-d" },
  { d: D_MANO,         g: "mano-i" },
  { d: esp(D_MANO),    g: "mano-d" },
  { d: D_CABEZA,       g: "cabeza" },
];

/**
 * El cilindro de cada pieza: de qué x a qué x cruza la rampa y cuál de las tres rampas usa. Los
 * dos números son los cantos de la pieza en el lienzo — el primero, el que mira a la luz.
 */
const TONOS = {
  "cuello":   [196, 250, CARNE_MED],
  "cabeza":   [197, 243, CARNE_MED],
  "tronco":   [172, 266, CARNE_MED],
  "brazo-i":  [126, 190, CARNE_LUZ],
  "brazo-d":  [250, 314, CARNE_SOM],
  "mano-i":   [124, 150, CARNE_LUZ],
  "mano-d":   [290, 316, CARNE_SOM],
  "pierna-i": [170, 213, CARNE_LUZ],
  "pierna-d": [227, 270, CARNE_SOM],
  "pie-i":    [176, 214, CARNE_LUZ],
  "pie-d":    [226, 264, CARNE_SOM],
};

// Contornos de los que cuelga el modelado. `_I` es el canto que mira a la luz (a la izquierda del
// lienzo) y `_D` el que queda en sombra; los del lado derecho salen de `esp()`.
const C_TRONCO_I = "M184 158 C177 166 174 176 175 190 C176 208 182 226 185 244 " +
  "C187 254 186 264 183 276 C180 288 177 296 178 303";
const C_BRAZO_I = "M190 145 C179 146 170 149 164 154 C158 160 156 168 157 177 " +
  "C155 186 153 193 152 201 C148 217 143 235 139 251 C136 270 131 292 129 311";
const C_BRAZO_D = "M147 319 C148 306 149 300 151 293 C154 278 155 272 157 265 " +
  "C159 258 161 254 164 250 C168 240 170 232 174 225 C178 214 181 208 184 200 " +
  "C187 190 189 183 190 177";
const C_PIERNA_I = "M177 296 C172 310 171 330 171 346 C172 360 175 368 177 376 " +
  "C178 384 179 388 179 392 C180 400 179 408 180 416 C181 428 184 442 186 458 " +
  "C186 470 186 480 186 490";
const C_PIERNA_D = "M212 302 C213 344 211 366 210 376 C210 382 209 386 209 392 " +
  "C209 404 209 410 209 418 C208 430 206 444 206 458 C206 470 206 480 206 490";
const C_CABEZA_I = "M214 79 C205 82 197 90 197 103 C197 114 199 122 203 129";

/**
 * El sombreado, que es lo que convierte el contorno en un cuerpo. Va todo dentro del recorte de
 * la silueta, así que se puede pintar a brochazos anchos sin miedo a salirse.
 */
function modelado(pref) {
  return [
    // Velo hacia los pies: la luz viene de arriba, así que las piernas se apagan. Un rectángulo
    // con degradado; el recorte lo pega al cuerpo.
    `<rect x="110" y="60" width="230" height="460" fill="url(#${pref}-suelo)"/>`,

    // ── Cabeza ──
    // Cráneo iluminado por la izquierda, sien derecha en sombra, cuencas hundidas y sombra bajo
    // el mentón. Nada de rasgos con línea: a este tamaño una raya oscura es una máscara.
    filo(C_CABEZA_I, pref, 4.5, .45),
    som("M230 84 C238 94 241 108 238 122 C236 130 231 137 226 141 L236 141 " +
        "C242 133 244 114 243 102 C242 90 237 83 231 82 Z", pref, .5),
    som("M204 104 C208 102 213 103 215 106 C213 110 207 111 204 109 Z", pref, .34, "b1"),
    som("M226 106 C229 103 234 103 237 105 C235 109 229 110 226 108 Z", pref, .28, "b1"),
    filo("M218 107 C220 113 221 118 219 122", pref, 2.2, .3),
    surco("M221 123 C223 124 224 125 222 126", pref, 2, .3),
    surco("M215 131 C218 132 223 132 226 131", pref, 2.2, .28),
    som("M207 132 C212 139 229 139 233 132 C233 143 227 150 220 150 C213 150 207 143 207 132 Z",
        pref, .5, "b1"),
    // Pelo corto, pegado al cráneo, con la coronilla algo iluminada.
    `<path d="M197 102 C196 86 206 76 220 76 C234 76 244 86 243 103 C239 94 231 90 223 90 ` +
      `C213 90 202 94 197 102 Z" fill="url(#${pref}-pelo)"/>`,
    filo("M204 86 C209 82 215 80 220 80", pref, 2.4, .26, "b1", LUZ_MEDIA),

    // ── Cuello y hombros ──
    // El cuello va SIEMPRE más apagado que la cara: le cae encima la sombra de la mandíbula.
    som("M204 142 L236 142 C238 152 236 160 232 166 L208 166 C204 160 202 152 204 142 Z",
        pref, .42),
    filo("M210 128 C208 138 205 146 200 152", pref, 3, .3),
    surco("M220 160 C212 161 204 163 196 168", pref, 2.6, .32),
    surco("M220 160 C228 161 236 163 244 168", pref, 2.6, .24),
    filo("M219 157 C211 158 204 160 197 164", pref, 2, .28),

    // ── Tronco ──
    filo(C_TRONCO_I, pref, 5, .5),
    surco(esp(C_TRONCO_I), pref, 9, .45, "b2"),
    // Pectorales: luz en el de la izquierda y pliegue corto debajo de los dos. El pliegue muere
    // hacia el sobaco, que es lo que lo separa de una sonrisa dibujada en el pecho.
    brillo("M186 176 C197 174 207 182 208 194 C208 203 200 209 191 207 C183 205 179 194 181 " +
           "184 C182 179 183 177 186 176 Z", pref, .3),
    surco("M191 202 C198 209 207 211 214 207", pref, 3.2, .38),
    surco("M249 202 C242 209 233 211 226 207", pref, 3.2, .28),
    filo("M186 182 C191 176 199 174 205 177", pref, 2.4, .32),
    // Costillar en sombra por la derecha, esternón, ombligo y una sombra blanda en cada ingle.
    som("M248 200 C256 214 258 232 256 250 L246 246 C248 230 246 214 242 204 Z", pref, .3),
    surco("M220 172 L220 198", pref, 2.2, .22),
    surco("M219 256 C222 256 222 260 219 260 C217 260 217 256 219 256 Z", pref, 2.4, .45),
    som("M184 276 C194 290 204 300 214 306 L214 314 C198 308 186 294 180 280 Z", pref, .28),
    som("M256 276 C246 290 236 300 226 306 L226 314 C242 308 254 294 260 280 Z", pref, .24),
    // Pubis y sombra del tronco sobre los muslos: sin esto la pelvis es una mancha clara. Va
    // flojo a propósito; subido de tono parece un calzón pintado.
    som("M207 300 L233 300 C233 310 227 316 220 316 C213 316 207 310 207 300 Z", pref, .38),

    // ── Brazos ──
    // Deltoides con su luz, sombra en el sobaco y en el canto de dentro (es lo que despega el
    // brazo del tronco), y el codo marcado.
    filo(C_BRAZO_I, pref, 5, .5),
    surco(C_BRAZO_D, pref, 8, .45, "b2"),
    brillo("M168 158 C178 156 187 165 185 177 C182 188 171 191 165 185 C159 179 161 161 168 " +
           "158 Z", pref, .28),
    surco("M188 172 C184 184 181 194 180 204", pref, 5, .3, "b2"),
    surco("M141 246 C147 251 154 253 160 251", pref, 3, .3),
    // El brazo del otro lado: la luz le llega de refilón, así que su canto de dentro solo lleva
    // un filo tenue y el de fuera, sombra ancha.
    filo(esp(C_BRAZO_D), pref, 4, .2),
    surco(esp(C_BRAZO_I), pref, 8, .45, "b2"),
    // Manos: dedos y pulgar. Tres surcos cortos; más, y a 440 px es una mancha rayada.
    surco("M129 322 C135 320 141 321 147 323 M129 330 C135 328 141 329 147 331 " +
          "M132 338 C137 336 142 337 146 339", pref, 1.8, .32),
    filo("M128 319 C126 325 126 332 129 338", pref, 2.4, .35),
    surco(esp("M129 322 C135 320 141 321 147 323 M129 330 C135 328 141 329 147 331 " +
              "M132 338 C137 336 142 337 146 339"), pref, 1.8, .28),
    filo(esp("M147 319 C149 325 149 332 146 338"), pref, 2.2, .18),

    // ── Piernas ──
    filo(C_PIERNA_I, pref, 5, .45),
    surco(C_PIERNA_D, pref, 8, .4, "b2"),
    filo(esp(C_PIERNA_D), pref, 4, .18),
    surco(esp(C_PIERNA_I), pref, 8, .45, "b2"),
    // Muslo con luz, rótula y el hueco de detrás de la rodilla.
    brillo("M180 316 C190 314 198 326 197 348 C196 366 188 374 182 368 C176 360 174 322 180 " +
           "316 Z", pref, .2),
    brillo("M182 378 C190 375 198 381 198 390 C198 398 190 402 184 399 C178 396 177 382 182 " +
           "378 Z", pref, .22),
    brillo(esp("M182 378 C190 375 198 381 198 390 C198 398 190 402 184 399 C178 396 177 382 " +
               "182 378 Z"), pref, .14),
    surco("M179 394 C187 400 196 402 205 399", pref, 3.2, .34),
    surco(esp("M179 394 C187 400 196 402 205 399"), pref, 3.2, .3),
    // Gemelo iluminado, espinilla y tobillo.
    brillo("M181 412 C187 410 190 420 189 432 C188 444 183 448 180 444 C176 438 177 416 181 " +
           "412 Z", pref, .2),
    filo("M186 452 C186 464 186 472 186 480", pref, 2.6, .3),
    surco("M186 482 L206 482", pref, 3, .34),
    surco(esp("M186 482 L206 482"), pref, 3, .34),
    // Pies: empeine iluminado, dedos y la línea de la planta.
    filo("M186 486 C182 491 179 496 178 501", pref, 2.4, .4),
    surco("M182 502 C188 499 198 499 205 502", pref, 2.2, .3),
    surco("M185 505 L206 505", pref, 2.2, .4),
    filo(esp("M186 486 C182 491 179 496 178 501"), pref, 2, .18),
    surco(esp("M182 502 C188 499 198 499 205 502"), pref, 2.2, .26),
    surco(esp("M185 505 L206 505"), pref, 2.2, .4),
  ].join("");
}

/** El dibujo de la figura. Ver la cabecera del fichero para el contrato y las opciones. */
export function figura(opciones = {}) {
  const pref = prefijo(opciones.sufijo);
  const conHalo = opciones.halo !== false;
  const op = opciones.opacidad == null ? 1 : Number(opciones.opacidad);

  const defs = opciones.defs === false ? "" :
    `<defs>` +
      // Un cilindro por pieza, todos en coordenadas del lienzo (ver TONOS).
      Object.entries(TONOS)
        .map(([k, [x1, x2, rampa]]) => cilindro(`${pref}-${k}`, x1, x2, rampa)).join("") +
      // Velo hacia los pies: la luz cae de arriba.
      gradLienzo(`${pref}-suelo`, [[SOMBRA, 0, 0], [SOMBRA, .55, .08], [SOMBRA, 1, .34]],
                 [0, 150, 0, 508]) +
      grad(`${pref}-pelo`, [["#3C4029", 0], ["#252A18", .55], ["#14180C", 1]], [0, 0, .8, 1]) +
      `<radialGradient id="${pref}-halo" cx=".46" cy=".42" r=".6">` +
        `<stop offset="0" stop-color="#8E9377" stop-opacity=".16"/>` +
        `<stop offset=".55" stop-color="#3A422C" stop-opacity=".09"/>` +
        `<stop offset="1" stop-color="#12140E" stop-opacity="0"/>` +
      `</radialGradient>` +
      // El recorte del cuerpo: la unión de todas las piezas.
      `<clipPath id="${pref}-piel">` +
        PIEZAS.map(({ d }) => `<path d="${d}"/>`).join("") +
      `</clipPath>` +
      desenfoque(`${pref}-b1`, 1.5) +
      desenfoque(`${pref}-b2`, 4.5) +
      desenfoque(`${pref}-b3`, 9) +
    `</defs>`;

  // El halo hace de aire alrededor del cuerpo: sin él la figura flota en el vacío. Y la sombra
  // del suelo le da un sitio donde estar de pie.
  const halo = conHalo
    ? `<ellipse cx="${EJE}" cy="290" rx="128" ry="214" fill="url(#${pref}-halo)"/>` +
      `<ellipse cx="${EJE}" cy="512" rx="74" ry="8" fill="${SOMBRA}" opacity=".7" ` +
        `filter="url(#${pref}-b3)"/>`
    : "";

  return `${defs}<g class="figura-cuerpo"${op !== 1 ? ` opacity="${op}"` : ""}>` +
    halo +
    // 1. Las piezas del cuerpo, cada una con su cilindro, de atrás hacia delante.
    `<g class="figura-piezas">` +
      PIEZAS.map(({ d, g }) => `<path d="${d}" fill="url(#${pref}-${g})"/>`).join("") +
    `</g>` +
    // 2. El modelado, recortado por la silueta.
    `<g clip-path="url(#${pref}-piel)">${modelado(pref)}</g>` +
    `</g>`;
}

// ── Los marcos ────────────────────────────────────────────────────────────────────────────────

/** Lo que come el marco por cada lado. Escala con el hueco: 10 en los grandes, 7 en los chicos. */
export const BORDE_HUECO = (w, h) => n(Math.min(10, Math.max(6, Math.min(w, h) * 0.14)));

/** El rectángulo libre de dentro del marco, donde va el icono. Ver la cabecera. */
export function interiorHueco(hueco, margen = 2) {
  const { x, y, w, h } = hueco;
  const b = BORDE_HUECO(w, h) + margen;
  return { x: n(x + b), y: n(y + b), w: n(w - 2 * b), h: n(h - 2 * b) };
}

/**
 * Marco cuadrado de un hueco: plancha de hierro remachada con el interior hundido. Ver la
 * cabecera del fichero para las opciones.
 *
 * El hundido se dibuja con el truco de siempre: con la luz entrando por arriba a la izquierda,
 * dentro de un agujero la pared que se ILUMINA es la de abajo a la derecha y la que queda a
 * oscuras es la de arriba a la izquierda — al revés que en una pieza que sobresale. Eso es todo
 * lo que hace falta para que el ojo lea un hueco y no una pegatina.
 */
export function marcoHueco(x, y, w, h, opciones = {}) {
  const pref = prefijo(opciones.sufijo);
  const b = BORDE_HUECO(w, h);
  const r = Math.min(4, b * 0.4);              // esquinas apenas redondeadas: hierro forjado
  const ix = x + b, iy = y + b, iw = w - 2 * b, ih = h - 2 * b;
  const acento = opciones.acento ?? null;
  // Los remaches van en la mitad del borde, y su radio baja con el tamaño del hueco: en un marco
  // de 52 unidades, cuatro remaches gordos se comen el borde.
  const rr = Math.max(1.9, Math.min(3, b * 0.28));
  const cs = [[x + b / 2, y + b / 2], [x + w - b / 2, y + b / 2],
              [x + b / 2, y + h - b / 2], [x + w - b / 2, y + h - b / 2]];

  const defs = opciones.defs === false ? "" :
    `<defs>` +
      grad(`${pref}-hierro`, HIERRO, [0, 0, .85, 1]) +
      grad(`${pref}-hondo`, HONDO, [.15, 0, .85, 1]) +
    `</defs>`;

  return defs +
    `<g class="marco-hueco">` +
      // Plancha exterior.
      `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(r)}" ` +
        `fill="url(#${pref}-hierro)" stroke="${OSCURO}" stroke-width="1.6"/>` +
      // Canto iluminado de la plancha (arriba e izquierda) y canto en sombra (abajo y derecha).
      `<path d="M${n(x + 1.4)} ${n(y + h - 2)} L${n(x + 1.4)} ${n(y + 1.4)} ` +
        `L${n(x + w - 2)} ${n(y + 1.4)}" fill="none" stroke="${LUZ_MEDIA}" stroke-width="1.3" ` +
        `opacity=".34"/>` +
      `<path d="M${n(x + 2)} ${n(y + h - 1.4)} L${n(x + w - 1.4)} ${n(y + h - 1.4)} ` +
        `L${n(x + w - 1.4)} ${n(y + 2)}" fill="none" stroke="${OSCURO}" stroke-width="1.4" ` +
        `opacity=".8"/>` +
      // El hundido.
      `<rect x="${n(ix)}" y="${n(iy)}" width="${n(iw)}" height="${n(ih)}" rx="1.6" ` +
        `fill="url(#${pref}-hondo)"/>` +
      // Pared de dentro: a oscuras arriba e izquierda, iluminada abajo y derecha.
      `<path d="M${n(ix)} ${n(iy + ih)} L${n(ix)} ${n(iy)} L${n(ix + iw)} ${n(iy)}" ` +
        `fill="none" stroke="${OSCURO}" stroke-width="2.6" opacity=".9"/>` +
      `<path d="M${n(ix + 1)} ${n(iy + ih - 1)} L${n(ix + iw - 1)} ${n(iy + ih - 1)} ` +
        `L${n(ix + iw - 1)} ${n(iy + 1)}" fill="none" stroke="${LUZ_MEDIA}" stroke-width="1.2" ` +
        `opacity=".2"/>` +
      (acento
        ? `<rect x="${n(ix - .8)}" y="${n(iy - .8)}" width="${n(iw + 1.6)}" ` +
          `height="${n(ih + 1.6)}" rx="1.8" fill="none" stroke="${acento}" stroke-width="1.6" ` +
          `opacity=".9"/>`
        : "") +
      (opciones.remaches === false ? "" : cs.map(([cx, cy]) => remache(cx, cy, rr)).join("")) +
    `</g>`;
}
