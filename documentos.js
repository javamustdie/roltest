/**
 * documentos.js — los papeles de atrezo que el DJ saca en pantalla.
 *
 * Cuando lo que importa es la LETRA —una fecha, un nombre, la frase que alguien escribió al
 * margen, una lista con ocho renglones tachados—, el DJ no lo lee en voz alta: lo enseña, y la
 * mesa lo lee, lo relee y lo discute entre ellos. Este módulo convierte el texto pelado que
 * escribe el DJ en ese papel.
 *
 * Tiene que parecer un objeto del mundo y no un cuadro de texto, así que además de los párrafos
 * se dibujan las marcas del uso: manchas de humedad, los dos pliegues de una carta que vino
 * doblada, la raya del margen de un libro de asientos, las grietas de una piedra. Todo eso es
 * SVG en línea generado aquí —ni una imagen ni una tipografía de fuera: la app se juega sin
 * conexión— y lleva su estilo en el propio atributo, porque el pergamino en sí (fondo, marco de
 * oro, grano, tipografía, variantes por `data-tipo`) lo pone la hoja de estilo de
 * `app/index.html` y este módulo no manda ahí. Si algún día se le quitan las marcas, lo que
 * queda sigue siendo un documento entero.
 *
 * Las marcas son DETERMINISTAS, sacadas de un hash del propio documento. No es un capricho:
 * `pintarDocumento()` vuelve a inyectar este HTML en cada turno del DJ, y unas manchas al azar
 * se pondrían a bailar por el papel delante de la mesa cada vez que él abre la boca.
 *
 * Contrato:
 *   TIPOS                                  — los cuatro papeles que sabe pintar.
 *   htmlDocumento({ titulo, texto, tipo }) — devuelve el HTML de un <article class="doc">.
 *
 * El texto viene de lo que el DJ se inventa, así que se escapa AQUÍ dentro: quien llama pasa
 * texto pelado y nunca marcado.
 */

/** Los cuatro papeles que sabe pintar. Mismo enum que la herramienta mostrar_documento. */
export const TIPOS = ["carta", "inscripcion", "pagina", "registro"];

/**
 * Los que se leen renglón a renglón. Un asiento de libro de cuentas y una piedra grabada no
 * tienen párrafos, tienen líneas, y cada línea es un <p> —que es justo lo que la hoja de estilo
 * subraya con puntitos en el registro—. Si aquí se juntaran las líneas en un párrafo, la lista
 * de los ocho diezmos saldría como un ladrillo y con un solo renglón subrayado.
 */
const RENGLONES = new Set(["registro", "inscripcion"]);

/** Una línea que empieza por raya es la firma: «— Padre Olen». */
const FIRMA = /^[—–]\s*\S/;

/** Alto del lienzo de las marcas. Es un papel de pie, no un cuadrado. */
const ALTO = 140;

/**
 * Todo lo que se traza va con esto puesto.
 *
 * El lienzo se estira a la caja real, que no se sabe cuánto mide, y sin esto el grosor se estira
 * con él: la raya del margen salía de cuatro píxeles —una franja, no una raya— y los pliegues de
 * la carta engordaban o adelgazaban según lo larga que fuera. Así el trazo se mide en píxeles de
 * pantalla y sale igual en un papel de tres renglones que en uno de treinta.
 */
const TRAZO = 'vector-effect="non-scaling-stroke"';

const TAU = Math.PI * 2;
/** Redondeo corto: el markup no necesita quince decimales. */
const r1 = (v) => Math.round(v * 10) / 10;

const esc = (t) =>
  String(t ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Hash estable (FNV-1a): del documento sale siempre la misma mancha en el mismo sitio. */
function semillaDe(texto) {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Generador pseudoaleatorio con semilla (mulberry32). */
function generador(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Marcas de dentro de la línea. A nadie se le explica al DJ que existen, y es a propósito: un
 * modelo escribe markdown por costumbre, y sin esto la mesa se encuentra leyendo «~~Sela
 * Ramos~~» con las virgulillas puestas. Se traduce a las tres etiquetas que el navegador ya
 * pinta sin una línea de CSS, así que un tachón se ve tachado aunque nadie estile nada.
 */
const marcas = (t) =>
  t
    .replace(/~~(\S(?:[^~]*\S)?)~~/g, "<s>$1</s>")
    .replace(/\*\*(\S(?:[^*]*\S)?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(\S(?:[^*]*\S)?)\*/g, "<em>$1</em>");

/** Una línea de texto, ya escapada y con sus marcas. */
const linea = (t) => marcas(esc(t));

/**
 * El texto del DJ partido en párrafos.
 *
 * En la carta y en la página manda el renglón en blanco: separa párrafos, y un salto suelto es
 * un salto de verdad —una dirección, una lista, un verso—, así que se respeta con <br> en vez
 * de fundir las líneas. En el registro y en la inscripción manda la línea, sin más.
 */
function cuerpoDe(texto, tipo) {
  const limpio = String(texto ?? "")
    .replace(/\r\n?/g, "\n")
    .trim();
  const bloques = RENGLONES.has(tipo) ? limpio.split("\n") : limpio.split(/\n[ \t]*\n+/);
  const salida = [];

  for (const bloque of bloques) {
    const lineas = bloque
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    let corrido = [];
    const soltar = () => {
      if (corrido.length) salida.push(`<p>${corrido.join("<br>")}</p>`);
      corrido = [];
    };
    for (const l of lineas) {
      if (FIRMA.test(l)) {
        soltar();
        salida.push(`<p class="doc-firma">${linea(l)}</p>`);
      } else {
        corrido.push(linea(l));
      }
    }
    soltar();
  }

  // Nunca se devuelve vacío: un pergamino abierto y sin nada dentro parece que la app ha fallado,
  // y la mesa se queda mirándolo esperando a que cargue algo que no existe.
  return salida.length ? salida.join("") : '<p class="doc-vacio">(en blanco)</p>';
}

// ── Las marcas del uso ────────────────────────────────────────────────────────

/** Por dónde se moja el papel: los bordes y las esquinas, nunca en medio de la plana. */
const SITIOS = [
  [10, 22, 13],
  [90, 36, 16],
  [15, 116, 15],
  [87, 110, 12],
];

/**
 * Una mancha. Es un polígono irregular suavizado con curvas —cada vértice hace de control y los
 * puntos medios de nudo—, porque una elipse a medio difuminar se reconoce como elipse a un metro
 * de distancia y ya no parece humedad, parece un adorno.
 */
function mancha(cx, cy, r, azar) {
  const n = 9;
  const p = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const rr = r * (0.62 + azar() * 0.62);
    p.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 1.15]);
  }
  const medio = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const xy = (q) => `${r1(q[0])},${r1(q[1])}`;
  let d = `M${xy(medio(p[n - 1], p[0]))}`;
  for (let i = 0; i < n; i++) d += `Q${xy(p[i])} ${xy(medio(p[i], p[(i + 1) % n]))}`;
  return `${d}Z`;
}

/** Una grieta: baja a saltos cortos y torcidos, que es como se raja la piedra. */
function grieta(x, y, alto, azar) {
  const pasos = 4 + Math.floor(azar() * 3);
  let cx = x;
  let d = `M${r1(x)},${r1(y)}`;
  for (let i = 1; i <= pasos; i++) {
    cx += (azar() - 0.5) * 10;
    d += `L${r1(cx)},${r1(y + (alto * i) / pasos)}`;
  }
  return d;
}

/** Las manchas de humedad, comunes a todo lo que sea papel. */
function manchasDe(cuantas, id, azar) {
  let d = "";
  for (let i = 0; i < cuantas; i++) {
    const [x, y, r] = SITIOS[i % SITIOS.length];
    const cx = x + (azar() - 0.5) * 12;
    const cy = y + (azar() - 0.5) * 16;
    d += `<path d="${mancha(cx, cy, r * (0.75 + azar() * 0.5), azar)}" fill="url(#${id}m)"/>`;
  }
  return d;
}

/**
 * La capa de marcas, en un <svg> aparte que va encima del texto.
 *
 * El viewBox no se estira a la caja real (`preserveAspectRatio="none"`): no se sabe de antemano
 * cuánto mide un documento, y una mancha estirada a lo largo sigue pareciendo una mancha —agua
 * que corrió por el papel—, mientras que recortarla por la mitad deja un canto recto que canta.
 */
function svgMarcas(tipo, semilla) {
  const azar = generador(semilla);
  const id = `dm${semilla.toString(36)}`;
  const piedra = tipo === "inscripcion";
  let defs = "";
  let capa = "";

  if (piedra) {
    // La piedra no se mancha: se raja y se desconcha. Cada grieta va dos veces, la clara medio
    // punto por debajo, que es la luz que hace el filo del cincel.
    const cortes = [
      [24, 6, 48],
      [70, 14, 64],
      [46, 92, 36],
    ];
    let claras = "";
    let oscuras = "";
    for (const [x, y, alto] of cortes) {
      const d = grieta(x, y, alto, azar);
      claras += `<path d="${d}" ${TRAZO}/>`;
      oscuras += `<path d="${d}" ${TRAZO}/>`;
    }
    capa =
      `<g transform="translate(.9 .9)" fill="none" stroke="#CFC6AE" stroke-opacity=".16" ` +
      `stroke-width="1.6" stroke-linecap="round">${claras}</g>` +
      `<g fill="none" stroke="#07080A" stroke-opacity=".45" stroke-width="1.4" ` +
      `stroke-linecap="round">${oscuras}</g>` +
      `<g fill="#07080A" fill-opacity=".3">` +
      `<path d="${mancha(4, 40, 5, azar)}"/><path d="${mancha(97, 104, 6, azar)}"/></g>`;
  } else {
    defs =
      `<radialGradient id="${id}m">` +
      `<stop offset="0" stop-color="#7A5322" stop-opacity=".40"/>` +
      `<stop offset=".62" stop-color="#7A5322" stop-opacity=".20"/>` +
      `<stop offset="1" stop-color="#7A5322" stop-opacity="0"/></radialGradient>`;

    if (tipo === "carta") {
      // Una carta llega doblada en tres, y los dos pliegues son lo primero que dice «esto venía
      // dentro de un sobre». El degradado va en coordenadas de usuario porque la caja de una
      // línea horizontal no tiene alto y en unidades del objeto no se pintaría nada.
      defs +=
        `<linearGradient id="${id}p" gradientUnits="userSpaceOnUse" x1="0" x2="100">` +
        `<stop offset="0" stop-color="#6B4A1E" stop-opacity="0"/>` +
        `<stop offset=".18" stop-color="#6B4A1E" stop-opacity=".5"/>` +
        `<stop offset=".82" stop-color="#6B4A1E" stop-opacity=".5"/>` +
        `<stop offset="1" stop-color="#6B4A1E" stop-opacity="0"/></linearGradient>`;
      capa =
        manchasDe(4, id, azar) +
        `<g stroke="url(#${id}p)" stroke-width="1.2" fill="none">` +
        `<path d="M0,46.7H100" ${TRAZO}/><path d="M0,93.3H100" ${TRAZO}/></g>`;
    } else if (tipo === "registro") {
      // La raya doble del margen, corrida a la izquierda del texto: en un libro de asientos la
      // columna de la izquierda va impresa, y sin ella esto es una carta con la letra apretada.
      capa =
        manchasDe(3, id, azar) +
        `<g stroke="#8A4A2E" fill="none" stroke-linecap="round">` +
        `<path d="M3.4,5V135" stroke-opacity=".3" stroke-width="1.4" ${TRAZO}/>` +
        `<path d="M5,5V135" stroke-opacity=".16" stroke-width="1" ${TRAZO}/></g>`;
    } else {
      // La página arrancada: el canto derecho queda sucio de fibras. El corte irregular lo hace
      // la hoja de estilo con un clip-path, y como esta capa va dentro se recorta con ella.
      defs +=
        `<linearGradient id="${id}r" gradientUnits="userSpaceOnUse" x1="88" x2="100">` +
        `<stop offset="0" stop-color="#6B4A1E" stop-opacity="0"/>` +
        `<stop offset="1" stop-color="#6B4A1E" stop-opacity=".32"/></linearGradient>`;
      capa =
        manchasDe(3, id, azar) +
        `<rect x="88" y="0" width="12" height="${ALTO}" fill="url(#${id}r)"/>`;
    }
  }

  // Sobre papel se multiplica, que es lo que hace el agua: oscurece lo que ya hay debajo, tinta
  // incluida. Sobre piedra no, porque la luz del cincel es más clara que la piedra y el
  // multiplicado se la comería entera.
  const estilo =
    `position:absolute;inset:0;width:100%;height:100%;pointer-events:none;` +
    (piedra ? `opacity:.75` : `mix-blend-mode:multiply;opacity:.55`);

  return (
    `<svg class="doc-marcas" viewBox="0 0 100 ${ALTO}" preserveAspectRatio="none" ` +
    `aria-hidden="true" focusable="false" style="${estilo}">` +
    (defs ? `<defs>${defs}</defs>` : "") +
    capa +
    `</svg>`
  );
}

// ── Lo que se usa desde fuera ─────────────────────────────────────────────────

/**
 * Un documento de atrezo listo para meter en #doc-caja.
 *
 * Un renglón en blanco separa párrafos y una línea que empieza por «— » sale como firma; es lo
 * que la herramienta `mostrar_documento` le promete al DJ y aquí es lo único que se interpreta.
 * Un tipo que no exista sale como carta, y un título vacío no pinta rótulo: una piedra grabada
 * no lleva encabezado.
 *
 * El `position:relative` en línea es lo único que este módulo le impone al pergamino, y lo
 * necesita: las marcas van dentro, colocadas sobre el papel, y sin él se irían a buscar el
 * primer antepasado colocado —el velo oscuro que ocupa toda la escena— y saldrían manchando la
 * pantalla entera en vez del papel.
 */
export function htmlDocumento({ titulo, texto, tipo } = {}) {
  const clase = TIPOS.includes(tipo) ? tipo : "carta";
  const rotulo = String(titulo ?? "").trim();
  const cuerpo = cuerpoDe(texto, clase);
  const semilla = semillaDe(`${clase}|${rotulo}|${String(texto ?? "")}`);

  return (
    `<article class="doc" data-tipo="${clase}" style="position:relative">` +
    (rotulo ? `<h3 class="doc-titulo">${linea(rotulo)}</h3>` : "") +
    `<div class="doc-cuerpo">${cuerpo}</div>` +
    svgMarcas(clase, semilla) +
    `</article>`
  );
}
