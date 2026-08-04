/**
 * mapa.js — el mapa pintado de la aventura.
 *
 * Dibuja un mapa de fantasía a color al estilo de los mapas de Might and Magic: mar con olas,
 * costa irregular, cordillera sombreada, colinas, bosque de copas superpuestas, turbera,
 * caminos de tierra a doble trazo, marco ornamentado y rosa de los vientos.
 *
 * Todo es SVG en línea generado aquí: ni librerías, ni imágenes externas, ni tipografías de
 * fuera (la CSP de la app es estricta). Los estilos van en un <style> DENTRO del propio SVG
 * para que el módulo sea autónomo y no dependa del CSS de la página.
 *
 * Es DETERMINISTA: la semilla sale de los ids de las localizaciones, así que el mismo mapa
 * se repinta idéntico y no "tiembla".
 *
 * Contrato: pintarMapaEn(svg, localizaciones, estado)
 *   svg            — elemento <svg> ya en el DOM (aquí se le pone el viewBox y el contenido).
 *   localizaciones — [{ id, nombre, x, y, conecta }] con x/y de 0 a 100.
 *   estado         — { local, visitadas }.
 * Los nodos salen como <g data-ir="ID" role="button" tabindex="0" aria-label="…">: quien
 * llama engancha los eventos por data-ir, así que eso no se toca.
 */

// ── Lienzo ────────────────────────────────────────────────────────────────────
// Lienzo grande a propósito: el mapa se pinta a ~680 px, así que con un viewBox de 100
// las letras saldrían gigantes. Aquí una unidad ≈ 0,68 px en pantalla.
const ANCHO = 1000;
const ALTO = 800;
const MARCO = 56; // grosor de la banda del marco ornamentado

/** Zona interior, dentro del marco: aquí va el mar y todo lo demás. */
const INT = { x0: MARCO, y0: MARCO, x1: ANCHO - MARCO, y1: ALTO - MARCO };
/** Caja donde se reparten las localizaciones (deja sitio para costa, mar y rótulos). */
const CAJA = { x0: 232, y0: 238, x1: 772, y1: 566 };
/** Hasta dónde puede llegar la tierra: siempre queda mar entre la costa y el marco. */
const LIM = { x0: INT.x0 + 40, y0: INT.y0 + 40, x1: INT.x1 - 40, y1: INT.y1 - 40 };
/** Cuánto se separa la costa de las localizaciones más externas. */
const MARGEN_COSTA = 112;
/** Muestras del contorno de la costa. */
const MUESTRAS = 72;

// ── Paleta ────────────────────────────────────────────────────────────────────
// Mapa antiguo iluminado a mano: verdes de turba, tierras cálidas, mar de pizarra verdosa.
// El oro y el sebo son los mismos de la app (--sebo #C8823C, --ambar #D9A04A) para que el
// marco y los caminos no choquen con el tema oscuro.
const C = {
  tinta: "#3A2A16",
  tintaSuave: "#5A4223",
  marHondo: "#1D414B",
  marMedio: "#2B5A63",
  marOrilla: "#437A83",
  espuma: "#8CB8B6",
  arena: "#DCC697",
  tierraBaja: "#BEAC7C",
  tierraAlta: "#D2C193",
  prado: "#AFB673",
  paramo: "#A79A6A",
  verde1: "#5F7F3C",
  verde2: "#496B32",
  verde3: "#324F27",
  verde4: "#77954B",
  roca: "#9C8C6D",
  rocaSombra: "#6B5F49",
  rocaLuz: "#CFC3A4",
  turbera: "#7C7B4C",
  turberaHonda: "#575636",
  camino: "#C99C5B",
  caminoIgnoto: "#9C8558",
  madera: "#231A11",
  maderaClara: "#3C2C1B",
  oro: "#D9A04A",
  oroSuave: "#C8823C",
  muro: "#DDD0AE",
  tejado: "#A9522F",
  tronco: "#5E4227",
  crema: "#F4EBD2",
};

// ── Utilidades ────────────────────────────────────────────────────────────────
const TAU = Math.PI * 2;
/** Redondeo corto: el markup no necesita quince decimales. */
const r1 = (v) => Math.round(v * 10) / 10;
const lim = (v, a, b) => (v < a ? a : v > b ? b : v);

const esc = (t) =>
  String(t ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Hash estable (FNV-1a) para sacar la semilla de los ids. */
function semillaDe(texto) {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Generador pseudoaleatorio con semilla (mulberry32): mismo mapa siempre. */
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

/** Ruido de valor suave en 0..1, para el relieve y la densidad del bosque. */
function campoRuido(azar, n = 32) {
  const tabla = new Float64Array(n * n);
  for (let i = 0; i < tabla.length; i++) tabla[i] = azar();
  const suave = (u) => u * u * (3 - 2 * u);
  const en = (i, j) => tabla[(((j % n) + n) % n) * n + (((i % n) + n) % n)];
  return (x, y, escala) => {
    const fx = x / escala;
    const fy = y / escala;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = suave(fx - x0);
    const ty = suave(fy - y0);
    const a = en(x0, y0);
    const b = en(x0 + 1, y0);
    const c = en(x0, y0 + 1);
    const d = en(x0 + 1, y0 + 1);
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  };
}

/** Curva cerrada suave (Catmull-Rom a Bézier) por una lista de puntos. */
function curvaCerrada(pts) {
  const n = pts.length;
  let d = `M${r1(pts[0].x)} ${r1(pts[0].y)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    d +=
      ` C${r1(p1.x + (p2.x - p0.x) / 6)} ${r1(p1.y + (p2.y - p0.y) / 6)}` +
      ` ${r1(p2.x - (p3.x - p1.x) / 6)} ${r1(p2.y - (p3.y - p1.y) / 6)}` +
      ` ${r1(p2.x)} ${r1(p2.y)}`;
  }
  return d + " Z";
}

/** Curva abierta suave, para el río y los caminos largos. */
function curvaAbierta(pts) {
  if (pts.length < 3) return `M${r1(pts[0].x)} ${r1(pts[0].y)} L${r1(pts[1].x)} ${r1(pts[1].y)}`;
  const g = (i) => pts[lim(i, 0, pts.length - 1)];
  let d = `M${r1(pts[0].x)} ${r1(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = g(i - 1);
    const p1 = g(i);
    const p2 = g(i + 1);
    const p3 = g(i + 2);
    d +=
      ` C${r1(p1.x + (p2.x - p0.x) / 6)} ${r1(p1.y + (p2.y - p0.y) / 6)}` +
      ` ${r1(p2.x - (p3.x - p1.x) / 6)} ${r1(p2.y - (p3.y - p1.y) / 6)}` +
      ` ${r1(p2.x)} ${r1(p2.y)}`;
  }
  return d;
}

/** Cuánto se puede avanzar desde c en dirección u sin salirse del rectángulo. */
function alcanceDentro(c, ux, uy, caja) {
  let t = Infinity;
  if (ux > 1e-6) t = Math.min(t, (caja.x1 - c.x) / ux);
  if (ux < -1e-6) t = Math.min(t, (caja.x0 - c.x) / ux);
  if (uy > 1e-6) t = Math.min(t, (caja.y1 - c.y) / uy);
  if (uy < -1e-6) t = Math.min(t, (caja.y0 - c.y) / uy);
  return t;
}

// ── Estilos (dentro del SVG, para que el módulo sea autónomo) ─────────────────
const SERIF =
  "Georgia,'Iowan Old Style','Palatino Linotype',Palatino,'Times New Roman','Liberation Serif',serif";

const ESTILOS = `<style>
  .m-lugar { cursor:pointer; }
  .m-lugar:focus { outline:none; }
  .m-zona { fill:#000; fill-opacity:0; }

  /* Rótulos: serif con halo de crema, para que se lean sobre mar, bosque o montaña. */
  .m-rotulo { font:500 21px/1 ${SERIF}; text-anchor:middle; fill:#2C1F10;
              paint-order:stroke fill; stroke:${C.crema}; stroke-width:5.5;
              stroke-linejoin:round; stroke-linecap:round; }
  .m-ignota .m-rotulo { font-style:italic; font-weight:400; fill:#54452C;
                        stroke:#EDE2C6; stroke-width:5; opacity:.92; }
  .m-actual .m-rotulo { font-size:23px; font-weight:700; fill:#3E2409;
                        stroke:#FBF2DA; stroke-width:6; }
  .m-ignota .m-dibujo { opacity:.66; }

  /* Estáis aquí: un pulso lento sobre el suelo, lo justo para encontrarlo de un vistazo. */
  @keyframes m-pulso { 0% { r:46; opacity:.85 } 70%,100% { r:82; opacity:0 } }
  @keyframes m-brillo { 0%,100% { opacity:.95 } 50% { opacity:.45 } }
  .m-pulso { fill:none; stroke:#FFD98A; stroke-width:5;
             animation:m-pulso 2.8s ease-out infinite; }
  .m-aro-aqui { fill:none; stroke:${C.oro}; stroke-width:4.4; opacity:.95;
                animation:m-brillo 2.8s ease-in-out infinite; }
  @media (prefers-reduced-motion:reduce) {
    .m-pulso, .m-aro-aqui { animation:none; }
    .m-pulso { opacity:.5; }
  }

  /* Todo lo decorativo deja pasar el toque: si no, el grano y el marco se comen los clics
     y los nodos data-ir nunca reciben el evento. */
  .m-mar, .m-tierra, .m-sendas, .m-vineta, .m-grano, .m-marco, .m-rosa, .m-escala
    { pointer-events:none; }
  .m-lugar:hover .m-aro-toque, .m-lugar:focus .m-aro-toque { opacity:.85; }
  .m-aro-toque { fill:none; stroke:${C.oro}; stroke-width:2.6; stroke-dasharray:7 6;
                 opacity:0; transition:opacity .18s ease; }

  /* Tinta común de todo lo dibujado a mano. */
  .m-ink { stroke:${C.tinta}; stroke-linejoin:round; stroke-linecap:round; }
  .m-sombra-suelo { fill:#4A3D22; opacity:.22; }

  .m-monte-cuerpo { fill:${C.roca}; stroke:${C.tinta}; stroke-width:2.2; stroke-linejoin:round; }
  .m-monte-sombra { fill:${C.rocaSombra}; opacity:.85; }
  .m-monte-luz { fill:${C.rocaLuz}; opacity:.9; }
  .m-monte-grieta { fill:none; stroke:${C.rocaSombra}; stroke-width:1.6; opacity:.7; }

  .m-colina-cuerpo { fill:${C.prado}; stroke:${C.tinta}; stroke-width:1.8; stroke-linejoin:round; }
  .m-colina-sombra { fill:${C.verde2}; opacity:.42; }

  .m-copa-base { stroke:${C.tinta}; stroke-width:1.5; }
  .m-tronco { stroke:${C.tronco}; stroke-linecap:round; fill:none; }

  .m-turba-base { fill:${C.turbera}; stroke:${C.turberaHonda}; stroke-width:1.8; opacity:.95; }
  .m-junco { fill:none; stroke:${C.turberaHonda}; stroke-width:1.5; stroke-linecap:round; }

  .m-rio { fill:none; stroke-linecap:round; stroke-linejoin:round; }

  /* Caminos de tierra: trazo de tinta ancho debajo, tierra clara encima. Doble línea. */
  .m-camino-ink { fill:none; stroke:${C.tinta}; stroke-linecap:round; }
  .m-camino-tierra { fill:none; stroke:${C.camino}; stroke-linecap:round; }
  .m-camino.m-conocido .m-camino-ink { stroke-width:9.5; opacity:.92; }
  .m-camino.m-conocido .m-camino-tierra { stroke-width:5.4; }
  .m-camino.m-ignoto .m-camino-ink { stroke-width:7; opacity:.42; stroke-dasharray:15 12; }
  .m-camino.m-ignoto .m-camino-tierra { stroke-width:3.4; opacity:.5;
                                        stroke:${C.caminoIgnoto}; stroke-dasharray:15 12; }

  .m-costa-ink { fill:none; stroke:${C.tinta}; stroke-width:3.2; opacity:.95; }
  .m-costa-arena { fill:none; stroke:${C.arena}; stroke-width:10; opacity:.85; }
  .m-eco { fill:none; stroke:${C.espuma}; stroke-width:1.8; }
  .m-ola { fill:none; stroke:${C.espuma}; stroke-width:1.7; opacity:.62; }

  .m-rosa-punta { fill:${C.crema}; stroke:${C.tinta}; stroke-width:1.4; }
  .m-rosa-punta-b { fill:${C.oroSuave}; stroke:${C.tinta}; stroke-width:1.4; }
  .m-rosa-aro { fill:none; stroke:${C.tinta}; stroke-width:2; }
  .m-rosa-letra { font:600 20px/1 ${SERIF}; text-anchor:middle; fill:${C.crema};
                  paint-order:stroke fill; stroke:${C.madera}; stroke-width:4;
                  stroke-linejoin:round; }
  .m-escala-texto { font:500 15px/1 ${SERIF}; text-anchor:middle; fill:${C.crema};
                    paint-order:stroke fill; stroke:#1B2A2E; stroke-width:3.6;
                    stroke-linejoin:round; }

  .m-marco-oro { fill:none; stroke:${C.oro}; }
  .m-marco-ink { fill:none; stroke:#120D08; }
  .m-adorno { fill:none; stroke:${C.oro}; stroke-width:2.6; stroke-linecap:round; }
  .m-adorno-relleno { fill:${C.oroSuave}; }
  .m-rombo { fill:${C.oroSuave}; stroke:${C.oro}; stroke-width:1.1; opacity:.75; }

  .m-grano { mix-blend-mode:multiply; opacity:.13; }
  .m-vineta { mix-blend-mode:multiply; }
</style>`;

// ── Marco ornamentado ─────────────────────────────────────────────────────────
/** Adorno de esquina: voluta dorada que entra un poco sobre el mapa. */
function esquina(x, y, sx, sy) {
  const g = `
    <path class="m-adorno" d="M4 60 C4 28 28 4 60 4"/>
    <path class="m-adorno" d="M14 60 C14 34 34 14 60 14" stroke-width="1.6" opacity=".8"/>
    <path class="m-adorno" d="M60 30 C44 30 30 44 30 60 C30 48 40 42 48 46 C54 49 54 58 46 58"/>
    <path class="m-adorno-relleno" d="M60 22 l7 7 -7 7 -7 -7 Z"/>
    <path class="m-adorno-relleno" d="M22 60 l7 7 -7 7 -7 -7 Z"/>
    <circle class="m-adorno-relleno" cx="30" cy="30" r="5"/>
    <path class="m-adorno" d="M74 8 C86 8 92 14 92 26" stroke-width="1.6" opacity=".7"/>
    <path class="m-adorno" d="M8 74 C8 86 14 92 26 92" stroke-width="1.6" opacity=".7"/>`;
  return `<g transform="translate(${x} ${y}) scale(${sx} ${sy})">${g}</g>`;
}

function marco() {
  const b = MARCO;
  // Banda del marco: rectángulo exterior menos el interior (regla par-impar).
  const banda =
    `M0 0 H${ANCHO} V${ALTO} H0 Z ` +
    `M${b} ${b} H${ANCHO - b} V${ALTO - b} H${b} Z`;

  // Rombos repartidos por la banda, cuadrando el número a cada lado.
  const rombos = [];
  const rombo = (cx, cy, r) =>
    rombos.push(`<path class="m-rombo" d="M${r1(cx)} ${r1(cy - r)} L${r1(cx + r)} ${r1(cy)} L${r1(cx)} ${r1(cy + r)} L${r1(cx - r)} ${r1(cy)} Z"/>`);
  const nH = Math.round((ANCHO - 2 * b) / 46);
  const pasoH = (ANCHO - 2 * b) / nH;
  for (let i = 0; i < nH; i++) {
    const cx = b + pasoH * (i + 0.5);
    rombo(cx, b / 2, 8.5);
    rombo(cx, ALTO - b / 2, 8.5);
  }
  const nV = Math.round((ALTO - 2 * b) / 46);
  const pasoV = (ALTO - 2 * b) / nV;
  for (let i = 0; i < nV; i++) {
    const cy = b + pasoV * (i + 0.5);
    rombo(b / 2, cy, 8.5);
    rombo(ANCHO - b / 2, cy, 8.5);
  }

  return `<g class="m-marco">
    <path d="${banda}" fill="url(#m-grad-marco)" fill-rule="evenodd"/>
    <rect class="m-marco-oro" x="5" y="5" width="${ANCHO - 10}" height="${ALTO - 10}"
          stroke-width="2.6" opacity=".85"/>
    <rect class="m-marco-ink" x="12.5" y="12.5" width="${ANCHO - 25}" height="${ALTO - 25}"
          stroke-width="1.6" opacity=".7"/>
    <rect class="m-marco-oro" x="${b - 12}" y="${b - 12}" width="${ANCHO - 2 * b + 24}"
          height="${ALTO - 2 * b + 24}" stroke-width="1.8" opacity=".7"/>
    ${rombos.join("")}
    <rect class="m-marco-ink" x="${b - 3.5}" y="${b - 3.5}" width="${ANCHO - 2 * b + 7}"
          height="${ALTO - 2 * b + 7}" stroke-width="3.4" opacity=".9"/>
    <rect class="m-marco-oro" x="${b - 0.5}" y="${b - 0.5}" width="${ANCHO - 2 * b + 1}"
          height="${ALTO - 2 * b + 1}" stroke-width="1.4" opacity=".55"/>
    ${esquina(0, 0, 1, 1)}
    ${esquina(ANCHO, 0, -1, 1)}
    ${esquina(0, ALTO, 1, -1)}
    ${esquina(ANCHO, ALTO, -1, -1)}
  </g>`;
}

// ── Rosa de los vientos ───────────────────────────────────────────────────────
function rosaDeLosVientos(cx, cy, R) {
  const puntas = [];
  // Cuatro puntas largas (N-S-E-O) y cuatro cortas en diagonal, cada una a dos caras.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU - Math.PI / 2;
    const largo = i % 2 === 0 ? R : R * 0.56;
    const ancho = i % 2 === 0 ? R * 0.17 : R * 0.13;
    const px = Math.cos(a) * largo;
    const py = Math.sin(a) * largo;
    const qx = Math.cos(a + Math.PI / 2) * ancho;
    const qy = Math.sin(a + Math.PI / 2) * ancho;
    puntas.push(
      `<path class="m-rosa-punta" d="M0 0 L${r1(px)} ${r1(py)} L${r1(qx)} ${r1(qy)} Z"/>` +
        `<path class="m-rosa-punta-b" d="M0 0 L${r1(px)} ${r1(py)} L${r1(-qx)} ${r1(-qy)} Z"/>`,
    );
  }
  // Marcas de rumbo en el aro exterior.
  const marcas = [];
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * TAU;
    const r0 = R * 0.94;
    const r2 = i % 4 === 0 ? R * 1.06 : R * 1.01;
    marcas.push(
      `<path class="m-rosa-aro" stroke-width="${i % 4 === 0 ? 2.2 : 1.2}" d="M${r1(Math.cos(a) * r0)} ${r1(Math.sin(a) * r0)} L${r1(Math.cos(a) * r2)} ${r1(Math.sin(a) * r2)}"/>`,
    );
  }
  return `<g class="m-rosa" transform="translate(${r1(cx)} ${r1(cy)})">
    <circle cx="0" cy="0" r="${r1(R * 1.14)}" fill="url(#m-grad-rosa)" stroke="${C.tinta}"
            stroke-width="2.4" opacity=".92"/>
    <circle class="m-rosa-aro" cx="0" cy="0" r="${r1(R * 0.94)}" stroke-width="1.6" opacity=".8"/>
    ${marcas.join("")}
    ${puntas.join("")}
    <circle cx="0" cy="0" r="${r1(R * 0.15)}" fill="${C.crema}" stroke="${C.tinta}" stroke-width="1.6"/>
    <circle cx="0" cy="0" r="${r1(R * 0.06)}" fill="${C.tinta}"/>
    <path class="m-adorno-relleno" d="M0 ${r1(-R * 1.34)} l6 10 h-12 Z"/>
    <text class="m-rosa-letra" x="0" y="${r1(-R * 1.42)}">N</text>
  </g>`;
}

/** Barra de escala: cuatro tramos de una legua. */
function barraEscala(cx, cy) {
  const w = 152;
  const h = 11;
  const x0 = cx - w / 2;
  const tramos = [];
  for (let i = 0; i < 4; i++) {
    tramos.push(
      `<rect x="${r1(x0 + (w / 4) * i)}" y="${cy}" width="${r1(w / 4)}" height="${h}"
             fill="${i % 2 ? C.crema : C.madera}" stroke="${C.tinta}" stroke-width="1.4"/>`,
    );
  }
  return `<g class="m-escala">
    ${tramos.join("")}
    <text class="m-escala-texto" x="${r1(cx)}" y="${cy - 8}">dos leguas</text>
  </g>`;
}

// ── Iconos de localización ────────────────────────────────────────────────────
/** Qué se dibuja en cada sitio, deducido del nombre. El orden de las pruebas importa. */
function tipoDe(l) {
  const t = `${l.nombre || ""} ${l.id || ""}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // fuera tildes: "corazón" y "corazon" valen igual
  if (/iglesia|ermita|capilla|parroqu|abadia|santuario|san |santa /.test(t)) return "iglesia";
  if (/pozo|cisterna|fuente|manantial/.test(t)) return "pozo";
  if (/vado|puente|arroyo|\brio\b|ribera|torrente/.test(t)) return "vado";
  if (/circulo|menhir|dolmen|piedras|tumulo|crom/.test(t)) return "circulo";
  if (/corazon|arbol|roble|abedul|fresno|bosque|espesura|clar/.test(t)) return "arbol";
  if (/choza|cabana|casa|alqueria|granja|herrer|molino|desvan|granero|posada/.test(t)) return "casa";
  if (/camino|senda|vereda|cruce|puerta|portal|mojon|frontera/.test(t)) return "mojon";
  return "aldea";
}

/** Casita suelta reutilizable: cuerpo, tejado a dos aguas y puerta. */
function casita(cx, base, w, h, tejadoVuelo = 5) {
  const x0 = cx - w / 2;
  return (
    `<path class="m-ink" stroke-width="1.8" fill="${C.muro}"
           d="M${r1(x0)} ${r1(base)} v${r1(-h)} h${r1(w)} v${r1(h)} Z"/>` +
    `<path class="m-ink" stroke-width="1.8" fill="${C.tejado}"
           d="M${r1(x0 - tejadoVuelo)} ${r1(base - h)} L${r1(cx)} ${r1(base - h - w * 0.52)}
              L${r1(cx + w / 2 + tejadoVuelo)} ${r1(base - h)} Z"/>` +
    `<path fill="${C.tintaSuave}" d="M${r1(cx - w * 0.14)} ${r1(base)} v${r1(-h * 0.55)}
           h${r1(w * 0.28)} v${r1(h * 0.55)} Z"/>`
  );
}

const ICONOS = {
  iglesia: {
    escala: 0.9,
    d: () => `
      <ellipse class="m-sombra-suelo" cx="2" cy="3" rx="38" ry="8"/>
      <path class="m-ink" stroke-width="2" fill="${C.muro}" d="M-8 0 v-26 h38 v26 Z"/>
      <path class="m-ink" stroke-width="2" fill="${C.tejado}" d="M-13 -26 L11 -44 L35 -26 Z"/>
      <path class="m-ink" stroke-width="2" fill="${C.muro}" d="M-34 0 v-44 h26 v44 Z"/>
      <path class="m-ink" stroke-width="2" fill="${C.tejado}" d="M-39 -44 L-21 -66 L-3 -44 Z"/>
      <path class="m-ink" stroke-width="2.4" fill="none" d="M-21 -66 v-13 M-28 -73 h14"/>
      <path fill="${C.tintaSuave}" d="M-27 -38 h12 v13 a6 6 0 0 0 -12 0 Z"/>
      <path fill="${C.tintaSuave}" d="M5 0 v-13 a7 7 0 0 1 14 0 v13 Z"/>
      <circle fill="${C.arena}" stroke="${C.tinta}" stroke-width="1.2" cx="26" cy="-32" r="4"/>`,
  },
  aldea: {
    escala: 0.98,
    d: () => `
      <ellipse class="m-sombra-suelo" cx="1" cy="4" rx="42" ry="9"/>
      ${casita(-26, -2, 18, 13)}
      ${casita(24, 0, 17, 12)}
      ${casita(-1, 3, 27, 19, 6)}
      <path class="m-ink" stroke-width="1.6" fill="${C.roca}" d="M11 -21 v-9 h5 v9 Z"/>
      <path class="m-junco" stroke="${C.tinta}" opacity=".5" d="M-14 3 q10 -5 20 0"/>`,
  },
  casa: {
    escala: 1.12,
    d: () => `
      <ellipse class="m-sombra-suelo" cx="2" cy="3" rx="27" ry="7"/>
      ${casita(0, 0, 30, 20, 6)}
      <path class="m-ink" stroke-width="1.6" fill="${C.roca}" d="M10 -25 v-11 h6 v8 Z"/>
      <path fill="none" stroke="${C.crema}" stroke-width="2" opacity=".45"
            d="M13 -37 c-4 -6 3 -8 0 -13"/>
      <path fill="${C.arena}" stroke="${C.tinta}" stroke-width="1.2" d="M-11 -14 h7 v7 h-7 Z"/>`,
  },
  pozo: {
    escala: 1.12,
    d: () => `
      <ellipse class="m-sombra-suelo" cx="2" cy="3" rx="25" ry="7"/>
      <path class="m-ink" stroke-width="2" fill="${C.roca}"
            d="M-17 -5 v-9 a17 6.5 0 0 1 34 0 v9 a17 6.5 0 0 1 -34 0 Z"/>
      <ellipse fill="#221C10" stroke="${C.tinta}" stroke-width="1.8" cx="0" cy="-14" rx="17" ry="6.5"/>
      <path class="m-ink" stroke-width="1.4" fill="none" opacity=".6" d="M-9 -5 v-8 M6 -4 v-9"/>
      <path class="m-ink" stroke-width="2.4" fill="none" d="M-13 -16 v-22 M13 -16 v-22"/>
      <path class="m-ink" stroke-width="2" fill="${C.tejado}" d="M-21 -38 L0 -49 L21 -38 Z"/>
      <path class="m-ink" stroke-width="1.6" fill="none" d="M0 -38 v7"/>
      <path class="m-ink" stroke-width="1.5" fill="${C.tronco}" d="M-5 -31 h10 v7 h-10 Z"/>`,
  },
  vado: {
    escala: 1.2,
    d: () => `
      <path fill="${C.arena}" opacity=".85" d="M-34 -20 q16 -5 34 0 t34 0 v-7 q-18 5 -34 0 t-34 0 Z"/>
      <path fill="${C.arena}" opacity=".85" d="M-34 4 q16 -5 34 0 t34 0 v6 q-18 -5 -34 0 t-34 0 Z"/>
      <path fill="${C.marOrilla}" stroke="${C.marHondo}" stroke-width="1.6"
            d="M-34 -20 q16 -5 34 0 t34 0 v25 q-18 -5 -34 0 t-34 0 Z"/>
      <path class="m-ola" stroke="${C.espuma}" opacity=".8" d="M-28 -12 q7 -5 14 0 t14 0 t14 0"/>
      <path class="m-ola" stroke="${C.espuma}" opacity=".6" d="M-28 -2 q7 -5 14 0 t14 0 t14 0"/>
      <g class="m-ink" stroke-width="1.7" fill="${C.roca}">
        <ellipse cx="-24" cy="-9" rx="8" ry="5.5"/>
        <ellipse cx="-8" cy="-3" rx="9" ry="6"/>
        <ellipse cx="9" cy="-10" rx="8.5" ry="5.5"/>
        <ellipse cx="25" cy="-3" rx="8" ry="5.5"/>
      </g>`,
  },
  circulo: {
    escala: 1.05,
    d: () => {
      const piedras = [];
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU + 0.42;
        const x = Math.cos(a) * 33;
        const y = -8 + Math.sin(a) * 15;
        const h = 17 + (Math.sin(a) + 1) * 8;
        const w = 6.4 + (Math.sin(a) + 1) * 1.8;
        piedras.push({
          y,
          s:
            `<path class="m-ink" stroke-width="1.7" fill="${C.roca}"
                   d="M${r1(x - w)} ${r1(y)} v${r1(-h)} q0 ${r1(-w)} ${r1(w)} ${r1(-w)}
                      q${r1(w)} 0 ${r1(w)} ${r1(w)} v${r1(h)} Z"/>` +
            `<path fill="${C.rocaSombra}" opacity=".6"
                   d="M${r1(x + w * 0.15)} ${r1(y)} v${r1(-h)} q${r1(w * 0.8)} ${r1(-w * 0.2)} ${r1(w * 0.85)} ${r1(w * 0.6)} v${r1(h * 0.95)} Z"/>`,
        });
      }
      piedras.sort((a, b) => a.y - b.y);
      return (
        `<ellipse fill="${C.paramo}" opacity=".55" cx="0" cy="-8" rx="34" ry="16"/>` +
        `<ellipse fill="none" stroke="${C.turberaHonda}" stroke-width="1.4" opacity=".45"
                  cx="0" cy="-8" rx="34" ry="16"/>` +
        piedras.map((p) => p.s).join("")
      );
    },
  },
  arbol: {
    escala: 1.08,
    d: () => `
      <ellipse class="m-sombra-suelo" cx="4" cy="3" rx="32" ry="8"/>
      <path class="m-ink" stroke-width="1.8" fill="${C.tronco}"
            d="M-14 2 q6 -6 7 -14 q1 -10 -2 -18 h18 q-3 8 -2 18 q1 8 7 14 Z"/>
      <path class="m-ink" stroke-width="1.6" fill="none" d="M-4 -22 q-10 -6 -16 -4 M4 -24 q10 -8 18 -5"/>
      <circle fill="${C.verde3}" stroke="${C.tinta}" stroke-width="2" cx="0" cy="-46" r="30"/>
      <circle fill="${C.verde2}" cx="-16" cy="-40" r="17"/>
      <circle fill="${C.verde2}" cx="17" cy="-42" r="16"/>
      <circle fill="${C.verde1}" cx="-4" cy="-58" r="17"/>
      <circle fill="${C.verde1}" cx="14" cy="-54" r="13"/>
      <circle fill="${C.verde4}" cx="-13" cy="-56" r="9"/>
      <circle fill="${C.verde4}" cx="4" cy="-66" r="7.5" opacity=".9"/>`,
  },
  mojon: {
    escala: 1.12,
    d: () => `
      <ellipse class="m-sombra-suelo" cx="2" cy="3" rx="26" ry="7"/>
      <path class="m-ink" stroke-width="1.9" fill="${C.roca}"
            d="M-20 0 v-13 q0 -10 9 -10 q9 0 9 10 v13 Z"/>
      <path fill="${C.rocaSombra}" opacity=".55" d="M-6 0 v-14 q0 -7 -4 -9 q9 0 9 10 v13 Z"/>
      <path class="m-ink" stroke-width="2.6" fill="none" d="M12 2 v-38"/>
      <path class="m-ink" stroke-width="1.8" fill="#9A7038"
            d="M12 -36 h22 l7 7 -7 7 h-22 Z"/>
      <path fill="${C.tinta}" opacity=".65" d="M16 -32 h18 v2.2 h-18 Z M16 -27 h12 v2.2 h-12 Z"/>
      <ellipse class="m-ink" stroke-width="1.4" fill="${C.roca}" cx="-24" cy="-3" rx="7" ry="4.5"/>`,
  },
};

// ── El mapa ───────────────────────────────────────────────────────────────────
/**
 * Pinta el mapa entero dentro del <svg> que se le pasa.
 * @param {SVGSVGElement} svg elemento ya en el DOM.
 * @param {Array<{id:string,nombre:string,x:number,y:number,conecta?:string[]}>} localizaciones
 * @param {{local?:string, visitadas?:string[]}} estado
 */
export function pintarMapaEn(svg, localizaciones, estado) {
  const L = Array.isArray(localizaciones) ? localizaciones.filter(Boolean) : [];
  const visitadas = new Set(estado && Array.isArray(estado.visitadas) ? estado.visitadas : []);
  const aqui = estado ? estado.local : null;

  svg.setAttribute("viewBox", `0 0 ${ANCHO} ${ALTO}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  // Con role="img" el lector de pantalla se comería los nodos, que son botones de verdad.
  svg.setAttribute("role", "group");

  // Semilla estable: los ids y las coordenadas. Mismo mapa siempre.
  const firma = L.map((l) => `${l.id}:${l.x},${l.y}`).join("|") || "mapa-vacio";
  const semilla = semillaDe(firma);
  const azar = generador(semilla);
  // Ids únicos por mapa Y por elemento: en la mesa hay dos mapas a la vez —la miniatura de la
  // esquina y el grande de la capa— y con el mismo sufijo sus <defs> compartirían id, así que
  // `url(#…)` de los dos resolvería al primero del documento.
  const sufijo = `m${(semilla % 100000).toString(36)}${svg.id ? `-${svg.id}` : ""}`;
  const ruidoRelieve = campoRuido(azar);
  const ruidoBosque = campoRuido(azar);
  const ruidoCosta = campoRuido(azar);

  if (!L.length) {
    svg.innerHTML = `${ESTILOS}${defs(sufijo, "", azar)}
      <rect x="${INT.x0}" y="${INT.y0}" width="${INT.x1 - INT.x0}" height="${INT.y1 - INT.y0}"
            fill="url(#${sufijo}-mar)"/>${marco()}`;
    return;
  }

  // ── 1. Colocar las localizaciones en el lienzo ──────────────────────────────
  const xs = L.map((l) => Number(l.x) || 0);
  const ys = L.map((l) => Number(l.y) || 0);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const escX = maxX - minX > 1 ? (CAJA.x1 - CAJA.x0) / (maxX - minX) : 0;
  const escY = maxY - minY > 1 ? (CAJA.y1 - CAJA.y0) / (maxY - minY) : 0;
  const P = L.map((l, i) => ({
    ...l,
    i,
    px: escX ? CAJA.x0 + ((Number(l.x) || 0) - minX) * escX : (CAJA.x0 + CAJA.x1) / 2,
    py: escY ? CAJA.y0 + ((Number(l.y) || 0) - minY) * escY : (CAJA.y0 + CAJA.y1) / 2,
  }));
  const porId = new Map(P.map((p) => [p.id, p]));

  // ── 2. Costa: función de soporte del conjunto de puntos, hinchada y ondulada ─
  const c = {
    x: P.reduce((a, p) => a + p.px, 0) / P.length,
    y: P.reduce((a, p) => a + p.py, 0) / P.length,
  };
  const f1 = azar() * TAU;
  const f2 = azar() * TAU;
  const f3 = azar() * TAU;
  let radios = [];
  for (let i = 0; i < MUESTRAS; i++) {
    const a = (i / MUESTRAS) * TAU;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    // Soporte: la envolvente convexa vista desde el centro.
    let h = 0;
    for (const p of P) h = Math.max(h, (p.px - c.x) * ux + (p.py - c.y) * uy);
    // Bahías y penínsulas: lóbulos lentos más un grano fino de ruido.
    const lob =
      1 +
      0.17 * Math.sin(3 * a + f1) +
      0.11 * Math.sin(5 * a + f2) +
      0.06 * Math.sin(8 * a + f3) +
      0.09 * (ruidoCosta(Math.cos(a) * 140 + 300, Math.sin(a) * 140 + 300, 90) - 0.5);
    let r = (h + MARGEN_COSTA) * lob;
    r = Math.max(r, h + 46); // nunca por dentro de las localizaciones
    r = Math.min(r, alcanceDentro(c, ux, uy, LIM));
    radios.push(r);
  }
  // Suavizado circular: quita los picos que dejan los recortes contra el marco.
  for (let vuelta = 0; vuelta < 2; vuelta++) {
    const prev = radios.slice();
    radios = radios.map((_, i) => {
      const a = prev[(i - 1 + MUESTRAS) % MUESTRAS];
      const b = prev[i];
      const d = prev[(i + 1) % MUESTRAS];
      return a * 0.25 + b * 0.5 + d * 0.25;
    });
  }
  const radioEn = (a) => {
    let t = ((a % TAU) + TAU) / TAU * MUESTRAS;
    const i = Math.floor(t);
    const f = t - i;
    return radios[i % MUESTRAS] * (1 - f) + radios[(i + 1) % MUESTRAS] * f;
  };
  const contorno = (k) => {
    const pts = [];
    for (let i = 0; i < MUESTRAS; i++) {
      const a = (i / MUESTRAS) * TAU;
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      const r = Math.min(radios[i] * k, alcanceDentro(c, ux, uy, { ...INT }) - 6);
      pts.push({ x: c.x + ux * r, y: c.y + uy * r });
    }
    return curvaCerrada(pts);
  };
  const costa = contorno(1);
  /** ¿Cae el punto dentro de la tierra (con un margen k para no pisar la orilla)? */
  const enTierra = (x, y, k = 0.92) => {
    const dx = x - c.x;
    const dy = y - c.y;
    return Math.hypot(dx, dy) <= radioEn(Math.atan2(dy, dx)) * k;
  };

  // ── 3. Caminos de tierra entre localizaciones conectadas ────────────────────
  const hechos = new Set();
  const caminos = [];
  const puntosCamino = [];
  for (const a of P) {
    for (const idB of a.conecta || []) {
      const k = [a.id, idB].sort().join("·");
      if (hechos.has(k)) continue;
      hechos.add(k);
      const b = porId.get(idB);
      if (!b || b === a) continue;
      const conocido = visitadas.has(a.id) && visitadas.has(idB);
      const mx = (a.px + b.px) / 2;
      const my = (a.py + b.py) / 2;
      const dx = b.px - a.px;
      const dy = b.py - a.py;
      const largo = Math.hypot(dx, dy) || 1;
      const off = (azar() - 0.5) * largo * 0.2;
      const qx = mx - (dy / largo) * off;
      const qy = my + (dx / largo) * off;
      const d = `M${r1(a.px)} ${r1(a.py)} Q${r1(qx)} ${r1(qy)} ${r1(b.px)} ${r1(b.py)}`;
      caminos.push(
        `<g class="m-camino ${conocido ? "m-conocido" : "m-ignoto"}">
           <path class="m-camino-ink" d="${d}"/>
           <path class="m-camino-tierra" d="${d}"/>
         </g>`,
      );
      // Muestras del trazado, para no plantar árboles encima del camino.
      for (let t = 0; t <= 1.0001; t += 1 / 14) {
        const u = 1 - t;
        puntosCamino.push({
          x: u * u * a.px + 2 * u * t * qx + t * t * b.px,
          y: u * u * a.py + 2 * u * t * qy + t * t * b.py,
        });
      }
    }
  }
  const lejosDeNodos = (x, y, d) => !P.some((p) => Math.hypot(p.px - x, p.py - y) < d);
  const lejosDeSendas = (x, y, d) => !puntosCamino.some((q) => Math.hypot(q.x - x, q.y - y) < d);

  // ── 4. Relieve y vegetación: candidatos en rejilla temblada dentro de tierra ─
  const cand = [];
  const paso = 25;
  for (let y = LIM.y0; y <= LIM.y1; y += paso) {
    for (let x = LIM.x0; x <= LIM.x1; x += paso) {
      const jx = x + (azar() - 0.5) * paso * 0.9;
      const jy = y + (azar() - 0.5) * paso * 0.9;
      if (!enTierra(jx, jy, 0.93)) continue;
      // Altitud: ruido suave con sesgo al norte y al interior.
      const dCentro = Math.hypot(jx - c.x, jy - c.y) / (radioEn(Math.atan2(jy - c.y, jx - c.x)) || 1);
      const alt =
        0.52 * ruidoRelieve(jx, jy, 165) +
        0.3 * (1 - (jy - LIM.y0) / (LIM.y1 - LIM.y0)) +
        0.18 * (1 - dCentro);
      // Espesura: ruido propio, más denso alrededor de los sitios "de bosque".
      let esp = 0.62 * ruidoBosque(jx + 400, jy - 250, 145) + 0.2 * dCentro;
      for (const p of P) {
        if (!/arbol|circulo/.test(tipoDe(p))) continue;
        const dd = Math.hypot(p.px - jx, p.py - jy);
        esp += 0.55 * Math.exp(-(dd * dd) / (2 * 190 * 190));
      }
      cand.push({ x: jx, y: jy, alt, esp, dCentro });
    }
  }

  // ── 5. Montañas: las cotas más altas, lejos de nodos y caminos ──────────────
  const montes = [];
  for (const q of [...cand].sort((a, b) => b.alt - a.alt)) {
    if (montes.length >= 9) break;
    if (q.dCentro > 0.82) continue;
    if (!lejosDeNodos(q.x, q.y, 82) || !lejosDeSendas(q.x, q.y, 44)) continue;
    if (montes.some((m) => Math.hypot(m.x - q.x, m.y - q.y) < 84)) continue;
    montes.push(q);
  }
  // Cada cumbre arrastra dos o tres hermanas más bajas: así se lee como cordillera.
  const dibujos = [];
  for (const m of montes) {
    const s = 0.78 + azar() * 0.32;
    dibujos.push({ y: m.y, s: monte(m.x, m.y, s, Math.floor(azar() * 3)) });
    const n = 1 + Math.floor(azar() * 2);
    for (let k = 0; k < n; k++) {
      const lado = k % 2 === 0 ? -1 : 1;
      const hx = m.x + lado * (24 + azar() * 22) * s;
      const hy = m.y + (3 + azar() * 14);
      const v = Math.floor(azar() * 3);
      if (!enTierra(hx, hy, 0.9) || !lejosDeNodos(hx, hy, 66) || !lejosDeSendas(hx, hy, 34)) continue;
      dibujos.push({ y: hy, s: monte(hx, hy, s * (0.5 + azar() * 0.26), v) });
    }
  }

  // ── 6. Río: nace en la sierra, pasa por el vado si lo hay y desemboca ───────
  const vado = P.find((p) => tipoDe(p) === "vado") || null;
  // El manantial sale de la cumbre más al norte; si no hay sierra, del interior alto.
  const cumbre = montes.length
    ? montes.reduce((a, b) => (b.y < a.y ? b : a))
    : (() => {
        const a = -Math.PI / 2 + (azar() - 0.5) * 0.9;
        return { x: c.x + Math.cos(a) * radioEn(a) * 0.6, y: c.y + Math.sin(a) * radioEn(a) * 0.6 };
      })();
  const nace = { x: cumbre.x + 8, y: cumbre.y + 14 };
  const medio = vado ? { x: vado.px, y: vado.py + 2 } : { x: c.x, y: c.y + 20 };
  const aBoca =
    Math.atan2(medio.y - c.y, medio.x - c.x) || Math.atan2(medio.y - nace.y, medio.x - nace.x);
  const boca = {
    x: c.x + Math.cos(aBoca) * radioEn(aBoca) * 1.04,
    y: c.y + Math.sin(aBoca) * radioEn(aBoca) * 1.04,
  };
  const cauce = [nace];
  const clave = [nace, medio, boca];
  for (let s = 0; s < clave.length - 1; s++) {
    const a = clave[s];
    const b = clave[s + 1];
    const largo = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const n = 3;
    for (let k = 1; k <= n; k++) {
      const t = k / (n + 1);
      const off = (azar() - 0.5) * largo * 0.24;
      cauce.push({
        x: a.x + (b.x - a.x) * t - ((b.y - a.y) / largo) * off,
        y: a.y + (b.y - a.y) * t + ((b.x - a.x) / largo) * off,
      });
    }
    cauce.push(b);
  }
  const dRio = curvaAbierta(cauce);
  // El río también es "senda": ni árboles ni colinas encima.
  for (let s = 0; s < cauce.length - 1; s++) {
    for (let t = 0; t < 1; t += 0.25) {
      puntosCamino.push({
        x: cauce[s].x + (cauce[s + 1].x - cauce[s].x) * t,
        y: cauce[s].y + (cauce[s + 1].y - cauce[s].y) * t,
      });
    }
  }

  // ── 7. Turbera: charcas alargadas en el curso bajo del río ──────────────────
  const turba = [];
  const zonasTurba = [];
  // Cuántas charcas: según lo que mida el río, para no encharcar un mapa pequeño.
  let largoRio = 0;
  for (let s = 0; s < cauce.length - 1; s++)
    largoRio += Math.hypot(cauce[s + 1].x - cauce[s].x, cauce[s + 1].y - cauce[s].y);
  const nCharcas = lim(Math.round(largoRio / 120), 4, 8);
  for (let k = 0; k < nCharcas; k++) {
    const t = 0.42 + (k / nCharcas) * 0.56;
    const idx = lim(Math.round(t * (cauce.length - 1)), 1, cauce.length - 1);
    const base = cauce[idx];
    const lado = k % 2 === 0 ? 1 : -1;
    const rx = 42 + azar() * 34;
    const ry = 21 + azar() * 14;
    // Hasta cuatro tanteos por charca: si el primer sitio no vale, se prueba más cerca del cauce.
    for (let intento = 0; intento < 4; intento++) {
      const bx = base.x + lado * (30 + azar() * 46) * (1 - intento * 0.22);
      const by = base.y + (azar() - 0.5) * 54 * (1 - intento * 0.2);
      if (!enTierra(bx, by, 0.87) || !lejosDeNodos(bx, by, 56)) continue;
      if (montes.some((m) => Math.hypot(m.x - bx, m.y - by) < 66)) continue;
      if (zonasTurba.some((z) => Math.hypot(z.x - bx, z.y - by) < 56)) continue;
      zonasTurba.push({ x: bx, y: by, rx, ry });
      turba.push(charca(bx, by, rx, ry, azar, sufijo));
      break;
    }
  }
  const enTurbera = (x, y, holgura = 10) =>
    zonasTurba.some((z) => {
      const dx = (x - z.x) / (z.rx + holgura);
      const dy = (y - z.y) / (z.ry + holgura);
      return dx * dx + dy * dy < 1;
    });

  // ── 8. Colinas: la cota media que rodea la sierra ───────────────────────────
  const colinas = [];
  for (const q of [...cand].sort((a, b) => b.alt - a.alt)) {
    if (colinas.length >= 15) break;
    if (q.dCentro > 0.9) continue;
    if (!lejosDeNodos(q.x, q.y, 62) || !lejosDeSendas(q.x, q.y, 30)) continue;
    if (montes.some((m) => Math.hypot(m.x - q.x, m.y - q.y) < 50)) continue;
    if (colinas.some((h) => Math.hypot(h.x - q.x, h.y - q.y) < 46)) continue;
    if (enTurbera(q.x, q.y, 20)) continue;
    colinas.push(q);
    dibujos.push({ y: q.y, s: colina(q.x, q.y, 0.85 + azar() * 0.5, Math.floor(azar() * 3)) });
  }

  // ── 9. Bosque: matas de copas superpuestas donde la espesura manda ──────────
  const matas = [];
  for (const q of [...cand].sort((a, b) => b.esp - a.esp)) {
    if (matas.length >= 215) break;
    if (!lejosDeNodos(q.x, q.y, 54) || !lejosDeSendas(q.x, q.y, 21)) continue;
    if (montes.some((m) => Math.hypot(m.x - q.x, m.y - q.y) < 48)) continue;
    if (colinas.some((h) => Math.hypot(h.x - q.x, h.y - q.y) < 34)) continue;
    if (matas.some((t) => Math.hypot(t.x - q.x, t.y - q.y) < 17)) continue;
    if (enTurbera(q.x, q.y, 4)) continue; // en la turbera no crece bosque
    if (q.esp < 0.37) continue;
    matas.push(q);
    dibujos.push({ y: q.y, s: mata(q.x, q.y, 0.7 + azar() * 0.55, q.esp, azar) });
  }
  // Y unas piedras sueltas y matojos en lo pelado, para que no haya vacíos lisos.
  for (const q of cand) {
    if (q.esp > 0.42 || azar() > 0.18) continue;
    if (!lejosDeNodos(q.x, q.y, 46) || !lejosDeSendas(q.x, q.y, 18)) continue;
    if (montes.some((m) => Math.hypot(m.x - q.x, m.y - q.y) < 40)) continue;
    if (enTurbera(q.x, q.y, 2)) continue;
    dibujos.push({ y: q.y, s: matojo(q.x, q.y, 0.7 + azar() * 0.5, azar) });
  }
  // Pintar de atrás hacia delante: lo de arriba queda detrás, como en un cuadro.
  dibujos.sort((a, b) => a.y - b.y);

  // ── 10. Parches de color de la tierra (borrosos, para que parezca pintado) ──
  const parches = [];
  for (let k = 0; k < 22; k++) {
    const a = azar() * TAU;
    const r = radioEn(a) * (0.12 + azar() * 0.76);
    const x = c.x + Math.cos(a) * r;
    const y = c.y + Math.sin(a) * r;
    const rr = 52 + azar() * 96;
    // Más verde que tierra: la comarca es de prado y páramo, no de arena.
    const col = [C.prado, C.verde4, C.prado, C.paramo, C.verde1, C.tierraAlta][Math.floor(azar() * 6)];
    parches.push(
      `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${r1(rr)}" ry="${r1(rr * (0.5 + azar() * 0.5))}"
                fill="${col}" opacity="${r1(0.34 + azar() * 0.34)}"/>`,
    );
  }

  // ── 11. Nodos: dibujo, rótulo colocado sin pisarse, y marca de "estáis aquí" ─
  // Las cajas de los dibujos se reservan antes: ningún rótulo tapa un edificio.
  const cajasRotulo = P.map((p) => ({
    x0: p.px - 40,
    x1: p.px + 40,
    y0: p.py - 56,
    y1: p.py + 12,
  }));
  const nodos = P.map((p) => {
    const tipo = tipoDe(p);
    const ico = ICONOS[tipo] || ICONOS.aldea;
    const estadoCls = p.id === aqui ? "m-actual" : visitadas.has(p.id) ? "m-visitada" : "m-ignota";
    const fuente = p.id === aqui ? 23 : 21;
    const anchoR = Math.max(60, String(p.nombre || "").length * fuente * 0.47);
    // Arriba por defecto; si choca con otro rótulo, se prueba abajo y más lejos.
    const opciones = [-64, 34, -92, 62, -118];
    let ly = p.py + opciones[0];
    for (const dy of opciones) {
      const cand2 = p.py + dy;
      const caja = { x0: p.px - anchoR / 2, x1: p.px + anchoR / 2, y0: cand2 - 18, y1: cand2 + 6 };
      const choca = cajasRotulo.some(
        (b) => caja.x0 < b.x1 && caja.x1 > b.x0 && caja.y0 < b.y1 && caja.y1 > b.y0,
      );
      if (!choca) {
        ly = cand2;
        break;
      }
    }
    // Que no se salga del lienzo por ningún lado.
    const lx = lim(p.px, INT.x0 + anchoR / 2 + 6, INT.x1 - anchoR / 2 - 6);
    ly = lim(ly, INT.y0 + 26, INT.y1 - 12);
    cajasRotulo.push({ x0: lx - anchoR / 2, x1: lx + anchoR / 2, y0: ly - 18, y1: ly + 6 });

    // Estáis aquí: resplandor cálido, aro que late en el suelo y banderola.
    const marca =
      p.id === aqui
        ? `<ellipse cx="${r1(p.px)}" cy="${r1(p.py - 16)}" rx="74" ry="60"
                    fill="url(#${sufijo}-aqui)"/>
           <g transform="translate(${r1(p.px)} ${r1(p.py + 4)}) scale(1 0.38)">
             <circle cx="0" cy="0" r="46" fill="none" stroke="#4A3208" stroke-width="8" opacity=".4"/>
             <circle class="m-aro-aqui" cx="0" cy="0" r="46"/>
             <circle class="m-pulso" cx="0" cy="0" r="46"/>
           </g>
           <path class="m-ink" stroke-width="2.4" fill="none"
                 d="M${r1(p.px + 30)} ${r1(p.py - 2)} v-52"/>
           <path class="m-ink" stroke-width="1.8" fill="${C.oroSuave}"
                 d="M${r1(p.px + 30)} ${r1(p.py - 54)} l26 8 -26 8 Z"/>`
        : "";

    return `<g class="m-lugar ${estadoCls}" data-ir="${esc(p.id)}" role="button" tabindex="0"
               aria-label="${esc(p.nombre)}${p.id === aqui ? ", estáis aquí" : visitadas.has(p.id) ? ", ya visitado" : ", sin visitar"}">
      <circle class="m-zona" cx="${r1(p.px)}" cy="${r1(p.py - 16)}" r="42" pointer-events="all"/>
      ${marca}
      <g class="m-dibujo" transform="translate(${r1(p.px)} ${r1(p.py)}) scale(${ico.escala})">
        ${ico.d()}
      </g>
      <circle class="m-aro-toque" cx="${r1(p.px)}" cy="${r1(p.py - 16)}" r="40"/>
      <text class="m-rotulo" x="${r1(lx)}" y="${r1(ly)}">${esc(p.nombre)}</text>
    </g>`;
  }).join("");

  // ── 12. Rosa de los vientos y escala: en las esquinas con más mar ───────────
  const esquinas = [
    { x: INT.x0 + 112, y: INT.y0 + 112 },
    { x: INT.x1 - 112, y: INT.y0 + 112 },
    { x: INT.x0 + 112, y: INT.y1 - 112 },
    { x: INT.x1 - 112, y: INT.y1 - 112 },
  ].map((e) => {
    const a = Math.atan2(e.y - c.y, e.x - c.x);
    return { ...e, mar: Math.hypot(e.x - c.x, e.y - c.y) - radioEn(a) };
  });
  esquinas.sort((a, b) => b.mar - a.mar);
  const eRosa = esquinas[0];
  const eEscala = esquinas[1];

  // ── 13. Montaje ─────────────────────────────────────────────────────────────
  svg.innerHTML = `${ESTILOS}
${defs(sufijo, costa, azar)}
<g class="m-mar">
  <rect x="${INT.x0}" y="${INT.y0}" width="${INT.x1 - INT.x0}" height="${INT.y1 - INT.y0}"
        fill="url(#${sufijo}-mar)"/>
  <rect x="${INT.x0}" y="${INT.y0}" width="${INT.x1 - INT.x0}" height="${INT.y1 - INT.y0}"
        fill="url(#${sufijo}-olas)" opacity=".9"/>
  <path d="${contorno(1.06)}" fill="${C.marOrilla}" opacity=".55"/>
  <path d="${contorno(1.03)}" fill="${C.marOrilla}" opacity=".45"/>
  <path class="m-eco" d="${contorno(1.11)}" opacity=".4"/>
  <path class="m-eco" d="${contorno(1.17)}" opacity=".26" stroke-dasharray="9 7"/>
  <path d="${costa}" fill="none" stroke="#123039" stroke-width="9" opacity=".5"
        filter="url(#${sufijo}-suave)"/>
</g>
<g class="m-tierra">
  <path d="${costa}" fill="url(#${sufijo}-tierra)"/>
  <g clip-path="url(#${sufijo}-recorte)">
    <g filter="url(#${sufijo}-suave)" opacity=".55">${parches.join("")}</g>
    <path class="m-costa-arena" d="${costa}"/>
    <g class="m-rio">
      <path d="${dRio}" stroke="${C.marHondo}" stroke-width="11.5" opacity=".85"/>
      <path d="${dRio}" stroke="${C.marOrilla}" stroke-width="7"/>
      <path d="${dRio}" stroke="${C.espuma}" stroke-width="2.4" opacity=".55"/>
    </g>
    ${turba.join("")}
    ${dibujos.map((d) => d.s).join("")}
  </g>
  <path class="m-costa-ink" d="${costa}"/>
</g>
<rect class="m-vineta" x="${INT.x0}" y="${INT.y0}" width="${INT.x1 - INT.x0}"
      height="${INT.y1 - INT.y0}" fill="url(#${sufijo}-vineta)" opacity=".75"/>
<g class="m-sendas">${caminos.join("")}</g>
<g class="m-lugares">${nodos}</g>
${rosaDeLosVientos(eRosa.x, eRosa.y, 58)}
${barraEscala(eEscala.x, eEscala.y + 34)}
<rect class="m-grano" x="${INT.x0}" y="${INT.y0}" width="${INT.x1 - INT.x0}"
      height="${INT.y1 - INT.y0}" filter="url(#${sufijo}-grano)"/>
${marco()}`;
}

// ── Piezas del relieve ────────────────────────────────────────────────────────
/**
 * Montaña con cara al sol, flanco en sombra y roca clara en la cumbre.
 * `v` (0, 1 o 2) cambia el tono de la roca y el perfil, para que la sierra no sea un molde.
 */
function monte(x, y, s, v = 0) {
  const cuerpo = [C.roca, "#8E8068", "#A8987A"][v % 3];
  const sombra = [C.rocaSombra, "#5E5540", "#77694F"][v % 3];
  const perfil =
    v % 3 === 1
      ? "M-38 6 L-14 -30 Q-9 -37 -3 -30 L3 -22 L10 -38 Q15 -45 20 -38 L38 6 Z"
      : "M-36 6 L-6 -42 Q0 -50 6 -42 L36 6 Z";
  const cumbre =
    v % 3 === 1
      ? "M-14 -30 Q-9 -37 -3 -30 L1 -24 L-6 -27 L-11 -22 Z M10 -38 Q15 -45 20 -38 L23 -32 L16 -35 L12 -31 Z"
      : "M-6 -42 Q0 -50 6 -42 L12 -31 L3 -35 L-3 -28 L-9 -33 Z";
  return `<g transform="translate(${r1(x)} ${r1(y)}) scale(${r1(s)})">
    <ellipse class="m-sombra-suelo" cx="6" cy="6" rx="40" ry="9"/>
    <path class="m-monte-cuerpo" fill="${cuerpo}" d="${perfil}"/>
    <path class="m-monte-sombra" fill="${sombra}"
          d="${v % 3 === 1 ? "M18 -40 L38 6 L18 6 Z" : "M3 -45 L36 6 L14 6 Z"}"/>
    <path class="m-monte-luz" d="${cumbre}"/>
    <path class="m-monte-grieta" stroke="${sombra}" d="M-2 -30 L-12 -8 M4 -26 L12 -6"/>
    <path fill="${C.verde2}" opacity=".3" d="M-36 6 q10 -8 22 -6 q14 3 24 -3 q14 4 26 9 Z"/>
  </g>`;
}

/** Colina: un lomo con su sombra. Tres perfiles distintos para que no se repita el molde. */
function colina(x, y, s, v = 0) {
  const verde = [C.prado, "#A3AC6C", "#B6BB7C"][v % 3];
  const cuerpo = [
    "M-30 5 Q-27 -14 -7 -19 Q14 -22 30 5 Z",
    "M-32 5 Q-28 -11 -14 -14 Q-6 -15 -2 -8 Q4 -20 16 -18 Q28 -15 32 5 Z",
    "M-26 5 Q-24 -19 -2 -21 Q20 -23 26 5 Z",
  ][v % 3];
  const sombra = [
    "M7 -20 Q21 -14 30 5 L13 5 Z",
    "M16 -18 Q28 -15 32 5 L18 5 Z",
    "M4 -21 Q20 -18 26 5 L12 5 Z",
  ][v % 3];
  const brizna = [
    "M-14 0 q6 -8 14 -10",
    "M-20 0 q5 -6 11 -8 M2 1 q6 -7 12 -9",
    "M-12 -2 q7 -9 16 -11",
  ][v % 3];
  return `<g transform="translate(${r1(x)} ${r1(y)}) scale(${r1(s)})">
    <ellipse class="m-sombra-suelo" cx="4" cy="5" rx="30" ry="7"/>
    <path class="m-colina-cuerpo" fill="${verde}" d="${cuerpo}"/>
    <path class="m-colina-sombra" d="${sombra}"/>
    <path class="m-monte-grieta" stroke="${C.verde2}" opacity=".4" d="${brizna}"/>
  </g>`;
}

/** Mata de bosque: copas superpuestas en varios verdes con contorno de tinta. */
function mata(x, y, s, esp, azar) {
  const verdes = [C.verde1, C.verde2, C.verde4];
  const a = verdes[Math.floor(azar() * verdes.length)];
  const b = verdes[Math.floor(azar() * verdes.length)];
  const alto = esp > 0.72 ? 1.12 : 1;
  return `<g transform="translate(${r1(x)} ${r1(y)}) scale(${r1(s)} ${r1(s * alto)})">
    <ellipse class="m-sombra-suelo" cx="3" cy="3" rx="19" ry="5"/>
    <path class="m-tronco" stroke-width="3.4" d="M-6 2 v-7 M6 2 v-8 M0 3 v-9"/>
    <circle class="m-copa-base" fill="${C.verde3}" cx="0" cy="-11" r="17"/>
    <circle fill="${a}" cx="-9" cy="-14" r="10.5"/>
    <circle fill="${b}" cx="9" cy="-15" r="10"/>
    <circle fill="${C.verde1}" cx="-1" cy="-22" r="10"/>
    <circle fill="${C.verde4}" cx="-7" cy="-21" r="5.4" opacity=".9"/>
    <circle fill="${C.verde4}" cx="6" cy="-21" r="4" opacity=".7"/>
  </g>`;
}

/** Matojo o piedra suelta para el páramo. */
function matojo(x, y, s, azar) {
  if (azar() < 0.42) {
    return `<g transform="translate(${r1(x)} ${r1(y)}) scale(${r1(s)})">
      <ellipse class="m-ink" stroke-width="1.4" fill="${C.roca}" cx="0" cy="-3" rx="9" ry="6"/>
      <path fill="${C.rocaSombra}" opacity=".5" d="M2 -6 a9 6 0 0 1 6 4 a9 6 0 0 1 -8 3 Z"/>
    </g>`;
  }
  return `<g transform="translate(${r1(x)} ${r1(y)}) scale(${r1(s)})">
    <path class="m-junco" stroke="${C.verde2}" stroke-width="2" d="M0 0 q-3 -8 -7 -11 M0 0 q0 -9 1 -13 M0 0 q4 -8 8 -10"/>
    <circle fill="${C.verde1}" cx="0" cy="-11" r="5.5" opacity=".85"/>
  </g>`;
}

/** Charca de turbera: mancha irregular, rayado de turba, pozas de agua negra y juncos. */
function charca(x, y, rx, ry, azar, sufijo) {
  const pts = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const k = 0.58 + azar() * 0.72; // muy irregular: nada de píldoras
    pts.push({ x: x + Math.cos(a) * rx * k, y: y + Math.sin(a) * ry * k });
  }
  const d = curvaCerrada(pts);
  // Pozas de agua estancada dentro de la turbera.
  const pozas = [];
  for (let i = 0; i < 3; i++) {
    const a = azar() * TAU;
    const px = x + Math.cos(a) * rx * 0.42;
    const py = y + Math.sin(a) * ry * 0.42;
    pozas.push(
      `<ellipse cx="${r1(px)}" cy="${r1(py)}" rx="${r1(5 + azar() * 8)}"
                ry="${r1(3 + azar() * 4)}" fill="#26301F" opacity=".72"/>`,
    );
  }
  const juncos = [];
  for (let i = 0; i < 7; i++) {
    const a = azar() * TAU;
    const jx = x + Math.cos(a) * rx * (0.55 + azar() * 0.4);
    const jy = y + Math.sin(a) * ry * (0.6 + azar() * 0.45);
    juncos.push(
      `<path class="m-junco" d="M${r1(jx)} ${r1(jy)} q-2 -9 -6 -13 M${r1(jx)} ${r1(jy)} q1 -10 4 -14"/>`,
    );
  }
  return `<g class="m-turba">
    <path class="m-turba-base" d="${d}"/>
    <path d="${d}" fill="url(#${sufijo}-turba)" opacity="1"/>
    <path d="${d}" fill="none" stroke="${C.turberaHonda}" stroke-width="2.4" opacity=".55"/>
    ${pozas.join("")}
    ${juncos.join("")}
  </g>`;
}

// ── Definiciones: degradados, patrones y filtros ──────────────────────────────
function defs(sufijo, costa, azar) {
  const semillaGrano = Math.floor(azar() * 90) + 1;
  return `<defs>
  <linearGradient id="${sufijo}-mar" x1="0" y1="0" x2="0.4" y2="1">
    <stop offset="0" stop-color="${C.marMedio}"/>
    <stop offset="0.55" stop-color="${C.marHondo}"/>
    <stop offset="1" stop-color="#17353E"/>
  </linearGradient>
  <radialGradient id="${sufijo}-tierra" cx="0.4" cy="0.34" r="0.78">
    <stop offset="0" stop-color="#CFC48D"/>
    <stop offset="0.62" stop-color="#B7B078"/>
    <stop offset="1" stop-color="#A29A6A"/>
  </radialGradient>
  <radialGradient id="${sufijo}-vineta" cx="0.5" cy="0.48" r="0.72">
    <stop offset="0" stop-color="#FFFFFF" stop-opacity="0"/>
    <stop offset="0.66" stop-color="#8C7A55" stop-opacity="0.16"/>
    <stop offset="1" stop-color="#3A2A16" stop-opacity="0.6"/>
  </radialGradient>
  <linearGradient id="m-grad-marco" x1="0" y1="0" x2="0.7" y2="1">
    <stop offset="0" stop-color="${C.maderaClara}"/>
    <stop offset="0.5" stop-color="${C.madera}"/>
    <stop offset="1" stop-color="#170F09"/>
  </linearGradient>
  <radialGradient id="${sufijo}-aqui" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#FFD98A" stop-opacity=".8"/>
    <stop offset="0.45" stop-color="${C.oro}" stop-opacity=".42"/>
    <stop offset="1" stop-color="${C.oro}" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="m-grad-rosa" cx="0.4" cy="0.35" r="0.75">
    <stop offset="0" stop-color="#EADFBE" stop-opacity=".95"/>
    <stop offset="1" stop-color="#C9B692" stop-opacity=".8"/>
  </radialGradient>

  <pattern id="${sufijo}-olas" width="72" height="46" patternUnits="userSpaceOnUse">
    <path class="m-ola" d="M4 12 q9 -7 18 0 t18 0"/>
    <path class="m-ola" d="M34 30 q9 -7 18 0 t18 0"/>
    <path class="m-ola" d="M-8 34 q9 -7 18 0" opacity=".3"/>
  </pattern>
  <pattern id="${sufijo}-turba" width="15" height="15" patternUnits="userSpaceOnUse"
           patternTransform="rotate(16)">
    <path d="M0 3.5 h15" stroke="${C.turberaHonda}" stroke-width="2" opacity=".8"/>
    <path d="M0 10 h8" stroke="${C.turberaHonda}" stroke-width="1.7" opacity=".6"/>
    <circle cx="11.5" cy="11.5" r="1.7" fill="${C.turberaHonda}" opacity=".6"/>
  </pattern>

  <filter id="${sufijo}-suave" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur stdDeviation="14"/>
  </filter>
  <filter id="${sufijo}-grano" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="4"
                  seed="${semillaGrano}" result="n"/>
    <feColorMatrix in="n" type="matrix"
      values="0 0 0 0 0.24  0 0 0 0 0.19  0 0 0 0 0.10  0.7 0.25 0.05 0 0"/>
  </filter>
  ${costa ? `<clipPath id="${sufijo}-recorte"><path d="${costa}"/></clipPath>` : ""}
</defs>`;
}
