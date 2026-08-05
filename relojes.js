/**
 * relojes.js — los relojes de tensión: el disco que se llena y que la mesa VE.
 *
 * Un reloj de tensión es una presión que corre por su cuenta —el rito que se prepara, la aldea
 * que empieza a sospechar, la niebla que se acerca— partida en cuatro, seis u ocho segmentos. El
 * DJ los gira en el mismo turno en que pasa lo que los mueve, y cuando el último segmento se
 * llena, ocurre lo que el reloj anunciaba. Toda la gracia está en que la mesa lo vea llenarse:
 * una presión que no está a la vista no presiona.
 *
 * Todo es SVG en línea generado aquí: ni librerías, ni imágenes externas, ni tipografías de fuera
 * (la CSP de la app es estricta). Y es DETERMINISTA —ni `Math.random()` ni `Date.now()`—, así que
 * el mismo reloj se repinta idéntico y no «tiembla»: `pintarTodo()` corre dentro del bucle de
 * herramientas, o sea varias veces por turno del DJ.
 *
 * El módulo es PURO: no lee el estado de la partida, no toca el DOM, no importa nada y no muta lo
 * que le pasan. Recibe números y devuelve cadenas. Por eso se puede probar suelto y por eso no
 * sabe nada de `E.relojes`.
 *
 * ── Contrato ──────────────────────────────────────────────────────────────────────────────────
 *
 *   SEGMENTOS → [4, 6, 8]
 *     Los tres tamaños que admite un reloj.
 *
 *   ESTADOS → ["normal", "urgente", "lleno", "archivado"]
 *     Los cuatro aspectos que sabe pintar `svgReloj`.
 *
 *   MAX_RELOJES → 3
 *     Cuántos puede haber a la vez sin archivar. La regla vive aquí para que la herramienta
 *     `crear_reloj` y el pintado no la escriban cada una por su lado.
 *
 *   sanearSegmentos(valor) → 4 | 6 | 8
 *     Redondea al tamaño válido más cercano. El DJ manda enteros y a veces manda cinco.
 *
 *   idDeReloj(titulo) → string
 *     Id estable: minúsculas, sin acentos, sin espacios. «El rito de Corvalar» → "el-rito-de-corvalar".
 *
 *   acotarLleno(lleno, total) → entero entre 0 y total
 *
 *   crearReloj({ titulo, segmentos, quePasa }, existentes?) → reloj
 *     Un reloj nuevo con id único dentro de `existentes` y su número de orden. No comprueba el
 *     tope de MAX_RELOJES: eso lo decide quien llama, que es quien puede contestarle al DJ.
 *
 *   girar(reloj, avance) → { total, antes, lleno, movidos, completado, descompletado }
 *     La cuenta del giro, acotada. NO muta el reloj: devuelve el resultado y quien llama lo
 *     aplica. `completado` es cierto solo en el giro que lo cierra —es la señal de «pasa lo que
 *     anunciaste»— y `descompletado`, en el que lo vuelve a abrir al deshacer.
 *
 *   estadoDeReloj(reloj) → "normal" | "urgente" | "lleno" | "archivado"
 *
 *   cuentaDeReloj(reloj) → "3 de 6"
 *
 *   svgReloj(segmentos, lleno, opciones?) → string
 *     El disco, como `<svg>` completo listo para `innerHTML`.
 *       opciones = {
 *         tam:    number — lado en píxeles (56 por defecto).
 *         estado: "normal" | "urgente" | "lleno" | "archivado" — solo elige la PALETA; la forma
 *                 sale de los números, así que un `estado` equivocado desafina el color pero no
 *                 miente sobre cuántos segmentos quedan.
 *       }
 *     El `<svg>` va con `aria-hidden="true"`: el texto accesible («El rito de Corvalar, tres de
 *     seis») lo pone quien llama, que es quien tiene el título. Y lleva `width`/`height` como
 *     ATRIBUTOS, no en un `style`, para que una regla CSS (`--rt-tam` en el modo tele) pueda
 *     ganarles sin pelear con la especificidad de un estilo en línea.
 */

// ── Reglas ────────────────────────────────────────────────────────────────────────────────────

export const SEGMENTOS = [4, 6, 8];

/** Tres es lo que una mesa sigue de un vistazo; con cuatro relojes no los mira nadie. */
export const MAX_RELOJES = 3;

/** Los cuatro estados que sabe pintar `svgReloj`. */
export const ESTADOS = ["normal", "urgente", "lleno", "archivado"];

// ── Paleta ────────────────────────────────────────────────────────────────────────────────────
//
// Los colores van LITERALES y no como `var(--sebo)`. El SVG se inyecta con `innerHTML` en sitios
// distintos —la escena, la capa Misión, la pestaña de la tele— y tiene que salir igual en todos;
// atarlo a variables heredadas es fiarlo a que el contenedor las tenga. Son exactamente los
// valores de `:root` en index.html, y si allí cambia la paleta, aquí también.
const SEBO = "#C8823C";       // --sebo: el acento de la app. Un reloj que simplemente corre.
const AMBAR = "#D9A04A";      // --ambar: aviso. Queda un segmento.
const HERRUMBRE = "#8D3524";  // --herrumbre: sangre. El reloj está cerrado.
const LIQUEN = "#3A422C";     // --liquen: el borde de todo. También el reloj guardado.
const HUECO = "#0B0D07";      // --hueco de ornado.css: el fondo de lo hundido.

/** El relleno de los segmentos hechos, según el estado. */
const RELLENO = {
  normal: SEBO,
  urgente: AMBAR,
  lleno: HERRUMBRE,
  archivado: LIQUEN,
};

// ── Geometría ─────────────────────────────────────────────────────────────────────────────────
//
// Lienzo de 100×100 con el centro en (50,50). Se dibuja para verse a 56 px —una unidad es medio
// píxel—, así que aquí no cabe ningún detalle fino: todo lo que hay tiene que leerse desde el
// otro lado de la mesa.
//
// El disco es una CORONA, no una tarta. Con los sectores en punta hacia el centro, ocho vértices
// se juntan en un pegote de medio píxel y a 56 px el reloj se lee como una mancha con rayas; con
// la corona, cada segmento es una tajada de grosor parejo y contar «cuántos quedan» es contar
// bultos iguales. En el agujero va el eje, que remata el dibujo como el pasador de una rueda.
//
// Los radios están apretados contra el borde del lienzo a propósito: el disco tiene que comerse
// todo el sitio que se le dé. El de más afuera es el halo (48,6 + medio trazo), y por eso el aro
// se queda en 45,6 aunque engorde a 3 de grosor con el reloj cerrado: sumando el temblor del
// trazo, lo más lejos que llega la tinta es 47,8 y el halo empieza justo después.
const CENTRO = 50;
const R_ARO = 45.6;  // el aro de fuera, el marco
const R_EXT = 39.5;  // canto exterior de los segmentos
const R_INT = 12.5;  // canto interior: el agujero de la corona
const R_EJE = 8.2;   // el pasador del centro
const R_HALO = 48.6; // segundo aro, solo cuando el reloj está cerrado

/** Separación entre segmentos, medida en unidades de ARCO sobre R_EXT. */
const HUECO_ARCO = 2.2;

/** La marca que cruza el canal entre los segmentos y el aro, una por junta. */
const MARCA = { r0: 40.9, r1: 44.2, grosor: 1.6 };

const TAM_POR_DEFECTO = 56;

/** Redondea a dos decimales: los paths salen legibles y el marcado no engorda. */
const n = (v) => Math.round(v * 100) / 100;

/**
 * Un punto del disco. Los ángulos se cuentan DESDE LAS DOCE y en el sentido de las agujas, que es
 * como se lee un reloj y como se llenan estos: el primer segmento es el de arriba a la derecha.
 */
function punto(grados, radio) {
  const a = ((grados - 90) * Math.PI) / 180;
  return [n(CENTRO + radio * Math.cos(a)), n(CENTRO + radio * Math.sin(a))];
}

/** Una tajada de corona, de `g0` a `g1` grados. */
function tajada(g0, g1, rInt, rExt) {
  const [x0, y0] = punto(g0, rExt);
  const [x1, y1] = punto(g1, rExt);
  const [x2, y2] = punto(g1, rInt);
  const [x3, y3] = punto(g0, rInt);
  const grande = g1 - g0 > 180 ? 1 : 0; // con 4, 6 u 8 segmentos nunca pasa, pero cuesta nada
  return (
    `M${x0} ${y0} A${rExt} ${rExt} 0 ${grande} 1 ${x1} ${y1} ` +
    `L${x2} ${y2} A${rInt} ${rInt} 0 ${grande} 0 ${x3} ${y3} Z`
  );
}

/**
 * El aro de fuera, trazado como si se hubiera pasado la tiza a mano: una vuelta y pico, con el
 * radio ondulando un poco.
 *
 * El temblor sale de dos senos de periodos que no casan, medidos sobre la VUELTA: una onda de dos
 * vueltas y media —el pulso de la mano, que deja el círculo un poco huevo— y otra de cinco y pico
 * por encima. Es feo de ver escrito y perfecto para esto: no se repite a simple vista y sale igual
 * en cada repintado.
 *
 * Los dos números que costaron un intento cada uno:
 *
 *  · POCAS ondas. Con doce por vuelta el aro no parecía trazado a mano sino un dodecágono: doce
 *    mínimos son doce esquinas, y entre esquina y esquina el trazo se ve recto. Una mano tiembla
 *    dos o tres veces por vuelta.
 *  · MUCHOS pasos, uno cada tres grados y pico, porque el trazo es una polilínea. Con cuarenta y
 *    seis colaba a 56 px, pero a 200 px en la capa Misión se veía lo que era. Y por eso las ondas
 *    van sobre la vuelta y no sobre el paso: atadas al paso, subir los pasos para quitar las
 *    facetas apretaba las ondas en la misma proporción y el temblor se volvía una lima.
 *
 * La amplitud (0,7, un tercio de píxel a tamaño de mesa) es tan pequeña porque a 56 px cualquier
 * temblor mayor se ve como un borrón y no como un trazo; donde se nota es de cerca, en la Misión y
 * en la tele. Y el cierre no cae en las doce sino en las dos: el trocito donde el trazo se solapa
 * consigo mismo tiene que leerse como el final de un gesto, y sobre el eje vertical parecería una
 * muesca del dibujo.
 */
function aroDeTiza(radio, amplitud = 0.7, pasos = 108) {
  const puntos = [];
  for (let i = 0; i <= pasos; i++) {
    const v = i / pasos; // la vuelta, de 0 a 1
    const g = 18 + v * 368;
    const r = radio + amplitud * (Math.sin(v * 16) * 0.6 + Math.sin(v * 34 + 1.1) * 0.4);
    const [x, y] = punto(g, r);
    puntos.push(`${x} ${y}`);
  }
  return `M${puntos.join(" L")}`;
}

// ── Lógica ────────────────────────────────────────────────────────────────────────────────────

/**
 * El tamaño válido más cercano. Los empates —cinco y siete— caen hacia ARRIBA: cuando el DJ duda
 * del tamaño es porque la presión da para más de lo que había pensado, y un reloj corto se llena
 * antes de que la mesa se entere de que existía.
 */
export function sanearSegmentos(valor) {
  const v = Math.round(Number(valor));
  if (!Number.isFinite(v)) return 6; // seis es la presión de una sesión: el término medio
  return SEGMENTOS.reduce(
    (mejor, c) => (Math.abs(c - v) <= Math.abs(mejor - v) ? c : mejor),
    SEGMENTOS[0],
  );
}

/**
 * Id estable a partir del título. La `ñ` sobrevive como `n` porque `normalize("NFD")` la parte en
 * ene y virgulilla, y la virgulilla cae con el resto de los acentos.
 */
export function idDeReloj(titulo) {
  const limpio = String(titulo ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 48)
    .replace(/^-+|-+$/g, "");
  return limpio || "reloj";
}

/** Los segmentos hechos, siempre un entero entre 0 y el total. */
export function acotarLleno(lleno, total) {
  const v = Math.trunc(Number(lleno)) || 0;
  return Math.max(0, Math.min(total, v));
}

/**
 * Un reloj nuevo. El id se desempata con `-2`, `-3`… si ya hay otro que se llama igual, y el
 * número de orden se saca del mayor que haya: sirve para que la columna no se reordene sola
 * cuando uno se archiva.
 */
export function crearReloj({ titulo, segmentos, quePasa } = {}, existentes = []) {
  const lista = Array.isArray(existentes) ? existentes : [];
  const nombre = String(titulo ?? "").trim() || "Sin título";
  const raiz = idDeReloj(nombre);
  const usados = new Set(lista.map((r) => r?.id));
  let id = raiz;
  let copia = 1;
  while (usados.has(id)) id = `${raiz}-${++copia}`;
  const orden = lista.reduce((m, r) => Math.max(m, Number(r?.n) || 0), 0) + 1;
  return {
    id,
    titulo: nombre,
    segmentos: sanearSegmentos(segmentos),
    lleno: 0,
    quePasa: String(quePasa ?? "").trim(),
    archivado: false,
    n: orden,
  };
}

/**
 * La cuenta de un giro. No toca el reloj: devuelve los números y quien llama decide qué hace con
 * ellos, que es lo que permite avisar a la mesa y contestarle al DJ con el mismo cálculo.
 *
 * `completado` solo es cierto en el giro que CIERRA el reloj. Es importante que no lo sea en los
 * siguientes: si lo fuera, cada golpe posterior volvería a tocar la campana y a soltar la alarma
 * de un reloj que ya se había disparado.
 */
export function girar(reloj, avance) {
  const total = sanearSegmentos(reloj?.segmentos);
  const antes = acotarLleno(reloj?.lleno, total);
  const paso = Math.trunc(Number(avance)) || 0;
  const lleno = acotarLleno(antes + paso, total);
  return {
    total,
    antes,
    lleno,
    movidos: lleno - antes,
    completado: lleno >= total && antes < total,
    descompletado: lleno < total && antes >= total,
  };
}

/**
 * El estado con el que se pinta.
 *
 * «lleno» gana a «archivado» a propósito: un reloj que se llenó y se guardó después cuenta algo
 * —eso llegó a pasar— y en la lista de la Misión se distingue de los que se archivaron a medias.
 */
export function estadoDeReloj(reloj) {
  const total = sanearSegmentos(reloj?.segmentos);
  const lleno = acotarLleno(reloj?.lleno, total);
  if (lleno >= total) return "lleno";
  if (total - lleno === 1) return "urgente";
  if (reloj?.archivado) return "archivado";
  return "normal";
}

/** «3 de 6». La cuenta que va al lado del disco, escrita en un solo sitio. */
export function cuentaDeReloj(reloj) {
  const total = sanearSegmentos(reloj?.segmentos);
  return `${acotarLleno(reloj?.lleno, total)} de ${total}`;
}

// ── El disco ──────────────────────────────────────────────────────────────────────────────────
//
// CÓMO SE LEE DE UN VISTAZO, que es lo único que importa aquí:
//
//   1. Los segmentos hechos van MACIZOS y los que faltan, HUECOS con el filo dibujado. La
//      diferencia es de masa, no de tono: a seis metros y con poca luz, dos naranjas distintos
//      son el mismo naranja, pero un bulto y un contorno no se confunden nunca.
//   2. Entre tajada y tajada queda un canal oscuro de arco constante —el mismo hueco con cuatro
//      segmentos que con ocho—, y por ese canal sube una marca hasta el aro. Son las juntas, y
//      son las que hacen que se cuente por bultos y no por grados.
//   3. Las marcas están SIEMPRE, también cuando el reloj está cerrado. Es lo que deja ver que un
//      ocho cerrado era de ocho: si desaparecieran, todos los relojes llenos serían el mismo.
//   4. Un reloj CERRADO cambia de forma, no solo de color: se va el canal entre tajadas, se cierra
//      el agujero del centro y el disco pasa a ser una pieza maciza con el aro engrosado y un
//      segundo aro por fuera. Corona segmentada contra sello macizo: uno a falta de uno y uno
//      completo no se parecen ni de refilón, que era justo lo que había que conseguir.
//
// Nada se mueve. Un disco que late o que se rellena solo es exactamente lo que se pidió que no
// estorbara, y además `prefers-reduced-motion` no tendría de dónde agarrarlo.

/** El disco de un reloj. Ver la cabecera del fichero para el contrato. */
export function svgReloj(segmentos, lleno, opciones = {}) {
  const total = sanearSegmentos(segmentos);
  const hechos = acotarLleno(lleno, total);
  const tam = Math.max(16, Number(opciones.tam) || TAM_POR_DEFECTO);
  const estado = ESTADOS.includes(opciones.estado) ? opciones.estado : "normal";
  const color = RELLENO[estado];

  // La forma sale de los NÚMEROS y el color del `estado`. Si quien llama se equivoca de estado, el
  // reloj desafina de color pero sigue diciendo la verdad sobre cuántos segmentos quedan.
  const cerrado = hechos >= total;
  // El aro se pone en herrumbre cuando el reloj se cierra, salvo si está archivado: uno guardado
  // no tiene por qué seguir gritando aunque en su día se llenara.
  const enSangre = cerrado && estado !== "archivado";
  const aro = enSangre ? HERRUMBRE : LIQUEN;
  const grosorAro = enSangre ? 3 : 1.8;

  const paso = 360 / total;
  // El hueco se mide en arco y no en grados para que se vea igual de ancho con cuatro segmentos
  // que con ocho; en grados, el canal de un reloj de ocho saldría el doble de estrecho.
  const hueco = ((HUECO_ARCO / R_EXT) * 180) / Math.PI;

  const trozos = [];

  // Fondo: la pizarra sobre la que está dibujado el reloj. Va macizo y no transparente para que
  // el canal entre tajadas sea SIEMPRE el mismo oscuro, se pinte el disco donde se pinte.
  trozos.push(`<circle cx="50" cy="50" r="${R_EXT}" fill="${HUECO}"/>`);

  if (cerrado) {
    // Sello macizo: ni canales ni agujero. El eje queda como una circunferencia grabada, lo justo
    // para que se siga viendo que esto era un reloj y no una moneda.
    trozos.push(`<circle cx="50" cy="50" r="${R_EXT}" fill="${color}"/>`);
    trozos.push(
      `<circle cx="50" cy="50" r="${R_EJE}" fill="none" stroke="${HUECO}" ` +
        `stroke-width="1.6" opacity=".55"/>`,
    );
  } else {
    for (let i = 0; i < total; i++) {
      const g0 = i * paso + hueco / 2;
      const g1 = (i + 1) * paso - hueco / 2;
      const d = tajada(n(g0), n(g1), R_INT, R_EXT);
      trozos.push(
        i < hechos
          ? `<path d="${d}" fill="${color}"/>`
          : `<path d="${d}" fill="${HUECO}" stroke="${LIQUEN}" stroke-width="1.5" ` +
            `stroke-linejoin="round"/>`,
      );
    }
    // El pasador del centro. Tapa los picos de las tajadas, que se juntan feos, y de paso le da
    // al dibujo cara de mecanismo.
    trozos.push(
      `<circle cx="50" cy="50" r="${R_EJE}" fill="${HUECO}" stroke="${aro}" stroke-width="1.3"/>`,
    );
  }

  // Las juntas, subiendo por el canal hasta el aro.
  for (let i = 0; i < total; i++) {
    const [x0, y0] = punto(i * paso, MARCA.r0);
    const [x1, y1] = punto(i * paso, MARCA.r1);
    trozos.push(
      `<path d="M${x0} ${y0} L${x1} ${y1}" stroke="${aro}" stroke-width="${MARCA.grosor}" ` +
        `stroke-linecap="round"/>`,
    );
  }

  trozos.push(
    `<path d="${aroDeTiza(R_ARO)}" fill="none" stroke="${aro}" stroke-width="${grosorAro}" ` +
      `stroke-linecap="round" stroke-linejoin="round"/>`,
  );

  // El segundo aro del reloj cerrado: la onda que suelta lo que acaba de pasar. Es la señal que se
  // ve antes que ninguna otra, porque cambia la silueta entera del dibujo.
  if (enSangre) {
    trozos.push(
      `<circle cx="50" cy="50" r="${R_HALO}" fill="none" stroke="${HERRUMBRE}" ` +
        `stroke-width=".9" opacity=".45"/>`,
    );
  }

  return (
    `<svg viewBox="0 0 100 100" width="${n(tam)}" height="${n(tam)}" aria-hidden="true">` +
    trozos.join("") +
    `</svg>`
  );
}
