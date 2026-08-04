/**
 * Centro de mandos — El Diezmo de Corvalar
 *
 * Todo ocurre en el tablet. No hay servidor:
 *   micrófono → Scribe (STT) → API de Claude → ElevenLabs (TTS) → altavoz
 *
 * Las claves las pone el dueño del dispositivo en Ajustes y viven en
 * localStorage. Nunca salen de aquí salvo hacia el servicio al que pertenecen.
 */

import { CAMPANAS, CAMPANA_POR_DEFECTO } from "./campana.js";
import { RETRATOS } from "./retratos.js";
import { rasgosDe } from "./rasgos.js";

/**
 * Muñeco de equipo. Una silueta humana en SVG con los huecos colocados donde van en el cuerpo,
 * en vez de una lista de campos de texto.
 *
 * Las coordenadas son sobre un lienzo de 200×300 y están puestas a mano: es un muñeco, no un
 * layout automático, y colocarlo a ojo sobre la silueta es justo lo que lo hace legible.
 */
const MUNECO = {
  cabeza:  { x: 100, y: 30,  lado: "arriba" },
  amuleto: { x: 100, y: 78,  lado: "arriba" },
  pecho:   { x: 100, y: 118, lado: "centro" },
  capa:    { x: 40,  y: 108, lado: "izq" },
  diestra: { x: 26,  y: 168, lado: "izq" },
  zurda:   { x: 174, y: 168, lado: "der" },
  manos:   { x: 174, y: 118, lado: "der" },
  anillo1: { x: 24,  y: 210, lado: "izq" },
  anillo2: { x: 176, y: 210, lado: "der" },
  piernas: { x: 100, y: 214, lado: "centro" },
  pies:    { x: 100, y: 276, lado: "abajo" },
};

/** La silueta. Trazos sueltos, no un dibujo cerrado: encaja con el tono del resto. */
const SILUETA = `
  <g class="cuerpo">
    <ellipse cx="100" cy="36" rx="17" ry="21"/>
    <path d="M100 57 L100 74"/>
    <path d="M70 80 Q100 70 130 80 L134 150 Q100 158 66 150 Z"/>
    <path d="M70 82 L44 104 L38 152"/>
    <path d="M130 82 L156 104 L162 152"/>
    <path d="M38 152 L34 196"/>
    <path d="M162 152 L166 196"/>
    <path d="M78 156 L74 226 L70 272"/>
    <path d="M122 156 L126 226 L130 272"/>
    <path d="M60 278 L84 278"/>
    <path d="M116 278 L140 278"/>
  </g>`;

/** Dibuja el muñeco con lo que lleva puesto en cada hueco. */
function pintarMuneco(p, i) {
  const eq = p.equipo ?? {};
  const puntos = HUECOS.map((h) => {
    const m = MUNECO[h.k];
    if (!m) return "";
    const puesto = !!eq[h.k]?.trim();
    // La etiqueta se coloca al lado que le toca para no cruzar la silueta.
    const dx = m.lado === "izq" ? -14 : m.lado === "der" ? 14 : 0;
    const anclaje = m.lado === "izq" ? "end" : m.lado === "der" ? "start" : "middle";
    const dy = m.lado === "arriba" ? -16 : m.lado === "abajo" ? 22 : m.lado === "centro" ? 22 : 4;
    return `<g class="ranura${puesto ? " puesta" : ""}" data-hueco="${h.k}" data-i="${i}"
               role="button" tabindex="0"
               aria-label="${h.n}: ${puesto ? esc(eq[h.k]) : "vacío"}">
      <circle cx="${m.x}" cy="${m.y}" r="11"/>
      <text class="ico" x="${m.x}" y="${m.y + 4}">${h.i}</text>
      <text class="etiq" x="${m.x + dx}" y="${m.y + dy}" text-anchor="${anclaje}">${
        puesto ? esc(recortar(eq[h.k], 22)) : h.n.toLowerCase()
      }</text>
    </g>`;
  }).join("");

  const mochila = (p.mochila ?? []).filter((x) => x?.trim());
  return `
    <div class="muneco-caja">
      <svg class="muneco" viewBox="-52 -8 304 318" role="img" aria-label="Equipo de ${esc(p.pj)}">
        ${SILUETA}${puntos}
      </svg>
      <div class="mochila">
        <h2>🎒 Mochila</h2>
        <ul class="bolsa">${
          mochila.length
            ? mochila.map((x, j) =>
                `<li><span>${esc(x)}</span><button data-quitarbolsa="${i}" data-j="${j}"
                   title="Quitar">✕</button></li>`).join("")
            : `<li class="nada">Vacía.</li>`
        }</ul>
        <form class="escribir" data-bolsa="${i}">
          <input autocomplete="off" placeholder="añadir a la mochila">
          <button type="submit">＋</button>
        </form>
      </div>
    </div>`;
}

const recortar = (t, n) => (String(t).length > n ? String(t).slice(0, n - 1) + "…" : String(t));

/**
 * Icono y nombre corto por clase. Se saca del texto libre de la ficha («Guerrero 2») porque la
 * clase la escribe el DJ y no hay un campo aparte: pedirle uno más sería una forma de que se
 * desincronizaran.
 */
const CLASES = [
  { re: /guerrer/i, i: "⚔", n: "Guerrero" },
  { re: /explorador|ranger|explorad/i, i: "🏹", n: "Explorador" },
  { re: /pícar|picar|ladr/i, i: "🗝", n: "Pícaro" },
  { re: /clérig|clerig|cléri|sacerd/i, i: "✝", n: "Clérigo" },
  { re: /druid/i, i: "🍂", n: "Druida" },
  { re: /mag[oa]|hechicer/i, i: "✶", n: "Mago" },
  { re: /bárbar|barbar/i, i: "🪓", n: "Bárbaro" },
  { re: /bard/i, i: "🎵", n: "Bardo" },
  { re: /paladí|paladi/i, i: "🛡", n: "Paladín" },
  { re: /monj/i, i: "☯", n: "Monje" },
  { re: /bruj/i, i: "👁", n: "Brujo" },
];
const claseDe = (t) => CLASES.find((c) => c.re.test(String(t ?? "")));
const ICONO_CLASE = (t) => claseDe(t)?.i ?? "◇";
/** El nombre sin el nivel: en un marco de 100 px no cabe «Exploradora 2». */
const claseCorta = (t) =>
  claseDe(t)?.n ?? (String(t ?? "").replace(/\s*\d+\s*$/, "").trim() || "—");

/**
 * Nivel por puntos de experiencia, con los umbrales del SRD recortados a 1-4. No se pasa de 4:
 * es el dial que sostiene el tono, así que la tabla se corta ahí a propósito.
 */
const UMBRALES = [0, 300, 900, 2700];
const nivelDe = (px) => {
  let n = 1;
  for (let i = 0; i < UMBRALES.length; i++) if ((px | 0) >= UMBRALES[i]) n = i + 1;
  return n;
};
/** Cuánto falta para el siguiente nivel, o null si ya está en el 4. */
const faltaPara = (px) => {
  const n = nivelDe(px);
  return n >= 4 ? null : UMBRALES[n] - (px | 0);
};

/**
 * Huecos de equipo, como en cualquier CRPG. El orden es el de la ficha, no alfabético: se lee
 * de la cabeza a los pies y luego los complementos.
 *
 * Son SOLO texto: lo que hay equipado no da bonificadores automáticos. En este sistema la CA la
 * lleva la ficha y la ajusta el DJ, así que un hueco que sumara solo sería una segunda fuente de
 * verdad discrepando con la primera.
 */
const HUECOS = [
  { k: "cabeza", n: "Cabeza", i: "⛑" },
  { k: "pecho", n: "Pecho", i: "🛡" },
  { k: "manos", n: "Manos", i: "🧤" },
  { k: "piernas", n: "Piernas", i: "👖" },
  { k: "pies", n: "Pies", i: "🥾" },
  { k: "capa", n: "Capa", i: "🧣" },
  { k: "diestra", n: "Diestra", i: "🗡" },
  { k: "zurda", n: "Zurda", i: "🪓" },
  { k: "anillo1", n: "Anillo", i: "💍" },
  { k: "anillo2", n: "Anillo", i: "💍" },
  { k: "amuleto", n: "Amuleto", i: "🔮" },
];

/** Las seis preguntas de la sesión cero, en el mismo orden en que se hacen. */
const ENTREVISTA = [
  { k: "jugador", n: "Lo lleva" },
  { k: "aspecto", n: "Qué se le nota" },
  { k: "oficio", n: "De qué vivía" },
  { k: "empuja", n: "Lo que no deja pasar" },
  { k: "dejo", n: "A quién dejó atrás" },
  { k: "miedo", n: "Qué le da miedo" },
];

// ── Herramientas del DJ ──────────────────────────────────────────────────────
/**
 * Lo que el DJ puede HACER, no solo decir.
 *
 * Antes solo hablaba: si te bajaba la vida, tenías que apuntarla tú a mano en la pestaña Grupo,
 * y el DJ no se enteraba de si lo habías hecho. Con esto lleva el estado él: los PG, las heridas,
 * el agotamiento, los suministros, la escena, y escribe las fichas de la sesión cero.
 *
 * Dos reglas de diseño que importan:
 *  - TODA acción se anota en el registro y se ve en la conversación. La mesa tiene que poder
 *    auditar al DJ, que es la premisa de la partida de prueba; un DJ que cambia números sin
 *    decirlo es peor que uno que no los cambia.
 *  - Nada de borrar. No hay herramienta para eliminar un personaje ni para vaciar el estado: si
 *    se equivoca, se corrige a mano, pero no puede destruir una partida de veinte sesiones.
 */
const HERRAMIENTAS = [
  {
    name: "cambiar_pg",
    description:
      "Cambia los puntos de golpe de un personaje. Úsalo en cuanto reciba daño o se cure, sin " +
      "esperar a que la mesa lo apunte. Si llega a 0 avisa de que está agonizante.",
    input_schema: {
      type: "object",
      properties: {
        pj: { type: "string", description: "Nombre del personaje, tal como aparece en el grupo." },
        delta: { type: "integer", description: "Cuánto cambia. Negativo si es daño." },
        motivo: { type: "string", description: "Una frase: de qué viene el cambio." },
      },
      required: ["pj", "delta", "motivo"],
    },
  },
  {
    name: "anadir_herida",
    description:
      "Apunta una herida persistente. Se usa al caer a 0 PG, al recibir un crítico, o al fallar " +
      "una salvación de muerte por 5 o más. Si no dices cuál, se tira en la tabla.",
    input_schema: {
      type: "object",
      properties: {
        pj: { type: "string" },
        herida: {
          type: "string",
          description: "La herida de la tabla de d10. Déjalo vacío para que la tire la app.",
        },
      },
      required: ["pj"],
    },
  },
  {
    name: "cambiar_agotamiento",
    description: "Sube o baja niveles de agotamiento. A 6 el personaje muere.",
    input_schema: {
      type: "object",
      properties: {
        pj: { type: "string" },
        delta: { type: "integer" },
        motivo: { type: "string" },
      },
      required: ["pj", "delta", "motivo"],
    },
  },
  {
    name: "gastar_suministro",
    description:
      "Descuenta o añade suministros del grupo: antorchas, raciones, aceite, flechas. Lleva la " +
      "cuenta tú: la logística es la mitad de la tensión y la mesa te va a preguntar cuántas quedan.",
    input_schema: {
      type: "object",
      properties: {
        que: { type: "string", description: "Antorchas, Raciones, Aceite o Flechas." },
        delta: { type: "integer", description: "Negativo para gastar." },
      },
      required: ["que", "delta"],
    },
  },
  {
    name: "mover_escena",
    description:
      "Mueve al grupo a otra localización de la aventura. Usa el identificador corto (L0, L4, P2…). " +
      "Cambia el arte y la narración de la pantalla, así que hazlo cuando de verdad se muevan.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "avanzar_noche",
    description: "Hace caer la noche: avanza el reloj de la campaña un paso.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "escribir_ficha",
    description:
      "Crea o actualiza la ficha de un personaje. Esto es lo que se usa al final de la sesión " +
      "cero, cuando ya tienes nombre, clase y características: escríbela tú, no hagas que la " +
      "mesa la teclee. Si el nombre no existe, se añade al grupo.",
    input_schema: {
      type: "object",
      properties: {
        pj: { type: "string", description: "Nombre del personaje." },
        clase: { type: "string", description: "Clase y nivel, por ejemplo «Guerrero 2»." },
        pgMax: { type: "integer" },
        ca: { type: "integer", description: "Clase de armadura." },
        retrato: { type: "string", description: "Id de un retrato ya generado, si lo hay." },
        notas: {
          type: "string",
          description:
            "Características, ataques, competencias, equipo y los ganchos que haya contado el " +
            "jugador. Se guarda entero y se ve en su ficha.",
        },
      },
      required: ["pj", "clase", "pgMax", "ca"],
    },
  },
  {
    name: "equipar",
    description:
      "Pone o quita algo de un hueco de equipo. Úsalo cuando encuentren algo y se lo pongan, y " +
      "al montar la ficha en la sesión cero para repartir el equipo inicial. Es texto, no da " +
      "bonificadores: si algo cambia la armadura, cámbiala tú con escribir_ficha.",
    input_schema: {
      type: "object",
      properties: {
        pj: { type: "string" },
        hueco: {
          type: "string",
          enum: ["cabeza", "pecho", "manos", "piernas", "pies", "capa", "diestra", "zurda",
                 "anillo1", "anillo2", "amuleto"],
        },
        objeto: { type: "string", description: "Qué se pone. Vacío para dejar el hueco libre." },
      },
      required: ["pj", "hueco"],
    },
  },
  {
    name: "escribir_entrevista",
    description:
      "Guarda las respuestas de la sesión cero en la ficha del personaje. Llámalo en cuanto un " +
      "jugador conteste las seis preguntas: es lo que hace que su personaje sea suyo y no un " +
      "pregenerado con otro nombre. La `pulla` es una línea burlona tuya sobre el personaje.",
    input_schema: {
      type: "object",
      properties: {
        pj: { type: "string" },
        jugador: { type: "string", description: "Nombre real de quien lo lleva." },
        aspecto: { type: "string", description: "Edad y qué se le nota a primera vista." },
        oficio: { type: "string", description: "De qué vivía antes. El oficio, no la clase." },
        empuja: { type: "string", description: "Lo que no puede dejar pasar." },
        dejo: { type: "string", description: "A quién dejó atrás y qué le debe." },
        miedo: { type: "string", description: "Qué le da miedo de verdad. Se usa en el pavor." },
        pulla: { type: "string", description: "Una línea burlona sobre el personaje, cariñosa." },
      },
      required: ["pj"],
    },
  },
  {
    name: "registrar_accion",
    description:
      "Anota algo que ha pasado, para el resumen del final de la sesión: una tirada importante, " +
      "una decisión, una muerte, un hallazgo. Sé breve y concreto.",
    input_schema: {
      type: "object",
      properties: {
        pj: { type: "string", description: "Quién lo hizo. Vacío si fue del grupo." },
        que: { type: "string", description: "Qué pasó, en una frase." },
        tipo: {
          type: "string",
          enum: ["tirada", "combate", "decision", "hallazgo", "herida", "muerte", "otro"],
        },
      },
      required: ["que", "tipo"],
    },
  },
];

// ── Voces (mismos ids que scripts/lib.mjs) ───────────────────────────────────
const VOZ = {
  narrador: "DdKbXdRlBmj7Ty7N0FVr",
  domar: "DdKbXdRlBmj7Ty7N0FVr",
  olen: "DdKbXdRlBmj7Ty7N0FVr",
  mirena: "OTsv82NplloP7M5TyIJ3",
  vesna: "OTsv82NplloP7M5TyIJ3",
  sela: "OTsv82NplloP7M5TyIJ3",
  acreedor: "PRfCKe8kdrG3nuXOAnoH",
};

/**
 * Resumen de reglas para el DJ. Es una condensación de
 * .claude/skills/gm/reglas.md — si cambias las reglas allí, actualízalo aquí.
 *
 * Se parte en dos: `GUIA` es común a cualquier aventura, y `TRAMA[clave]` añade lo que solo
 * vale para una. Sin esa separación, al jugar la prueba el DJ por voz hablaría de Corvalar.
 */
const GUIA = `
Eres el Director de Juego de una partida de rol de mesa física en español.
Hablas POR VOZ con los jugadores: te oyen, no te leen.

REGLAS DE VOZ (manda esto sobre todo lo demás):
- Una a tres frases. Nunca más. Si hace falta más, di lo esencial y espera.
- Sin markdown, sin listas, sin guiones, sin asteriscos, sin emoji: se pronuncia.
- No incluyas etiquetas internas ni XML en la respuesta bajo ningún concepto.
- Números naturales: "dificultad trece", no "CD 13".
- Anuncia la dificultad ANTES de que tiren, en la misma frase.
- Cuando canten un resultado, narra la consecuencia, no la mecánica.
- Las descripciones ambientales largas ya están grabadas: tú improvisas y adjudicas.
- TERMINA SIEMPRE LAS FRASES. Antes que dejar una a medias, di menos. Si un tema no cabe,
  cierra lo que estás diciendo y ofrécete a seguir en el turno siguiente.

SISTEMA: 5e simplificado, niveles 1-4, competencia +2.
d20 + modificador + competencia contra dificultad: fácil 10, media 13, difícil 16,
muy difícil 19. Ventaja/desventaja: 2d20 el mejor/el peor.
Si no hay riesgo real, funciona sin tirada.

DIALES DE FANTASÍA OSCURA:
- Curación lenta: el descanso largo exige refugio, fuego y comida, y no devuelve todos los PG.
- A 0 PG: inconsciente y agonizante, dos éxitos estabilizan y dos fallos matan, y se
  tira herida persistente.
- No existe la resurrección. Si algo la ofrece, miente o cobra un precio terrible.
- Agotamiento por hambre, frío y falta de sueño.
- Antorchas de una hora y raciones contadas: la logística es la tensión.
- Ante el horror, salvación de Sabiduría o quedas asustado.

TONO: folk horror. Telegrafía el peligro siempre. Los aldeanos no explican nada.
Nunca digas "no puedes": di qué costaría.

NUNCA tires los dados de los jugadores: los tira la mesa y te cantan el resultado.
Fallar una prueba social significa NO obtener información, nunca obtener información falsa.
`.trim();

/**
 * Modo sesión cero. Sustituye a TRAMA mientras se crean los personajes: manda sobre la
 * aventura porque en la sesión cero no se juega ninguna, se monta la mesa.
 * Condensado de campana/sesion-cero.md — si cambias allí el procedimiento, cámbialo aquí.
 */
const GUIA_CERO = `
ESTÁS EN SESIÓN CERO: no se juega ninguna escena todavía, se monta la mesa. Sigue este orden
y NO te lo salgas. UNA COSA POR TURNO, y espera respuesta antes de seguir.

AQUÍ SE LEVANTA EL LÍMITE DE TRES FRASES: los pasos 2, 3 y 4 son explicaciones y pueden
ocupar un párrafo. Pero sigue mandando lo de terminar las frases, y sobre todo NO ENCADENES
DOS PASOS EN EL MISMO TURNO. Haz el paso, pregunta si hay dudas, y para. Si notas que se te
está haciendo largo, corta y di que sigues cuando te digan.

1. SEGURIDAD, ANTES DE DESCRIBIR NADA. Avisa de que hay folk horror con niños en peligro y
   cosas duras. Explica líneas (no aparecen), velos (fuera de cámara) y que cualquiera puede
   decir "Corta" en cualquier momento sin justificarse. Pregunta si hay alguna. Apunta lo que
   digan y respétalo el resto de la campaña.

2. EL MUNDO, minuto y medio. Un valle sin mapas buenos: turba, piedra, lluvia y un bosque de
   abedules que baja hasta donde acaban las casas. No es un mundo de héroes, es un mundo donde
   la gente aguanta. Hay fe de verdad, pero negocia. Hay magia de verdad, y por eso da miedo:
   quien la usa llama la atención de algo. Ellos no son elegidos ni herederos: son cuatro
   personas capaces que han llegado a una aldea llamada Corvalar por caminos distintos, y
   Corvalar tiene un problema del que no habla. NO CUENTES MÁS ARGUMENTO. Si preguntan, di que
   eso lo descubren jugando.

3. CÓMO SE JUEGA, cuatro frases. Dado de veinte más lo de la ficha contra un número que tú das
   ANTES de tirar: fácil diez, normal trece, difícil dieciséis. Sin riesgo no se tira. Ventaja
   son dos dados y te quedas el mejor. Los dados los tiran ellos y te cantan el número. Y la
   muerte es definitiva, las heridas se quedan, y no hay resurrección.

4. LOS SEIS ARQUETIPOS, una frase cada uno, y que no hace falta saberse las reglas porque la
   ficha la montas tú: Guerrero, el que se pone delante. Explorador, lee el terreno y tira con
   arco. Pícaro, abre lo cerrado y oye lo que no debía. Clérigo, tiene fe de verdad y aquí eso
   complica las cosas. Druida, habla con lo que no habla y le teme menos al bosque. Mago, sabe
   cosas que en un pueblo así es mejor no saber. Empiezan en NIVEL 2 y no se pasa del 4.
   Sugiere que no lleven dos lo mismo y que alguien pueda curar.

5. RONDA DE PRESENTACIÓN, uno por uno, seis preguntas cortas: cómo se llama el jugador y cómo
   se llama el personaje; qué aspecto tiene con una cosa que se le note a primera vista; de qué
   vivía antes (oficio, no clase); qué es lo que no puede dejar pasar; a quién dejó atrás y qué
   le debe; y qué le da miedo de verdad. Avísale de que el miedo lo usarás en las salvaciones de
   pavor, y que si prefiere que algo no aparezca eso es una línea, no un miedo. Si alguien se
   queda en blanco, dale dos opciones para que elija; que nadie se atasque.

6. CARACTERÍSTICAS. Que cada uno tire un dado de veinte SEIS veces y te cante los seis números.
   Conviértelos tú con esta tabla: 1 es 8; 2 y 3 son 9; de 4 a 6 es 10; de 7 a 9 es 11; de 10 a
   12 es 12; 13 y 14 son 13; 15 y 16 son 14; 17 y 18 son 15; 19 es 16; 20 es 17. Los seis se
   reparten libremente y tú le dices dónde le conviene el más alto según la clase. Si la suma de
   los seis baja de 63, que repita la tanda entera. Si su valor más alto no llega a 14, súbelo a
   14. Puede intercambiar dos valores una vez. LAS CUENTAS LAS HACES TÚ: modificadores, clase de
   armadura, puntos de golpe de nivel 2, ataques con su bonificador y su daño, salvaciones,
   habilidades competentes y equipo con antorchas y raciones contadas. Competencia +2 siempre.
   Dales la ficha dicha en voz alta y despacio para que la copien.

7. LA FOTO. Explica que NO hay modelado 3D y que NO hacen falta varios ángulos: basta UNA foto
   frontal con luz decente, mandada por el chat. Tú la miras, escribes una descripción de rasgos
   en TEXTO, y solo ese texto va al generador. La foto no sale de la conversación ni se sube a
   ninguna API. El parecido es de familia, no de gemelo. Si alguien no quiere, se le hace el
   retrato sin foto y no se nota.

8. POR QUÉ ESTÁN JUNTOS, en grupo. Ofrece tres: van de camino y Corvalar es la parada; los han
   contratado a los cuatro a la vez y no saben quién paga; o uno tiene un motivo y los otros le
   acompañan (la mejor). Y pregunta a los pares de qué se conocen.

Al acabar, di que apunten los personajes en la pestaña Grupo con «Editar personajes», y que
quiten el modo sesión cero de Ajustes para empezar a jugar.
`.trim();

/**
 * Cómo usar las herramientas. Va aparte de GUIA porque es lo que convierte al DJ de narrador en
 * árbitro: sin decirle explícitamente que las use, describe el daño y no lo aplica.
 */
const GUIA_HERRAMIENTAS = `
TIENES HERRAMIENTAS Y LLEVAS EL ESTADO TÚ. No pidas a la mesa que apunte nada.

- En cuanto alguien reciba daño o se cure, llama a cambiar_pg. No narres «pierdes cuatro» sin
  aplicarlo: la pantalla tiene que cuadrar con lo que dices.
- Al caer a 0 PG, o con un crítico, llama a anadir_herida.
- Al gastar una antorcha, comer una ración o disparar flechas, llama a gastar_suministro. Te van
  a preguntar cuántas quedan y tienes que saber el número exacto.
- Cuando el grupo se mueva de verdad, llama a mover_escena: cambia el arte de la pantalla.
- Llama a registrar_accion en los momentos que merezcan salir en el resumen del final: una
  decisión, una muerte, un hallazgo, una tirada que cambió algo.
- En sesión cero, cuando tengas nombre, clase y características de alguien, llama a
  escribir_ficha. Tú escribes la ficha; la mesa solo contesta preguntas y canta dados.
- En cuanto un jugador conteste las seis preguntas de personaje, llama a escribir_entrevista con
  lo que haya dicho, y añade una PULLA: una línea burlona y cariñosa sobre el personaje. Va en su
  ficha y es lo que hace que se sienta suyo.
- Reparte el equipo inicial con equipar, hueco por hueco, y equipa lo que encuentren cuando se lo
  pongan. Los huecos son cabeza, pecho, manos, piernas, pies, capa, diestra, zurda, dos anillos y
  amuleto.

Puedes llamar a varias en el mismo turno. Después de usarlas, di en una o dos frases lo que ha
pasado en la ficción — no leas los números como un contable, ya se ven en pantalla.

Lo que NO puedes hacer: tirar los dados de los jugadores, borrar personajes, ni resucitar a nadie.
`.trim();

/**
 * Tono de mesa opcional. La ficción sigue siendo la misma —el horror no se rebaja— pero el DJ
 * se permite el mismo cachondeo que hay en una mesa de verdad. Se separa del tono narrativo a
 * propósito: lo que cambia es cómo habla CONTIGO, no cómo describe el bosque.
 */
const GUIA_CACHONDEO = `
REGISTRO DE MESA: los jugadores son colegas y se pican entre ellos. Entra al trapo.
- Puedes ser sarcástico, burlón y seco con la MESA. Si alguien hace una tontería, dilo.
- Si se insultan entre ellos, no hagas de árbitro: te ríes y sigues. No moralices ni des sermones.
- Puedes vacilar a quien saca un uno y celebrar con maldad a quien saca un veinte.
- Comentarios de una línea, nunca chistes largos ni explicados.
- Lo que NO se toca: cuando describes la escena o interpretas a un NPC, sigues siendo folk horror
  serio. El cachondeo es tuyo como DJ hablando con la mesa, no del mundo. Un aldeano no hace
  chistes; tú sí, entre paréntesis.
- Y las líneas y velos que acordó la mesa siguen mandando sobre todo esto.
`.trim();

/** Lo específico de cada aventura. Se añade a GUIA según la que esté elegida. */
const TRAMA = {
  corvalar: `
LA PARTIDA: "El Diezmo de Corvalar".
Corvalar entrega un niño al Bosque cada siete años. La elegida, Sela, de once años, ha
huido, y la Luna Muerta es inminente. Los aldeanos no son víctimas: hicieron el pacto y lo
han cumplido ocho veces. Lo que se debe en realidad es la tierra, no los niños.
No reveles eso: que lo descubran.
`.trim(),

  prueba: `
LA PARTIDA: "El Pozo de Sarna", una partida de PRUEBA de 30-45 minutos. Su objetivo real es
que la mesa compruebe que aplicas bien las reglas, así que sé especialmente explícito con
las dificultades y con el recuento de recursos. No menciones Corvalar ni su trama.

La alquería de Sarna, aislada en la turbera. Hace nueve días Toma Sarna volvió cambiado de
una noche en el bosque y empezó a apilar piedras en el patio; habló de "una que había que
dar" y miró a su mujer, Nera, y luego a la cuna vacía. Nera bajó al pozo con él y subió
sola: le soltó la cuerda. Nera está viva, escondida en el desván, y lo cuenta sin excusarse.
Lo que hay en el pozo es Toma, ahogado y movido por la turba.

Escenas: la alquería (pistas), el pozo (el combate), el desván (Nera y la decisión).

DIFICULTADES YA FIJADAS, no las cambies:
cocina Percepción 13, corral Supervivencia 13 (Elara tira con VENTAJA por Explorador
natural y Enemigo predilecto: dilo tú sin que te lo pidan), pozo Investigación 10,
desván Percepción 16, pavor al ver al Ahogado Sabiduría 13, escapar del agarre
Atletismo o Acrobacias 13, Nera Perspicacia 13.

EL AHOGADO DE SARNA: clase de armadura 13, 30 puntos de golpe, velocidad 6 metros.
Manos de turba, más cuatro al ataque, 1d6+3 contundente, y al acertar salvación de Fuerza
13 o agarrado. Vómito de turba a 3 metros, salvación de Constitución 13 o envenenado, SIN
daño. Si tiene a alguien agarrado, al empezar su turno lo arrastra 3 metros hacia el pozo.
Es VULNERABLE AL FUEGO: el daño de fuego se duplica, y una antorcha hace 1d4 contundente
más 4 de fuego y se gasta. Ese es el atajo; si lo encuentran, funciona.

Empiezan con una hora de luz natural y SEIS antorchas. Lleva la cuenta: te la van a
preguntar a propósito, y tienes que saber el número exacto.

Con Nera hay cuatro salidas (llevarla a Corvalar, dejarla marchar, dejarla allí, bajar por
el cuerpo) y NINGUNA es la correcta. Nárralas igual de bien y no empujes hacia ninguna.
`.trim(),
};

// ── Estado ───────────────────────────────────────────────────────────────────
const CLAVE_AJUSTES = "corvalar.ajustes.v1";
// Una partida guardada POR aventura: jugar la prueba no debe pisar el avance de la campaña.
const claveEstado = (av) => `corvalar.estado.v1.${av}`;

function cargar(k) {
  try { return JSON.parse(localStorage.getItem(k)); } catch { return null; }
}

let A = cargar(CLAVE_AJUSTES) ?? {
  clave11: "", claveCl: "", modelo: "claude-sonnet-5", vozModelo: "eleven_flash_v2_5",
};
if (!CAMPANAS[A.aventura]) A.aventura = CAMPANA_POR_DEFECTO;

let CAMPANA = CAMPANAS[A.aventura];

const porDefecto = () => ({
  local: CAMPANA.localizaciones[0].id,
  visitadas: [CAMPANA.localizaciones[0].id],
  noche: 0,
  partida: structuredClone(CAMPANA.partidaInicial),
  suministros: { ...CAMPANA.suministrosIniciales },
  charla: [],
  gasto: { sttSeg: 0, entrada: 0, salida: 0, ttsCar: 0 },
});

let E = cargar(claveEstado(A.aventura)) ?? porDefecto();
// Si la aventura cambió de forma bajo un estado guardado, la localización puede no existir
// ya: sin esto la app arranca en blanco y no dice por qué.
if (!CAMPANA.localizaciones.some((l) => l.id === E.local)) E = porDefecto();

function guardarEstado() { localStorage.setItem(claveEstado(A.aventura), JSON.stringify(E)); }
function guardarAjustes() { localStorage.setItem(CLAVE_AJUSTES, JSON.stringify(A)); }

/** Cambia de aventura: carga su partida guardada (o la empieza) y repinta todo. */
function cambiarAventura(clave) {
  if (!CAMPANAS[clave] || clave === A.aventura) return;
  guardarEstado();
  A.aventura = clave;
  guardarAjustes();
  CAMPANA = CAMPANAS[clave];
  E = cargar(claveEstado(clave)) ?? porDefecto();
  if (!CAMPANA.localizaciones.some((l) => l.id === E.local)) E = porDefecto();
  pintarTodo();
  irA("escena");
}

const $ = (s) => document.querySelector(s);
const loc = (id) => CAMPANA.localizaciones.find((l) => l.id === id);
const actual = () => loc(E.local);

// ── Pestañas ─────────────────────────────────────────────────────────────────
const PESTANAS = ["escena", "mapa", "grupo", "ajustes"];

function irA(nombre, tocarHash = true) {
  if (!PESTANAS.includes(nombre)) nombre = "escena";
  for (const o of document.querySelectorAll("nav button")) o.removeAttribute("data-activa");
  for (const v of document.querySelectorAll(".vista")) v.removeAttribute("data-activa");
  document.querySelector(`nav button[data-va="${nombre}"]`).setAttribute("data-activa", "");

  // La mesa es un tablero a pantalla completa, hermano de main, no una vista dentro de él:
  // la ilustración tiene que poder ocupar todo el hueco sin el relleno de las otras pestañas.
  const enMesa = nombre === "escena";
  $("#v-tablero").hidden = !enMesa;
  document.querySelector("main").hidden = enMesa;
  if (!enMesa) {
    $(`#v-${nombre}`).setAttribute("data-activa", "");
    document.querySelector("main").scrollTop = 0;
  }
  if (tocarHash && location.hash.slice(1) !== nombre) history.replaceState(null, "", `#${nombre}`);
}

for (const b of document.querySelectorAll("nav button")) {
  b.addEventListener("click", () => irA(b.dataset.va));
}
addEventListener("hashchange", () => irA(location.hash.slice(1), false));

// ── Pintar ───────────────────────────────────────────────────────────────────
function pintarCabecera() {
  const l = actual();
  $("#cab-lugar").textContent = l.id;
  $("#cab-nombre").textContent = l.nombre;
  const rl = CAMPANA.reloj;
  const r = $("#cab-reloj");

  if (!rl) {
    // Aventura sin cuenta atrás (la prueba). El hueco del reloj marca que es una prueba,
    // que es justo lo que conviene tener a la vista mientras se verifica al DJ.
    r.innerHTML = "<b>prueba</b>";
    r.dataset.urgente = "no";
    $("#reloj-titulo").textContent = "Partida de prueba";
    $("#noche-nota").textContent =
      "Ve tachando campana/prueba/VERIFICACION.md mientras jugáis: cada punto lleva escrito el " +
      "resultado correcto, para poder pillar al DJ si se equivoca.";
    $("#reloj-botones").hidden = true;
    return;
  }

  $("#reloj-titulo").textContent = "El reloj";
  $("#reloj-botones").hidden = false;
  const quedan = rl.noches - E.noche;
  r.innerHTML = quedan <= 0 ? `<b>${esc(rl.etiqueta)}</b>` : `${esc(rl.etiqueta)} <b>${quedan}</b>`;
  r.dataset.urgente = quedan <= 1 ? "si" : "no";
  $("#noche-nota").textContent =
    quedan <= 0
      ? rl.agotado
      : `Noche ${E.noche}. Quedan ${quedan} ${quedan === 1 ? "noche" : "noches"}.`;
}

function pintarEscena() {
  const l = actual();
  const img = $("#esc-arte"), vacio = $("#esc-arte-vacio");
  // El manejador se engancha ANTES de asignar src: si se hace después, un 404
  // rápido dispara el error antes de que exista el manejador y quedan visibles
  // la imagen rota y el placeholder a la vez.
  img.onerror = () => { img.hidden = true; vacio.hidden = false; };
  img.onload = () => { img.hidden = false; vacio.hidden = true; };
  if (l.arte) {
    img.alt = l.pie ?? l.nombre;
    img.hidden = true; vacio.hidden = false; // hasta que cargue, el placeholder
    img.src = `arte/${l.arte}.webp`;
  } else {
    img.removeAttribute("src");
    img.hidden = true; vacio.hidden = false;
  }
  $("#esc-pie").textContent = l.arte ? (l.pie ?? "") : "";

  $("#esc-sabeis").innerHTML = (l.sabeis ?? [])
    .map((s) => `<li>${esc(s)}</li>`).join("") || "<li>Nada todavía.</li>";

  const a = $("#esc-audio"), boton = $("#acc-narracion");
  // El aviso se limpia en cada escena: si no, el de una escena sin audio se quedaría pegado
  // en la siguiente, que sí lo tiene.
  $("#esc-nota-audio").textContent = "";
  if (l.audio) a.src = `audio/${l.audio}.mp3`;
  else a.removeAttribute("src");
  boton.querySelector("span:last-child").textContent = "Narración";
  boton.disabled = !l.audio;
}

function pintarCharla() {
  const c = $("#charla");
  if (!E.charla.length) {
    c.innerHTML = `<div class="turno" data-de="dj"><div class="quien">director de juego</div>
      <p>Toca el botón de abajo, habla, y vuelve a tocarlo para enviar. O escríbeme aquí.</p></div>`;
    return;
  }
  const desde = Math.max(0, E.charla.length - 12);
  c.innerHTML = E.charla
    .slice(desde)
    .map((t, k) => `<div class="turno" data-de="${t.de}">
        <div class="quien">${t.de === "mesa" ? "la mesa" : "director de juego"}${
          t.de === "dj"
            ? `<button class="repe" data-repetir="${desde + k}" data-suena="no"
                 title="Repetir en voz. Vuelve a tocarlo para parar."><span>▶</span></button>`
            : ""
        }</div>
        <p>${esc(t.texto)}</p>${
          t.hechos?.length
            ? `<ul class="hechos">${t.hechos.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>`
            : ""
        }</div>`)
    .join("");
  c.lastElementChild?.scrollIntoView({ block: "nearest" });
}

function estadoPj(p) {
  if (p.pg <= 0) return "caido";
  if (p.pg <= p.pgMax / 3) return "grave";
  if (p.pg <= p.pgMax / 2) return "tocado";
  return "entero";
}

// ── Banda de personajes ──────────────────────────────────────────────────────
/** Iniciales para el hueco de quien aún no tiene retrato. */
const iniciales = (n) =>
  n.trim().split(/\s+/).slice(0, 2).map((x) => x[0] ?? "").join("").toUpperCase() || "?";

/**
 * La capa que anima la cara: párpados sobre los ojos y boca sobre la boca, con las coordenadas
 * medidas de cada retrato. Es SVG en un lienzo de 0 a 1, escalado al recuadro.
 *
 * Los párpados bajan desde arriba (`scaleY` desde el borde superior del ojo), así que en reposo
 * tienen altura cero y no se ven. La boca es una elipse oscura que crece al bostezar. Y para el
 * gesto de dolor, dos trazos que fruncen las cejas.
 */
function capaCara(idRetrato) {
  const r = rasgosDe(idRetrato);
  const ojo = ([x, y], clase) => `
    <g class="ojo ${clase}" style="transform-origin:${x}px ${y - r.ojoRy}px">
      <ellipse class="lid" cx="${x}" cy="${y}" rx="${r.ojoRx}" ry="${r.ojoRy}"/>
      <path class="pestana" d="M${x - r.ojoRx} ${y + r.ojoRy * 0.15} Q${x} ${y + r.ojoRy * 1.1} ${x + r.ojoRx} ${y + r.ojoRy * 0.15}"/>
    </g>`;
  const [bx, by] = r.boca;
  const [cix, ciy] = r.ojoIzq, [cdx, cdy] = r.ojoDer;
  return `<svg class="capacara" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
    ${ojo(r.ojoIzq, "izq")}${ojo(r.ojoDer, "der")}
    <ellipse class="bocota" cx="${bx}" cy="${by}" rx="${r.bocaRx}" ry="0.001"/>
    <g class="ceno">
      <path d="M${cix - r.ojoRx} ${ciy - r.ojoRy * 2.6} L${cix + r.ojoRx} ${ciy - r.ojoRy * 1.4}"/>
      <path d="M${cdx + r.ojoRx} ${cdy - r.ojoRy * 2.6} L${cdx - r.ojoRx} ${cdy - r.ojoRy * 1.4}"/>
    </g>
  </svg>`;
}

function pintarBanda() {
  $("#banda").innerHTML = E.partida
    .map((p, i) => {
      const pct = Math.max(0, Math.min(100, (p.pg / Math.max(1, p.pgMax)) * 100));
      const cara = p.retrato
        ? `<img alt="" src="retratos/${encodeURIComponent(p.retrato)}.webp"
             onerror="this.replaceWith(Object.assign(document.createElement('span'),
                      {className:'inicial',textContent:${JSON.stringify(iniciales(p.pj))}}))">`
        : `<span class="inicial">${esc(iniciales(p.pj))}</span>`;
      // La segunda barra es el agotamiento, en el sitio donde el original ponía los puntos de
      // hechizo. Se llena al empeorar, al contrario que la vida, y a 6 mata.
      const agot = Math.max(0, Math.min(6, p.agotamiento ?? 0));
      return `<button class="pj-banda" data-estado="${estadoPj(p)}" data-pjbanda="${i}"
                 aria-label="${esc(p.pj)}, ${p.pg} de ${p.pgMax} puntos de golpe${
                   agot ? `, agotamiento ${agot} de 6` : ""
                 }">
        <span class="marco"><span class="cara">${cara}</span>
          ${p.retrato ? capaCara(p.retrato) : ""}
          <span class="vidrio"></span></span>
        <span class="nom">${esc(p.pj)}</span>
        <span class="oficio"><i>${ICONO_CLASE(p.clase)}</i>${esc(claseCorta(p.clase))}</span>
        <span class="medidor">
          <span class="pgbar"><i style="width:${pct}%"></i></span>
          <span class="agotbar"><i style="width:${(agot / 6) * 100}%"></i></span>
        </span>
        <span class="pgnum">${p.pg}/${p.pgMax}${agot ? ` · ago ${agot}` : ""}</span>
        <span class="px">${p.px ?? 0} px · niv ${nivelDe(p.px ?? 0)}</span>
      </button>`;
    })
    .join("");
  reaccionarAlDano();
}

/**
 * Gestos. Cada pocos segundos, una cara al azar parpadea, bosteza o ladea la cabeza.
 *
 * Es aleatorio a propósito: cuatro bucles CSS sincronizados se notan a la primera mirada, y lo
 * que se quiere es que parezca que están ahí esperando, no que son un GIF. El bostezo es raro
 * —una de cada seis veces— porque bostezar cada tres segundos parece narcolepsia.
 */
const GESTOS = [
  { attr: "data-parpadea", ms: 260, peso: 6 },
  { attr: "data-tic", ms: 800, peso: 3 },
  { attr: "data-bosteza", ms: 1600, peso: 1 },
];
const RULETA = GESTOS.flatMap((g) => Array(g.peso).fill(g));

function gesto() {
  if (document.hidden) return; // con la app en segundo plano no se gasta nada
  // Los caídos no gesticulan: están inconscientes.
  const caras = [...document.querySelectorAll('.pj-banda:not([data-estado="caido"]) .marco')];
  const libres = caras.filter((m) => !m.hasAttribute("data-golpe") && ![...m.attributes]
    .some((a) => a.name.startsWith("data-p") || a.name === "data-tic" || a.name === "data-bosteza"));
  if (!libres.length) return;
  const m = libres[Math.floor(Math.random() * libres.length)];
  const g = RULETA[Math.floor(Math.random() * RULETA.length)];
  m.setAttribute(g.attr, "");
  setTimeout(() => m.removeAttribute(g.attr), g.ms);
}
setInterval(gesto, 2600);

/**
 * Reacción al daño. Se llama al repintar la banda comparando con los PG anteriores, así que se
 * dispara igual si el golpe viene del DJ, de la ficha o de la pestaña Grupo.
 */
let pgAnteriores = null;
function reaccionarAlDano() {
  const ahora = E.partida.map((p) => p.pg);
  if (pgAnteriores) {
    for (let i = 0; i < ahora.length; i++) {
      const antes = pgAnteriores[i];
      if (antes === undefined || antes === ahora[i]) continue;
      const m = document.querySelectorAll(".pj-banda")[i]?.querySelector(".marco");
      if (!m) continue;
      const attr = ahora[i] < antes ? "data-golpe" : "data-cura";
      m.removeAttribute("data-golpe"); m.removeAttribute("data-cura");
      // Un reflow forzado, o el navegador no vuelve a lanzar la animación si el atributo
      // se quita y se pone en el mismo fotograma.
      void m.offsetWidth;
      m.setAttribute(attr, "");
      setTimeout(() => m.removeAttribute(attr), attr === "data-golpe" ? 550 : 650);
    }
  }
  pgAnteriores = ahora;
}

$("#banda").addEventListener("click", (ev) => {
  const b = ev.target.closest("button[data-pjbanda]");
  if (b) abrirFicha(+b.dataset.pjbanda);
});

// ── Ficha de personaje, como capa sobre la mesa ───────────────────────────────
function abrirFicha(i) {
  const p = E.partida[i];
  if (!p) return;
  const l = actual();
  p.equipo ??= {};
  p.ficha ??= {};

  const cara = p.retrato
    ? `<img class="retrato-grande" alt="" src="retratos/${encodeURIComponent(p.retrato)}.webp">`
    : `<div class="retrato-grande sin-foto">${esc(iniciales(p.pj))}
         <small>sin foto todavía</small></div>`;

  // Las respuestas de la sesión cero. Solo se muestran las que existen: una lista de seis
  // huecos vacíos no informa de nada y ocupa media ficha.
  const entrevista = ENTREVISTA.filter((c) => p.ficha[c.k]?.trim());

  $("#ficha-caja").innerHTML = `
    <div class="ficha-cab">
      ${cara}
      <div class="ficha-quien">
        <h3>${esc(p.pj)}</h3>
        <div class="sub">${esc(p.clase)}</div>
        ${p.pulla ? `<p class="pulla">«${esc(p.pulla)}»<span>— el director de juego</span></p>` : ""}
        <div class="ficha-rejilla">
          <div><i>❤</i><span>vida</span><b>${p.pg} / ${p.pgMax}</b></div>
          <div><i>🛡</i><span>armadura</span><b>${p.ca}</b></div>
          <div><i>🌙</i><span>agotamiento</span><b>${p.agotamiento ?? 0} / 6</b></div>
          <div><i>🩸</i><span>heridas</span><b>${p.heridas.length}</b></div>
          <div><i>✶</i><span>experiencia</span><b>${p.px ?? 0}</b></div>
          <div><i>${ICONO_CLASE(p.clase)}</i><span>nivel</span><b>${nivelDe(p.px ?? 0)}</b></div>
        </div>
        ${(() => {
          const px = p.px ?? 0, falta = faltaPara(px), n = nivelDe(px);
          if (falta === null) return `<p class="vacio">Nivel 4, el techo de la campaña.</p>`;
          const base = UMBRALES[n - 1], meta = UMBRALES[n];
          const pct = Math.max(0, Math.min(100, ((px - base) / (meta - base)) * 100));
          return `<div class="pxbar" title="${falta} px para el nivel ${n + 1}">
            <i style="width:${pct}%"></i><span>${falta} px para el nivel ${n + 1}</span></div>`;
        })()}
      </div>
    </div>

    <div><h2>Puntos de golpe</h2>
      <div class="pg-fila" style="margin-top:8px">
        <button data-fpg="${i}" data-d="-3">−3</button>
        <button data-fpg="${i}" data-d="-1">−1</button>
        <span class="val">${p.pg} / ${p.pgMax}</span>
        <button data-fpg="${i}" data-d="1">+1</button>
        <button data-fpg="${i}" data-d="3">+3</button>
      </div>
    </div>

    <div><h2>Equipo</h2>
      <p class="vacio">Toca una ranura del muñeco para poner o cambiar lo que lleva ahí.</p>
      ${pintarMuneco(p, i)}
    </div>

    ${p.heridas.length
      ? `<div><h2>Heridas persistentes</h2><div class="marcas" style="margin-top:8px">${p.heridas
          .map((h, j) => `<button class="marca" data-fherida="${i}" data-h="${j}">${esc(h)} ✕</button>`)
          .join("")}</div></div>`
      : ""}

    <div><h2>Quién es</h2>
      ${entrevista.length
        ? `<dl class="entrevista">${entrevista
            .map((c) => `<dt>${c.n}</dt><dd>${esc(p.ficha[c.k])}</dd>`).join("")}</dl>`
        : `<p class="vacio">Todavía sin entrevista. En la sesión cero el DJ hace seis preguntas
             —qué se te nota, de qué vivías, qué no puedes dejar pasar, a quién dejaste atrás y
             qué te da miedo— y las escribe aquí él.</p>`}
      <div class="fila" style="margin-top:10px">
        <button data-entrevista="${i}"><span class="icono">✎</span><span>Editar a mano</span></button>
      </div>
    </div>

    ${p.notas ? `<div><h2>De la ficha</h2><p class="notas">${esc(p.notas)}</p></div>` : ""}

    <div><h2>Dónde estáis</h2>
      <p style="margin:6px 0 0;font-size:.9rem">${esc(l.id)} · ${esc(l.nombre)}</p>
      <p style="margin:4px 0 0;font:500 .8rem/1.5 var(--mono);color:var(--tiza-baja)">${
        Object.entries(E.suministros).map(([k, v]) => `${k} ${v}`).join(" · ")
      }</p>
    </div>

    <div class="fila">
      <button data-ir-grupo="${i}"><span class="icono">✎</span><span>Editar en Grupo</span></button>
      <button id="ficha-cerrar"><span class="icono">✕</span><span>Cerrar</span></button>
    </div>`;
  $("#ficha").hidden = false;
  $("#ficha-caja").scrollTop = 0;
}

/** Editar la entrevista a mano, por si no se hizo en la sesión cero. */
function editarEntrevista(i) {
  const p = E.partida[i];
  p.ficha ??= {};
  $("#ficha-caja").innerHTML = `
    <h3 style="margin:0">Quién es ${esc(p.pj)}</h3>
    <p class="vacio">Las seis preguntas de la sesión cero. Se guardan al escribir.</p>
    ${ENTREVISTA.map((c) => `<label>${c.n}
       <input data-en="${c.k}" data-i="${i}" value="${esc(p.ficha[c.k] ?? "")}"
              autocomplete="off"></label>`).join("")}
    <label>Pulla del DJ <small>— una línea burlona, la escribe él o tú</small>
      <input data-pulla="${i}" value="${esc(p.pulla ?? "")}" autocomplete="off"></label>
    <div class="fila">
      <button data-volver="${i}"><span class="icono">←</span><span>Volver a la ficha</span></button>
    </div>`;
  $("#ficha-caja").scrollTop = 0;
}

$("#ficha").addEventListener("click", (ev) => {
  // Tocar fuera de la caja cierra: en mesa nadie busca la X.
  if (ev.target === $("#ficha") || ev.target.closest("#ficha-cerrar")) {
    $("#ficha").hidden = true;
    return;
  }
  const pg = ev.target.closest("button[data-fpg]");
  if (pg) {
    const p = E.partida[+pg.dataset.fpg];
    p.pg = Math.max(0, Math.min(p.pgMax, p.pg + +pg.dataset.d));
    guardarEstado(); pintarGrupo(); pintarBanda();
    abrirFicha(+pg.dataset.fpg);
    return;
  }
  const quitar = ev.target.closest("button[data-fherida]");
  if (quitar) {
    E.partida[+quitar.dataset.fherida].heridas.splice(+quitar.dataset.h, 1);
    guardarEstado(); pintarGrupo(); pintarBanda();
    abrirFicha(+quitar.dataset.fherida);
    return;
  }
  // Ranura del muñeco: se pregunta qué se pone. Un prompt es feo, pero en mesa es un toque y
  // escribir, y un panel de inventario completo sería otra pantalla que atravesar.
  const ranura = ev.target.closest(".ranura");
  if (ranura) {
    const pj = E.partida[+ranura.dataset.i];
    const h = HUECOS.find((x) => x.k === ranura.dataset.hueco);
    pj.equipo ??= {};
    const v = prompt(`${h.n} de ${pj.pj}:`, pj.equipo[h.k] ?? "");
    if (v !== null) {
      pj.equipo[h.k] = v.trim();
      guardarEstado();
      abrirFicha(+ranura.dataset.i);
    }
    return;
  }
  const quitarB = ev.target.closest("button[data-quitarbolsa]");
  if (quitarB) {
    const pj = E.partida[+quitarB.dataset.quitarbolsa];
    pj.mochila?.splice(+quitarB.dataset.j, 1);
    guardarEstado(); abrirFicha(+quitarB.dataset.quitarbolsa);
    return;
  }
  const entr = ev.target.closest("button[data-entrevista]");
  if (entr) { editarEntrevista(+entr.dataset.entrevista); return; }
  const volver = ev.target.closest("button[data-volver]");
  if (volver) { abrirFicha(+volver.dataset.volver); return; }
  const ir = ev.target.closest("button[data-ir-grupo]");
  if (ir) {
    $("#ficha").hidden = true;
    irA("grupo");
    if ($("#editor").hidden) $("#editar-grupo").click();
  }
});

// El equipo y la entrevista se guardan al teclear. La ficha NO se repinta: reescribirla
// perdería el foco a cada letra, que es el fallo clásico de un formulario que se autoguarda.
$("#ficha-caja").addEventListener("submit", (ev) => {
  const f = ev.target.closest("form[data-bolsa]");
  if (!f) return;
  ev.preventDefault();
  const i = +f.dataset.bolsa;
  const c = f.querySelector("input");
  const v = c.value.trim();
  if (!v) return;
  E.partida[i].mochila ??= [];
  E.partida[i].mochila.push(v);
  c.value = "";
  guardarEstado(); abrirFicha(i);
});

// Teclado: una ranura es un botón, así que Enter y espacio tienen que abrirla.
$("#ficha-caja").addEventListener("keydown", (ev) => {
  const r = ev.target.closest(".ranura");
  if (r && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); r.dispatchEvent(new Event("click", { bubbles: true })); }
});

$("#ficha-caja").addEventListener("input", (ev) => {
  const c = ev.target;
  const p = E.partida[+c.dataset.i];
  if (!p) return;
  if (c.dataset.eq !== undefined) {
    p.equipo ??= {};
    p.equipo[c.dataset.eq] = c.value;
    c.closest(".hueco")?.classList.toggle("puesto", !!c.value.trim());
  } else if (c.dataset.en !== undefined) {
    p.ficha ??= {};
    p.ficha[c.dataset.en] = c.value;
  } else if (c.dataset.pulla !== undefined) {
    p.pulla = c.value;
  } else return;
  guardarEstado();
});

function pintarGrupo() {
  $("#grupo-lista").innerHTML = E.partida
    .map(
      (p, i) => `
    <div class="pj" data-estado="${estadoPj(p)}">
      <div class="pj-cab">
        <span class="nom">${esc(p.pj)}</span>
        <span class="cls">${esc(p.clase)}</span>
        <span class="ca">CA ${p.ca}</span>
      </div>
      <div class="pg-fila">
        <button data-pg="${i}" data-d="-3">−3</button>
        <button data-pg="${i}" data-d="-1">−1</button>
        <span class="val">${p.pg} / ${p.pgMax}</span>
        <button data-pg="${i}" data-d="1">+1</button>
        <button data-pg="${i}" data-d="3">+3</button>
      </div>
      ${p.heridas.length ? `<div class="marcas">${p.heridas
        .map((h, j) => `<button class="marca" data-quitar="${i}" data-h="${j}">${esc(h)} ✕</button>`)
        .join("")}</div>` : ""}
      <div class="fila">
        <button data-herida="${i}"><span class="icono">✚</span><span>Herida</span></button>
        <button data-agot="${i}" data-d="1"><span class="icono">▲</span><span>Agotamiento</span></button>
        <button data-agot="${i}" data-d="-1"><span class="icono">▼</span><span>Descansa</span></button>
      </div>
      ${p.agotamiento ? `<div class="agot">Agotamiento ${p.agotamiento} de 6</div>` : ""}
    </div>`,
    )
    .join("");

  $("#sumin").innerHTML = Object.entries(E.suministros)
    .map(
      ([k, v]) => `<div data-vacio="${v <= 0 ? "si" : "no"}">
        <button data-sum="${k}" data-d="-1">−</button>
        <span>${esc(k)}</span><b>${v}</b>
        <button data-sum="${k}" data-d="1">+</button>
      </div>`,
    )
    .join("");
}

/**
 * Mapa dibujado, no tres círculos.
 *
 * Pergamino con manchas, bosque a base de matas de árboles, turbera rayada, los caminos como
 * trazo de tinta con dos pasadas para que parezcan a pluma, y cada localización con su icono
 * según lo que es. Todo generado del mismo `x`/`y` que ya tenía cada localización, así que
 * añadir una localización a la aventura la coloca sola.
 */
const ICONO_LUGAR = (l) => {
  const t = `${l.id} ${l.nombre}`.toLowerCase();
  if (/iglesia|ermita|san /.test(t)) return "†";
  if (/pozo/.test(t)) return "◎";
  if (/choza|casa|alquer|herrer/.test(t)) return "⌂";
  if (/vado|arroyo|r[ií]o/.test(t)) return "≈";
  if (/c[ií]rculo|abedul|bosque|coraz/.test(t)) return "⁂";
  if (/camino|desv[áa]n|sur/.test(t)) return "⌇";
  return "✦";
};

function pintarMapa() {
  const L = CAMPANA.localizaciones;
  const svg = $("#mapa");

  // Semilla estable a partir de los ids: la decoración tiene que salir igual cada vez que se
  // pinta, o el mapa "tiembla" al repintar.
  let semilla = L.map((l) => l.id).join("").split("").reduce((a, c) => a + c.charCodeAt(0), 7);
  const azar = () => ((semilla = (semilla * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

  // Manchas de pergamino
  const manchas = Array.from({ length: 14 }, () => {
    const x = azar() * 100, y = azar() * 100, r = 3 + azar() * 9;
    return `<circle class="mancha" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"/>`;
  }).join("");

  // Bosque: matas de tres copas, más densas donde están las localizaciones del Bosque.
  const arboles = Array.from({ length: 90 }, () => {
    const x = azar() * 100, y = azar() * 100;
    // El bosque ocupa la mitad derecha y la franja de arriba; la aldea queda despejada.
    const densidad = (x / 100) * 0.85 + (1 - y / 100) * 0.3;
    if (azar() > densidad) return "";
    if (L.some((l) => Math.hypot(l.x - x, l.y - y) < 7)) return "";
    const e = 0.62 + azar() * 0.45;
    return `<g class="arbol" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${e.toFixed(2)})">
      <path d="M0 0 L0 -1.5"/><circle cx="0" cy="-2.6" r="1.5"/>
      <circle cx="-1.3" cy="-1.7" r="1.1"/><circle cx="1.3" cy="-1.7" r="1.1"/></g>`;
  }).join("");

  // Turbera: rayas horizontales cortas en la franja baja izquierda.
  const turba = Array.from({ length: 26 }, () => {
    const x = azar() * 62, y = 58 + azar() * 40, w = 2 + azar() * 5;
    return `<path class="turba" d="M${x.toFixed(1)} ${y.toFixed(1)} h${w.toFixed(1)}"/>`;
  }).join("");

  // Caminos: dos trazos ligeramente desviados, para que parezcan de pluma.
  const hechas = new Set();
  const caminos = [];
  for (const a of L) {
    for (const bId of a.conecta) {
      const clave = [a.id, bId].sort().join("-");
      if (hechas.has(clave)) continue;
      hechas.add(clave);
      const b = L.find((x) => x.id === bId);
      if (!b) continue;
      const conocida = E.visitadas.includes(a.id) && E.visitadas.includes(bId);
      // Curva: el punto de control se desplaza perpendicular a la recta.
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      const off = (azar() - 0.5) * len * 0.22;
      const cx = mx - (dy / len) * off, cy = my + (dx / len) * off;
      const d = `M${a.x} ${a.y} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x} ${b.y}`;
      caminos.push(
        `<path class="camino ${conocida ? "conocida" : "ignota"}" d="${d}"/>` +
          `<path class="camino2 ${conocida ? "conocida" : "ignota"}" d="${d}"/>`,
      );
    }
  }

  const nodos = L.map((l) => {
    const clase = l.id === E.local ? "actual" : E.visitadas.includes(l.id) ? "visitada" : "ignota";
    return `<g class="lugar ${clase}" data-ir="${l.id}" role="button" tabindex="0"
               aria-label="${esc(l.nombre)}${l.id === E.local ? ", estáis aquí" : ""}">
      <circle class="halo" cx="${l.x}" cy="${l.y}" r="5.6"/>
      <circle class="punto" cx="${l.x}" cy="${l.y}" r="3.4"/>
      <text class="glifo" x="${l.x}" y="${l.y + 1.5}">${ICONO_LUGAR(l)}</text>
      <text class="rotulo-mapa" x="${l.x}" y="${l.y - 7.4}">${esc(l.nombre)}</text>
    </g>`;
  }).join("");

  svg.innerHTML = `
    <rect class="pergamino" x="0" y="0" width="100" height="100"/>
    ${manchas}${turba}${arboles}
    <g class="rosa" transform="translate(90 91)">
      <path d="M0 -5 L1.4 0 L0 5 L-1.4 0 Z"/><path d="M-5 0 L0 1.2 L5 0 L0 -1.2 Z"/>
      <text y="-6.4">N</text>
    </g>
    ${caminos.join("")}${nodos}`;

  for (const g of svg.querySelectorAll("g[data-ir]")) {
    const ir = () => moverA(g.dataset.ir);
    g.addEventListener("click", ir);
    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ir(); }
    });
  }
}

function moverA(id) {
  E.local = id;
  if (!E.visitadas.includes(id)) E.visitadas.push(id);
  guardarEstado();
  pintarTodo();
  irA("escena");
}

function pintarGasto() {
  const g = E.gasto;
  const stt = (g.sttSeg / 3600) * 0.22;
  const cl = (g.entrada / 1e6) * 3 + (g.salida / 1e6) * 15;
  const tts = (g.ttsCar / 1000) * (A.vozModelo === "eleven_flash_v2_5" ? 0.05 : 0.1);
  const t = stt + cl + tts;
  $("#gasto").innerHTML =
    `Transcripción ${Math.round(g.sttSeg)} s · Claude ${g.entrada}+${g.salida} tok · ` +
    `voz ${g.ttsCar} car.<br><b>Estimado: ${t.toFixed(2)} $</b>`;
}

function pintarRegistro() {
  const r = E.registro ?? [];
  $("#registro").innerHTML = r.length
    ? r.slice(-40).map((x) =>
        `<li><span class="tipo">${esc(x.tipo)}</span>${esc(x.que)}</li>`).join("")
    : `<li style="list-style:none;margin-left:-1.4em;color:var(--tiza-baja);font-style:italic">
         Todavía nada. El DJ va anotando aquí lo que pasa.</li>`;
}

function pintarTodo() {
  pintarCabecera(); pintarEscena(); pintarCharla(); pintarGrupo(); pintarBanda();
  pintarMapa(); pintarGasto(); pintarArrancar(); pintarRegistro();
}

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ── Interacciones de grupo y suministros ─────────────────────────────────────
$("#grupo-lista").addEventListener("click", (ev) => {
  const b = ev.target.closest("button");
  if (!b) return;
  if (b.dataset.pg !== undefined) {
    const p = E.partida[+b.dataset.pg];
    p.pg = Math.max(0, Math.min(p.pgMax, p.pg + +b.dataset.d));
  } else if (b.dataset.herida !== undefined) {
    const p = E.partida[+b.dataset.herida];
    const h = CAMPANA.heridas[Math.floor(Math.random() * CAMPANA.heridas.length)];
    p.heridas.push(h);
  } else if (b.dataset.quitar !== undefined) {
    E.partida[+b.dataset.quitar].heridas.splice(+b.dataset.h, 1);
  } else if (b.dataset.agot !== undefined) {
    const p = E.partida[+b.dataset.agot];
    p.agotamiento = Math.max(0, Math.min(6, p.agotamiento + +b.dataset.d));
  } else return;
  guardarEstado(); pintarGrupo(); pintarBanda();
});

$("#sumin").addEventListener("click", (ev) => {
  const b = ev.target.closest("button[data-sum]");
  if (!b) return;
  E.suministros[b.dataset.sum] = Math.max(0, E.suministros[b.dataset.sum] + +b.dataset.d);
  guardarEstado(); pintarGrupo(); pintarBanda();
});

$("#noche-mas").addEventListener("click", () => {
  E.noche = Math.min(CAMPANA.reloj?.noches ?? 0, E.noche + 1);
  guardarEstado(); pintarCabecera();
});
$("#noche-menos").addEventListener("click", () => {
  E.noche = Math.max(0, E.noche - 1);
  guardarEstado(); pintarCabecera();
});

$("#reiniciar").addEventListener("click", () => {
  if (!confirm("¿Empezar la partida de cero? Se pierde el estado actual.")) return;
  E = porDefecto(); guardarEstado(); pintarTodo();
});

// ── Editor del grupo ─────────────────────────────────────────────────────────
// Sin esto, tras la sesión cero la app seguiría mostrando a los cuatro pregenerados mientras
// la mesa juega con sus propios personajes: los PG que se tocan en mesa serían de otra gente.
function pintarEditor() {
  $("#editor-lista").innerHTML = E.partida
    .map(
      (p, i) => `
    <div class="pj-edit">
      <div class="campos">
        <label>Nombre<input data-e="pj" data-i="${i}" value="${esc(p.pj)}" autocomplete="off"></label>
        <label>Clase y nivel<input data-e="clase" data-i="${i}" value="${esc(p.clase)}" autocomplete="off"></label>
      </div>
      <label>Retrato${RETRATOS.length ? "" : " <small>— aún no hay ninguno generado</small>"}
        <select data-e="retrato" data-i="${i}">
          <option value=""${p.retrato ? "" : " selected"}>— sin retrato, con iniciales —</option>
          ${RETRATOS.map(
            (r) => `<option value="${esc(r)}"${p.retrato === r ? " selected" : ""}>${esc(r)}</option>`,
          ).join("")}
        </select></label>
      <div class="numeros">
        <label>PG máx<input data-e="pgMax" data-i="${i}" type="number" inputmode="numeric" min="1" max="200" value="${p.pgMax}"></label>
        <label>PG ahora<input data-e="pg" data-i="${i}" type="number" inputmode="numeric" min="0" max="200" value="${p.pg}"></label>
        <label>CA<input data-e="ca" data-i="${i}" type="number" inputmode="numeric" min="1" max="30" value="${p.ca}"></label>
      </div>
      <button data-borrar="${i}"><span class="icono">✕</span><span>Quitar a ${esc(p.pj)}</span></button>
    </div>`,
    )
    .join("");
}

$("#editar-grupo").addEventListener("click", () => {
  const ed = $("#editor");
  ed.hidden = !ed.hidden;
  if (!ed.hidden) pintarEditor();
});

const cambioEditor = (ev) => {
  const c = ev.target.closest("[data-e]");
  if (!c) return;
  const p = E.partida[+c.dataset.i];
  if (!p) return;

  if (c.dataset.e === "pj" || c.dataset.e === "clase") {
    p[c.dataset.e] = c.value;
  } else if (c.dataset.e === "retrato") {
    // El valor sale del desplegable, que se genera de los ficheros que existen de verdad; se
    // valida igualmente contra la lista para que un estado guardado raro no cuele una ruta.
    p.retrato = RETRATOS.includes(c.value) ? c.value : "";
  } else {
    // Un campo numérico vacío llega como "" y `Number("")` es 0: sin este guardado se
    // pondría el personaje a 0 PG máximos en cuanto alguien borra el número para reescribirlo.
    if (c.value === "") return;
    const n = Math.max(c.dataset.e === "pg" ? 0 : 1, Math.min(200, Math.round(+c.value) || 0));
    p[c.dataset.e] = n;
    if (c.dataset.e === "pgMax" && p.pg > n) p.pg = n;
  }
  guardarEstado();
  pintarGrupo(); pintarBanda(); // el editor no se repinta: reescribirlo perdería el foco al teclear
};
// «input» para los campos de texto y número, «change» para el desplegable del retrato.
$("#editor-lista").addEventListener("input", cambioEditor);
$("#editor-lista").addEventListener("change", cambioEditor);

$("#editor-lista").addEventListener("click", (ev) => {
  const b = ev.target.closest("button[data-borrar]");
  if (!b) return;
  const i = +b.dataset.borrar;
  if (!confirm(`¿Quitar a ${E.partida[i]?.pj} del grupo?`)) return;
  E.partida.splice(i, 1);
  guardarEstado(); pintarEditor(); pintarGrupo(); pintarBanda();
});

$("#anadir-pj").addEventListener("click", () => {
  E.partida.push({ pj: "Nuevo", clase: "Clase 2", pg: 18, pgMax: 18, ca: 14, heridas: [], agotamiento: 0 });
  guardarEstado(); pintarEditor(); pintarGrupo(); pintarBanda();
  $("#editor-lista").lastElementChild?.querySelector("input")?.focus();
});

$("#restaurar-pj").addEventListener("click", () => {
  if (!confirm("¿Volver a los cuatro personajes pregenerados? Se pierden los que hay ahora.")) return;
  E.partida = structuredClone(CAMPANA.partidaInicial);
  guardarEstado(); pintarEditor(); pintarGrupo(); pintarBanda();
});

$("#charla-limpiar").addEventListener("click", () => {
  E.charla = []; guardarEstado(); pintarCharla(); pintarArrancar();
});

$("#gasto-reset").addEventListener("click", () => {
  E.gasto = { sttSeg: 0, entrada: 0, salida: 0, ttsCar: 0 };
  guardarEstado(); pintarGasto();
});

// ── Narración pregenerada ────────────────────────────────────────────────────
{
  const a = $("#esc-audio"), b = $("#acc-narracion");
  b.addEventListener("click", () => {
    if (a.paused) { a.play().catch(() => avisar("No he podido reproducir el audio.")); }
    else a.pause();
  });
  a.addEventListener("play", () => (b.querySelector(".icono").textContent = "❚❚"));
  a.addEventListener("pause", () => (b.querySelector(".icono").textContent = "▶"));
  // Falta el MP3 (aún sin pregenerar, o el service worker no lo tiene en caché). Se dice qué
  // pasa y qué lo arregla: un botón desactivado sin explicación, en mesa, parece la app rota.
  a.addEventListener("error", () => {
    if (!a.getAttribute("src")) return; // escena sin narración: ya viene desactivado
    b.disabled = true;
    b.querySelector("span:last-child").textContent = "Narración sin generar";
    // En la lateral no cabe un párrafo: mensaje corto, y el detalle solo si hace falta.
    $("#esc-nota-audio").textContent = "Narración sin generar. La voz en vivo sí funciona.";
  });
}

// ── Ajustes ──────────────────────────────────────────────────────────────────
$("#clave-11").value = A.clave11;
$("#clave-cl").value = A.claveCl;
$("#modelo").value = A.modelo;
$("#voz-modelo").value = A.vozModelo;
$("#aventura").value = A.aventura;
$("#sesion-cero").checked = !!A.sesionCero;
$("#cachondeo").checked = !!A.cachondeo;
$("#diarizar").checked = !!A.diarizar;

for (const [id, campo] of [["cachondeo", "cachondeo"], ["diarizar", "diarizar"]]) {
  $(`#${id}`).addEventListener("change", (ev) => {
    A[campo] = ev.target.checked;
    guardarAjustes();
    ponEstado("Guardado en este dispositivo.", "ok");
  });
}

// Cambiar de aventura tiene efecto inmediato, sin pasar por «Guardar»: es lo que se espera
// de un selector que reescribe la escena, el mapa y el grupo enteros.
$("#aventura").addEventListener("change", (ev) => cambiarAventura(ev.target.value));

$("#sesion-cero").addEventListener("change", (ev) => {
  A.sesionCero = ev.target.checked;
  guardarAjustes();
  pintarArrancar();
  ponEstado(
    A.sesionCero
      ? "Modo sesión cero. Aprieta el botón de hablar y el DJ empieza por las líneas y velos."
      : "Modo de juego normal.",
    "ok",
  );
});

$("#guardar").addEventListener("click", () => {
  // Se asignan campo a campo en vez de reemplazar A: si se reconstruye el objeto entero se
  // pierde `aventura`, y la app volvería a la aventura por defecto al guardar una clave.
  A.clave11 = $("#clave-11").value.trim();
  A.claveCl = $("#clave-cl").value.trim();
  A.modelo = $("#modelo").value;
  A.vozModelo = $("#voz-modelo").value;
  A.sesionCero = $("#sesion-cero").checked;
  A.cachondeo = $("#cachondeo").checked;
  A.diarizar = $("#diarizar").checked;
  guardarAjustes();
  ponEstado("Guardado en este dispositivo.", "ok");
  actualizarBotonHablar();
});

/**
 * Traduce un fallo a algo accionable. Importa porque este diagnóstico no se pudo
 * probar en el entorno de desarrollo (sin salida a internet desde el navegador):
 * si algo falla en el tablet, este mensaje es la única pista.
 */
function explicar(servicio, estado, excepcion) {
  if (excepcion) {
    return `${servicio} ✗ — no ha salido la petición. Suele ser: sin conexión, o el ` +
      `navegador ha bloqueado la llamada. Prueba en Chrome y con la app abierta por https.`;
  }
  if (estado === 401 || estado === 403) return `${servicio} ✗ — clave rechazada (${estado}). Revísala.`;
  if (estado === 402) return `${servicio} ✗ — sin saldo (402). Recarga en su panel.`;
  if (estado === 429) return `${servicio} ✗ — demasiadas peticiones (429). Espera un momento.`;
  if (estado >= 500) return `${servicio} ✗ — problema del servicio (${estado}). No es tu culpa.`;
  return `${servicio} ✗ (${estado})`;
}

$("#probar").addEventListener("click", async () => {
  if (!A.clave11 && !A.claveCl) { ponEstado("Pon las claves y dale a Guardar primero.", "mal"); return; }
  ponEstado("Comprobando…", "neutro");
  const r = [];

  try {
    const a = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
      headers: { "xi-api-key": A.clave11 },
    });
    if (a.ok) {
      const s = await a.json();
      const quedan = (s.character_limit ?? 0) - (s.character_count ?? 0);
      r.push(`ElevenLabs ✓ (${quedan.toLocaleString("es")} car. disponibles)`);
    } else r.push(explicar("ElevenLabs", a.status));
  } catch (e) { r.push(explicar("ElevenLabs", 0, e)); }

  try {
    const b = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: cabecerasClaude(),
      body: JSON.stringify({
        model: A.modelo, max_tokens: 8,
        messages: [{ role: "user", content: "di solo: ok" }],
      }),
    });
    r.push(b.ok ? `Anthropic ✓ (${A.modelo})` : explicar("Anthropic", b.status));
  } catch (e) { r.push(explicar("Anthropic", 0, e)); }

  const bien = r.every((x) => x.includes("✓"));
  ponEstado(r.join("  ·  "), bien ? "ok" : "mal");
});

function ponEstado(txt, clase) {
  const e = $("#estado-claves");
  e.textContent = txt;
  e.className = `estado-linea ${clase}`;
}
/**
 * Un aviso que se VE, en el panel de abajo, esté la mesa en la pestaña que esté.
 *
 * Antes esto escribía solo en la línea de estado de Ajustes, así que cualquier fallo durante la
 * partida —micrófono denegado, clave rechazada, sin saldo— era un fallo invisible: la app no
 * hacía nada y no decía por qué. Se sigue escribiendo también en Ajustes, que es donde se
 * comprueban las claves.
 */
function avisar(txt) {
  ponEstado(txt, "mal");
  const a = $("#aviso");
  a.textContent = txt;
  a.hidden = false;
}
function limpiarAviso() { $("#aviso").hidden = true; }
$("#aviso").addEventListener("click", limpiarAviso);

function cabecerasClaude() {
  return {
    "x-api-key": A.claveCl,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
    // Sin esta cabecera el navegador no puede llamar a la API de Claude.
    "anthropic-dangerous-direct-browser-access": "true",
  };
}

// ── Voz: micrófono → texto → Claude → voz ────────────────────────────────────
/**
 * El botón FUNCIONA POR TOQUES, no manteniéndolo pulsado, y eso es una corrección.
 *
 * Con mantener-pulsado la primera vez no funcionaba nunca: el navegador abre el diálogo de
 * permiso del micrófono, tú sueltas el botón para poder darle a «Permitir», y cuando
 * `getUserMedia` por fin resuelve ya nadie está pulsando — la grabación arrancaba huérfana y
 * no la paraba nada. Con ratón era aún peor, porque salirse un píxel del botón la cortaba.
 *
 * Tocar para empezar y tocar para enviar se comporta igual con dedo, ratón y teclado, y el
 * permiso se puede pedir tranquilamente antes, en su propio paso.
 *
 * El micro se mantiene abierto entre turnos: pedirlo en cada pregunta añade medio segundo y
 * en algunos navegadores vuelve a preguntar.
 */
const bHablar = $("#hablar"), tHablar = $("#hablar-txt");
let grabadora = null, trozos = [], inicioGrab = 0, ocupado = false;
let micro = null; // MediaStream reutilizado
let cronometro = null;

const TEXTO_DJ = {
  listo: "esperando a la mesa",
  grabando: "escuchando…",
  pensando: "pensando…",
  hablando: "hablando",
};
function modo(m, txt) {
  bHablar.dataset.modo = m;
  tHablar.textContent = txt;
  // El retrato del DJ refleja el mismo estado: en mesa se mira la cara, no el botón.
  $("#dj").dataset.estado = m;
  $("#dj-estado").textContent = TEXTO_DJ[m] ?? m;
  // Cancelar solo tiene sentido mientras hay algo en marcha.
  $("#cancelar").hidden = !(m === "pensando" || m === "hablando");
}
function actualizarBotonHablar() {
  const falta = !A.clave11 || !A.claveCl;
  // Ocupado NO desactiva el botón: mientras piensa sirve para cancelar.
  bHablar.disabled = falta;
  if (falta) return modo("listo", "Pon las claves en Ajustes");
  if (ocupado) return;
  modo("listo", grabadora ? "Enviar" : "Toca para hablar");
}

/** Pide el micrófono una vez y se queda con el flujo. Devuelve null si no se puede. */
async function pedirMicro() {
  if (micro?.active) return micro;
  if (!navigator.mediaDevices?.getUserMedia) {
    avisar(
      "Este navegador no da acceso al micrófono. Suele ser porque la página no está en https. " +
        "Escribe tu turno en el recuadro de abajo mientras lo arreglamos.",
    );
    return null;
  }
  try {
    micro = await navigator.mediaDevices.getUserMedia({ audio: true });
    return micro;
  } catch (e) {
    // Distinguir los tres fallos: el navegador los llama distinto y se arreglan distinto.
    const n = e?.name ?? "";
    avisar(
      n === "NotAllowedError"
        ? "Has denegado el micrófono (o el navegador lo bloquea). Toca el candado de la barra de " +
            "direcciones, permite el micrófono y recarga. Mientras, escribe tu turno abajo."
        : n === "NotFoundError"
          ? "No encuentro ningún micrófono conectado. Escribe tu turno abajo."
          : `No he podido abrir el micrófono (${n || "error desconocido"}). Escribe tu turno abajo.`,
    );
    return null;
  }
}

async function empezarGrabacion() {
  const stream = await pedirMicro();
  if (!stream) return;
  trozos = [];
  grabadora = new MediaRecorder(stream);
  grabadora.ondataavailable = (e) => e.data.size && trozos.push(e.data);
  grabadora.onstop = () => procesar(new Blob(trozos, { type: grabadora?.mimeType || "audio/webm" }));
  grabadora.start();
  inicioGrab = Date.now();
  modo("grabando", "Grabando 0 s · toca para enviar");
  cronometro = setInterval(() => {
    modo("grabando", `Grabando ${Math.round((Date.now() - inicioGrab) / 1000)} s · toca para enviar`);
  }, 1000);
  if (navigator.vibrate) navigator.vibrate(18);
}

function pararGrabacion() {
  clearInterval(cronometro);
  const g = grabadora;
  grabadora = null;
  if (g?.state === "recording") g.stop();
  else actualizarBotonHablar();
}

bHablar.addEventListener("click", () => {
  // Mientras piensa o habla, el botón CANCELA. Es la salida cuando algo tarda demasiado, y
  // evita el único estado del que antes no se podía salir sin recargar la página.
  if (ocupado) {
    cola?.cortar();
    enCurso?.ac.abort(new Error("cancelado por la mesa"));
    return;
  }
  if (bHablar.disabled) return;
  grabadora ? pararGrabacion() : empezarGrabacion();
});

// ── Repetir lo que dijo el DJ ────────────────────────────────────────────────
// Un icono por mensaje. En mesa se pierde una frase constantemente —alguien tosió, alguien
// preguntó algo— y hasta ahora la única forma de recuperarla era leerla.
let colaRepe = null;

function pararRepeticion() {
  colaRepe?.cortar();
  colaRepe = null;
  for (const b of document.querySelectorAll("button[data-repetir]")) b.dataset.suena = "no";
}

async function repetir(indice, boton) {
  // Si ya está sonando esa misma, el botón para. Un icono que solo empieza es medio icono.
  if (boton.dataset.suena === "si") { pararRepeticion(); return; }
  pararRepeticion();
  if (!A.clave11) { avisar("Falta la clave de ElevenLabs en Ajustes para repetir en voz."); return; }
  const t = E.charla[indice];
  if (!t?.texto) return;

  boton.dataset.suena = "si";
  const c = new ColaVoz(actual().voz ?? "narrador");
  colaRepe = c;
  // Se trocea por frases igual que al hablar: así empieza a sonar sin esperar el párrafo entero.
  for (const frase of t.texto.split(/(?<=[.!?…])\s+/)) if (frase.trim()) c.encolar(frase.trim());
  try { await c.terminar(); } finally {
    if (colaRepe === c) colaRepe = null;
    boton.dataset.suena = "no";
    if (c.fallo) avisar(c.fallo);
  }
}

$("#charla").addEventListener("click", (ev) => {
  const b = ev.target.closest("button[data-repetir]");
  if (b) repetir(+b.dataset.repetir, b);
});

// ── Cancelar ─────────────────────────────────────────────────────────────────
// Botón propio y visible. Antes cancelar era «vuelve a tocar el botón de hablar», que nadie
// adivina y que además no se distinguía de empezar a grabar otra vez.
$("#cancelar").addEventListener("click", () => {
  pararRepeticion();
  if (!ocupado) return;
  cola?.cortar();
  enCurso?.ac.abort(new Error("cancelado por la mesa"));
});

// ── Cantar una tirada ────────────────────────────────────────────────────────
// Es lo que más se hace en mesa, y dictar números por voz es justo lo que peor transcribe.
$("#tirada-forma").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const c = $("#tirada");
  const n = c.value.trim();
  if (!n || ocupado) return;
  if (!A.claveCl) { avisar("Falta la clave de Anthropic en Ajustes."); return; }
  c.value = "";
  await turno(null, 0, `Hemos tirado y sale ${n}.`);
});

// ── Gastar una antorcha ──────────────────────────────────────────────────────
$("#acc-antorcha").addEventListener("click", () => {
  const k = Object.keys(E.suministros).find((x) => /antorcha/i.test(x));
  if (!k) return;
  if (E.suministros[k] <= 0) { avisar("No quedan antorchas. A oscuras: desventaja en todo."); return; }
  E.suministros[k]--;
  guardarEstado(); pintarGrupo();
  if (E.suministros[k] === 0) avisar("Era la última antorcha.");
});

// ── Escribir el turno, en vez de hablarlo ────────────────────────────────────
// No es un adorno: si el micrófono falla —permiso denegado, sin https, portátil sin micro— sin
// esto no se puede jugar en absoluto. Y para dictar nombres propios va mejor.
$("#escribir-forma").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const c = $("#escribir");
  const texto = c.value.trim();
  if (!texto || ocupado) return;
  if (!A.claveCl) { avisar("Falta la clave de Anthropic en Ajustes."); return; }
  c.value = "";
  await turno(null, 0, texto);
});

// ── Botón de empezar ─────────────────────────────────────────────────────────
// Antes había que adivinar que el arranque era mantener pulsado el botón de hablar y decir algo.
// Esto manda el primer turno ya escrito, así que la partida empieza con un toque y sin micrófono.
function pintarArrancar() {
  const cero = !!A.sesionCero;
  $("#arrancar-txt").textContent = cero ? "Empezar la sesión cero" : "Empezar la escena";
  $("#arrancar").hidden = E.charla.length > 0;
}

$("#arrancar").addEventListener("click", async () => {
  if (ocupado) return;
  if (!A.claveCl) { avisar("Falta la clave de Anthropic en Ajustes."); return; }
  await turno(
    null,
    0,
    A.sesionCero
      ? "Somos la mesa y es nuestra primera vez. Empieza la sesión cero por el paso uno."
      : "Empezamos. Descríbenos la escena y qué vemos.",
  );
});

async function procesar(blob) {
  const segundos = (Date.now() - inicioGrab) / 1000;
  if (segundos < 0.4) {
    avisar("Ha sido demasiado corto. Toca, habla, y vuelve a tocar para enviar.");
    actualizarBotonHablar();
    return;
  }
  await turno(blob, segundos);
}

/**
 * Aborta una petición que no contesta.
 *
 * Sin esto, un `fetch` que se queda colgado —wifi de mesa que se cae a medias, servicio que no
 * responde— dejaba `ocupado` en true PARA SIEMPRE: el botón de hablar, el recuadro de escribir y
 * el de empezar quedaban muertos y la única salida era recargar la página. Era el fallo que
 * hacía parecer que el micrófono no funcionaba.
 */
function conLimite(ms, queEs) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(new Error(`${queEs} no ha contestado en ${ms / 1000} s`)), ms);
  return { señal: ac.signal, listo: () => clearTimeout(t), abortar: () => ac.abort(), ac };
}

/** Petición en curso, para poder cancelarla desde el botón. */
let enCurso = null;
let cola = null;

/**
 * Reconstruye el diálogo por hablantes a partir de la respuesta de Scribe con diarización.
 *
 * Scribe devuelve palabras con `speaker_id`, no frases por persona, así que hay que agrupar
 * los tramos consecutivos del mismo hablante. Los identificadores son anónimos (speaker_0,
 * speaker_1…): no sabe QUIÉN es cada uno, solo que son distintos. Se numeran «Voz 1», «Voz 2»
 * y el DJ ya los cruza con los nombres del grupo por lo que dicen.
 */
function porHablantes(tr) {
  const palabras = tr.words?.filter((w) => w.text?.trim());
  if (!palabras?.length) return tr.text?.trim() ?? "";

  const etiquetas = new Map();
  const tramos = [];
  for (const w of palabras) {
    const id = w.speaker_id ?? "speaker_0";
    if (!etiquetas.has(id)) etiquetas.set(id, `Voz ${etiquetas.size + 1}`);
    const ult = tramos[tramos.length - 1];
    if (ult && ult.id === id) ult.texto += (w.type === "spacing" ? "" : " ") + w.text.trim();
    else tramos.push({ id, texto: w.text.trim() });
  }
  // Con un solo hablante no se etiqueta nada: «Voz 1: hola» leído por el DJ suena a robot.
  if (etiquetas.size < 2) return tramos.map((t) => t.texto).join(" ").replace(/\s+/g, " ").trim();
  return tramos
    .map((t) => `${etiquetas.get(t.id)}: ${t.texto.replace(/\s+/g, " ").trim()}`)
    .join("\n");
}

/** Envía un turno a Claude: desde el micrófono (blob) o escrito (texto). */
async function turno(blob, segundos, textoEscrito) {
  limpiarAviso();
  ocupado = true;
  modo("pensando", (textoEscrito ? "Pensando…" : "Transcribiendo…") + " · toca para cancelar");
  actualizarBotonHablar();
  try {
    let dicho = textoEscrito?.trim();

    // 1. Lo que habéis dicho → texto (si vino por voz)
    if (!dicho) {
      const fd = new FormData();
      fd.append("file", blob, "voz.webm");
      fd.append("model_id", "scribe_v1");
      fd.append("language_code", "spa");
      if (A.diarizar) fd.append("diarize", "true");
      const lim = conLimite(30_000, "la transcripción");
      enCurso = lim;
      const rs = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
        method: "POST", headers: { "xi-api-key": A.clave11 }, body: fd, signal: lim.señal,
      }).finally(lim.listo);
      if (!rs.ok) throw new Error(`no he podido transcribir. ${explicar("ElevenLabs", rs.status)}`);
      const tr = await rs.json();
      dicho = A.diarizar ? porHablantes(tr) : tr.text?.trim();
      E.gasto.sttSeg += segundos;
      if (!dicho) throw new Error("no he entendido nada. Prueba a hablar más cerca, o escríbelo abajo");
    }

    E.charla.push({ de: "mesa", texto: dicho });
    guardarEstado(); pintarCharla(); pintarArrancar();

    // 2. Claude responde, en streaming, y se va troceando por frases para que
    //    la voz empiece antes de que termine de escribir.
    modo("pensando", "Pensando…");
    cola = new ColaVoz(actual().voz ?? "narrador");
    let respuesta = "";
    let pendiente = "";

    const res = await claudeStream(dicho, (t) => {
      respuesta += t;
      pendiente += t;
      const corte = pendiente.search(/[.!?…]["»]?\s/);
      if (corte > 20) {
        const frase = pendiente.slice(0, corte + 1).trim();
        pendiente = pendiente.slice(corte + 1);
        cola.encolar(frase);
        modo("hablando", "Hablando… · toca para cancelar");
      }
    });
    if (pendiente.trim()) cola.encolar(pendiente.trim());
    const { cortado, hechos } = res;

    E.charla.push({
      de: "dj",
      texto: respuesta.trim() || "(silencio)",
      // Lo que el DJ ha CAMBIADO se guarda con su turno y se ve bajo él. Es la única forma de
      // auditarle: un DJ que toca los números sin decirlo es peor que uno que no los toca.
      // Se copia el array, no se referencia: `E.hechos` se vacía en el turno siguiente.
      ...(hechos?.length ? { hechos: [...hechos] } : {}),
    });
    guardarEstado(); pintarTodo();
    if (cortado) {
      avisar('El DJ se ha quedado a media frase por el límite de longitud. Dile «sigue» y remata.');
    }

    modo("hablando", "Hablando… · toca para cancelar");
    await cola.terminar();
    if (cola.fallo) avisar(cola.fallo);
  } catch (e) {
    const m = e?.name === "AbortError" ? (e.message || "cancelado") : e.message;
    avisar(`No ha salido: ${m}`);
  } finally {
    ocupado = false;
    enCurso = null;
    cola = null;
    actualizarBotonHablar();
  }
}


// ── Ejecutar lo que pide el DJ ───────────────────────────────────────────────
/** Busca un personaje por nombre, tolerando mayúsculas y acentos. */
function buscarPj(nombre) {
  const norm = (x) =>
    String(x ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const n = norm(nombre);
  return (
    E.partida.find((p) => norm(p.pj) === n) ??
    E.partida.find((p) => norm(p.pj).startsWith(n) || n.startsWith(norm(p.pj)))
  );
}

/** Apunta en el registro de la sesión. Es la base del resumen del final. */
function registrar(tipo, que, pj) {
  E.registro ??= [];
  E.registro.push({ n: E.registro.length + 1, tipo, que, pj: pj ?? null, escena: E.local });
}

/**
 * Ejecuta una herramienta y devuelve lo que se le contesta al DJ.
 *
 * Devuelve SIEMPRE un texto, también cuando falla: si se le contesta con un error claro
 * («no existe ningún personaje llamado así»), lo corrige en el mismo turno. Si se le lanza una
 * excepción, la conversación se rompe y la mesa no sabe por qué.
 */
function ejecutarHerramienta(nombre, e) {
  const nota = (t) => { E.hechos ??= []; E.hechos.push(t); return t; };

  if (nombre === "cambiar_pg") {
    const p = buscarPj(e.pj);
    if (!p) return `No hay ningún personaje llamado "${e.pj}". El grupo es: ${E.partida.map((x) => x.pj).join(", ")}.`;
    const antes = p.pg;
    p.pg = Math.max(0, Math.min(p.pgMax, p.pg + (e.delta | 0)));
    registrar("tirada", `${p.pj}: ${antes} → ${p.pg} PG (${e.motivo})`, p.pj);
    const cae = p.pg === 0 && antes > 0;
    return nota(
      `${p.pj}: ${antes} → ${p.pg} de ${p.pgMax} PG.` +
        (cae ? " Ha caído a 0: inconsciente y agonizante, y toca tirar herida persistente." : ""),
    );
  }

  if (nombre === "anadir_herida") {
    const p = buscarPj(e.pj);
    if (!p) return `No hay ningún personaje llamado "${e.pj}".`;
    const h = e.herida?.trim() || CAMPANA.heridas[Math.floor(Math.random() * CAMPANA.heridas.length)];
    p.heridas.push(h);
    registrar("herida", `${p.pj} — ${h}`, p.pj);
    return nota(`${p.pj} se queda con «${h}». No se cura con conjuros: semana de reposo o Medicina 16.`);
  }

  if (nombre === "cambiar_agotamiento") {
    const p = buscarPj(e.pj);
    if (!p) return `No hay ningún personaje llamado "${e.pj}".`;
    const antes = p.agotamiento ?? 0;
    p.agotamiento = Math.max(0, Math.min(6, antes + (e.delta | 0)));
    registrar("otro", `${p.pj}: agotamiento ${antes} → ${p.agotamiento} (${e.motivo})`, p.pj);
    return nota(
      `${p.pj}: agotamiento ${antes} → ${p.agotamiento} de 6.` +
        (p.agotamiento >= 6 ? " A seis, muere." : ""),
    );
  }

  if (nombre === "gastar_suministro") {
    // Se acepta cualquier forma de escribirlo: «antorcha», «antorchas», «Antorchas».
    const clave = Object.keys(E.suministros).find(
      (k) => k.toLowerCase().startsWith(String(e.que ?? "").toLowerCase().slice(0, 4)),
    );
    if (!clave) return `No hay un suministro llamado "${e.que}". Hay: ${Object.keys(E.suministros).join(", ")}.`;
    const antes = E.suministros[clave];
    E.suministros[clave] = Math.max(0, antes + (e.delta | 0));
    registrar("otro", `${clave}: ${antes} → ${E.suministros[clave]}`);
    return nota(
      `${clave}: ${antes} → ${E.suministros[clave]}.` +
        (E.suministros[clave] === 0 ? " Se han agotado." : ""),
    );
  }

  if (nombre === "mover_escena") {
    const l = CAMPANA.localizaciones.find(
      (x) => x.id.toLowerCase() === String(e.id ?? "").toLowerCase(),
    );
    if (!l) return `No existe "${e.id}". Las localizaciones son: ${CAMPANA.localizaciones.map((x) => x.id).join(", ")}.`;
    E.local = l.id;
    if (!E.visitadas.includes(l.id)) E.visitadas.push(l.id);
    registrar("otro", `El grupo se mueve a ${l.id} · ${l.nombre}`);
    return nota(`La pantalla ya muestra ${l.id} · ${l.nombre}.`);
  }

  if (nombre === "avanzar_noche") {
    if (!CAMPANA.reloj) return "Esta aventura no lleva reloj de noches.";
    const antes = E.noche;
    E.noche = Math.min(CAMPANA.reloj.noches, antes + 1);
    registrar("otro", `Cae la noche: ${antes} → ${E.noche}`);
    const quedan = CAMPANA.reloj.noches - E.noche;
    return nota(
      `Noche ${E.noche}. ` + (quedan <= 0 ? `Es ${CAMPANA.reloj.etiqueta}.` : `Quedan ${quedan}.`),
    );
  }

  if (nombre === "escribir_ficha") {
    const pgMax = Math.max(1, Math.min(200, e.pgMax | 0));
    const ca = Math.max(1, Math.min(30, e.ca | 0));
    const retrato = RETRATOS.includes(e.retrato) ? e.retrato : undefined;
    let p = buscarPj(e.pj);
    if (p) {
      Object.assign(p, { pj: e.pj, clase: e.clase, pgMax, ca });
      // Los PG actuales se respetan salvo que pasen del nuevo máximo: si está herido, sigue herido.
      p.pg = Math.min(p.pg, pgMax);
      if (retrato) p.retrato = retrato;
      if (e.notas) p.notas = e.notas;
      registrar("otro", `Ficha actualizada: ${p.pj} (${p.clase})`, p.pj);
      return nota(`Ficha de ${p.pj} actualizada: ${p.clase}, ${p.pg}/${pgMax} PG, CA ${ca}.`);
    }
    p = {
      pj: e.pj, clase: e.clase, pg: pgMax, pgMax, ca,
      heridas: [], agotamiento: 0, ...(retrato ? { retrato } : {}), ...(e.notas ? { notas: e.notas } : {}),
    };
    E.partida.push(p);
    registrar("otro", `Ficha nueva: ${p.pj} (${p.clase})`, p.pj);
    return nota(
      `${p.pj} entra en el grupo: ${p.clase}, ${pgMax} PG, CA ${ca}.` +
        (retrato ? "" : ` Sin retrato todavía — los disponibles son: ${RETRATOS.join(", ") || "ninguno"}.`),
    );
  }

  if (nombre === "equipar") {
    const p = buscarPj(e.pj);
    if (!p) return `No hay ningún personaje llamado "${e.pj}".`;
    if (!HUECOS.some((h) => h.k === e.hueco)) {
      return `"${e.hueco}" no es un hueco. Son: ${HUECOS.map((h) => h.k).join(", ")}.`;
    }
    p.equipo ??= {};
    const antes = p.equipo[e.hueco];
    p.equipo[e.hueco] = (e.objeto ?? "").trim();
    const h = HUECOS.find((x) => x.k === e.hueco).n.toLowerCase();
    registrar("otro", `${p.pj}: ${h} → ${p.equipo[e.hueco] || "(vacío)"}`, p.pj);
    return nota(
      p.equipo[e.hueco]
        ? `${p.pj} lleva ${p.equipo[e.hueco]} en ${h}${antes ? ` (antes: ${antes})` : ""}.`
        : `${p.pj} se queda con ${h} libre.`,
    );
  }

  if (nombre === "escribir_entrevista") {
    const p = buscarPj(e.pj);
    if (!p) return `No hay ningún personaje llamado "${e.pj}".`;
    p.ficha ??= {};
    let n = 0;
    for (const c of ENTREVISTA) {
      if (e[c.k]?.trim()) { p.ficha[c.k] = e[c.k].trim(); n++; }
    }
    if (e.pulla?.trim()) p.pulla = e.pulla.trim();
    registrar("otro", `Entrevista de ${p.pj} apuntada`, p.pj);
    return nota(`Ficha de ${p.pj}: ${n} respuesta(s) guardadas${e.pulla ? " y la pulla" : ""}.`);
  }

  if (nombre === "registrar_accion") {
    registrar(e.tipo ?? "otro", e.que, e.pj);
    return "Anotado.";
  }

  return `No tengo ninguna herramienta llamada "${nombre}".`;
}

/**
 * Llama a Claude en streaming, ejecuta las herramientas que pida, y va entregando el texto.
 *
 * El bucle es lo que convierte al DJ en algo que ACTÚA: pide una herramienta, se ejecuta contra
 * el estado, se le devuelve el resultado, y se le vuelve a preguntar hasta que ya no pide más.
 * Sin el bucle solo podría pedir una cosa por turno, y un combate normal necesita bajar vida,
 * apuntar una herida y anotar la acción en el mismo turno.
 *
 * Devuelve { cortado, hechos } — `hechos` es lo que ha cambiado, para poder enseñárselo a la mesa.
 */
async function claudeStream(pregunta, alRecibir) {
  let cortado = false;
  E.hechos = [];

  const contexto = () => {
    const l = actual();
    const grupo = E.partida
      .map((p) => `${p.pj} (${p.clase}, ${p.pg}/${p.pgMax} PG, CA ${p.ca}${
        p.heridas.length ? ", herido: " + p.heridas.join(" y ") : ""
      }${p.agotamiento ? ", agotamiento " + p.agotamiento : ""})`)
      .join("; ");

    // En sesión cero no se manda escena ni reloj: si se manda, el DJ empieza a describir la
    // localización en vez de crear personajes, por muy claro que sea el resto del prompt.
    return (
      A.sesionCero
        ? [
            "Aún no ha empezado la partida: estás en sesión cero.",
            `Grupo actual (pregenerados, a sustituir con escribir_ficha): ${grupo}.`,
            `Retratos ya generados y disponibles: ${RETRATOS.join(", ") || "ninguno"}.`,
          ]
        : [
            `Escena actual: ${l.id} · ${l.nombre}.`,
            l.sabeis?.length ? `Lo que la mesa ya sabe: ${l.sabeis.join(" ")}` : "",
            CAMPANA.reloj
              ? `Noche ${E.noche} de ${CAMPANA.reloj.noches} hasta ${CAMPANA.reloj.etiqueta}.`
              : "",
            `Grupo: ${grupo}.`,
            `Suministros: ${Object.entries(E.suministros).map(([k, v]) => `${k} ${v}`).join(", ")}.`,
            `Localizaciones a las que puedes mover: ${CAMPANA.localizaciones.map((x) => x.id).join(", ")}.`,
          ]
    ).filter(Boolean).join("\n");
  };

  const historial = E.charla.slice(-8).map((t) => ({
    role: t.de === "mesa" ? "user" : "assistant",
    content: t.texto,
  }));
  const mensajes = [...historial, { role: "user", content: pregunta }];

  const lim = conLimite(120_000, "el DJ");
  enCurso = lim;

  try {
    // Hasta 6 vueltas. Es de sobra para un turno de mesa y es el tope que evita que un bucle
    // de herramientas se coma el saldo sin que nadie lo pare.
    for (let vuelta = 0; vuelta < 6; vuelta++) {
      const cuerpo = {
        model: A.modelo,
        max_tokens: A.sesionCero ? 1400 : 700,
        stream: true,
        tools: HERRAMIENTAS,
        system: [
          {
            type: "text",
            text: [
              GUIA,
              GUIA_HERRAMIENTAS,
              A.cachondeo ? GUIA_CACHONDEO : "",
              A.sesionCero ? GUIA_CERO : TRAMA[A.aventura],
            ].filter(Boolean).join("\n\n"),
            cache_control: { type: "ephemeral" },
          },
          { type: "text", text: contexto() },
        ],
        messages: mensajes,
      };
      // Sonnet 5 y Opus 5 piensan por defecto; en voz eso añade segundos.
      if (/sonnet-5|opus-5/.test(A.modelo)) cuerpo.thinking = { type: "disabled" };

      const primerByte = setTimeout(
        () => lim.ac.abort(new Error("el DJ no ha contestado en 25 s")), 25_000,
      );

      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: cabecerasClaude(), body: JSON.stringify(cuerpo), signal: lim.señal,
      }).catch((e) => {
        clearTimeout(primerByte);
        throw new Error(
          e?.name === "AbortError" ? String(e.message || "cancelado") : explicar("Claude", 0, e),
        );
      });
      clearTimeout(primerByte);

      if (!r.ok) {
        const d = await r.text().catch(() => "");
        throw new Error(`${explicar("Claude", r.status)}${d.includes("credit") ? " Sin saldo." : ""}`);
      }

      // Se van montando los bloques por índice: el texto llega en trozos y el JSON de cada
      // herramienta también, así que no se puede parsear hasta que el bloque termina.
      const bloques = new Map();
      let motivo = null;
      const lector = r.body.getReader(), dec = new TextDecoder();
      let resto = "";

      while (true) {
        const { done, value } = await lector.read();
        if (done) break;
        resto += dec.decode(value, { stream: true });
        const lineas = resto.split("\n");
        resto = lineas.pop() ?? "";
        for (const linea of lineas) {
          if (!linea.startsWith("data:")) continue;
          let ev; try { ev = JSON.parse(linea.slice(5).trim()); } catch { continue; }

          if (ev.type === "content_block_start") {
            bloques.set(ev.index, { tipo: ev.content_block?.type, cb: ev.content_block, json: "" });
          } else if (ev.type === "content_block_delta") {
            const b = bloques.get(ev.index);
            if (ev.delta?.type === "text_delta") alRecibir(ev.delta.text);
            else if (ev.delta?.type === "input_json_delta" && b) b.json += ev.delta.partial_json ?? "";
          } else if (ev.type === "message_start") {
            E.gasto.entrada += ev.message?.usage?.input_tokens ?? 0;
          } else if (ev.type === "message_delta") {
            E.gasto.salida += ev.usage?.output_tokens ?? 0;
            motivo = ev.delta?.stop_reason ?? motivo;
            if (motivo === "max_tokens") cortado = true;
          }
        }
      }

      const usos = [...bloques.values()].filter((b) => b.tipo === "tool_use");
      if (motivo !== "tool_use" || !usos.length) return { cortado, hechos: E.hechos };

      // Se reconstruye el turno del asistente TAL COMO LLEGÓ —texto y peticiones— porque la API
      // exige que cada tool_use tenga su tool_result en el mensaje siguiente.
      const contenidoAsistente = [...bloques.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, b]) =>
          b.tipo === "tool_use"
            ? { type: "tool_use", id: b.cb.id, name: b.cb.name, input: parsearJson(b.json) }
            : { type: "text", text: b.cb?.text ?? "" },
        )
        .filter((x) => x.type === "tool_use" || x.text);

      mensajes.push({ role: "assistant", content: contenidoAsistente });
      mensajes.push({
        role: "user",
        content: usos.map((b) => ({
          type: "tool_result",
          tool_use_id: b.cb.id,
          content: ejecutarHerramienta(b.cb.name, parsearJson(b.json)),
        })),
      });

      guardarEstado();
      pintarTodo();
    }
    return { cortado, hechos: E.hechos };
  } finally {
    lim.listo();
  }
}

/** El JSON de una herramienta puede llegar vacío si no tenía argumentos. */
function parsearJson(t) {
  if (!t?.trim()) return {};
  try { return JSON.parse(t); } catch { return {}; }
}

/** Convierte frases en voz y las reproduce en orden, sin solaparse. */
class ColaVoz {
  constructor(rol) {
    this.voz = VOZ[rol] ?? VOZ.narrador;
    this.cadena = Promise.resolve();
  }
  encolar(frase) {
    if (!frase) return;
    const pedir = this.sintetizar(frase); // arranca ya, en paralelo
    this.cadena = this.cadena.then(async () => {
      const url = await pedir;
      if (!url || this.cortada) { if (url) URL.revokeObjectURL(url); return; }
      await this.reproducir(url);
    });
  }

  /** Reproduce y se guarda el audio en curso, para poder callar al cancelar. */
  reproducir(url) {
    return new Promise((res) => {
      const a = new Audio(url);
      this.suena = a;
      const fin = () => { URL.revokeObjectURL(url); if (this.suena === a) this.suena = null; res(); };
      a.onended = fin; a.onerror = fin;
      a.play().catch(fin);
    });
  }

  /** Callar ya: para lo que suena y descarta lo que quedaba en la cola. */
  cortar() {
    this.cortada = true;
    if (this.suena) { this.suena.pause(); this.suena = null; }
  }
  async sintetizar(texto) {
    // Con límite, y si falla se devuelve null: la frase se queda sin voz pero el texto ya está
    // en la conversación, así que la partida sigue. Una frase muda es mucho mejor que colgarse.
    const lim = conLimite(25_000, "la voz");
    try {
      const r = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${this.voz}?output_format=mp3_22050_32`,
        {
          method: "POST",
          headers: { "xi-api-key": A.clave11, "content-type": "application/json" },
          body: JSON.stringify({
            text: texto, model_id: A.vozModelo, language_code: "es",
            voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3 },
          }),
          signal: lim.señal,
        },
      );
      if (!r.ok) {
        this.fallo ??= explicar("ElevenLabs", r.status);
        return null;
      }
      E.gasto.ttsCar += texto.length;
      return URL.createObjectURL(await r.blob());
    } catch (e) {
      this.fallo ??= `la voz no ha salido (${e?.name ?? "error"}). El texto sí está arriba.`;
      return null;
    } finally {
      lim.listo();
    }
  }
  terminar() { return this.cadena; }
}


// ── Arranque ─────────────────────────────────────────────────────────────────
pintarTodo();
actualizarBotonHablar();
irA(location.hash.slice(1) || "escena", false);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
