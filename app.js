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
import { pintarMapaEn } from "./mapa.js";
import { iconoObjeto } from "./objetos.js";
import { figura, HUECOS_FIGURA, LIENZO, marcoHueco, interiorHueco } from "./figura.js";
import { accionesDe, COMUNES, COSTES } from "./acciones.js";

/**
 * El muñeco de equipo lo dibuja `app/figura.js`: un cuerpo con volumen y **marcos cuadrados**
 * en dos columnas, como el inventario de Diablo III.
 *
 * Antes eran once círculos pegados a una silueta de líneas, y se rechazó dos veces en mesa. Las
 * coordenadas y el marco vienen del módulo; aquí solo se decide qué va dentro de cada hueco y en
 * qué estado está.
 */

/**
 * Un objeto de equipo es `{n, ca, dano, nota}`, pero también puede ser **texto pelado**: así se
 * guardaba antes, y hay partidas por ahí con esa forma. Todo el que lea equipo pasa por aquí en
 * vez de mirar el valor a pelo, o una partida vieja peta al abrir la ficha.
 *
 * Devuelve `null` para un hueco vacío, para poder escribir `if (!objDe(v))`.
 */
const objDe = (v) => {
  if (typeof v === "string") return v.trim() ? { n: v.trim() } : null;
  return v?.n?.trim() ? v : null;
};
const nombreObj = (v) => objDe(v)?.n ?? "";

/**
 * La CA es **derivada**: base de la ficha más lo que sume lo que lleva puesto.
 *
 * Se calcula cada vez en vez de acumularse en `p.ca`, porque acumular al equipar significa que
 * ponerse y quitarse la misma coraza tres veces deja la CA distinta de donde empezó. Y el desglose
 * se muestra en la ficha, así que si el DJ suma dos veces la misma armadura se ve en pantalla.
 *
 * `caBase` es la CA sin equipo. Si no está —fichas de antes— se usa `p.ca`, así que una partida
 * guardada abre con la misma CA que tenía y solo cambia cuando el DJ equipa algo con bonificador.
 */
const bonosCa = (p) =>
  Object.values(p.equipo ?? {}).reduce((t, v) => t + (Number(objDe(v)?.ca) || 0), 0);
const caBaseDe = (p) => Number(p.caBase ?? p.ca) || 10;
const caDe = (p) => caBaseDe(p) + bonosCa(p);

/** «+2 CA · 1d8+2», para pintarlo junto al objeto. Cadena vacía si el objeto no bonifica nada. */
const bonoTexto = (o) => {
  const t = [];
  if (Number(o?.ca)) t.push(`${Number(o.ca) > 0 ? "+" : ""}${Number(o.ca)} CA`);
  if (o?.dano?.trim()) t.push(o.dano.trim());
  return t.length ? ` ${t.join(" · ")}` : "";
};

/** Lo que hace daño de lo que lleva encima, para tenerlo a mano en la ficha. */
const armasDe = (p) =>
  Object.entries(p.equipo ?? {})
    .map(([k, v]) => ({ hueco: k, ...objDe(v) }))
    .filter((o) => o.n && o.dano);

/**
 * Lo que está «en la mano» mientras se mueve equipo: `{tipo:"bolsa"|"hueco", i, j|hueco, obj}`.
 * Vive fuera de la ficha porque la ficha se repinta entera a cada toque.
 */
let cogido = null;

/**
 * Dibuja el muñeco con lo que lleva puesto en cada hueco.
 *
 * El nombre de la pieza va DEBAJO de su marco y solo cuando lleva algo: el hueco vacío ya dice
 * qué es con su icono apagado, y un rótulo por hueco eran once palabras que no hacían falta.
 */
function pintarMuneco(p, i) {
  const eq = p.equipo ?? {};
  const puntos = HUECOS_FIGURA.map((h, n) => {
    const o = objDe(eq[h.k]);
    const puesto = !!o;
    const nom = HUECOS.find((x) => x.k === h.k);
    const enMano = cogido?.tipo === "hueco" && cogido.i === i && cogido.hueco === h.k;
    // Un hueco donde cabe lo que se ha cogido se resalta: con once marcos hay que ver de un
    // vistazo dónde se puede soltar.
    const libre = !!cogido && cogido.i === i && !enMano;

    // El icono se escala al hueco libre que deja el marco, conservando proporción y centrado.
    const d = interiorHueco(h);
    const lado = Math.min(d.w, d.h);
    const ix = d.x + (d.w - lado) / 2, iy = d.y + (d.h - lado) / 2;

    return `<g class="ranura${puesto ? " puesta" : ""}${enMano ? " enmano" : ""}${
      libre ? " destino" : ""}" data-hueco="${h.k}" data-i="${i}"
               role="button" tabindex="0"
               aria-label="${nom?.n ?? h.k}: ${puesto ? esc(o.n) + bonoTexto(o) : "vacío"}">
      ${marcoHueco(h.x, h.y, h.w, h.h, { sufijo: `p${i}`, defs: n === 0 })}
      <g class="ico-hueco"
         transform="translate(${ix.toFixed(1)} ${iy.toFixed(1)}) scale(${(lado / 100).toFixed(4)})"
        >${iconoObjeto(puesto ? o.n : nom?.ej ?? "fardo",
                       { sufijo: `p${i}-${h.k}`, sombra: false })}</g>
      <rect class="marca-estado" x="${h.x}" y="${h.y}" width="${h.w}" height="${h.h}"/>
    </g>`;
  }).join("");

  // Los nombres NO van sobre el muñeco. Con los marcos en dos columnas pegados a los cantos, un
  // rótulo centrado debajo se sale del lienzo por un lado y choca con el marco de abajo por el
  // otro; y en la referencia el muñeco es solo iconos. Aquí va la lista de lo que lleva puesto,
  // que además se lee mucho mejor que once textos de once píxeles.
  const puestas = HUECOS_FIGURA
    .map((h) => ({ h, o: objDe(p.equipo?.[h.k]) }))
    .filter((x) => x.o)
    .map(({ h, o }) => {
      const nom = HUECOS.find((x) => x.k === h.k);
      return `<li><span class="dónde">${esc(nom?.n ?? h.k)}</span>
        <b>${esc(o.n)}</b>${bonoTexto(o) ? `<em>${esc(bonoTexto(o).trim())}</em>` : ""}</li>`;
    })
    .join("");

  const mochila = (p.mochila ?? []).map(objDe).filter(Boolean);
  return `
    <div class="muneco-caja">
      <svg class="muneco" viewBox="0 0 ${LIENZO.ancho} ${LIENZO.alto}" role="img"
           aria-label="Equipo de ${esc(p.pj)}">
        ${figura({ sufijo: `f${i}` })}${puntos}
      </svg>
      <ul class="puestas">${
        puestas || `<li class="nada">No lleva nada puesto.</li>`
      }</ul>
      <div class="mochila" data-soltar="${i}">
        <h2><svg class="ico-tit" viewBox="0 0 100 100" aria-hidden="true"
              >${iconoObjeto("mochila", { sufijo: `tm${i}`, sombra: false })}</svg> Mochila</h2>
        ${cogido?.tipo === "hueco" && cogido.i === i
          ? `<p class="cogiendo">Llevas <b>${esc(cogido.obj.n)}</b> en la mano. Toca un hueco
               para ponerlo, o aquí para guardarlo.</p>`
          : cogido?.tipo === "bolsa" && cogido.i === i
            ? `<p class="cogiendo">Toca el hueco del muñeco donde quieras ponerlo.</p>`
            : ""}
        <ul class="bolsa">${
          mochila.length
            ? mochila.map((x, j) =>
                `<li data-bolsaobj data-i="${i}" data-j="${j}" tabindex="0"
                     class="${cogido?.tipo === "bolsa" && cogido.i === i && cogido.j === j
                              ? "enmano" : ""}"
                     title="${esc(x.nota ?? x.n)}${esc(bonoTexto(x))}">
                   <svg class="ico-casilla" viewBox="0 0 100 100" aria-hidden="true"
                     >${iconoObjeto(x.n, { sufijo: `b${i}-${j}` })}</svg>
                   <span>${esc(x.n)}</span>
                   <button data-quitarbolsa="${i}" data-j="${j}" title="Quitar">✕</button></li>`)
                .join("")
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
// `ej` es el objeto de `objetos.js` que representa la clase: se dibuja en la banda en vez del
// emoji que había. Un ✝ y un 🎵 al lado del nombre no dicen «clérigo» ni «bardo», dicen «emoji».
const CLASES = [
  { re: /guerrer/i, ej: "espada", n: "Guerrero" },
  { re: /explorador|ranger|explorad/i, ej: "arco", n: "Explorador" },
  { re: /pícar|picar|ladr/i, ej: "ganzuas", n: "Pícaro" },
  { re: /clérig|clerig|cléri|sacerd/i, ej: "simbolo", n: "Clérigo" },
  { re: /druid/i, ej: "hierbas", n: "Druida" },
  { re: /mag[oa]|hechicer/i, ej: "pergamino", n: "Mago" },
  { re: /bárbar|barbar/i, ej: "hacha", n: "Bárbaro" },
  { re: /bard/i, ej: "campana", n: "Bardo" },
  { re: /paladí|paladi/i, ej: "escudo", n: "Paladín" },
  { re: /monj/i, ej: "baston", n: "Monje" },
  { re: /bruj/i, ej: "libro", n: "Brujo" },
];
const claseDe = (t) => CLASES.find((c) => c.re.test(String(t ?? "")));
/** El icono de la clase, ya dentro de su <svg>. `fardo` es la red para una clase inventada. */
const ICONO_CLASE = (t, sufijo) =>
  `<svg class="ico-clase" viewBox="0 0 100 100" aria-hidden="true"
    >${iconoObjeto(claseDe(t)?.ej ?? "fardo", { sufijo, sombra: false })}</svg>`;
/**
 * El nombre sin el nivel: en un marco de 100 px no cabe «Exploradora 2».
 *
 * Se recorta el texto DE LA FICHA en vez de devolver el nombre canónico de `CLASES`, porque ese
 * está en masculino para poder buscar el icono con una sola entrada por clase, y en la banda se
 * leía «Elara · EXPLORADOR». El canónico queda solo como red por si la ficha no trae nada usable.
 */
const claseCorta = (t) =>
  String(t ?? "").replace(/\s*\d+\s*$/, "").trim() || claseDe(t)?.n || "—";

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
/**
 * Los once huecos de equipo. `ej` es lo que se dibuja cuando el hueco está VACÍO: el icono de lo
 * que va ahí, apagado. Antes había un emoji, y un emoji a todo color dentro de una ranura de
 * piedra se ve como lo que es. Los nombres de `ej` son claves de `objetos.js`.
 */
const HUECOS = [
  { k: "cabeza", n: "Cabeza", ej: "casco" },
  { k: "pecho", n: "Pecho", ej: "coraza" },
  { k: "manos", n: "Manos", ej: "guantes" },
  { k: "piernas", n: "Piernas", ej: "pantalones" },
  { k: "pies", n: "Pies", ej: "botas" },
  { k: "capa", n: "Capa", ej: "capa" },
  { k: "diestra", n: "Diestra", ej: "espada" },
  { k: "zurda", n: "Zurda", ej: "escudo" },
  { k: "anillo1", n: "Anillo", ej: "anillo" },
  { k: "anillo2", n: "Anillo", ej: "anillo" },
  { k: "amuleto", n: "Amuleto", ej: "amuleto" },
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
        ca: {
          type: "integer",
          description:
            "Clase de armadura SIN CONTAR la armadura que lleve equipada. Lo que sume la coraza " +
            "o el escudo se pone al equiparlos, con el campo `ca` de `equipar`, y la app suma. " +
            "Para un personaje sin armadura son 10 + su modificador de Destreza.",
        },
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
      "Pone o quita algo de un hueco de equipo, CON sus bonificadores. Es tu trabajo, no de la " +
      "mesa: en cuanto encuentren algo que se puedan poner, equípaselo y dilo. La app suma la CA " +
      "sola y lo dibuja en el muñeco de la ficha.",
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
        ca: {
          type: "integer",
          description:
            "Lo que SUMA a la clase de armadura, no la CA total. Un camisote de malla son +3 " +
            "sobre la base sin armadura, un escudo +2, una capa 0. Puede ser negativo.",
        },
        dano: {
          type: "string",
          description: "Solo si es un arma: el daño, por ejemplo «1d8+2 cortante».",
        },
        nota: { type: "string", description: "Una línea sobre el objeto, si tiene algo especial." },
      },
      required: ["pj", "hueco"],
    },
  },
  {
    name: "dar_objeto",
    description:
      "Mete algo en la mochila de un personaje. Úsalo EN CUANTO encuentren algo: no digas «lo " +
      "apuntáis», apúntalo tú y que aparezca dibujado en su mochila. Si es algo que se puede " +
      "llevar puesto y les conviene, usa equipar en vez de esto.",
    input_schema: {
      type: "object",
      properties: {
        pj: { type: "string" },
        objeto: { type: "string", description: "Qué encuentran. En singular y concreto." },
        ca: {
          type: "integer",
          description:
            "Si es armadura o escudo, lo que sumaría a la CA al ponérselo. Ponlo aunque de " +
            "momento vaya a la mochila: el bonificador viaja con el objeto, así que cuando se lo " +
            "equipen —tú o ellos a mano— se aplica solo.",
        },
        dano: { type: "string", description: "Si es un arma, su daño. Mismo motivo que `ca`." },
        nota: { type: "string", description: "Para qué sirve, si no es evidente." },
      },
      required: ["pj", "objeto"],
    },
  },
  {
    name: "cambiar_oro",
    description:
      "Suma o resta monedas a un personaje. En positivo lo que encuentran o cobran, en negativo " +
      "lo que pagan. Llévalo tú: si la mesa tiene que apuntar el dinero a mano, no lo apunta.",
    input_schema: {
      type: "object",
      properties: {
        pj: { type: "string" },
        cuanto: { type: "integer", description: "Monedas. Negativo para restar." },
        porque: { type: "string", description: "Una línea: de dónde sale o en qué se va." },
      },
      required: ["pj", "cuanto"],
    },
  },
  {
    name: "quitar_objeto",
    description:
      "Saca algo de la mochila: se gasta, se rompe, se lo dan a alguien o lo dejan atrás.",
    input_schema: {
      type: "object",
      properties: {
        pj: { type: "string" },
        objeto: { type: "string", description: "Nombre de lo que sale. Basta con acertar parte." },
      },
      required: ["pj", "objeto"],
    },
  },
  {
    name: "pedir_tirada",
    description:
      "Pone una tirada en pantalla ANTES de que tiren, con su CD a la vista. Úsalo SIEMPRE que " +
      "haya que tirar: es lo que hace que la mesa pueda comprobar el resultado en vez de fiarse " +
      "de ti. La app hace la cuenta sola y dice si pasa, así que da el modificador exacto.\n\n" +
      "Si no hay riesgo real, no pidas tirada: se resuelve narrando.",
    input_schema: {
      type: "object",
      properties: {
        pj: { type: "string", description: "Quién tira." },
        que: { type: "string", description: "Qué tirada: «Supervivencia», «salvación de Sabiduría», «ataque con arco»." },
        cd: { type: "integer", description: "El número que hay que igualar o pasar. En un ataque, la CA del objetivo." },
        mod: { type: "integer", description: "Lo que suma al d20: característica + competencia. Exacto." },
        ventaja: { type: "string", enum: ["ninguna", "ventaja", "desventaja"] },
      },
      required: ["pj", "que", "cd", "mod"],
    },
  },
  {
    name: "iniciativa",
    description:
      "Pone el orden de turnos en pantalla al empezar un combate, y lo quita al acabar. Mientras " +
      "está puesto, la mesa ve de quién es el turno sin preguntar.",
    input_schema: {
      type: "object",
      properties: {
        orden: {
          type: "array",
          items: { type: "string" },
          description:
            "Nombres en orden de iniciativa, de mayor a menor, incluyendo a los enemigos. " +
            "Lista vacía para quitar la tira: el combate ha terminado.",
        },
      },
      required: ["orden"],
    },
  },
  {
    name: "siguiente_turno",
    description: "Pasa al siguiente de la tira de iniciativa. Llámalo al acabar cada turno.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "ambiente",
    description:
      "Cambia la música de fondo. Hazlo cuando cambie el tono de la escena, no en cada frase: al " +
      "entrar en un sitio, al empezar una pelea, al morir alguien. Si la mesa lo tiene apagado no " +
      "suena nada, pero el cambio se recuerda para cuando lo encienda.",
    input_schema: {
      type: "object",
      properties: {
        estado: {
          type: "string",
          enum: ["calma", "tension", "combate", "horror", "duelo"],
          description:
            "«calma» hablando o de camino; «tension» cuando saben que hay algo; «combate» en la " +
            "pelea; «horror» el Bosque y lo que no se debería mirar; «duelo» cuando alguien ha " +
            "muerto o se cierra algo.",
        },
      },
      required: ["estado"],
    },
  },
  {
    name: "ilustrar",
    description:
      "Pinta una ilustración de lo que está pasando AHORA y la pone en pantalla, encima del arte " +
      "de la localización. Para eso están los momentos que merecen una imagen: una pelea, la " +
      "aparición de algo, un hallazgo, el final de una escena. Tarda unos quince segundos y la " +
      "mesa ve que se está pintando, así que sigue narrando mientras: NO te calles a esperarla.\n\n" +
      "El `prompt` va en INGLÉS, describiendo lo que se ve como si fuera un cuadro, no como una " +
      "orden. Nada de nombres propios de la campaña —el generador no los conoce— y nada de " +
      "describir cuerpos, piel ni ropa escasa: el filtro del proveedor lo bloquea y devuelve una " +
      "imagen negra. Del estilo no te ocupes, se añade solo.",
    input_schema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description:
            "En inglés. Lo que se ve: quién, haciendo qué, dónde, con qué luz. Por ejemplo " +
            "«four ragged travellers with torches fighting a bloated drowned corpse beside a " +
            "stone well at night, mud, thick fog».",
        },
        pie: { type: "string", description: "Una línea en español para debajo de la imagen." },
      },
      required: ["prompt"],
    },
  },
  {
    name: "mostrar",
    description:
      "Cambia lo que se ve en el tablet. La pantalla la manejas TÚ: si alguien pide el mapa, " +
      "muéstraselo con esto en vez de decirle qué pestaña tocar; si vas a hablar de lo que lleva " +
      "alguien, abre su ficha; si acaba la sesión, saca el cierre. Hazlo también sin que lo " +
      "pidan, cuando lo que estás contando se vea mejor en otra pantalla.",
    input_schema: {
      type: "object",
      properties: {
        vista: {
          type: "string",
          enum: ["mesa", "mapa", "mision", "grupo", "ficha", "cierre"],
          description:
            "«mesa» es la escena con las caras; «mapa» el mapa de la aventura a pantalla " +
            "completa; «mision» lo que saben, el reloj y lo que han ido haciendo; «grupo» las " +
            "barras, los suministros y el oro; «ficha» la hoja de un personaje (hace falta " +
            "`pj`); «cierre» las estadísticas y el resumen del final.",
        },
        pj: { type: "string", description: "De quién es la ficha, si `vista` es «ficha»." },
      },
      required: ["vista"],
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
/**
 * Este mapa es para las PIEZAS DE NARRACIÓN GRABADAS, donde cada personaje suena como él: la
 * línea de Domar con la voz de Domar, la de Nera con la de Nera.
 *
 * **El DJ en vivo NO usa este mapa.** Usa siempre `VOZ_DJ`, y eso es una corrección: la voz de
 * la cola se sacaba de la localización actual (`actual().voz`), así que el director de juego
 * cambiaba de voz según dónde estuviera el grupo — hablaba como Mirena en la casa de los Ramos y
 * como el Acreedor en el Corazón. En mesa se oye como si salieran tres narradores al azar.
 */
const VOZ = {
  narrador: "DdKbXdRlBmj7Ty7N0FVr",
  domar: "DdKbXdRlBmj7Ty7N0FVr",
  olen: "DdKbXdRlBmj7Ty7N0FVr",
  mirena: "OTsv82NplloP7M5TyIJ3",
  vesna: "OTsv82NplloP7M5TyIJ3",
  sela: "OTsv82NplloP7M5TyIJ3",
  acreedor: "PRfCKe8kdrG3nuXOAnoH",
};

/** La voz del director de juego. Una, fija, la misma en toda la partida. */
const VOZ_DJ = VOZ.narrador;

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
- Reparte el equipo inicial con equipar, hueco por hueco. Los huecos son cabeza, pecho, manos,
  piernas, pies, capa, diestra, zurda, dos anillos y amuleto. Pon SIEMPRE el bonificador: la
  armadura lleva su \`ca\` (malla +3, escudo +2, cuero +1, una capa 0) y las armas su \`dano\`.
  La app suma la CA sola y lo dibuja en el muñeco.

LOS OBJETOS Y LA PANTALLA LOS MANEJAS TÚ. Esto es lo que la mesa espera de ti:

- **Encuentran algo → aparece.** En cuanto haya un objeto en la ficción, llama a dar_objeto y sale
  dibujado en su mochila. Nunca digas «lo apuntáis» ni «que lo apunte quien lleve la ficha». Si es
  armadura o arma, pon su \`ca\` o su \`dano\` YA, aunque de momento vaya a la mochila: el
  bonificador viaja con el objeto y se aplica en cuanto se lo pongan.
- **Si les conviene ponérselo, póntelo tú.** Equipa lo que encuentren en el hueco que toque, con
  su bonificador, y di en una frase qué cambia: «ahora tienes CA diecisiete». No preguntes «¿os lo
  queréis poner?» para algo obvio; hazlo y sigue.
- **Se gasta o se rompe → quitar_objeto.** Una antorcha consumida, una cuerda cortada, algo que
  dejan atrás.
- **Toda tirada va por pedir_tirada, con su CD y el modificador exacto.** La app hace la cuenta y
  dice si pasa, y eso es lo que permite que la mesa te compruebe. No resuelvas una tirada de
  cabeza ni pidas que canten «17+5»: pon la tirada y espera.
- **En combate, pon la iniciativa** con iniciativa al empezar, pasa turno con siguiente_turno, y
  quítala con una lista vacía al acabar.
- **El dinero también es tuyo.** cambiar_oro cuando encuentren monedas, cobren o paguen. Si la mesa
  tiene que apuntar el dinero a mano, no lo apunta.
- **Ilustra SIN QUE TE LO PIDAN** cuando empieza un combate, cuando aparece una criatura por
  primera vez, y cuando se cierra una escena. Y si te lo piden, ilústralo SIEMPRE, aunque acabes
  de hacerlo: no discutas la petición.
- **Ilustra los momentos que lo merecen.** Con ilustrar pintas lo que está pasando y sale en
  pantalla: una pelea, la aparición de algo, un hallazgo. Tarda unos quince segundos y la mesa ve
  que está en marcha, así que **sigue narrando mientras**, no te calles a esperarla. El prompt en
  inglés, sin nombres propios de la campaña y sin describir cuerpos ni piel: el filtro del
  proveedor lo bloquea y devuelve una imagen negra.
- **Tú decides qué se ve.** Con mostrar cambias la pantalla del tablet: si preguntan dónde están o
  piden el mapa, saca el mapa; si vais a hablar de lo que lleva alguien, abre su ficha; si acaba
  la sesión, saca el cierre. Y hazlo también sin que lo pidan, cuando lo que estás contando se vea
  mejor en otra pantalla. No les digas nunca qué pestaña tocar: llévalos tú.

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
  clave11: "", claveCl: "", modelo: "claude-sonnet-5", vozModelo: "eleven_multilingual_v2",
};
if (!CAMPANAS[A.aventura]) A.aventura = CAMPANA_POR_DEFECTO;

// Volúmenes. La voz alta por defecto —es lo que hay que oír— y el ambiente bajo: suena DEBAJO
// de la voz, y si compite gana el ambiente y la mesa se pierde la mitad de lo que dice el DJ.
A.volVoz ??= 1;
A.volAmb ??= 0.35;
A.ambiente ??= false;

// Migración de una sola vez: el modelo de voz rápido era el de por defecto, y en mesa se dijo
// que la voz sonaba mal. Cambiar el valor por defecto no arregla un dispositivo que ya tiene
// «rápido» guardado, así que se sube al de calidad —el mismo que usa la narración pregenerada—
// y se marca. La marca es lo que hace que esto pase UNA vez: si después se elige «rápido» a
// mano, se respeta y no se vuelve a tocar.
if (!A.vozTocada) {
  A.vozModelo = "eleven_multilingual_v2";
  A.vozTocada = true;
  localStorage.setItem(CLAVE_AJUSTES, JSON.stringify(A));
}

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

/**
 * MODO TELE
 *
 * Se abre una SEGUNDA pestaña de la app con `?tele` y se duplica esa a la televisión, mientras el
 * tablet se queda con la lateral del DJ y los mandos. La de la tele no lleva controles: solo la
 * escena, los personajes, la ilustración, la tirada y la iniciativa — lo que hay que mirar.
 *
 * ¿Por qué dos pestañas y no un modo dentro de la misma? Porque si escondes los mandos para
 * duplicar la pantalla, te quedas sin mandos. Las dos pestañas son del mismo origen, así que
 * comparten `localStorage` y se avisan por `BroadcastChannel`: la del tablet manda, la de la tele
 * relee el estado y se repinta. Ninguna toca la red por su cuenta.
 *
 * `docs/tele-firestick.md` explica por qué esto es lo que cuesta cero: el micrófono del mando de
 * un Fire TV no está expuesto a aplicaciones de terceros, así que la voz tiene que salir del
 * tablet de todas formas.
 */
const ES_TELE = new URLSearchParams(location.search).has("tele");
const canal = "BroadcastChannel" in window ? new BroadcastChannel("corvalar") : null;

function guardarEstado() {
  localStorage.setItem(claveEstado(A.aventura), JSON.stringify(E));
  // La pestaña de la tele no manda avisos: solo escucha. Si los mandara, las dos se repintarían
  // en bucle la una a la otra.
  if (!ES_TELE) canal?.postMessage({ que: "estado", aventura: A.aventura });
}
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
/**
 * La mesa es la ÚNICA pantalla. Todo lo demás se abre como una capa encima de la escena.
 *
 * Antes esto era una barra de pestañas: tocar «Misión» escondía el tablero entero y con él el
 * director de juego y el botón de hablar. Eso convertía cada consulta en un viaje de ida y
 * vuelta, y en mesa lo que se quiere es mirar el mapa SIN dejar de hablar con el DJ.
 *
 * Ahora las capas se abren dentro del escenario: la lateral del DJ se queda al lado, la banda de
 * personajes por encima, y el rótulo del lugar sigue arriba. `irA` mantiene su nombre y sus
 * argumentos porque la llaman `moverA`, la herramienta `mostrar` y el arranque por hash.
 */
const CAPAS = ["mapa", "mision", "grupo", "ajustes"];

function irA(nombre, tocarHash = true) {
  const capa = CAPAS.includes(nombre) ? nombre : null; // cualquier otra cosa es «la escena»
  for (const c of CAPAS) $(`#capa-${c}`).hidden = c !== capa;
  for (const b of document.querySelectorAll(".atajos button")) {
    b.toggleAttribute("data-abierta", b.dataset.capa === capa);
  }
  if (capa) $(`#capa-${capa} .capa-cuerpo`).scrollTop = 0;
  const destino = capa ?? "escena";
  if (tocarHash && location.hash.slice(1) !== destino) {
    history.replaceState(null, "", `#${destino}`);
  }
}

for (const b of document.querySelectorAll(".atajos button")) {
  // Tocar el atajo de una capa abierta la cierra: es el gesto que se espera de un botón que
  // se queda marcado.
  b.addEventListener("click", () =>
    irA(b.hasAttribute("data-abierta") ? "escena" : b.dataset.capa));
}
for (const b of document.querySelectorAll("[data-cerrarcapa]")) {
  b.addEventListener("click", () => irA("escena"));
}
// Escape cierra lo que haya abierto encima de la escena, capa o ficha.
addEventListener("keydown", (ev) => {
  if (ev.key !== "Escape") return;
  if (!$("#ficha").hidden) cerrarFicha();
  else irA("escena");
});
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

  // Dónde estáis, en la capa de la misión. Antes ese dato solo estaba sobre la ilustración, y al
  // abrir la misión no se sabía de qué sitio hablaban las pistas.
  $("#mision-lugar").textContent = `${l.id} · ${l.nombre}`;
  $("#mision-pie").textContent = l.pie ?? "";

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
/**
 * Las heridas persistentes se DIBUJAN en la cara del retrato, no solo se listan en la ficha.
 *
 * En este sistema las heridas no se curan: te acompañan el resto de la campaña. Si solo salen
 * como una etiqueta roja en una pantalla que hay que abrir, no pesan. Marcadas en la cara que la
 * mesa tiene delante toda la partida, sí.
 *
 * Cada marca se ata a la herida por su NOMBRE, no por el orden en que salieron: la tabla de
 * heridas es aleatoria y el mismo personaje tiene que salir igual siempre. Lo que no reconoce no
 * dibuja nada, que es mejor que poner una cicatriz genérica en el sitio equivocado.
 */
function marcasDeHerida(heridas, r) {
  const [ix, iy] = r.ojoIzq, [dx, dy] = r.ojoDer;
  const [bx, by] = r.boca;
  const t = (h) => norm(h);
  const marca = {
    "ojo danado": `<path class="cic" d="M${dx - r.ojoRx * 1.5} ${dy - r.ojoRy * 3}
                      L${dx + r.ojoRx * 1.4} ${dy + r.ojoRy * 3.4}"/>
                   <ellipse class="parche" cx="${dx}" cy="${dy}"
                      rx="${r.ojoRx * 1.5}" ry="${r.ojoRy * 2.2}"/>`,
    "oido reventado": `<path class="cic" d="M${dx + r.ojoRx * 3.6} ${dy}
                          q${r.ojoRx} ${r.ojoRy * 2} 0 ${r.ojoRy * 4}"/>`,
    cicatriz: `<path class="cic" d="M${ix - r.ojoRx * 1.2} ${iy - r.ojoRy * 3.2}
                  L${ix - r.ojoRx * 0.2} ${iy + r.ojoRy * 4}"/>`,
    conmocion: `<path class="cic" d="M${bx - r.bocaRx * 0.7} ${by - r.bocaRx * 1.3}
                   L${bx + r.bocaRx * 0.2} ${by - r.bocaRx * 0.6}"/>`,
    hemorragia: `<path class="sangre" d="M${bx + r.bocaRx * 0.35} ${by + 0.012}
                    q0.004 0.03 -0.002 0.055"/>`,
    "marca del bosque": `<g class="bosque">
        <path d="M${ix + r.ojoRx * 2.4} ${iy + r.ojoRy * 5} l0.03 0.022"/>
        <path d="M${ix + r.ojoRx * 2.4} ${iy + r.ojoRy * 5} l0.024 -0.026"/>
        <path d="M${ix + r.ojoRx * 2.4} ${iy + r.ojoRy * 5} l-0.008 0.034"/>
      </g>`,
  };
  return (heridas ?? []).map((h) => marca[t(h)] ?? "").join("");
}

function capaCara(idRetrato, heridas) {
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
    <g class="heridas-cara">${marcasDeHerida(heridas, r)}</g>
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
          ${p.retrato ? capaCara(p.retrato, p.heridas) : ""}
          <span class="vidrio"></span></span>
        <span class="nom">${esc(p.pj)}</span>
        <!-- Sin icono de clase aquí, y es una decisión: los iconos de objetos.js están dibujados
             para leerse desde 40 px y en la banda no caben más de 20, donde un arco o un símbolo
             se quedan en una mancha. El nombre de la clase ya dice qué es cada uno, que es lo que
             se pedía; un emoji tampoco valía. En la ficha sí hay sitio y ahí va dibujado. -->
        <span class="oficio">${esc(claseCorta(p.clase))}</span>
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
  if (cogido && cogido.i !== i) cogido = null;
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
          <div><i>🛡</i><span>armadura</span><b>${caDe(p)}</b></div>
          <div><i>🌙</i><span>agotamiento</span><b>${p.agotamiento ?? 0} / 6</b></div>
          <div><i>🩸</i><span>heridas</span><b>${p.heridas.length}</b></div>
          <div><svg class="ico-clase" viewBox="0 0 100 100" aria-hidden="true"
                >${iconoObjeto("moneda", { sufijo: `or${i}`, sombra: false })}</svg
              ><span>monedas</span><b>${p.oro ?? 0}</b></div>
          <div><i>✶</i><span>experiencia</span><b>${p.px ?? 0}</b></div>
          <div>${ICONO_CLASE(p.clase, `fn${i}`)}<span>nivel</span><b>${nivelDe(p.px ?? 0)}</b></div>
        </div>
        ${(() => {
          const px = p.px ?? 0, falta = faltaPara(px), n = nivelDe(px);
          if (falta === null) return `<p class="vacio">Nivel 4, el techo de la campaña.</p>`;
          const base = UMBRALES[n - 1], meta = UMBRALES[n];
          const pct = Math.max(0, Math.min(100, ((px - base) / (meta - base)) * 100));
          return `<div class="pxbar" title="${falta} px para el nivel ${n + 1}">
            <i style="width:${pct}%"></i><span>${falta} px para el nivel ${n + 1}</span></div>`;
        })()}
        ${bonosCa(p) ? `<p class="desglose">Armadura ${caDe(p)} = ${caBaseDe(p)} de base
          ${Object.entries(p.equipo ?? {}).map(([k, v]) => {
            const o = objDe(v); const n = Number(o?.ca) || 0;
            return n ? ` ${n > 0 ? "+" : "−"} ${Math.abs(n)} (${esc(o.n)})` : "";
          }).join("")}</p>` : ""}
        ${armasDe(p).length ? `<p class="desglose">Con qué pega:
          ${armasDe(p).map((o) => `<b>${esc(o.n)}</b> ${esc(o.dano)}`).join(" · ")}</p>` : ""}
      </div>
    </div>

    <div data-bloque="pg"><h2>Puntos de golpe</h2>
      <div class="pg-fila" style="margin-top:8px">
        <button data-fpg="${i}" data-d="-3">−3</button>
        <button data-fpg="${i}" data-d="-1">−1</button>
        <span class="val">${p.pg} / ${p.pgMax}</span>
        <button data-fpg="${i}" data-d="1">+1</button>
        <button data-fpg="${i}" data-d="3">+3</button>
      </div>
    </div>

    <div data-bloque="acciones"><h2>Qué puedes hacer</h2>
      ${pintarCartas(accionesDe(p.clase), `Como ${esc(claseCorta(p.clase).toLowerCase())}`)}
      <details class="mas-cartas">
        <summary>Y lo que puede hacer cualquiera (${COMUNES.length})</summary>
        ${pintarCartas(COMUNES)}
      </details>
    </div>

    <div data-bloque="equipo"><h2>Equipo</h2>
      <p class="vacio">Toca una ranura del muñeco para poner o cambiar lo que lleva ahí.</p>
      ${pintarMuneco(p, i)}
    </div>

    ${p.heridas.length
      ? `<div data-bloque="heridas"><h2>Heridas persistentes</h2><div class="marcas" style="margin-top:8px">${p.heridas
          .map((h, j) => `<button class="marca" data-fherida="${i}" data-h="${j}">${esc(h)} ✕</button>`)
          .join("")}</div></div>`
      : ""}

    <div data-bloque="quien"><h2>Quién es</h2>
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

    ${p.notas ? `<div data-bloque="notas"><h2>De la ficha</h2><p class="notas">${esc(p.notas)}</p></div>` : ""}

    <div data-bloque="donde"><h2>Dónde estáis</h2>
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

/** Quita la capa de la ficha. La usan el aspa, el clic fuera, y la herramienta `mostrar`. */
function cerrarFicha() { cogido = null; $("#ficha").hidden = true; }

$("#ficha").addEventListener("click", (ev) => {
  // Tocar fuera de la caja cierra: en mesa nadie busca la X.
  if (ev.target === $("#ficha") || ev.target.closest("#ficha-cerrar")) {
    cerrarFicha();
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
  // ── Mover objetos: coger y soltar, por TOQUES ────────────────────────────
  // No se arrastra. Esto es una tablet, y el arrastrar-y-soltar de HTML5 no existe en táctil:
  // habría que reimplementarlo con eventos de puntero y coordenadas. Coger con un toque y
  // soltar con otro se comporta igual con dedo, ratón y teclado, y es lo que hacen los propios
  // juegos de inventario en mando.
  const celda = ev.target.closest("li[data-bolsaobj]");
  if (celda && !ev.target.closest("button")) {
    const i = +celda.dataset.i, j = +celda.dataset.j;
    // Tocar lo que ya estaba cogido lo suelta: hace falta una salida sin efectos.
    cogido = cogido?.tipo === "bolsa" && cogido.i === i && cogido.j === j
      ? null
      : { tipo: "bolsa", i, j };
    abrirFicha(i);
    return;
  }

  const ranura = ev.target.closest(".ranura");
  if (ranura) {
    const i = +ranura.dataset.i;
    const pj = E.partida[i];
    const k = ranura.dataset.hueco;
    pj.equipo ??= {};
    pj.mochila ??= [];
    const puesto = objDe(pj.equipo[k]);

    if (cogido && cogido.i === i) {
      if (cogido.tipo === "bolsa") {
        // De la mochila al hueco. Lo que hubiera puesto se va a la mochila, no se pierde.
        const [obj] = pj.mochila.splice(cogido.j, 1);
        if (objDe(obj)) {
          pj.equipo[k] = objDe(obj);
          if (puesto) pj.mochila.push(puesto);
        }
      } else if (cogido.hueco !== k) {
        // De un hueco a otro: se intercambian, que es lo que uno espera al mover un anillo.
        pj.equipo[cogido.hueco] = puesto ?? null;
        pj.equipo[k] = objDe(cogido.obj);
      }
      cogido = null;
      guardarEstado(); pintarGrupo(); pintarBanda();
      abrirFicha(i);
      return;
    }

    if (puesto) {
      cogido = cogido?.tipo === "hueco" && cogido.hueco === k
        ? null
        : { tipo: "hueco", i, hueco: k, obj: puesto };
      abrirFicha(i);
      return;
    }

    // Hueco vacío y nada cogido: se escribe a mano. Sigue siendo la vía para meter algo que no
    // está en la mochila, y en la sesión cero es más rápido que dar-y-equipar.
    const h = HUECOS.find((x) => x.k === k);
    const v = prompt(`${h.n} de ${pj.pj}:`, "");
    if (v?.trim()) {
      pj.equipo[k] = { n: v.trim() };
      guardarEstado(); pintarGrupo(); pintarBanda();
      abrirFicha(i);
    }
    return;
  }

  // Soltar en la mochila lo que se ha cogido de un hueco: así se desequipa sin borrarlo.
  const bolsa = ev.target.closest("[data-soltar]");
  if (bolsa && cogido?.tipo === "hueco" && cogido.i === +bolsa.dataset.soltar) {
    const pj = E.partida[cogido.i];
    pj.mochila ??= [];
    pj.mochila.push(cogido.obj);
    pj.equipo[cogido.hueco] = null;
    cogido = null;
    guardarEstado(); pintarGrupo(); pintarBanda();
    abrirFicha(+bolsa.dataset.soltar);
    return;
  }

  const quitarB = ev.target.closest("button[data-quitarbolsa]");
  if (quitarB) {
    const pj = E.partida[+quitarB.dataset.quitarbolsa];
    pj.mochila?.splice(+quitarB.dataset.j, 1);
    cogido = null;
    guardarEstado(); abrirFicha(+quitarB.dataset.quitarbolsa);
    return;
  }
  const entr = ev.target.closest("button[data-entrevista]");
  if (entr) { editarEntrevista(+entr.dataset.entrevista); return; }
  const volver = ev.target.closest("button[data-volver]");
  if (volver) { abrirFicha(+volver.dataset.volver); return; }
  const ir = ev.target.closest("button[data-ir-grupo]");
  if (ir) {
    cerrarFicha();
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
  E.partida[i].mochila.push({ n: v });
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
    p.equipo[c.dataset.eq] = c.value.trim()
      ? { ...(objDe(p.equipo[c.dataset.eq]) ?? {}), n: c.value.trim() }
      : null;
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
  // Una tarjeta por personaje, con su cara, sus barras y sus números. Antes era una lista de
  // cajas con cinco botones apilados y el mismo aspecto para todos: no se veía de un vistazo
  // quién estaba mal, que es lo único que se busca aquí en mitad de un combate.
  $("#grupo-lista").innerHTML = E.partida
    .map((p, i) => {
      const pct = Math.max(0, Math.min(100, (p.pg / Math.max(1, p.pgMax)) * 100));
      const agot = Math.max(0, Math.min(6, p.agotamiento ?? 0));
      const cara = p.retrato
        ? `<img alt="" src="retratos/${encodeURIComponent(p.retrato)}.webp">`
        : `<span class="ini">${esc(iniciales(p.pj))}</span>`;
      return `
    <article class="tarjeta-pj" data-estado="${estadoPj(p)}">
      <button class="tarjeta-cara" data-verficha="${i}"
              title="Abrir la ficha de ${esc(p.pj)}">${cara}</button>
      <div class="tarjeta-datos">
        <div class="tarjeta-cab">
          <b>${esc(p.pj)}</b>
          <span class="cls">${esc(p.clase)}</span>
        </div>

        <div class="chapas">
          <span title="Clase de armadura">CA <b>${caDe(p)}</b></span>
          <span title="Monedas">${iconoChapa("moneda", `gm${i}`)}<b>${p.oro ?? 0}</b></span>
          <span title="Experiencia">${nivelDe(p.px ?? 0)}º <b>${p.px ?? 0} px</b></span>
        </div>

        <div class="medidores">
          <span class="m-pg" title="Puntos de golpe">
            <i style="width:${pct}%"></i><em>${p.pg} / ${p.pgMax}</em></span>
          <span class="m-agot" title="Agotamiento ${agot} de 6">
            <i style="width:${(agot / 6) * 100}%"></i><em>agot. ${agot}/6</em></span>
        </div>

        <div class="pg-fila">
          <button data-pg="${i}" data-d="-3">−3</button>
          <button data-pg="${i}" data-d="-1">−1</button>
          <button data-pg="${i}" data-d="1">+1</button>
          <button data-pg="${i}" data-d="3">+3</button>
        </div>

        ${p.heridas.length
          ? `<div class="marcas">${p.heridas
              .map((h, j) =>
                `<button class="marca" data-quitar="${i}" data-h="${j}">${esc(h)} ✕</button>`)
              .join("")}</div>`
          : ""}

        <div class="fila menudos">
          <button data-herida="${i}"><span class="icono">✚</span><span>Herida</span></button>
          <button data-agot="${i}" data-d="1"><span class="icono">▲</span><span>Agotar</span></button>
          <button data-agot="${i}" data-d="-1"><span class="icono">▼</span><span>Descansa</span></button>
        </div>
      </div>
    </article>`;
    })
    .join("");

  // Los suministros con su icono dibujado: se reconocen antes por el dibujo que por la palabra.
  $("#sumin").innerHTML = Object.entries(E.suministros)
    .map(
      ([k, v]) => `<div data-vacio="${v <= 0 ? "si" : "no"}">
        ${iconoChapa(k, `su-${k}`)}
        <span>${esc(k)}</span><b>${v}</b>
        <button data-sum="${k}" data-d="-1" title="Gastar uno">−</button>
        <button data-sum="${k}" data-d="1" title="Añadir uno">+</button>
      </div>`,
    )
    .join("");
}

/**
 * Las cartas de acción, para que un novato sepa qué puede hacer sin buscarlo en una hoja.
 *
 * El contenido sale de `app/acciones.js`, contrastado contra `reglas.md`: los números que no están
 * en las reglas no se inventan, se remiten a la ficha. El `aviso` de cada carta es el error típico
 * del que no ha jugado nunca, y es lo que más vale de todo esto.
 */
function pintarCartas(lista, titulo) {
  if (!lista?.length) return `<p class="vacio">Esta clase no tiene cartas todavía.</p>`;
  return (titulo ? `<h3 class="tit-cartas">${titulo}</h3>` : "") +
    `<div class="cartas">${lista.map((a) => `
      <article class="carta">
        <header>
          ${a.icono ? iconoChapa(a.icono, `ac-${a.id}`) : ""}
          <b>${esc(a.nombre)}</b>
          <span class="coste">${esc(COSTES[a.coste] ?? a.coste)}</span>
        </header>
        <p class="que">${esc(a.que)}</p>
        ${a.tirada
          ? `<p class="tira"><span>Tiras</span> ${esc(a.tirada)}${
              a.contra ? ` <span>contra</span> ${esc(a.contra)}` : ""}</p>`
          : `<p class="tira"><span>Sin tirada</span></p>`}
        ${a.efecto ? `<p class="efecto">${esc(a.efecto)}</p>` : ""}
        ${a.gasta ? `<p class="gasta">Gasta: ${esc(a.gasta)}</p>` : ""}
        ${a.aviso ? `<p class="ojo">${esc(a.aviso)}</p>` : ""}
      </article>`).join("")}</div>`;
}

/** Un icono de objeto del tamaño de una letra, para meterlo en una chapa o un rótulo. */
const iconoChapa = (nombre, sufijo) =>
  `<svg class="ico-chapa" viewBox="0 0 100 100" aria-hidden="true"
    >${iconoObjeto(nombre, { sufijo, sombra: false })}</svg>`;


function pintarMapa() {
  // El mapa lo dibuja mapa.js: un mapa pintado de verdad (mar, costa, cordillera, bosque,
  // marco y rosa de los vientos), no cuatro círculos sobre un pergamino. Aquí solo se le pasan
  // las localizaciones y el estado, y se enganchan los eventos por data-ir.
  const svg = $("#mapa");
  const estado = { local: E.local, visitadas: E.visitadas };
  pintarMapaEn(svg, CAMPANA.localizaciones, estado);

  for (const g of svg.querySelectorAll("g[data-ir]")) {
    const ir = () => moverA(g.dataset.ir);
    g.addEventListener("click", ir);
    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ir(); }
    });
  }

  // La miniatura de la esquina de la escena: el mismo mapa, sin rótulos (los esconde el CSS) y
  // sin nodos tocables. Toda ella es un botón que abre el grande, porque a 130 px acertar una
  // localización con el dedo es imposible.
  pintarMapaEn($("#minimapa"), CAMPANA.localizaciones, estado);
}


$("#minimapa-caja").addEventListener("click", () => irA("mapa"));

// Cuánto ocupa la banda de personajes, para que las capas dejen ese hueco abajo y sus últimos
// controles no acaben debajo de los retratos. Se mide, no se calcula: la altura depende del
// tamaño del marco (que escala con la pantalla), de si alguien lleva heridas y de la tipografía.
{
  const banda = $("#banda");
  const medir = () => {
    const alto = banda.offsetHeight;
    document.documentElement.style.setProperty("--alto-banda", `${alto}px`);
  };
  if ("ResizeObserver" in window) new ResizeObserver(medir).observe(banda);
  else addEventListener("resize", medir);
  medir();
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
  // fal.ai flux/dev: unos 0,025 $ por imagen de 1024×576.
  const img = (g.imagenes ?? 0) * 0.025;
  const t = stt + cl + tts + img;
  $("#gasto").innerHTML =
    `Transcripción ${Math.round(g.sttSeg)} s · Claude ${g.entrada}+${g.salida} tok · ` +
    `voz ${g.ttsCar} car.${g.imagenes ? ` · ${g.imagenes} ilustración${
      g.imagenes === 1 ? "" : "es"}` : ""}<br><b>Estimado: ${t.toFixed(2)} $</b>`;
}

function pintarRegistro() {
  const r = E.registro ?? [];
  $("#registro").innerHTML = r.length
    ? r.slice(-40).map((x) =>
        `<li><span class="tipo">${esc(x.tipo)}</span>${esc(x.que)}</li>`).join("")
    : `<li style="list-style:none;margin-left:-1.4em;color:var(--tiza-baja);font-style:italic">
         Todavía nada. El DJ va anotando aquí lo que pasa.</li>`;
}

/**
 * Estadísticas del cierre de sesión.
 *
 * Todo sale de cosas que ya se llevaban: el registro que va anotando el DJ con
 * `registrar_accion`, los suministros iniciales de la aventura frente a los que quedan, y las
 * heridas y el agotamiento de cada ficha. No hay contadores nuevos que mantener sincronizados.
 */
function estadisticas() {
  const reg = E.registro ?? [];
  const porPj = E.partida.map((p) => {
    const suyas = reg.filter((x) => x.pj && buscarPj(x.pj) === p);
    return {
      pj: p.pj,
      // La clase tal cual la lleva la ficha, no `claseCorta`: esa normaliza al masculino para
      // poder buscar el icono, y aquí eso se lee como «Elara, Explorador».
      clase: p.clase,
      acciones: suyas.length,
      tiradas: suyas.filter((x) => x.tipo === "tirada").length,
      combate: suyas.filter((x) => x.tipo === "combate").length,
      pg: `${p.pg}/${p.pgMax}`,
      heridas: p.heridas ?? [],
      agotamiento: p.agotamiento ?? 0,
      px: p.px ?? 0,
    };
  });

  // Lo gastado se deduce de la diferencia con lo que llevaba el grupo al empezar. Si alguien
  // ha subido un suministro por encima del inicial (han encontrado antorchas), sale 0 y no un
  // número negativo, que en un resumen no significa nada.
  const gastado = Object.entries(CAMPANA.suministrosIniciales)
    .map(([k, v0]) => [k, Math.max(0, v0 - (E.suministros[k] ?? 0))])
    .filter(([, n]) => n > 0);

  return {
    porPj,
    gastado,
    acciones: reg.length,
    sitios: E.visitadas.length,
    deSitios: CAMPANA.localizaciones.length,
    noche: E.noche,
    caidos: porPj.filter((x) => x.heridas.length).map((x) => x.pj),
  };
}

function pintarCierre() {
  const s = estadisticas();
  $("#cierre-tabla").innerHTML = s.porPj.map((x) => `
    <div class="fila-cierre">
      <b>${esc(x.pj)}</b>
      <span class="cls">${esc(x.clase)}</span>
      <span class="num" title="Acciones anotadas">${x.acciones} acc.</span>
      <span class="num" title="Pruebas de habilidad">${x.tiradas} tir.</span>
      <span class="num" title="Golpes en combate">${x.combate} comb.</span>
      <span class="num">${esc(x.pg)} PG</span>
      <span class="num">${x.px} px</span>
      ${x.heridas.length ? `<span class="mal">${esc(x.heridas.join(", "))}</span>` : ""}
      ${x.agotamiento ? `<span class="mal">agotamiento ${x.agotamiento}</span>` : ""}
    </div>`).join("");

  $("#cierre-resumen-datos").innerHTML =
    `<li>${s.acciones === 1 ? "Una cosa anotada" : `${s.acciones} cosas anotadas`} en el ` +
      `registro.</li>` +
    `<li>${s.sitios} de ${s.deSitios} ${
      s.deSitios === 1 ? "localización" : "localizaciones"} visitada${s.sitios === 1 ? "" : "s"}.</li>` +
    (CAMPANA.reloj ? `<li>Noche ${s.noche} de ${CAMPANA.reloj.noches}.</li>` : "") +
    (s.gastado.length
      ? `<li>Gastado: ${s.gastado.map(([k, n]) => `${n} ${k.toLowerCase()}`).join(", ")}.</li>`
      : `<li>No se ha gastado ni un suministro. Sospechoso.</li>`) +
    (s.caidos.length
      ? `<li>Sale tocado del asunto: ${s.caidos.join(", ")}.</li>`
      : `<li>Nadie sale con una herida persistente.</li>`);
}

function pintarTodo() {
  pintarCabecera(); pintarEscena(); pintarCharla(); pintarGrupo(); pintarBanda();
  pintarMapa(); pintarGasto(); pintarArrancar(); pintarRegistro(); pintarCierre();
  pintarResumen(); pintarTirada(); pintarIniciativa(); pintarDiario();
}

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ── Interacciones de grupo y suministros ─────────────────────────────────────
$("#grupo-lista").addEventListener("click", (ev) => {
  const b = ev.target.closest("button");
  if (!b) return;
  // Tocar la cara abre su ficha, igual que en la banda de la mesa: es el gesto que ya se conoce.
  if (b.dataset.verficha !== undefined) {
    irA("escena");
    abrirFicha(+b.dataset.verficha);
    return;
  }
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
        <label>CA base<input data-e="caBase" data-i="${i}" type="number" inputmode="numeric" min="1" max="30" value="${caBaseDe(p)}"></label>
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
/**
 * Cuando el DJ mueve al grupo, la narración grabada del sitio nuevo suena sola. Antes había que
 * acordarse de darle a un botón, y en mesa eso significa que casi nunca sonaba.
 *
 * Se encola en vez de sonar en el momento en que el DJ llama a `mover_escena`, porque en ese
 * instante el DJ está hablando por la voz en vivo y las dos se pisarían.
 */
let narracionPendiente = false;

function sonarNarracionSiToca() {
  if (!narracionPendiente) return;
  narracionPendiente = false;
  const a = $("#esc-audio");
  if (!a.getAttribute("src") || $("#acc-narracion").disabled) return;
  a.currentTime = 0;
  a.volume = A.volVoz;
  // Si no se puede reproducir no se avisa: no lo ha pedido nadie, y un aviso rojo por algo que
  // pasa solo asusta más de lo que informa. El botón sigue ahí para intentarlo a mano.
  a.play().catch(() => {});
}

{
  const a = $("#esc-audio"), b = $("#acc-narracion");
  b.addEventListener("click", () => {
    if (a.paused) {
      a.volume = A.volVoz;
      a.play().catch(() => avisar("No he podido reproducir el audio."));
    }
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
$("#clave-fal").value = A.claveFal ?? "";
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
  A.claveFal = $("#clave-fal").value.trim();
  A.modelo = $("#modelo").value;
  A.vozModelo = $("#voz-modelo").value;
  A.vozTocada = true;
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
function limpiarAviso() { $("#aviso").hidden = true; $("#aviso").dataset.tipo = "error"; }

/**
 * Un aviso de PELIGRO, no de error: alguien está a punto de morir. Se distingue en color del
 * aviso de fallo técnico a propósito — en mesa no se pueden confundir «la app tiene un problema»
 * y «vuestro amigo se muere».
 */
function alarma(txt) {
  const a = $("#aviso");
  a.dataset.tipo = "peligro";
  a.textContent = txt;
  a.hidden = false;
}
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
  const c = new ColaVoz(VOZ_DJ);
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
    cola = new ColaVoz(VOZ_DJ);
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
    sonarNarracionSiToca();
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
/** Minúsculas y sin acentos, para comparar lo que escribe el DJ con lo que hay guardado. */
const norm = (x) =>
  String(x ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

/** Busca un personaje por nombre, tolerando mayúsculas y acentos. */
function buscarPj(nombre) {
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

    // La muerte es definitiva en este sistema y no hay resurrección, así que caer a 0 —y quedarse
    // a un golpe de caer— se avisan EN PANTALLA, no solo en la narración. Que la mesa lo vea venir
    // es la diferencia entre una muerte que duele y una que sienta mal.
    if (cae) {
      sonarSuceso("campana");
      alarma(
        `${p.pj} cae a 0 PG. Inconsciente y agonizante: salvación de muerte cada turno, 10 o más. ` +
          `Dos éxitos estabilizan, dos fallos matan. Y toca tirar herida persistente.`,
      );
    } else if (p.pg > 0 && p.pg < antes && p.pg <= Math.max(2, Math.ceil(p.pgMax * 0.2))) {
      alarma(`${p.pj} se queda en ${p.pg} de ${p.pgMax} PG. Un golpe más y cae.`);
    }

    return nota(
      `${p.pj}: ${antes} → ${p.pg} de ${p.pgMax} PG.` +
        (cae
          ? " Ha caído a 0: inconsciente y agonizante, y toca tirar herida persistente. La mesa ya " +
            "tiene el aviso en pantalla."
          : ""),
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
    // La narración grabada del sitio nuevo suena SOLA, pero al acabar el turno: si arrancara
    // aquí se pisaría con lo que el DJ está diciendo en ese momento por la voz en vivo.
    narracionPendiente = !!l.audio;
    // Al llegar a un sitio nuevo, el ambiente que le corresponda. El DJ puede cambiarlo después
    // con `ambiente`, pero así no hace falta que se acuerde en cada movimiento.
    ponerAmbiente(l.ambiente ?? "calma");
    return nota(
      `La pantalla ya muestra ${l.id} · ${l.nombre}.` +
        (l.audio ? " Su narración grabada suena en cuanto acabes de hablar, no la repitas." : ""),
    );
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
      Object.assign(p, { pj: e.pj, clase: e.clase, pgMax, caBase: ca });
      delete p.ca; // la CA es derivada; dejarla guardada solo sirve para que discrepen
      // Los PG actuales se respetan salvo que pasen del nuevo máximo: si está herido, sigue herido.
      p.pg = Math.min(p.pg, pgMax);
      if (retrato) p.retrato = retrato;
      if (e.notas) p.notas = e.notas;
      registrar("otro", `Ficha actualizada: ${p.pj} (${p.clase})`, p.pj);
      return nota(
        `Ficha de ${p.pj} actualizada: ${p.clase}, ${p.pg}/${pgMax} PG, CA ${caDe(p)}` +
          `${bonosCa(p) ? ` (${ca} de base + ${bonosCa(p)} del equipo)` : ""}.`,
      );
    }
    p = {
      pj: e.pj, clase: e.clase, pg: pgMax, pgMax, caBase: ca,
      heridas: [], agotamiento: 0, equipo: {}, mochila: [], px: 0, ...(retrato ? { retrato } : {}), ...(e.notas ? { notas: e.notas } : {}),
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
    const antes = nombreObj(p.equipo[e.hueco]);
    const caAntes = caDe(p);
    const n = (e.objeto ?? "").trim();
    // Se guarda como objeto para que el bonificador viaje CON la pieza: así quitarla lo retira,
    // sin tener que acordarse de restarlo a mano.
    p.equipo[e.hueco] = n
      ? {
          n,
          ...(Number(e.ca) ? { ca: Math.max(-10, Math.min(10, Math.round(+e.ca))) } : {}),
          ...(e.dano?.trim() ? { dano: e.dano.trim() } : {}),
          ...(e.nota?.trim() ? { nota: e.nota.trim() } : {}),
        }
      : null;
    const h = HUECOS.find((x) => x.k === e.hueco).n.toLowerCase();
    const o = objDe(p.equipo[e.hueco]);
    registrar("hallazgo", `${p.pj}: ${h} → ${o ? o.n + bonoTexto(o) : "(vacío)"}`, p.pj);
    const cambio = caDe(p) !== caAntes ? ` Su CA pasa de ${caAntes} a ${caDe(p)}.` : "";
    return nota(
      o
        ? `${p.pj} lleva ${o.n} en ${h}${bonoTexto(o) ? ` (${bonoTexto(o).trim()})` : ""}` +
          `${antes ? `, y suelta ${antes}` : ""}.${cambio}`
        : `${p.pj} se queda con ${h} libre.${cambio}`,
    );
  }

  if (nombre === "dar_objeto") {
    const p = buscarPj(e.pj);
    if (!p) return `No hay ningún personaje llamado "${e.pj}".`;
    const n = (e.objeto ?? "").trim();
    if (!n) return "Falta el nombre del objeto.";
    p.mochila ??= [];
    if (p.mochila.length >= 24) {
      return `La mochila de ${p.pj} está llena (24 objetos). Quita algo antes con quitar_objeto.`;
    }
    // Los bonificadores se guardan YA, no al equipar: si el objeto llega a la mochila pelado y
    // luego alguien lo arrastra a un hueco a mano, entraría sin sumar nada y la CA mentiría.
    const obj = {
      n,
      ...(Number(e.ca) ? { ca: Math.max(-10, Math.min(10, Math.round(+e.ca))) } : {}),
      ...(e.dano?.trim() ? { dano: e.dano.trim() } : {}),
      ...(e.nota?.trim() ? { nota: e.nota.trim() } : {}),
    };
    p.mochila.push(obj);
    registrar("hallazgo", `${p.pj} se guarda ${n}${bonoTexto(obj)}`, p.pj);
    return nota(
      `${n} entra en la mochila de ${p.pj}${bonoTexto(obj) ? ` (${bonoTexto(obj).trim()})` : ""}.`,
    );
  }

  if (nombre === "cambiar_oro") {
    const p = buscarPj(e.pj);
    if (!p) return `No hay ningún personaje llamado "${e.pj}".`;
    const n = Math.round(+e.cuanto) || 0;
    // No se permite deber dinero: la mesa se queda a cero y el DJ se entera de cuánto faltaba.
    const antes = p.oro ?? 0;
    p.oro = Math.max(0, antes + n);
    const real = p.oro - antes;
    registrar("otro", `${p.pj}: ${real >= 0 ? "+" : ""}${real} monedas` +
      `${e.porque?.trim() ? ` (${e.porque.trim()})` : ""}`, p.pj);
    return nota(
      `${p.pj} tiene ${p.oro} monedas` +
        (real !== n ? `. Solo tenía ${antes}, así que no ha podido pagar las ${Math.abs(n)}.` : "."),
    );
  }

  if (nombre === "quitar_objeto") {
    const p = buscarPj(e.pj);
    if (!p) return `No hay ningún personaje llamado "${e.pj}".`;
    const buscado = norm(e.objeto ?? "");
    if (!buscado) return "Falta el nombre del objeto.";
    p.mochila ??= [];
    // Se acepta un trozo del nombre: el DJ dice «la cuerda» y en la mochila está «Cuerda de
    // cáñamo, 15 m». Exigir el nombre exacto haría que la herramienta fallara casi siempre.
    const i = p.mochila.findIndex((v) => {
      const q = norm(nombreObj(v));
      return q === buscado || q.includes(buscado) || buscado.includes(q);
    });
    if (i < 0) {
      const hay = p.mochila.map(nombreObj).filter(Boolean);
      return `${p.pj} no lleva nada que se parezca a "${e.objeto}". Lleva: ${
        hay.join(", ") || "nada"
      }.`;
    }
    const [fuera] = p.mochila.splice(i, 1);
    registrar("otro", `${p.pj} suelta ${nombreObj(fuera)}`, p.pj);
    return nota(`${nombreObj(fuera)} sale de la mochila de ${p.pj}.`);
  }

  if (nombre === "pedir_tirada") {
    const p = buscarPj(e.pj);
    // Se acepta que tire alguien que no está en el grupo (un NPC, una bestia): la tirada se
    // muestra igual, solo que sin buscar su ficha.
    const cd = Math.round(+e.cd) || 0;
    const mod = Math.round(+e.mod) || 0;
    E.tirada = {
      pj: p?.pj ?? (String(e.pj ?? "").trim() || "alguien"),
      que: String(e.que ?? "").trim() || "una prueba",  // aquí sí: || solo, sin ??
      cd, mod,
      ventaja: ["ventaja", "desventaja"].includes(e.ventaja) ? e.ventaja : "ninguna",
      dados: [], total: null, pasa: null,
    };
    guardarEstado(); pintarTirada();
    return nota(
      `En pantalla: ${E.tirada.pj} tira ${E.tirada.que}, CD ${cd}, ${mod >= 0 ? "+" : ""}${mod}` +
        `${E.tirada.ventaja !== "ninguna" ? ` con ${E.tirada.ventaja}` : ""}. ` +
        `Espera a que canten el dado; la app hace la cuenta.`,
    );
  }

  if (nombre === "iniciativa") {
    const orden = (Array.isArray(e.orden) ? e.orden : [])
      .map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, 12);
    E.iniciativa = orden.length ? { orden, turno: 0 } : null;
    guardarEstado(); pintarIniciativa();
    return nota(
      orden.length
        ? `Orden en pantalla: ${orden.join(", ")}. Empieza ${orden[0]}.`
        : "Tira de iniciativa quitada.",
    );
  }

  if (nombre === "siguiente_turno") {
    if (!E.iniciativa) return "No hay ningún combate en marcha, así que no hay turno que pasar.";
    const n = E.iniciativa.orden.length;
    E.iniciativa.turno = (E.iniciativa.turno + 1) % n;
    const vuelta = E.iniciativa.turno === 0;
    guardarEstado(); pintarIniciativa();
    return nota(
      `Turno de ${E.iniciativa.orden[E.iniciativa.turno]}${vuelta ? " (ronda nueva)" : ""}.`,
    );
  }

  if (nombre === "ambiente") {
    const cuales = ["calma", "tension", "combate", "horror", "duelo"];
    if (!cuales.includes(e.estado)) return `"${e.estado}" no vale. Son: ${cuales.join(", ")}.`;
    ponerAmbiente(e.estado);
    return nota(
      A.ambiente
        ? `El ambiente pasa a ${e.estado}.`
        : `Ambiente anotado (${e.estado}). La mesa lo tiene apagado, así que no suena.`,
    );
  }

  if (nombre === "ilustrar") {
    if (!A.claveFal) {
      // El aviso va a la MESA, no solo al DJ. Antes esto devolvía un texto y el DJ decidía si lo
      // mencionaba o no: se pidió una ilustración, no salió nada, y nadie supo por qué.
      avisar("El DJ ha querido ilustrar la escena pero falta la clave de fal.ai. Está en Ajustes.");
      return "No hay clave de fal.ai en Ajustes, así que no puedo pintar. DILE A LA MESA que le " +
        "falta esa clave, y sigue narrando sin imagen.";
    }
    const prompt = (e.prompt ?? "").trim();
    if (!prompt) return "Falta el prompt de la ilustración.";
    // Se lanza y NO se espera: son 10-20 segundos y el turno del DJ no puede quedarse parado
    // mirando. La imagen entra en pantalla cuando llegue, y si falla se avisa a la mesa.
    ilustrarEscena(prompt, e.pie);
    registrar("hallazgo", `Ilustración: ${prompt.slice(0, 70)}`);
    return nota(
      "Ya se está pintando; la mesa ve que está en marcha. Sigue narrando, no esperes a la imagen.",
    );
  }

  if (nombre === "mostrar") {
    // Abrir la ficha es un caso aparte: no es una pestaña, es una capa por encima de la mesa.
    if (e.vista === "ficha") {
      const p = buscarPj(e.pj);
      if (!p) {
        return `Para abrir una ficha hace falta de quién. No hay ningún personaje llamado "${
          e.pj ?? ""
        }". Son: ${E.partida.map((x) => x.pj).join(", ")}.`;
      }
      irA("escena");
      abrirFicha(E.partida.indexOf(p));
      return nota(`En pantalla: la ficha de ${p.pj}.`);
    }
    cerrarFicha();
    const vistas = { mesa: "escena", mapa: "mapa", mision: "mision", grupo: "grupo",
                     cierre: "mision" };
    const destino = vistas[e.vista];
    if (!destino) return `"${e.vista}" no es una vista. Son: mesa, mapa, grupo, ficha, cierre.`;
    irA(destino);
    // El cierre vive al final de la pestaña Misión, así que además hay que bajar hasta él.
    if (e.vista === "cierre") {
      $("#cierre-tabla")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    const comoSeLlama = { mesa: "la mesa", mapa: "el mapa", mision: "la misión",
                          grupo: "el grupo", cierre: "el cierre de la sesión" };
    return nota(`En pantalla: ${comoSeLlama[e.vista]}.`);
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
      .map((p) => `${p.pj} (${p.clase}, ${p.pg}/${p.pgMax} PG, CA ${caDe(p)}${
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
            // El «dónde lo dejamos», que es para lo que existe el diario. Solo la última entrada:
            // son unos 200 tokens y ahorran que la mesa se lo cuente al DJ cada vez. El diario
            // entero no cabe en cada turno.
            (() => {
              const u = leerDiario().at(-1);
              return u ? `De la sesión anterior (${u.n}): ${u.texto}` : "";
            })(),
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
  /** `voz` es un ID de voz de ElevenLabs, no un rol: el DJ siempre habla con `VOZ_DJ`. */
  constructor(voz) {
    this.voz = voz ?? VOZ_DJ;
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

  /**
   * Reproduce y se guarda el audio en curso, para poder callar al cancelar.
   *
   * Se guarda TAMBIÉN el `res` de la promesa, en `cerrarActual`. Es lo que arregla el fallo por el
   * que había que recargar la página: ver el comentario de `cortar()`.
   */
  reproducir(url) {
    return new Promise((res) => {
      const a = new Audio(url);
      a.volume = A.volVoz;
      this.suena = a;
      const fin = () => {
        URL.revokeObjectURL(url);
        if (this.suena === a) this.suena = null;
        this.cerrarActual = null;
        res();
      };
      this.cerrarActual = fin;
      a.onended = fin; a.onerror = fin;
      a.play().catch(fin);
    });
  }

  /**
   * Callar ya: para lo que suena y descarta lo que quedaba en la cola.
   *
   * **Y resuelve a mano la promesa de la frase que estaba sonando.** Sin eso, cancelar mientras el
   * DJ hablaba dejaba la app MUERTA hasta recargar la página, y así se dijo en mesa: `pause()` no
   * dispara `ended` ni `error`, así que la promesa de `reproducir` no se resolvía nunca, el
   * `await cola.terminar()` de `turno()` se quedaba colgado para siempre, su `finally` no llegaba a
   * correr y `ocupado` se quedaba en `true`. Con `ocupado` en true el botón solo cancela: no se
   * podía ni hablar ni escribir.
   *
   * Y se abortan las síntesis en vuelo, o cancelar tardaba hasta 25 segundos en surtir efecto
   * mientras esperaba a que contestara ElevenLabs para tirar el resultado a la basura.
   */
  cortar() {
    this.cortada = true;
    if (this.suena) { this.suena.pause(); this.suena = null; }
    this.cerrarActual?.();
    for (const l of this.enVuelo ?? []) l.ac.abort(new Error("cancelado por la mesa"));
    this.enVuelo = [];
  }
  async sintetizar(texto) {
    // Con límite, y si falla se devuelve null: la frase se queda sin voz pero el texto ya está
    // en la conversación, así que la partida sigue. Una frase muda es mucho mejor que colgarse.
    const lim = conLimite(25_000, "la voz");
    (this.enVuelo ??= []).push(lim);
    try {
      const r = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${this.voz}?output_format=mp3_44100_128`,
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
      this.enVuelo = (this.enVuelo ?? []).filter((x) => x !== lim);
    }
  }
  terminar() { return this.cadena; }
}


// ── Tirada en pantalla ───────────────────────────────────────────────────────
/**
 * El DJ anuncia la CD ANTES de tirar —es la regla de este sistema— así que la app puede hacer la
 * cuenta ella. Y eso es justo el punto: la mesa canta el dado, la pantalla suma y dice si pasa,
 * y el DJ ya no puede colar un resultado. Es lo que la partida de prueba existe para comprobar,
 * y hasta ahora solo se podía comprobar de oído.
 *
 * Con ventaja o desventaja se piden DOS dados y se coge el mejor o el peor, que es la regla.
 */
function pintarTirada() {
  const t = E.tirada;
  const caja = $("#tirada-caja");
  caja.hidden = !t;
  if (!t) return;

  const dobles = t.ventaja !== "ninguna";
  caja.dataset.fase = t.total === null ? "pide" : t.pasa ? "pasa" : "falla";
  $("#tir-quien").textContent = t.pj;
  $("#tir-que").textContent = t.que;
  $("#tir-cd").textContent = t.cd;
  $("#tir-mod").textContent = `${t.mod >= 0 ? "+" : "−"}${Math.abs(t.mod)}`;
  $("#tir-ventaja").textContent = dobles ? t.ventaja : "";
  $("#tir-ventaja").hidden = !dobles;
  $("#tir-d2").hidden = !dobles;
  $("#tir-pedir").hidden = t.total !== null;
  $("#tir-resultado").hidden = t.total === null;

  if (t.total !== null) {
    const usado = t.ventaja === "desventaja" ? Math.min(...t.dados) : Math.max(...t.dados);
    const desc = t.dados.length > 1
      ? `${t.dados.join(" y ")} → ${usado}`
      : `${usado}`;
    $("#tir-cuenta").textContent =
      `${desc} ${t.mod >= 0 ? "+" : "−"} ${Math.abs(t.mod)} = ${t.total}`;
    $("#tir-veredicto").textContent = t.pasa ? "PASA" : "FALLA";
    // Un 20 o un 1 natural se dicen: cambian lo que pasa después, y en mesa se celebran.
    const nat = usado === 20 ? "veinte natural" : usado === 1 ? "uno natural" : "";
    $("#tir-nat").textContent = nat;
    $("#tir-nat").hidden = !nat;
  }
}

/** Resuelve la tirada con los dados que ha cantado la mesa y se lo cuenta al DJ. */
async function resolverTirada() {
  const t = E.tirada;
  if (!t || t.total !== null) return;
  const dobles = t.ventaja !== "ninguna";
  const d1 = parseInt($("#tir-d1").value, 10);
  const d2 = dobles ? parseInt($("#tir-d2").value, 10) : NaN;
  const vale = (x) => Number.isInteger(x) && x >= 1 && x <= 20;
  if (!vale(d1) || (dobles && !vale(d2))) {
    avisar(dobles ? "Hacen falta los DOS dados, de 1 a 20." : "El dado va de 1 a 20.");
    return;
  }
  t.dados = dobles ? [d1, d2] : [d1];
  const usado = t.ventaja === "desventaja" ? Math.min(...t.dados) : Math.max(...t.dados);
  t.total = usado + t.mod;
  t.pasa = t.total >= t.cd;
  guardarEstado(); pintarTirada();
  sonarSuceso(t.pasa ? "golpe" : "gota");

  const linea =
    `${t.pj}, ${t.que}: ${t.dados.join(" y ")}${t.dados.length > 1 ? ` (${t.ventaja})` : ""}` +
    ` ${t.mod >= 0 ? "+" : "−"} ${Math.abs(t.mod)} = ${t.total} contra CD ${t.cd}. ` +
    `${t.pasa ? "PASA" : "FALLA"}${usado === 20 ? " (veinte natural)" : usado === 1 ? " (uno natural)" : ""}.`;
  registrar("tirada", linea, t.pj);
  $("#tir-d1").value = ""; $("#tir-d2").value = "";
  // Se le manda al DJ ya resuelta: la cuenta la ha hecho la app, no él.
  await turno(null, 0, linea);
}

$("#tirada-forma-caja").addEventListener("submit", (ev) => { ev.preventDefault(); resolverTirada(); });
$("#tir-cerrar").addEventListener("click", () => {
  E.tirada = null;
  guardarEstado(); pintarTirada();
});


// ── Iniciativa ───────────────────────────────────────────────────────────────
/** La tira de turnos durante el combate. Antes se llevaba de cabeza, y se perdía. */
function pintarIniciativa() {
  const ini = E.iniciativa;
  const caja = $("#iniciativa");
  caja.hidden = !ini;
  if (!ini) return;
  caja.innerHTML = ini.orden
    .map((n, i) => {
      // Quien está en el grupo se marca aparte de los enemigos: en una tira de siete nombres hay
      // que distinguir de un vistazo a los tuyos.
      const mio = !!buscarPj(n);
      return `<button class="turno-ini${i === ini.turno ? " ahora" : ""}"
                data-turno="${i}" data-mio="${mio ? "si" : "no"}"
                title="${i === ini.turno ? "Le toca" : "Tocar para saltar a su turno"}"
                >${esc(n)}</button>`;
    })
    .join("");
}

$("#iniciativa").addEventListener("click", (ev) => {
  const b = ev.target.closest("button[data-turno]");
  if (!b || !E.iniciativa) return;
  E.iniciativa.turno = +b.dataset.turno;
  guardarEstado(); pintarIniciativa();
});


// ── Ambiente sonoro ──────────────────────────────────────────────────────────
/**
 * La música y el ambiente están **sintetizados en el navegador** (`app/musica.js`), no son
 * ficheros. Motivo: la app tiene que funcionar sin conexión, unos loops pregenerados costarían
 * dinero, meterían megas en el repo y se oiría el bucle a la tercera vuelta.
 *
 * El módulo se carga con `import()` dinámico y **solo cuando se enciende**, por dos razones: no
 * cargar un motor de audio a quien no lo va a usar, y porque los navegadores exigen un gesto del
 * usuario para arrancar el audio — un `AudioContext` creado al abrir la página nace suspendido.
 */
let amb = null;
let ambEstado = "calma";

async function motorAmbiente() {
  if (amb) return amb;
  const { crearAmbiente } = await import("./musica.js");
  amb = crearAmbiente();
  amb.volumen(A.volAmb);
  return amb;
}

async function encenderAmbiente(si) {
  A.ambiente = si;
  guardarAjustes();
  pintarBotonAmbiente();
  try {
    if (!si) { amb?.parar(); return; }
    const m = await motorAmbiente();
    m.volumen(A.volAmb);
    m.poner(ambEstado);
  } catch (err) {
    A.ambiente = false;
    guardarAjustes();
    pintarBotonAmbiente();
    avisar(`El ambiente no ha arrancado (${err?.message ?? "error"}). La partida va igual.`);
  }
}

function pintarBotonAmbiente() {
  $("#acc-ambiente").dataset.on = A.ambiente ? "si" : "no";
  $("#acc-ambiente-txt").textContent = A.ambiente ? "Ambiente ♪" : "Ambiente";
}

/**
 * Un sonido suelto: la campana cuando alguien cae, la gota cuando una tirada falla.
 *
 * Solo suena si el ambiente ya está encendido. NO arranca el motor por su cuenta: un golpe de
 * tambor saliendo de la nada porque alguien falló una tirada sería una sorpresa desagradable, y
 * además el navegador exige un gesto para arrancar el audio.
 */
function sonarSuceso(tipo) {
  if (!A.ambiente || !amb) return;
  try { amb.suceso(tipo); } catch { /* el ambiente no es crítico: si falla, silencio */ }
}

/** Cambia de ambiente. Si está apagado se recuerda, y al encender suena el que toca. */
async function ponerAmbiente(estado) {
  ambEstado = estado;
  if (!A.ambiente) return;
  try { (await motorAmbiente()).poner(estado); } catch { /* ya se avisó al encender */ }
}

$("#acc-ambiente").addEventListener("click", () => encenderAmbiente(!A.ambiente));
$("#acc-sonido").addEventListener("click", () => {
  const m = $("#mandos-sonido");
  m.hidden = !m.hidden;
});

{
  const vv = $("#vol-voz"), va = $("#vol-amb");
  vv.value = Math.round(A.volVoz * 100);
  va.value = Math.round(A.volAmb * 100);
  $("#vol-voz-num").textContent = vv.value;
  $("#vol-amb-num").textContent = va.value;
  vv.addEventListener("input", () => {
    A.volVoz = +vv.value / 100;
    $("#vol-voz-num").textContent = vv.value;
    guardarAjustes();
    // Lo que ya está sonando también obedece: subir el volumen y no oír el cambio hasta la
    // frase siguiente parece que el mando no funciona.
    if (cola?.suena) cola.suena.volume = A.volVoz;
    const n = $("#esc-audio");
    if (n) n.volume = A.volVoz;
  });
  va.addEventListener("input", () => {
    A.volAmb = +va.value / 100;
    $("#vol-amb-num").textContent = va.value;
    guardarAjustes();
    amb?.volumen(A.volAmb);
  });
}


// ── Ilustrar la escena en vivo ───────────────────────────────────────────────
/**
 * El estilo se añade aquí y no lo escribe el DJ, por dos motivos: que todas las ilustraciones de
 * la campaña salgan del mismo cuadro, y que no se le pueda olvidar. Es el mismo texto que usa
 * `scripts/lib.mjs` para el arte pregenerado.
 */
const ESTILO_ILUSTRACION =
  "estética folk horror, pintura al óleo sombría, paleta desaturada de verdes musgo y grises turba";

/**
 * El diario de la campaña: una entrada por sesión cerrada, en orden.
 *
 * Va en su propia clave y NO dentro del estado de la partida, por lo mismo que la ilustración: el
 * estado se reescribe en cada golpe y no tiene sentido arrastrar diez resúmenes en cada escritura.
 * Y por aventura, que la prueba y la campaña no comparten crónica.
 */
const claveDiario = (av) => `corvalar.diario.v1.${av}`;

function leerDiario() {
  try { return JSON.parse(localStorage.getItem(claveDiario(A.aventura))) ?? []; }
  catch { return []; }
}

function guardarDiario(d) {
  try { localStorage.setItem(claveDiario(A.aventura), JSON.stringify(d.slice(-40))); }
  catch { avisar("No cabe más diario en el dispositivo. Descarga los audios y borra alguna entrada."); }
}

/**
 * Cierra la sesión: mete el resumen en el diario y pone a cero lo que es de UNA sesión —el
 * registro de acciones y la cuenta del gasto—, sin tocar el avance de la partida.
 *
 * Se pide confirmación porque no hay vuelta atrás para el registro, y porque cerrar la sesión sin
 * querer en mitad de una partida sería un fastidio de los que no se perdonan.
 */
function cerrarSesion() {
  if (!E.resumen) {
    avisar("Antes de cerrar la sesión hay que escribir el resumen: es lo que va al diario.");
    return;
  }
  const d = leerDiario();
  const n = d.length + 1;
  if (!confirm(
    `¿Cerrar la sesión ${n} y guardarla en el diario?\n\n` +
      `Se archiva el resumen y se vacía el registro de lo que ha pasado, para empezar la sesión ` +
      `siguiente en limpio. El avance de la partida no se toca.`,
  )) return;

  d.push({
    n,
    // La fecha la pone el dispositivo: aquí no hay reloj de servidor y tampoco hace falta.
    fecha: new Date().toISOString().slice(0, 10),
    lugar: `${actual().id} · ${actual().nombre}`,
    texto: E.resumen,
    grupo: E.partida.map((p) => ({ pj: p.pj, pg: `${p.pg}/${p.pgMax}`, heridas: [...p.heridas] })),
  });
  guardarDiario(d);

  E.registro = [];
  E.resumen = null;
  E.gasto = { sttSeg: 0, entrada: 0, salida: 0, ttsCar: 0, imagenes: 0 };
  E.tirada = null;
  E.iniciativa = null;
  guardarEstado();
  pintarTodo();
  ponEstado(`Sesión ${n} guardada en el diario.`, "bien");
}

function pintarDiario() {
  const d = leerDiario();
  $("#diario").innerHTML = d.length
    ? [...d].reverse().map((x) => `
        <article class="entrada-diario">
          <h3>Sesión ${x.n}<span>${esc(x.fecha)}${x.lugar ? ` · ${esc(x.lugar)}` : ""}</span></h3>
          <p>${esc(x.texto)}</p>
          ${x.grupo?.length
            ? `<p class="salieron">Salieron: ${x.grupo.map((g) =>
                 `${esc(g.pj)} ${esc(g.pg)}${g.heridas?.length ? ` (${esc(g.heridas.join(", "))})` : ""}`)
                 .join(" · ")}</p>`
            : ""}
        </article>`).join("")
    : `<p class="vacio">Todavía no hay sesiones cerradas. Al final de cada partida, escribe el
         resumen y dale a «Cerrar la sesión»: se va guardando aquí y el DJ lo lee para saber dónde
         lo dejasteis.</p>`;
}

$("#cerrar-sesion").addEventListener("click", cerrarSesion);

/** La última ilustración de la sesión, para poder volver a ella y para que sobreviva a recargar. */
const CLAVE_ILUSTRACION = "corvalar.ilustracion.v1";
let ilustrando = false;

async function ilustrarEscena(prompt, pie) {
  if (ilustrando) return; // una a la vez: dos en paralelo se pisan en pantalla y cuestan doble
  ilustrando = true;
  pintarIlustracion({ estado: "pintando", pie });

  const lim = conLimite(90_000, "la ilustración");
  try {
    const r = await fetch("https://fal.run/fal-ai/flux/dev", {
      method: "POST",
      headers: { Authorization: `Key ${A.claveFal}`, "content-type": "application/json" },
      signal: lim.señal,
      body: JSON.stringify({
        prompt: `${prompt}. ${ESTILO_ILUSTRACION}`,
        image_size: { width: 1024, height: 576 },
        num_images: 1,
        enable_safety_checker: true,
      }),
    });
    if (!r.ok) throw new Error(explicar("fal.ai", r.status));
    const j = await r.json();
    // El filtro de contenido de fal.ai NO falla: devuelve una imagen negra. Sin esto, en mesa
    // aparece un rectángulo negro y nadie sabe por qué.
    if (j.has_nsfw_concepts?.[0]) {
      throw new Error("El filtro del generador ha bloqueado la escena. Pídele al DJ otra imagen.");
    }
    const url = j.images?.[0]?.url;
    if (!url) throw new Error("El generador no ha devuelto imagen.");

    E.gasto.imagenes = (E.gasto.imagenes ?? 0) + 1;

    // Se intenta descargar para guardarla como data URL: un `blob:` no sobrevive a recargar y la
    // URL del proveedor caduca. Pero eso necesita que el proveedor sirva CORS, y si no lo hace la
    // imagen ya está pintada y sería absurdo perderla: en ese caso se usa la URL remota tal cual
    // en el `<img>` —que no necesita CORS— y solo se pierde el sobrevivir a recargar.
    let datos = null;
    try {
      const bytes = await (await fetch(url, { signal: lim.señal })).blob();
      if (!bytes.type.startsWith("image/")) throw new Error(`no es una imagen (${bytes.type})`);
      if (bytes.size < 20_000) {
        throw new Error(`imagen vacía (${(bytes.size / 1024) | 0} KB)`);
      }
      datos = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.onerror = () => rej(new Error("no se ha podido leer"));
        fr.readAsDataURL(bytes);
      });
      guardarIlustracion({ datos, pie: pie ?? "", prompt });
    } catch (e2) {
      if (e2?.name === "AbortError") throw e2;
      datos = url;
      ponEstado(`La ilustración se ve, pero no he podido guardarla (${e2.message}).`, "");
    }
    pintarIlustracion({ estado: "lista", datos, pie });
  } catch (err) {
    pintarIlustracion({ estado: "no" });
    avisar(err?.message ?? "La ilustración no ha salido.");
  } finally {
    lim.listo();
    ilustrando = false;
    pintarGasto();
  }
}

/**
 * Se guarda aparte del estado de la partida, no dentro: son cientos de kilobytes en base64 y
 * meterlos en `estado.json` haría que cada `guardarEstado()` —que pasa en cada golpe— reescribiera
 * medio megabyte. Y si no cabe, se descarta sin romper nada: la imagen ya está en pantalla.
 */
function guardarIlustracion(x) {
  try { localStorage.setItem(CLAVE_ILUSTRACION, JSON.stringify(x)); }
  catch { localStorage.removeItem(CLAVE_ILUSTRACION); }
}

function pintarIlustracion({ estado, datos, pie }) {
  const caja = $("#ilustracion"), img = $("#ilus-img");
  caja.dataset.estado = estado;
  caja.hidden = estado === "no";
  $("#ilus-pie").textContent = pie ?? "";
  if (estado === "lista" && datos) img.src = datos;
  if (estado === "no") img.removeAttribute("src");
}

/** Al arrancar, si la sesión anterior dejó una ilustración, se recupera. */
function recuperarIlustracion() {
  let x = null;
  try { x = JSON.parse(localStorage.getItem(CLAVE_ILUSTRACION)); } catch { /* nada */ }
  if (x?.datos) pintarIlustracion({ estado: "lista", datos: x.datos, pie: x.pie });
}

/**
 * Ilustrar a petición de la mesa, sin pasar por la decisión del DJ.
 *
 * Existe porque la primera vez que se pidió una imagen en mesa no salió ninguna: la herramienta
 * está, pero llamarla depende de que el modelo lo decida en ese turno. Con un botón no depende.
 *
 * Hace una llamada corta y aparte para convertir la conversación en un prompt de imagen en
 * inglés. Es un par de segundos y sale mucho mejor que mandar el texto español tal cual: el
 * generador no entiende «el Ahogado» ni «la turbera».
 */
async function pedirIlustracion() {
  if (ilustrando) return avisar("Ya se está pintando una. Espera a que termine.");
  if (!A.claveFal) return avisar("Falta la clave de fal.ai en Ajustes para poder ilustrar.");
  if (!A.claveCl) return avisar("Falta la clave de Claude en Ajustes.");
  limpiarAviso();
  const b = $("#acc-ilustrar");
  b.disabled = true;

  const l = actual();
  const ultimas = E.charla.slice(-4).map((t) => `${t.de === "mesa" ? "MESA" : "DJ"}: ${t.texto}`);
  const lim = conLimite(40_000, "el prompt de la ilustración");
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: cabecerasClaude(), signal: lim.señal,
      body: JSON.stringify({
        model: A.modelo, max_tokens: 300,
        system:
          "Convierte lo que está pasando en una partida de rol en un prompt de imagen, EN INGLÉS. " +
          "Describe lo que se ve como si fuera un cuadro: quién, haciendo qué, dónde, con qué luz. " +
          "Una sola frase, sin nombres propios (el generador no los conoce) y sin describir " +
          "cuerpos, piel ni ropa escasa, que el filtro del proveedor lo bloquea. No añadas estilo " +
          "ni calidad ni nada de «masterpiece»: eso se pone aparte. Contesta SOLO con el prompt.",
        messages: [{ role: "user", content:
          [`Sitio: ${l.nombre}. ${l.pie ?? ""}`, ...(ultimas.length ? ultimas : ["Acaban de llegar."])]
            .join("\n") }],
        ...(/sonnet-5|opus-5/.test(A.modelo) ? { thinking: { type: "disabled" } } : {}),
      }),
    });
    if (!r.ok) throw new Error(explicar("Claude", r.status));
    const j = await r.json();
    E.gasto.entrada += j.usage?.input_tokens ?? 0;
    E.gasto.salida += j.usage?.output_tokens ?? 0;
    const prompt = (j.content ?? []).filter((c) => c.type === "text")
      .map((c) => c.text).join("").trim();
    if (!prompt) throw new Error("no he sabido describir la escena");
    await ilustrarEscena(prompt, l.nombre);
  } catch (err) {
    avisar(`La ilustración no ha salido: ${err?.message ?? "error"}`);
  } finally {
    lim.listo();
    b.disabled = false;
    pintarGasto();
  }
}

$("#acc-ilustrar").addEventListener("click", pedirIlustracion);

$("#ilus-cerrar").addEventListener("click", () => {
  pintarIlustracion({ estado: "no" });
  localStorage.removeItem(CLAVE_ILUSTRACION);
});


// ── Cierre de sesión: resumen escrito y audio para mandar por WhatsApp ───────
/**
 * El resumen NO se inventa: se le pasa a Claude el registro que el DJ ha ido anotando durante la
 * partida, más los números del cierre. Así lo que sale es lo que pasó de verdad, con nombres, y
 * no una redacción genérica de aventureros en un bosque.
 *
 * Va aparte de `claudeStream` a propósito: aquí no hacen falta herramientas, ni historial, ni
 * streaming —el texto no se lee en voz alta a medida que llega—, y el prompt del DJ tiraría
 * hacia narrar la escena en vez de resumir la sesión.
 */
function guionDelResumen() {
  const s = estadisticas();
  const reg = (E.registro ?? []).map((x) =>
    `${x.n}. [${x.tipo}]${x.pj ? ` ${x.pj}:` : ""} ${x.que}`).join("\n");
  return [
    `Aventura: ${CAMPANA.titulo}.`,
    `Grupo: ${s.porPj.map((x) => `${x.pj} (${x.clase}, acaba con ${x.pg} PG${
      x.heridas.length ? `, herido: ${x.heridas.join(" y ")}` : ""
    })`).join("; ")}.`,
    `Localizaciones visitadas: ${E.visitadas.join(", ")}.`,
    s.gastado.length
      ? `Gastado: ${s.gastado.map(([k, n]) => `${n} ${k.toLowerCase()}`).join(", ")}.`
      : "",
    "",
    reg ? `Lo que quedó anotado, en orden:\n${reg}` : "No quedó nada anotado en el registro.",
  ].filter((x) => x !== null).join("\n");
}

const PROMPT_RESUMEN =
  "Eres el director de juego de una partida de rol de mesa que acaba de terminar. Escribe el " +
  "resumen de la sesión para mandárselo al grupo por WhatsApp, para que se lo escuchen.\n\n" +
  "Reglas:\n" +
  "- En español de España, en pasado, entre 110 y 150 palabras. Ni una más.\n" +
  "- Nombra a los personajes por su nombre y di qué hizo cada uno. Si alguien no hizo nada " +
  "reseñable, dilo con gracia en vez de inventarle una hazaña.\n" +
  "- Tono de crónica de taberna: con humor y algo de pique, pero sin insultar de verdad.\n" +
  "- Solo lo que esté en los datos. Nada de inventarse hechos, criaturas ni finales.\n" +
  "- Es para ESCUCHAR: frases cortas, sin listas, sin títulos, sin emojis, sin markdown. " +
  "Números en palabras cuando queden raros leídos en voz alta.\n" +
  "- Acaba con una frase que deje ganas de la siguiente sesión.";

let resumenEnCurso = false;

async function generarResumen() {
  if (resumenEnCurso) return;
  if (!A.claveCl) return avisar("Falta la clave de Claude. Está en Ajustes.");
  if (!(E.registro ?? []).length &&
      !confirm("El registro está vacío, así que el resumen va a ser muy pobre. ¿Lo hago igual?")) {
    return;
  }
  resumenEnCurso = true;
  limpiarAviso();
  const b = $("#cierre-hacer");
  b.disabled = true;
  b.querySelector("span:last-child").textContent = "escribiendo el resumen…";

  const lim = conLimite(90_000, "el resumen");
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: cabecerasClaude(),
      signal: lim.señal,
      body: JSON.stringify({
        model: A.modelo,
        max_tokens: 700,
        system: PROMPT_RESUMEN,
        messages: [{ role: "user", content: guionDelResumen() }],
        // Pensar aquí solo añade espera: es un texto corto con los datos delante.
        ...(/sonnet-5|opus-5/.test(A.modelo) ? { thinking: { type: "disabled" } } : {}),
      }),
    });
    if (!r.ok) throw new Error(explicar("Claude", r.status));
    const j = await r.json();
    E.gasto.entrada += j.usage?.input_tokens ?? 0;
    E.gasto.salida += j.usage?.output_tokens ?? 0;
    const texto = (j.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("").trim();
    if (!texto) throw new Error("Claude ha contestado sin texto.");
    E.resumen = texto;
    guardarEstado();
    pintarResumen();
  } catch (e) {
    avisar(e?.message ?? "El resumen no ha salido.");
  } finally {
    lim.listo();
    resumenEnCurso = false;
    b.disabled = false;
    b.querySelector("span:last-child").textContent = "Escribir el resumen";
    pintarGasto();
  }
}

/**
 * Convierte el resumen en un MP3 descargable.
 *
 * No se reproduce por la cola de voz: esto es un fichero para compartir, así que se deja como
 * enlace de descarga con nombre de fichero decente y además un reproductor, para poder oírlo
 * antes de mandarlo. El objeto URL anterior se revoca al hacer uno nuevo o la pestaña va
 * acumulando MP3 en memoria.
 */
let urlAudioResumen = null;

async function audioDelResumen() {
  if (!E.resumen) return avisar("Primero hay que escribir el resumen.");
  if (!A.clave11) return avisar("Falta la clave de ElevenLabs. Está en Ajustes.");
  limpiarAviso();
  const b = $("#cierre-audio");
  b.disabled = true;
  b.querySelector("span:last-child").textContent = "grabando la voz…";

  const lim = conLimite(60_000, "el audio del resumen");
  try {
    const r = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOZ.narrador}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": A.clave11, "content-type": "application/json" },
        signal: lim.señal,
        body: JSON.stringify({
          text: E.resumen, model_id: A.vozModelo, language_code: "es",
          voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.35 },
        }),
      },
    );
    if (!r.ok) throw new Error(explicar("ElevenLabs", r.status));
    const blob = await r.blob();
    E.gasto.ttsCar += E.resumen.length;

    if (urlAudioResumen) URL.revokeObjectURL(urlAudioResumen);
    urlAudioResumen = URL.createObjectURL(blob);

    const nombre = `${CAMPANA.titulo.replace(/[^\wáéíóúñÁÉÍÓÚÑ ]/g, "").replace(/\s+/g, "-")
      .toLowerCase()}-resumen.mp3`;
    const a = $("#cierre-descargar");
    a.href = urlAudioResumen;
    a.download = nombre;
    a.hidden = false;
    const au = $("#cierre-reproductor");
    au.src = urlAudioResumen;
    au.hidden = false;
    $("#cierre-peso").textContent = `${(blob.size / 1024).toFixed(0)} KB · ${nombre}`;
  } catch (e) {
    avisar(e?.message ?? "El audio no ha salido. El texto sí está, se puede copiar.");
  } finally {
    lim.listo();
    b.disabled = false;
    b.querySelector("span:last-child").textContent = "Grabar el audio";
    pintarGasto();
  }
}

function pintarResumen() {
  const hay = !!E.resumen;
  $("#cierre-texto").textContent = E.resumen ?? "";
  $("#cierre-texto").hidden = !hay;
  $("#cierre-audio").hidden = !hay;
  $("#cierre-copiar").hidden = !hay;
  if (!hay) {
    $("#cierre-descargar").hidden = true;
    $("#cierre-reproductor").hidden = true;
    $("#cierre-peso").textContent = "";
  }
}

$("#cierre-hacer").addEventListener("click", generarResumen);
$("#cierre-audio").addEventListener("click", audioDelResumen);
$("#cierre-copiar").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(E.resumen ?? "");
    ponEstado("Resumen copiado.", "bien");
  } catch {
    // Sin permiso de portapapeles (pasa en http): se selecciona para que copiar sea un gesto.
    const n = $("#cierre-texto");
    getSelection().selectAllChildren(n);
    ponEstado("Selecciónalo y cópialo a mano: el navegador no deja hacerlo solo.", "");
  }
});


// ── Modo tele: la pestaña que se duplica a la televisión ─────────────────────
if (ES_TELE) {
  document.documentElement.dataset.tele = "si";
  // Nada de capas ni de ficha en la tele: es una pantalla para mirar, no para tocar.
  irA("escena");
  canal?.addEventListener("message", (ev) => {
    if (ev.data?.que !== "estado") return;
    // Se relee del almacén en vez de recibir el estado por el mensaje: así la tele no puede
    // quedarse con una versión distinta de la que hay guardada.
    if (ev.data.aventura !== A.aventura && CAMPANAS[ev.data.aventura]) {
      A.aventura = ev.data.aventura;
      CAMPANA = CAMPANAS[A.aventura];
    }
    const nuevo = cargar(claveEstado(A.aventura));
    if (nuevo) { E = nuevo; pintarTodo(); recuperarIlustracion(); }
  });
  // La ilustración vive en su propia clave, y esa sí avisa por `storage` entre pestañas.
  addEventListener("storage", (ev) => {
    if (ev.key === CLAVE_ILUSTRACION) recuperarIlustracion();
  });
}


// ── Arranque ─────────────────────────────────────────────────────────────────
pintarTodo();
pintarBotonAmbiente();
recuperarIlustracion();

// Si el ambiente quedó encendido, arranca en el PRIMER gesto y no antes: un `AudioContext`
// creado al abrir la página nace suspendido, y llamarle `resume()` sin que nadie haya tocado
// nada no hace nada en ningún navegador moderno.
if (A.ambiente) {
  const arrancar = () => {
    removeEventListener("pointerdown", arrancar);
    removeEventListener("keydown", arrancar);
    encenderAmbiente(true);
  };
  addEventListener("pointerdown", arrancar, { once: false });
  addEventListener("keydown", arrancar, { once: false });
}
actualizarBotonHablar();
irA(location.hash.slice(1) || "escena", false);

/**
 * La versión, a la vista en Ajustes. `VERSION_APP` la sube a mano quien cambia la app; la del
 * service worker se le pregunta a él, y son dos cosas distintas a propósito: si no coinciden, el
 * tablet está sirviendo código viejo de la caché, que es lo primero que hay que descartar cuando
 * en mesa algo «no funciona».
 */
const VERSION_APP = "corvalar-v18";
$("#version").textContent = `app ${VERSION_APP} · service worker: preguntando…`;

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
  navigator.serviceWorker.addEventListener("message", (e) => {
    const v = e.data?.version;
    if (!v) return;
    $("#version").textContent =
      `app ${VERSION_APP} · service worker ${v}` +
      (v === VERSION_APP ? " · al día ✓" : " · ¡NO COINCIDEN! recarga dos veces");
  });
  navigator.serviceWorker.ready.then((reg) => {
    reg.active?.postMessage("version");
  }).catch(() => {});
  // Si no contesta en tres segundos, se dice: mejor «no contesta» que «preguntando…» para siempre.
  setTimeout(() => {
    if ($("#version").textContent.includes("preguntando")) {
      $("#version").textContent = `app ${VERSION_APP} · el service worker no contesta`;
    }
  }, 3000);
} else {
  $("#version").textContent = `app ${VERSION_APP} · sin service worker (no funcionará sin red)`;
}
