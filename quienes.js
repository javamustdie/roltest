/**
 * quienes.js — «Quién es quién»: la gente que la mesa ya ha conocido.
 *
 * Cuatro jugadores novatos no se acuerdan de quién era Domar cuando llevan dos horas de sesión y
 * han oído siete nombres. Esto pone cara, nombre, una línea de quién es y CÓMO OS TRATA ahora, que
 * es el dato que de verdad se pierde: la mesa recuerda al herrero, pero no que la última vez se
 * fue dando un portazo.
 *
 * La regla que manda sobre todo lo demás: **aquí solo entra quien la mesa ya ha conocido**. Un NPC
 * del catálogo que aún no ha aparecido no se pinta, ni atenuado ni con interrogantes ni de ninguna
 * forma — esta galería se ve en una pantalla que miran los jugadores, y una lista con los que
 * faltan destriparía media trama. El filtro no es una precaución, es lo primero que hace la
 * función.
 *
 * El módulo es PURO: no lee el estado de la partida, no toca el DOM, no importa nada y no muta lo
 * que le pasan. Recibe el catálogo y lo que hay apuntado, y devuelve una cadena de HTML. Y es
 * DETERMINISTA —ni `Math.random()` ni `Date.now()`—, así que el mismo NPC sale idéntico en cada
 * repintado: `pintarTodo()` corre dentro del bucle de herramientas, o sea varias veces por turno
 * del DJ, y una cara que cambia de color a mitad de escena es una cara distinta.
 *
 * Todo lo que viene del estado (nombres, notas, disposiciones, rutas de retrato) lo escribe el DJ
 * sobre la marcha, así que se escapa AQUÍ dentro: quien llama pasa texto pelado y nunca marcado.
 *
 * ── Contrato ──────────────────────────────────────────────────────────────────────────────────
 *
 *   DISPOSICIONES → string[]
 *     Las ocho que entiende la galería, mismo enum que la herramienta `apuntar_npc`. Es lo que
 *     puede salir en `data-disposicion`, y por tanto lo que la hoja de estilo tiene que colorear.
 *
 *   medallon(nombre, id) → string "<svg …>…</svg>", viewBox 0 0 100 100
 *     El marcador de posición mientras no haya retratos de NPC: silueta encapuchada e iniciales
 *     grabadas sobre un disco tintado. El tinte sale del `id`, así que cada uno tiene siempre el
 *     suyo. Lleva `width`/`height` al 100 % para llenar `.qn-cara` sin depender de ninguna regla
 *     CSS, y `aria-hidden`: el nombre va en texto justo al lado.
 *
 *   htmlGaleria(npcs, conocidos) → string HTML, o "" si no hay ninguno conocido
 *     npcs      — catálogo de la aventura: [{ id, nombre, que, donde, retrato? }]
 *     conocidos — E.npcs: { [id]: { conocido, disposicion, nota, muerto, nombre? } }
 *     El vacío lo escribe quien llama (#quienes-vacio), que es quien sabe cómo redactarlo.
 *
 * ── Dos cosas que quien integre tiene que saber ───────────────────────────────────────────────
 *
 *  1. El medallón se emite SIEMPRE, y la <img> del retrato solo si el NPC lleva `retrato`. La
 *     imagen va encima por CSS, así que si el `.webp` no existe se ve un icono roto sobre la
 *     silueta: quien llama le engancha un `onerror` que la retira DESPUÉS de insertar el HTML.
 *     Aquí no se puede poner en línea porque la CSP de la app prohíbe manejadores en el marcado.
 *  2. `apuntar_npc` también apunta a gente que no está en el catálogo —el DJ improvisa y esa
 *     gente la mesa también la ha conocido—, así que la galería pinta además los `conocidos` que
 *     no casan con ningún id del catálogo, con el nombre que el DJ escribiera.
 */

/** Las disposiciones que entiende la galería. Mismo enum que la herramienta apuntar_npc. */
export const DISPOSICIONES = [
  "aliado",
  "neutral",
  "tenso",
  "evasivo",
  "hostil",
  "asustado",
  "impaciente",
  "desconocido",
];

// ── Paleta ────────────────────────────────────────────────────────────────────────────────────
//
// Literales y no `var(--…)`, por lo mismo que en relojes.js: el SVG se inyecta con `innerHTML` en
// la capa de la galería y en la pestaña de la tele, y tiene que salir igual en las dos sin fiarlo
// a que el contenedor herede la paleta. Son los valores de `:root` en index.html y de ornado.css.

/**
 * Los cuatro tintes del disco. Son los cuatro fondos apagados que ya usa la app —el liquen de los
 * bordes, el latón sucio de la chapa, el rojo de fondo de la herrumbre y el violeta del aviso de
 * atasco—, así que la galería no estrena ni un color.
 *
 * El tinte sale del `id` y NO de la disposición: es la cara del personaje, no su humor. Si
 * cambiara al enfadarse, la mesa perdería lo único que le sirve para reconocerlo de un vistazo
 * dos sesiones después, que es justo lo que esta pantalla viene a arreglar.
 */
const TINTES = ["#3A422C", "#4A3714", "#2A1512", "#241A2C"];

const TINTA = "#070804"; // el negro de los contornos; nunca #000, que corta demasiado
const HUECO = "#0B0D07"; // el fondo de lo hundido: aquí, el vacío bajo la capucha
const TIZA_BAJA = "#8E9377"; // la luz sucia del canto y las iniciales
const ORO_BAJO = "#5C4519"; // el aro del medallón
const LATON = "#8A6A28"; // el hilo de reflejo del aro

/** La pila serif de `--serif` en index.html, en comillas simples: va dentro de un atributo. */
const SERIF = "Georgia,'Iowan Old Style',Palatino,'Book Antiqua',serif";

// ── Utilidades ────────────────────────────────────────────────────────────────────────────────

const esc = (t) =>
  String(t ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Hash estable (FNV-1a): del mismo id sale siempre el mismo tinte. */
function semillaDe(texto) {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Minúsculas, sin acentos y sin sobras, para comparar lo que escribe el DJ con lo que hay. */
const norm = (t) =>
  String(t ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036F]/g, "")
    .trim()
    .toLowerCase();

/**
 * Palabras que no cuentan para las iniciales. «Vesna de la Hilandera» tiene que dar VH, no VD.
 */
const PARTICULAS = new Set(
  ["de", "del", "la", "las", "los", "el", "y", "da", "di", "do", "van", "von"],
);

/**
 * Las iniciales que van grabadas en el medallón. Como mucho dos: con tres, a 64 píxeles, ya no se
 * leen. Si el nombre no da ni una letra se devuelve cadena vacía y el medallón se queda con la
 * capucha vacía, que dice la verdad —no sabemos ni cómo se llama— y encima queda mejor que un
 * interrogante.
 */
function iniciales(nombre) {
  const letras = String(nombre ?? "")
    .trim()
    .split(/\s+/)
    .filter((p) => p && !PARTICULAS.has(norm(p)))
    .map((p) => [...p][0])
    .filter((c) => /[\p{L}\p{N}]/u.test(c ?? ""));
  return letras.slice(0, 2).join("").toLocaleUpperCase("es-ES");
}

/**
 * La disposición canónica, la que va en `data-disposicion` y colorea el canto de la tarjeta.
 *
 * Se pasa por la forma masculina porque el estado de la campaña está escrito en castellano de
 * verdad: `campana/estado.json` dice «desconocida» de Sela y «viva», no «desconocido». Perder el
 * color de media galería por una `a` final sería ridículo.
 *
 * Lo que no casa con ninguna de las ocho cae en «desconocido», que es el gris: la palabra que
 * escribiera el DJ sigue viéndose entera en la etiqueta, así que no se pierde información, solo
 * se deja de acertar el color.
 */
function disposicionCanonica(valor) {
  const v = norm(valor);
  if (DISPOSICIONES.includes(v)) return v;
  const masculino = v.replace(/a$/, "o");
  if (DISPOSICIONES.includes(masculino)) return masculino;
  return "desconocido";
}

/**
 * La ruta del retrato, si el NPC tiene uno.
 *
 * El campo `retrato` del catálogo es un id de `app/arte/` («npc-domar» → «arte/npc-domar.webp»),
 * que es donde `scripts/preparar-app.mjs` deja las imágenes y lo que el service worker cachea por
 * su regla de `/(audio|arte|retratos)/`. Se admite también una ruta relativa ya escrita, por si
 * algún día un retrato vive en otro sitio.
 *
 * Todo lo demás se descarta y el NPC se queda con su medallón. Esto acaba en un atributo `src`,
 * así que no vale con escapar: lo que no tenga forma de ruta de este repo no se emite. Fuera
 * quedan las URL absolutas —la CSP las bloquearía de todas formas, pero avisando por consola en
 * mitad de la partida— y cualquier cosa con `..`.
 */
function rutaRetrato(valor) {
  const v = String(valor ?? "").trim();
  if (!v || v.includes("..")) return "";
  if (/^[A-Za-z0-9_-]+$/.test(v)) return `arte/${v}.webp`;
  if (/^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*\.(webp|png|jpe?g|svg)$/.test(v)) return v;
  return "";
}

// ── El medallón ───────────────────────────────────────────────────────────────────────────────
//
// No hay retratos de NPC generados y en esta tanda no se van a generar, así que el hueco se llena
// con un dibujo que aguante la comparación: un disco de metal tintado, con la vuelta de aro, una
// figura encapuchada de espaldas a la luz y las iniciales grabadas donde estaría la cara.
//
// Encapuchada por dos razones, y ninguna es decorativa. La primera es que un retrato genérico de
// cara —cualquier cara— sería MENTIRA: la mesa vería a un señor que no es Domar y se quedaría con
// esa cara. Un hueco bajo la capucha no afirma nada. La segunda es que así el medallón envejece
// bien: el día que exista `arte/npc-domar.webp`, la foto entra encima y lo que desaparece es un
// marcador de posición, no un personaje que la mesa ya se había imaginado.
//
// Luz siempre desde arriba a la izquierda, como en `figura.js` y en todo el resto de la app.

/** El sitio de las iniciales dentro de la capucha, que va de x=28 a x=72 y está centrada en 51. */
const HUECO_ANCHO = 42;
const HUECO_CENTRO = 51;

/**
 * Ancho de las mayúsculas en fracción del cuerpo de letra. Son las métricas de Times, que es la
 * serif que hay debajo de la pila cuando no hay Georgia, y de todas formas esto no pretende medir
 * fino: solo saber que una eme ocupa el doble que una i.
 */
const ANCHOS = {
  A: 0.722, B: 0.667, C: 0.667, D: 0.722, E: 0.611, F: 0.556, G: 0.722, H: 0.722, I: 0.333,
  J: 0.389, K: 0.722, L: 0.611, M: 0.889, N: 0.722, O: 0.722, P: 0.556, Q: 0.722, R: 0.667,
  S: 0.556, T: 0.611, U: 0.722, V: 0.722, W: 0.944, X: 0.722, Y: 0.722, Z: 0.611,
};

/**
 * El cuerpo de letra al que las iniciales caben dentro de la capucha, sin recortarlas ni
 * deformarlas.
 *
 * Hace falta calcularlo porque un tamaño fijo se pasa de listo con las letras anchas: «MR», de
 * Mirena Ramos, ocupa la mitad más que «PO», de Padre Olen, y con el cuerpo bueno para el segundo
 * el primero se sale de la capucha y se come el canto del medallón. El diez por ciento de margen
 * es porque Georgia es algo más ancha que Times y porque una letra pegada al filo del hueco se
 * lee peor que una letra un punto más pequeña.
 */
function cuerpoDeLetra(ini) {
  const em = [...ini].reduce((a, c) => a + (ANCHOS[norm(c).toUpperCase()] ?? 0.72), 0) || 1;
  return Math.round((Math.min(ini.length > 1 ? 30 : 44, HUECO_ANCHO / (em * 1.1)) * 10)) / 10;
}

/** El disco, la capucha y las iniciales. Ver la cabecera del fichero para el contrato. */
export function medallon(nombre, id) {
  const semilla = semillaDe(String(id ?? nombre ?? "") || "npc");
  const tinte = TINTES[semilla % TINTES.length];
  // Sufijo propio por medallón: en la misma página hay siete de estos y, con el id de <defs>
  // repetido, `url(#…)` resolvería siempre al primero del documento.
  const s = `qn${semilla.toString(36)}`;
  const ini = iniciales(nombre);
  const tam = cuerpoDeLetra(ini);
  // Las mayúsculas ocupan unos siete décimos del cuerpo hacia arriba desde la línea de base, así
  // que la base va medio alto por debajo del centro del hueco para que queden centradas de verdad.
  const base = Math.round((HUECO_CENTRO + tam * 0.35) * 10) / 10;
  const letra = `font-family="${SERIF}" font-size="${tam}" font-weight="600" text-anchor="middle"`;

  return (
    `<svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true" focusable="false">` +
    `<defs>` +
    // La luz: un halo desvaído arriba a la izquierda, no un brillo. Es metal viejo.
    `<radialGradient id="${s}l" cx=".34" cy=".27" r=".78">` +
    `<stop offset="0" stop-color="#DCD8C4" stop-opacity=".16"/>` +
    `<stop offset=".6" stop-color="#DCD8C4" stop-opacity="0"/>` +
    `</radialGradient>` +
    // Y la viñeta, que es lo que hunde los bordes y hace que el disco parezca redondo.
    `<radialGradient id="${s}v" cx=".5" cy=".5" r=".5">` +
    `<stop offset=".52" stop-color="${TINTA}" stop-opacity="0"/>` +
    `<stop offset="1" stop-color="${TINTA}" stop-opacity=".58"/>` +
    `</radialGradient>` +
    // La figura se recorta con el disco: los hombros salen por fuera del medallón a propósito,
    // como en un camafeo, y es este recorte el que los corta limpios contra el aro.
    `<clipPath id="${s}c"><circle cx="50" cy="50" r="47"/></clipPath>` +
    `</defs>` +
    `<circle cx="50" cy="50" r="47" fill="${tinte}"/>` +
    `<g clip-path="url(#${s}c)">` +
    // Hombros y capa. Van más oscuros que el fondo pero no negros: negro del todo se comería la
    // silueta contra la viñeta y el medallón parecería vacío.
    `<path d="M0 100 C2 84 14 76 32 74 L68 74 C86 76 98 84 100 100 Z" ` +
    `fill="${TINTA}" opacity=".62"/>` +
    // La capucha, en punta blanda. El canto de la izquierda lleva luz; el de la derecha, sombra.
    `<path d="M50 14 C66 14 78 31 79 51 C80 65 73 78 64 83 L36 83 C27 78 20 65 21 51 ` +
    `C22 31 34 14 50 14 Z" fill="${TINTA}" opacity=".78"/>` +
    `<path d="M21 56 C21 32 34 14 50 14" fill="none" stroke="${TIZA_BAJA}" stroke-opacity=".26" ` +
    `stroke-width="1.8" stroke-linecap="round"/>` +
    // El vacío de dentro de la capucha: aquí no hay cara, y no la hay a propósito.
    `<path d="M50 25 C63 25 72 37 72 52 C72 66 62 77 50 77 C38 77 28 66 28 52 ` +
    `C28 37 37 25 50 25 Z" fill="${HUECO}" opacity=".92"/>` +
    `</g>` +
    // Las iniciales, grabadas: la copia oscura debajo y la clara un punto por encima. Es el filo
    // que deja el cincel cuando la luz viene de arriba, y sin ella las letras se ven pegadas
    // encima del dibujo en vez de metidas en él.
    (ini
      ? `<text x="50" y="${base}" ${letra} fill="${TINTA}" fill-opacity=".85">${esc(ini)}</text>` +
        `<text x="50" y="${base - 1}" ${letra} fill="${TIZA_BAJA}" ` +
        `fill-opacity=".82">${esc(ini)}</text>`
      : "") +
    // El aro, de fuera adentro: contorno, latón sucio y un hilo de reflejo.
    `<circle cx="50" cy="50" r="48.4" fill="none" stroke="${TINTA}" stroke-width="3"/>` +
    `<circle cx="50" cy="50" r="46.8" fill="none" stroke="${ORO_BAJO}" stroke-width="2.2"/>` +
    `<circle cx="50" cy="50" r="45.2" fill="none" stroke="${LATON}" stroke-width=".8" ` +
    `opacity=".5"/>` +
    `<circle cx="50" cy="50" r="47" fill="url(#${s}l)"/>` +
    `<circle cx="50" cy="50" r="47" fill="url(#${s}v)"/>` +
    `</svg>`
  );
}

// ── La galería ────────────────────────────────────────────────────────────────────────────────

/**
 * El nombre que se enseña. Manda el del catálogo, que está bien escrito y con sus tildes; si el
 * NPC lo improvisó el DJ, el que él escribiera; y si no hay ninguno, el id despiezado, que al
 * menos es legible («el-ahogado» → «El ahogado»).
 */
function nombreVisible(id, ficha, delCatalogo) {
  const n = String(delCatalogo?.nombre ?? ficha?.nombre ?? "").trim();
  if (n) return n;
  const suelto = String(id ?? "").replace(/[-_]+/g, " ").trim();
  return suelto ? suelto[0].toLocaleUpperCase("es-ES") + suelto.slice(1) : "Alguien";
}

/** Una tarjeta. `ficha` es lo apuntado en `E.npcs`; `delCatalogo` puede no existir. */
function tarjeta(id, ficha, delCatalogo) {
  const nombre = nombreVisible(id, ficha, delCatalogo);
  const disp = disposicionCanonica(ficha?.disposicion);
  // La etiqueta enseña lo que hay apuntado y no lo canónico: si el DJ escribió «serena», la mesa
  // lee «serena» aunque el color caiga en el gris de «desconocido». El tope de caracteres es para
  // que una frase entera colada en el campo no rompa la fila.
  const rotulo = String(ficha?.disposicion ?? "").trim().slice(0, 24) || disp;
  const que = String(delCatalogo?.que ?? "").trim();
  const nota = String(ficha?.nota ?? "").trim();
  const foto = rutaRetrato(delCatalogo?.retrato ?? ficha?.retrato);

  return (
    `<article class="qn" data-disposicion="${disp}" data-muerto="${ficha?.muerto ? "si" : "no"}">` +
    `<div class="qn-cara">` +
    medallon(nombre, id) +
    (foto ? `<img class="qn-foto" src="${esc(foto)}" alt="">` : "") +
    `</div>` +
    `<div class="qn-datos">` +
    `<b class="qn-nombre">${esc(nombre)}</b>` +
    // Los dos de abajo se omiten si están vacíos: un hueco en blanco bajo el nombre parece que
    // la app no ha terminado de cargar, y de un NPC improvisado no hay línea de catálogo.
    (que ? `<span class="qn-que">${esc(que)}</span>` : "") +
    (nota ? `<span class="qn-nota">${esc(nota)}</span>` : "") +
    `</div>` +
    `<span class="qn-disp">${esc(rotulo)}</span>` +
    `</article>`
  );
}

/**
 * La galería entera. Ver la cabecera del fichero: SOLO entra quien la mesa ya ha conocido.
 *
 * El orden es el del catálogo, y los improvisados detrás por orden de aparición. Se conserva
 * aunque alguno muera o cambie de humor: la galería se repinta en cada turno del DJ, y una lista
 * que se reordena sola delante de la mesa es una lista que no sirve para buscar un nombre.
 */
export function htmlGaleria(npcs, conocidos) {
  const catalogo = Array.isArray(npcs) ? npcs.filter((n) => n && n.id) : [];
  const apuntados = conocidos && typeof conocidos === "object" ? conocidos : {};
  const tarjetas = [];
  const puestos = new Set();

  for (const n of catalogo) {
    const ficha = apuntados[n.id];
    if (!ficha?.conocido) continue;
    puestos.add(n.id);
    tarjetas.push(tarjeta(n.id, ficha, n));
  }

  // Los que el DJ se sacó de la manga con `apuntar_npc` y no están en el catálogo. También son
  // gente que la mesa ha conocido, así que también tienen su sitio aquí.
  for (const [id, ficha] of Object.entries(apuntados)) {
    if (puestos.has(id) || !ficha?.conocido) continue;
    tarjetas.push(tarjeta(id, ficha, null));
  }

  return tarjetas.join("");
}
