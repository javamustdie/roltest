/**
 * Centro de mandos — El Diezmo de Corvalar
 *
 * Por defecto todo ocurre en el tablet y no hay servidor:
 *   micrófono → Scribe (STT) → API de Claude → ElevenLabs (TTS) → altavoz
 *
 * Las claves las pone el dueño del dispositivo en Ajustes y viven en
 * localStorage. Nunca salen de aquí salvo hacia el servicio al que pertenecen.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Y ADEMÁS, SI LO HAY, UN SERVIDOR DE MESA
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Cuando la página la sirve `servidor/mesa.mjs` (el Pocophone de casa), la app
 * detecta el servidor con `conectarMesa()` y entra en uno de dos modos:
 *
 *   · `mesa`  — el tablet. Es el ÚNICO que ejecuta el bucle del DJ y el único
 *               que suena. Publica el estado y se come la cola de turnos que
 *               llegan de los móviles.
 *   · `mando` — un móvil. Manda turnos, ve el estado y se hace el selfie.
 *               **No reproduce la voz del DJ jamás**: cinco altavoces con la
 *               misma frase y décimas de desfase suenan a cueva. Eso no es un
 *               permiso, es reparto de trabajo por una razón física.
 *
 * Con servidor, las tres APIs van por su proxy (`API` más abajo) y las claves
 * las pone él desde su `.env`: ningún móvil necesita claves.
 *
 * Sin servidor —si mañana el Pocophone no arranca— `conectarMesa()` devuelve
 * `null` en menos de segundo y medio y la app se queda EXACTAMENTE como estaba:
 * estado en `localStorage`, claves de Ajustes. Eso es innegociable, y por eso
 * cada cosa que toca la mesa pregunta antes si hay mesa.
 */

import { CAMPANAS, CAMPANA_POR_DEFECTO } from "./campana.js";
import { RETRATOS } from "./retratos.js";
import { rasgosDe } from "./rasgos.js";
import { pintarMapaEn } from "./mapa.js";
import { iconoObjeto } from "./objetos.js";
import { figura, HUECOS_FIGURA, LIENZO, marcoHueco, interiorHueco } from "./figura.js";
import { accionesDe, COMUNES, COSTES } from "./acciones.js";
import {
  MAX_RELOJES, crearReloj, girar, estadoDeReloj, cuentaDeReloj, svgReloj,
} from "./relojes.js";
import { htmlDocumento } from "./documentos.js";
import { htmlGaleria } from "./quienes.js";
import { NARRACION } from "./narracion.js";
import {
  conectarMesa, apis as apisDe, modoRecordado, recordarModo,
} from "./sesion.js";

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
          enum: ["mesa", "mapa", "mision", "grupo", "quienes", "ficha", "cierre"],
          description:
            "«mesa» es la escena con las caras; «mapa» el mapa de la aventura a pantalla " +
            "completa; «mision» lo que saben, lo que han averiguado, los relojes y lo que han " +
            "ido haciendo; «grupo» las barras, los suministros y el oro; «quienes» a quién han " +
            "conocido y cómo les trata; «ficha» la hoja de un personaje (hace falta `pj`); " +
            "«cierre» las estadísticas y el resumen del final.",
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
  {
    name: "sonido",
    description:
      "Dispara un efecto de sonido MIENTRAS hablas. Es para el golpe seco de lo que pasa: la " +
      "espada que cae al suelo, la puerta que cruje, la campana de la iglesia. Suena a la vez que " +
      "narras, así que llámalo en el mismo turno en el que lo cuentas y no antes.\n\n" +
      "Úsalo poco y en lo que importa. Un sonido cada vez que alguien se mueve deja de significar " +
      "nada; uno bien puesto en una casa en silencio levanta a la mesa de la silla.",
    input_schema: {
      type: "object",
      properties: {
        que: {
          type: "string",
          enum: ["golpe", "crujido", "campana", "cuerno", "gota", "susurro", "rasca", "agudo"],
          description:
            "«golpe» algo que cae o se cierra de golpe —una espada al suelo, una puerta—; " +
            "«crujido» madera, una tabla, algo que cede despacio; «campana» la iglesia, o algo " +
            "que se acaba; «cuerno» una llamada lejana, gente que viene; «gota» agua en piedra, " +
            "un pozo, una cueva; «susurro» algo que habla y no debería; «rasca» algo arañando " +
            "al otro lado de la madera; «agudo» el pinchazo de cuando se ve lo que no se " +
            "esperaba.",
        },
      },
      required: ["que"],
    },
  },
  {
    name: "crear_reloj",
    description:
      "Abre un RELOJ DE TENSIÓN: un círculo de segmentos que se rellena y que la mesa ve en " +
      "pantalla todo el rato. Es para lo que avanza tenga alguien delante o no —un rito que se " +
      "prepara, una aldea que empieza a sospechar, algo que se acerca—, y sirve para que la " +
      "presión se vea en vez de tener que anunciarla cada dos por tres.\n\n" +
      "OJO: esto NO es la cuenta atrás de noches hasta la Luna Muerta; esa va sola y se mueve con " +
      "`avanzar_noche`. Abre un reloj cuando empiece una amenaza concreta, no al principio de la " +
      "sesión y de golpe: como mucho tres a la vez, y lo normal es uno o dos.",
    input_schema: {
      type: "object",
      properties: {
        titulo: {
          type: "string",
          description: "Corto y en voz de la mesa: «El rito», «La aldea sospecha», «Se acaba la luz».",
        },
        segmentos: {
          type: "integer",
          description:
            "4 si es cosa de una escena, 6 si cuesta una sesión, 8 si es el hilo de toda la " +
            "aventura. Por defecto 6.",
        },
        que_pasa: {
          type: "string",
          description: "Qué ocurre cuando se llene. Escríbelo ahora: al llenarse tendrás que cumplirlo.",
        },
      },
      required: ["titulo", "que_pasa"],
    },
  },
  {
    name: "girar_reloj",
    description:
      "Rellena (o vacía) segmentos de un reloj de tensión. Gíralo cuando la mesa gaste tiempo, " +
      "haga ruido, falle una tirada que importaba o simplemente se demore: uno o dos segmentos, y " +
      "DILO EN VOZ ALTA. Un reloj que se mueve en silencio no presiona a nadie.\n" +
      "Con avance negativo se deshace, que para eso está: si te has pasado, vuelve atrás.",
    input_schema: {
      type: "object",
      properties: {
        reloj: { type: "string", description: "El título del reloj, o parte de él." },
        avance: { type: "integer", description: "Cuántos segmentos. Normalmente 1 o 2." },
        motivo: { type: "string", description: "Por qué, en cuatro palabras. Sale en el registro." },
      },
      required: ["reloj", "avance"],
    },
  },
  {
    name: "archivar_reloj",
    description:
      "Quita un reloj de la escena cuando ya no viene a cuento o cuando se ha cumplido lo que " +
      "anunciaba. No lo borra: sigue apuntado en la Misión, para que en el resumen se vea por " +
      "dónde pasó la partida. Hazlo también si necesitas hueco para uno nuevo.",
    input_schema: {
      type: "object",
      properties: { reloj: { type: "string", description: "El título del reloj, o parte de él." } },
      required: ["reloj"],
    },
  },
  {
    name: "revelar_secreto",
    description:
      "Suelta una de las cosas que la mesa puede llegar a saber. Los secretos NO están atados a " +
      "un sitio ni a una tirada concreta: tú tienes la lista, y sueltas el que encaje cuando se " +
      "lo hayan ganado —una buena idea, una conversación que va bien, un registro que sí miran—. " +
      "Es lo que evita que la trama se atasque porque nadie registró el cadáver.\n\n" +
      "Suelta uno por escena tranquila y dos si la cosa va rápida. Dilo con tus palabras, no lo " +
      "leas tal cual. Lo que sueltas se apunta en la Misión; lo que no, no lo ve nadie.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "El id del secreto del catálogo de la aventura." },
        texto: {
          type: "string",
          description: "Solo si es algo que has improvisado y no está en el catálogo.",
        },
        como: { type: "string", description: "Cómo se han enterado, en media línea. Va al registro." },
      },
    },
  },
  {
    name: "apuntar_npc",
    description:
      "Apunta a alguien en «Quién es quién» la primera vez que la mesa lo conoce, y vuelve a " +
      "llamarlo cuando cambie su actitud o cuando muera. Con cuatro jugadores nuevos, los nombres " +
      "se pierden a la tercera sesión y luego nadie sabe quién era Olen.\n" +
      "Vale también para gente que te hayas inventado tú: se apunta igual.",
    input_schema: {
      type: "object",
      properties: {
        npc: { type: "string", description: "Su nombre." },
        disposicion: {
          type: "string",
          description:
            "Cómo os trata AHORA: tenso, hostil, evasivo, impaciente, neutral, asustado, " +
            "aliado, desconocido.",
        },
        nota: { type: "string", description: "Media línea que la mesa puede leer sin destriparse nada." },
        muerto: { type: "boolean" },
      },
      required: ["npc"],
    },
  },
  {
    name: "mostrar_documento",
    description:
      "Pone un papel en pantalla para que lo LEAN ellos: una carta, una inscripción en piedra, " +
      "una página de un registro, una lista de nombres. Es mejor que leerlo en voz alta —lo " +
      "miran, lo señalan, discuten— y hace que el hallazgo pese.\n\n" +
      "Dales tiempo y **quítalo con `cerrar` cuando acabéis**, que si no tapa la escena.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "El id del documento del catálogo de la aventura." },
        titulo: { type: "string", description: "Si te lo inventas: qué es." },
        texto: { type: "string", description: "Si te lo inventas: lo que pone. Cuanto más corto, más se lee." },
        tipo: {
          type: "string",
          enum: ["carta", "inscripcion", "pagina", "registro"],
          description: "Cómo se dibuja el papel.",
        },
        cerrar: { type: "boolean", description: "true para quitarlo de la pantalla." },
      },
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
  // Paloma, madura y peninsular. Antes era Marisa, y se rechazó en escucha en mesa.
  mirena: "CS57JcynCr2pHsVpogbW",
  vesna: "CS57JcynCr2pHsVpogbW",
  sela: "CS57JcynCr2pHsVpogbW",
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

- **Los relojes de tensión son tu forma de apretar sin avisar cada dos por tres.** Abre uno con
  crear_reloj en cuanto empiece una amenaza que avanza tenga alguien delante o no: un rito que se
  prepara, una aldea que empieza a sospechar, algo que se acerca. Cuatro segmentos si es cosa de
  una escena, seis si cuesta una sesión, ocho si es el hilo de la aventura. Gíralo con girar_reloj
  cuando se demoren, hagan ruido o fallen algo que importaba, **y dilo en voz alta cada vez**: un
  reloj que se mueve en silencio no presiona a nadie. Al llenarse, cumple lo que anunciaste en esa
  misma escena y sin volver a avisar. Como mucho tres a la vez; lo normal es uno o dos.
  Cuidado, que hay dos cosas que se llaman reloj: **esto no es la cuenta atrás de noches**, que va
  aparte y se mueve con avanzar_noche.
- **Suelta secretos en vez de esconderlos detrás de una tirada.** Con revelar_secreto tienes una
  lista de cosas que pueden llegar a saber, y NO están atadas a un sitio concreto: sueltas la que
  encaje cuando se lo hayan ganado, por donde sea. Uno por escena tranquila, dos si va rápido.
  Así la trama no se atasca porque a nadie se le ocurrió registrar el cadáver. Dilo con tus
  palabras, no leas la frase tal cual.
- **Apunta a la gente.** La primera vez que conozcan a alguien, apuntar_npc; y otra vez cuando
  cambie cómo os trata o cuando muera. Son cuatro jugadores nuevos: sin esto, a la tercera sesión
  nadie se acuerda de quién era Olen.
- **Enséñales los papeles en vez de leerlos.** Con mostrar_documento pones en pantalla una carta,
  una inscripción o una página de un registro, y ellos la leen, la señalan y discuten. Pesa mucho
  más que si la lees tú. Dales tiempo y quítalo con \`cerrar\` cuando acaben.

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

  /** Relojes de tensión. No se borran nunca: se archivan, y siguen a la vista en la Misión. */
  relojes: [],
  /** Secretos ya soltados. Los que NO están aquí no se pintan jamás: el tablet lo ve la mesa. */
  secretos: [],
  /** Quién habéis conocido, por clave: { conocido, disposicion, nota, muerto }. */
  npcs: {},
  /** El papel que hay ahora mismo en pantalla, o null. */
  documento: null,
});

/**
 * Rellena lo que falte en un estado guardado ANTES de que nadie lo lea.
 *
 * Hay partidas a medias en el `localStorage` de la tablet, guardadas por versiones que no tenían
 * relojes ni secretos ni NPC. Sin esto, el primer `E.relojes.filter(...)` revienta y la app se
 * queda en blanco a mitad de sesión, que es el peor momento posible para descubrirlo.
 */
function sanearEstado() {
  E.relojes = Array.isArray(E.relojes) ? E.relojes : [];
  E.secretos = Array.isArray(E.secretos) ? E.secretos : [];
  E.npcs = E.npcs && typeof E.npcs === "object" ? E.npcs : {};
  if (E.documento && typeof E.documento !== "object") E.documento = null;
}

let E = cargar(claveEstado(A.aventura)) ?? porDefecto();
// Si la aventura cambió de forma bajo un estado guardado, la localización puede no existir
// ya: sin esto la app arranca en blanco y no dice por qué.
if (!CAMPANA.localizaciones.some((l) => l.id === E.local)) E = porDefecto();
sanearEstado();

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

// ── Las tres APIs, por un solo sitio ─────────────────────────────────────────
/**
 * Había ONCE `fetch` con el host escrito a mano —`api.anthropic.com`,
 * `api.elevenlabs.io`, `fal.run`— y con las cabeceras montadas en cada sitio. Eso hacía imposible
 * lo que pide la mesa: que los móviles llamen a las mismas APIs **por el proxy del servidor**, que
 * es quien tiene las claves. Ahora todos pasan por aquí.
 *
 * `API` arranca apuntando a los hosts de siempre con las claves de Ajustes —o sea, la app de hoy,
 * bit a bit— y `apisPara(mesa)` la reapunta al mismo origen cuando hay servidor de mesa. Las
 * funciones de cabeceras reciben la clave local y **la ignoran si hay servidor**: así el mismo
 * código de llamada sirve para un tablet con claves y para un móvil sin ninguna.
 *
 * `once` en vez de `eleven` porque el resto del fichero está en español; el módulo de sesión lo
 * llama `eleven` y la traducción se hace aquí, en un sitio.
 */
let API = apisPara(null);

/**
 * Se decide **por servicio**, no en bloque, y eso es una corrección: si el Pocophone sirve la app
 * pero su `.env` está a medias —tiene la de Claude y no la de fal, que es exactamente lo que pasa
 * cuando se monta con prisa— mandar todo por el proxy dejaría al tablet sin poder ilustrar aunque
 * tenga esa clave en Ajustes. Cada servicio va por el proxy solo si el servidor tiene ESA clave; si
 * no, se llama al host de siempre con la de este aparato.
 */
function apisPara(mesa) {
  const proxy = apisDe(mesa);     // mismo origen, claves del servidor
  const directo = apisDe(null);   // los hosts de siempre, claves de Ajustes
  const cual = (s) => (mesa && CLAVES_SERVIDOR[s] ? proxy : directo);
  const c = cual("claude"), o = cual("once"), f = cual("fal");
  return {
    claude: c.claude,   // el endpoint completo de /v1/messages
    once: o.eleven,     // la base, sin barra final: `${API.once}/text-to-speech/…`
    fal: f.fal,         // la base: `${API.fal}/fal-ai/flux/dev`
    conServidor: !!mesa,
    cab: {
      claude: (k) => c.cabeceras.claude(k),
      eleven: (k, op) => o.cabeceras.eleven(k, op),
      fal: (k, op) => f.cabeceras.fal(k, op),
    },
  };
}

// ── Modo de mesa ─────────────────────────────────────────────────────────────
/** El objeto de `sesion.js`, o null mientras no se sepa (y para siempre si no hay servidor). */
let MESA = null;
/** `solo` es la app de hoy: un tablet y nada más. Ver la cabecera del fichero. */
let MODO = "solo";
const enMando = () => MODO === "mando";
const enMesa = () => MODO === "mesa";
/**
 * Quién puede hacer ruido. Un móvil NUNCA: cinco altavoces reproduciendo la misma voz en la misma
 * habitación con décimas de desfase suena a cueva, y eso incluye la narración pregenerada, el
 * ambiente y el «repetir» de un mensaje. El texto sí lo ven todos.
 */
const puedeSonar = () => MODO !== "mando";

/**
 * De qué claves dispone el servidor (lo dice `/mesa/salud` en `apis`). Sin servidor no hay
 * ninguna y manda Ajustes, que es como funciona hoy.
 *
 * Se pregunta en vez de suponerse porque el fallo que evita es concreto: un móvil sin claves
 * enseñando «Falta la clave de fal.ai en Ajustes» cuando la clave la tiene el Pocophone.
 */
let CLAVES_SERVIDOR = { claude: false, once: false, fal: false };
/** Hay clave si la tiene el servidor **o** este aparato. Cualquiera de las dos sirve. */
const hayClave = (servicio, local) => (API.conServidor && CLAVES_SERVIDOR[servicio]) || !!local;
const faltaClaude = () => !hayClave("claude", A.claveCl);
const faltaOnce = () => !hayClave("once", A.clave11);
const faltaFal = () => !hayClave("fal", A.claveFal);
/** El mensaje de «no hay clave» tiene que decir DÓNDE se pone, y eso depende de quién llama. */
const sinClave = (servicio, para) =>
  API.conServidor
    ? `Nadie tiene clave de ${servicio} —ni el servidor de la mesa, en su .env, ni este aparato, ` +
      `en Ajustes—, así que no puedo ${para}.`
    : `Falta la clave de ${servicio} en Ajustes para ${para}.`;

function guardarEstado() {
  localStorage.setItem(claveEstado(A.aventura), JSON.stringify(E));
  // La pestaña de la tele no manda avisos: solo escucha. Si los mandara, las dos se repintarían
  // en bucle la una a la otra.
  if (!ES_TELE) canal?.postMessage({ que: "estado", aventura: A.aventura });
  // Y si hay servidor de mesa y este aparato ES la mesa, el estado nuevo va a todos. Va agrupado
  // (ver `publicarPartida`): guardarEstado se llama varias veces por turno.
  publicarPartida();
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
  sanearEstado();
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
const CAPAS = ["mapa", "mision", "grupo", "quienes", "ajustes"];

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
      <p>Toca mi cara o el botón de abajo, habla, y vuelve a tocar para enviar. O escríbeme aquí.</p></div>`;
    pintarCola();
    pintarParte();
    return;
  }
  const desde = Math.max(0, E.charla.length - 12);
  c.innerHTML = E.charla
    .slice(desde)
    .map((t, k) => `<div class="turno" data-de="${t.de}">
        <div class="quien">${
          t.de === "mesa" ? "la mesa"
            : t.de === "grabada" ? `narración · ${esc(t.lugar ?? "")}`
            : "director de juego"
        }${
          t.de === "dj"
            ? `<button class="repe" data-repetir="${desde + k}" data-suena="no"
                 title="Repetir en voz. Vuelve a tocarlo para parar."><span>▶</span></button>`
            : ""
        }${
          // La grabada se relanza con su propio MP3, no volviendo a sintetizarla: ya existe, suena
          // mejor que la voz en vivo y repetirla por TTS costaría dinero por algo que ya está.
          t.de === "grabada"
            ? `<button class="repe" data-regrabada="${esc(t.audio)}"
                 title="Volver a poner la grabación"><span>▶</span></button>`
            : ""
        }</div>
        <p>${esc(t.texto)}</p>${
          t.hechos?.length
            ? `<ul class="hechos">${t.hechos.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>`
            : ""
        }</div>`)
    .join("");
  // Estos dos van DESPUÉS y por su cuenta porque no viven en `E.charla`: son lo que está pasando
  // ahora mismo y todavía no es historia. Y porque el `innerHTML` de arriba los borraría.
  pintarCola();
  pintarParte();
  c.lastElementChild?.scrollIntoView({ block: "nearest" });
}

/**
 * Lo que los móviles han dicho y el DJ todavía no ha atendido.
 *
 * Sin esto, hablar desde un móvil es un acto de fe: tocas, sueltas, y no pasa nada visible hasta
 * que la tablet termina el turno entero —que puede ser medio minuto—. Con esto la frase aparece en
 * la conversación en cuanto el servidor la transcribe, marcada como pendiente, y quien la dijo sabe
 * que ha llegado. En la tablet vale para lo contrario: ver cuánta gente está esperando turno.
 */
function pintarCola() {
  $("#cola-mesa")?.remove();
  // Un turno que la mesa ya ha metido en la conversación no se pinta dos veces. Pasa de verdad:
  // mientras el DJ resuelve la frase de un móvil, esa frase está a la vez en `E.charla` (porque la
  // mesa publica en cuanto la apunta) y en la cola del servidor (que no se vacía hasta el final).
  const dichas = E.charla.slice(-4).filter((t) => t.de === "mesa").map((t) => t.texto);
  const pendientes = COLA_MESA.filter(
    (t) => t?.texto && t.estado !== "hecho" && !dichas.some((d) => d.endsWith(t.texto)),
  );
  if (!pendientes.length) return;
  const c = $("#charla");
  if (!c) return;
  const n = document.createElement("div");
  n.id = "cola-mesa";
  n.innerHTML = pendientes
    .map((t) => `<div class="turno" data-de="mesa" data-cola="${esc(t.estado ?? "pendiente")}">
        <div class="quien">${esc(t.nombre || "un móvil")} · ${
          t.estado === "atendido" ? "el DJ lo está atendiendo" : "en la cola"
        }</div>
        <p>${esc(t.texto)}</p>
      </div>`)
    .join("");
  c.append(n);
}

function estadoPj(p) {
  if (p.pg <= 0) return "caido";
  if (p.pg <= p.pgMax / 3) return "grave";
  if (p.pg <= p.pgMax / 2) return "tocado";
  return "entero";
}

// ── Banda de personajes ──────────────────────────────────────────────────────
/**
 * RETRATOS HECHOS EN MESA, A PARTIR DE UNA FOTO
 *
 * Antes el único camino era: el jugador manda la foto por el chat, yo la miro, escribo una
 * descripción de rasgos y el TEXTO va al generador. La foto no salía de la conversación. Es lo
 * prudente, pero el resultado no valía: una cara generada desde «mandíbula marcada, pelo castaño»
 * no es la de nadie, y un retrato que no se reconoce no pinta nada en la barra de personajes.
 *
 * Así que ahora la foto va al proveedor, a un modelo hecho para conservar el parecido. Lo decidió
 * el dueño del proyecto a sabiendas. Lo que hay que tener presente:
 *   · La foto sale del dispositivo. Si es de otra persona, tiene que saberlo.
 *   · Se manda SOLO al generar. No se guarda la foto: se guarda el retrato pintado.
 *   · Se reduce a 768 px antes de mandarla. Una foto de móvil son 4 MB y no hacen falta.
 *
 * Los retratos generados viven aparte del estado, como las ilustraciones: son data URL de cientos
 * de kilobytes y `guardarEstado()` se llama en cada golpe.
 */
const CLAVE_CARAS = "corvalar.caras.v1";

function leerCaras() {
  try { return JSON.parse(localStorage.getItem(CLAVE_CARAS)) ?? {}; }
  catch { return {}; }
}

/** El retrato de un personaje: primero el hecho en mesa, y si no, el fichero pregenerado. */
function caraDe(p) {
  const propia = leerCaras()[p.pj];
  if (propia) return propia;
  return p.retrato ? `retratos/${encodeURIComponent(p.retrato)}.webp` : null;
}

/** El concepto visual de cada clase, para que el retrato no salga en vaqueros. */
const CONCEPTO_CLASE = {
  explorador: "cazador de bosque, capucha de lana basta, cuero gastado, mirada cansada",
  guerrero: "soldado curtido, cota de malla remendada, cicatrices, mandíbula apretada",
  clerigo: "religiosa de aldea, hábito pardo, símbolo de madera al cuello, gesto severo",
  picaro: "ladrón de caminos, capa oscura, media sonrisa, ojos que miran a los lados",
};

function conceptoDe(p) {
  const c = norm(p.clase).replace(/[^a-z]/g, "");
  return (
    Object.entries(CONCEPTO_CLASE).find(([k]) => c.startsWith(k))?.[1] ??
    "campesino de aldea, ropa basta de lana, gesto endurecido"
  );
}

/**
 * El encuadre del retrato. Es el mismo que usa `scripts/retrato.mjs`, y tiene que seguir siéndolo:
 * las medidas de la cara de `app/rasgos.js` —donde van los párpados y la boca— están tomadas con
 * este encuadre. Si cambia, la animación de la cara se descoloca.
 */
const ENCUADRE_RETRATO =
  "primer plano muy cerrado de la CARA, de frente, mirando a cámara, la cabeza llena el encuadre, " +
  "vestuario de campesino o soldado del siglo XIV, sin ropa moderna, sin cremalleras, " +
  "fondo liso muy oscuro, luz lateral suave de vela, pintura al óleo sobria, folk horror";

function pintarCaras() {
  const caja = $("#caras");
  if (!caja) return;
  const hechas = leerCaras();
  caja.innerHTML = E.partida
    .map((p, i) => {
      const src = caraDe(p);
      return `<div class="cara-fila">
        <span class="cara-mini">${
          src ? `<img alt="" src="${esc(src)}">` : `<span class="ini">${esc(iniciales(p.pj))}</span>`
        }</span>
        <span class="cara-quien"><b>${esc(p.pj)}</b><span>${esc(p.clase)}</span></span>
        <label class="cara-hacer">
          <input type="file" accept="image/*" capture="user" data-foto="${i}" hidden>
          <span class="icono">◉</span><span>${hechas[p.pj] ? "Otra vez" : "Hacer foto"}</span>
        </label>
        ${hechas[p.pj]
          ? `<button class="cara-quitar" data-quitarcara="${esc(p.pj)}"
               title="Quitar el retrato hecho en mesa">✕</button>`
          : ""}
      </div>`;
    })
    .join("");
}

/**
 * Reduce la foto antes de mandarla. Una foto de tablet son 3-5 MB en base64 y el modelo solo
 * necesita la cara: a 768 px el parecido es el mismo y la petición deja de tardar en subir.
 */
function reducirFoto(archivo, lado = 768) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(new Error("no he podido leer la foto"));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => rej(new Error("esa foto no se puede abrir"));
      img.onload = () => {
        // Recorte cuadrado centrado: el encuadre del retrato es cuadrado y así no se deforma.
        const corte = Math.min(img.width, img.height);
        const c = document.createElement("canvas");
        c.width = c.height = lado;
        const cx = c.getContext("2d");
        cx.drawImage(img, (img.width - corte) / 2, (img.height - corte) / 2, corte, corte, 0, 0, lado, lado);
        res(c.toDataURL("image/jpeg", 0.9));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(archivo);
  });
}

async function hacerRetrato(indice, archivo) {
  const p = E.partida[indice];
  if (!p) return;
  if (faltaFal()) return avisar(sinClave("fal.ai", "hacer retratos"));
  limpiarAviso();
  const nota = $("#caras-nota");
  nota.textContent = `Pintando el retrato de ${p.pj}… tarda unos veinte segundos.`;
  const paraElChip = chipPintando();

  const lim = conLimite(90_000, "el retrato");
  try {
    const foto = await reducirFoto(archivo);
    // Con servidor de mesa esto sale por su proxy, así que un móvil sin claves puede hacerse el
    // selfie: es lo que convierte «apiñaos alrededor del tablet» en «cada uno con el suyo».
    const r = await fetch(`${API.fal}/fal-ai/flux-pulid`, {
      method: "POST",
      headers: API.cab.fal(A.claveFal),
      signal: lim.señal,
      body: JSON.stringify({
        prompt: `${conceptoDe(p)}, ${ENCUADRE_RETRATO}`,
        reference_image_url: foto,
        image_size: "square_hd",
        num_inference_steps: 20,
        guidance_scale: 4,
        // A 1 sale calcado pero parece un filtro de móvil; por debajo de 0,8 deja de
        // reconocerse. 0,9 es donde se parece Y parece pintado.
        id_weight: 0.9,
        enable_safety_checker: true,
      }),
    });
    if (!r.ok) throw new Error(explicar("fal.ai", r.status));
    const j = await r.json();
    if (j.has_nsfw_concepts?.[0]) {
      throw new Error(
        "El filtro del generador ha bloqueado la foto. Prueba otra: de frente, con luz y de " +
          "hombros para arriba.",
      );
    }
    const url = j.images?.[0]?.url;
    if (!url) throw new Error("El generador no ha devuelto retrato.");

    // Se guarda como data URL para que sobreviva a recargar y funcione sin conexión: la URL del
    // proveedor caduca en unas horas y entonces la barra de personajes se queda con huecos.
    const bytes = await (await fetch(url, { signal: lim.señal })).blob();
    const datos = await new Promise((res2, rej) => {
      const fr = new FileReader();
      fr.onload = () => res2(fr.result);
      fr.onerror = () => rej(new Error("no se ha podido guardar el retrato"));
      fr.readAsDataURL(bytes);
    });

    const caras = leerCaras();
    caras[p.pj] = datos;
    try { localStorage.setItem(CLAVE_CARAS, JSON.stringify(caras)); }
    catch { throw new Error("No cabe otro retrato en el dispositivo. Quita alguno y reintenta."); }

    E.gasto.imagenes = (E.gasto.imagenes ?? 0) + 1;
    guardarEstado();
    pintarTodo();
    nota.textContent = `Listo. Si no le gusta, que se haga otra: se sobrescribe.`;
    // Quien se hace la foto es quien está mirando el móvil: eso es lo que hace que «Mi ficha» y
    // «Mi cara» sepan de quién hablan sin inventar roles ni logins.
    recordarMiPj(p.pj);
    // Y el retrato tiene que acabar en la tablet y en la tele, no solo en este aparato.
    await compartirCara(p.pj, datos);
  } catch (e) {
    nota.textContent = `No ha salido: ${e.message}`;
  } finally {
    lim.listo();
    paraElChip();
  }
}

$("#caras").addEventListener("change", (ev) => {
  const inp = ev.target.closest("input[data-foto]");
  if (!inp?.files?.[0]) return;
  const i = +inp.dataset.foto;
  const archivo = inp.files[0];
  inp.value = ""; // para que elegir la misma foto otra vez vuelva a disparar el evento
  // Quien se hace la foto es quien tiene el móvil en la mano, y eso se apunta ya —antes de que el
  // generador conteste— para que «Mi ficha» funcione aunque el retrato no salga.
  if (enMando()) recordarMiPj(E.partida[i]?.pj);
  hacerRetrato(i, archivo);
});

$("#caras").addEventListener("click", (ev) => {
  const b = ev.target.closest("button[data-quitarcara]");
  if (!b) return;
  const caras = leerCaras();
  delete caras[b.dataset.quitarcara];
  localStorage.setItem(CLAVE_CARAS, JSON.stringify(caras));
  pintarTodo();
});

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
      const src = caraDe(p);
      const cara = src
        ? `<img alt="" src="${esc(src)}"
             onerror="this.replaceWith(Object.assign(document.createElement('span'),
                      {className:'inicial',textContent:${JSON.stringify(iniciales(p.pj))}}))">`
        : `<span class="inicial">${esc(iniciales(p.pj))}</span>`;
      // La segunda barra es el agotamiento, en el sitio donde el original ponía los puntos de
      // hechizo. Se llena al empeorar, al contrario que la vida, y a 6 mata.
      const agot = Math.max(0, Math.min(6, p.agotamiento ?? 0));
      // `data-mio` enciende el marco en ámbar en el móvil de quien lleva ese personaje: en una
      // banda de cuatro caras de 44 px, encontrar la tuya de un vistazo importa.
      return `<button class="pj-banda" data-estado="${estadoPj(p)}" data-pjbanda="${i}"${
                 A.miPj && p.pj === A.miPj ? ' data-mio="si"' : ""
               }
                 aria-label="${esc(p.pj)}, ${p.pg} de ${p.pgMax} puntos de golpe${
                   agot ? `, agotamiento ${agot} de 6` : ""
                 }">
        <span class="marco"><span class="cara">${cara}</span>
          ${/* Con retrato hecho en mesa no hay medidas de la cara, pero POR_DEFECTO acierta
                bastante con este encuadre: mejor animar y dibujar heridas con valores por
                defecto que dejar la cara quieta porque nadie la ha medido todavía. */ ""}
          ${src ? capaCara(p.retrato ?? "", p.heridas) : ""}
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

  const srcCara = caraDe(p);
  const cara = srcCara
    ? `<img class="retrato-grande" alt="" src="${esc(srcCara)}">`
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
      const src = caraDe(p);
      const cara = src
        ? `<img alt="" src="${esc(src)}">`
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

/**
 * Los relojes de tensión, en dos sitios y a propósito.
 *
 * Sobre la escena van solo los que están en marcha —hasta tres— porque son los que aprietan
 * ahora; en la Misión van todos, incluidos los archivados, porque al cerrar la sesión enseñan por
 * dónde pasó la partida. Un reloj que no se ve no presiona a nadie, que es justamente su oficio.
 */
function pintarRelojes() {
  const vivos = E.relojes.filter((r) => !r.archivado).slice(0, MAX_RELOJES);
  const caja = $("#relojes");
  if (caja) {
    caja.hidden = !vivos.length;
    caja.innerHTML = vivos.map((r) => fichaReloj(r, 62)).join("");
  }
  const todos = $("#relojes-mision");
  if (todos) {
    todos.innerHTML = E.relojes.length
      ? E.relojes.map((r) => fichaReloj(r, 54)).join("")
      : `<p class="vacio">Ninguno todavía. El DJ los abre cuando algo empieza a apretar.</p>`;
  }
}

/** Un reloj con su título y, debajo, lo que pasa al llenarse. */
function fichaReloj(r, tam) {
  const estado = estadoDeReloj(r);
  return (
    `<figure class="reloj-t" data-estado="${estado}" title="${esc(r.quePasa)}">` +
    svgReloj(r.segmentos, r.lleno, { tam, estado }) +
    `<figcaption><b>${esc(r.titulo)}</b><span>${esc(cuentaDeReloj(r))}</span></figcaption>` +
    `</figure>`
  );
}

/** Lo que la mesa ha averiguado. Lo que NO se ha revelado no pasa por aquí nunca. */
function pintarSecretos() {
  const caja = $("#secretos");
  if (!caja) return;
  caja.innerHTML = E.secretos.length
    ? E.secretos.map((s) => `<li>${esc(s.texto)}</li>`).join("")
    : `<li class="vacio">Todavía nada. Lo que vayáis averiguando se apunta aquí.</li>`;
}

/** La galería de quien habéis conocido. El filtro de «conocido» lo hace `quienes.js`. */
function pintarQuienes() {
  const caja = $("#quienes");
  if (!caja) return;
  caja.innerHTML = htmlGaleria(CAMPANA.npcs ?? [], E.npcs);
}

/** El papel que el DJ ha puesto sobre la mesa, si hay alguno. */
function pintarDocumento() {
  const caja = $("#documento");
  if (!caja) return;
  const d = E.documento;
  caja.hidden = !d;
  $("#documento-hoja").innerHTML = d ? htmlDocumento(d) : "";
}

function pintarTodo() {
  pintarCabecera(); pintarEscena(); pintarCharla(); pintarGrupo(); pintarBanda();
  pintarMapa(); pintarGasto(); pintarArrancar(); pintarRegistro(); pintarCierre();
  pintarResumen(); pintarTirada(); pintarIniciativa(); pintarDiario();
  pintarRelojes(); pintarSecretos(); pintarQuienes(); pintarDocumento(); pintarMomentos();
  pintarCaras(); pintarMio();
}

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ── Interacciones de grupo y suministros ─────────────────────────────────────
$("#grupo-lista").addEventListener("click", (ev) => {
  const b = ev.target.closest("button");
  if (!b) return;
  // Tocar la cara abre su ficha, igual que en la banda de la mesa: es el gesto que ya se conoce.
  if (b.dataset.verficha !== undefined) {
    // En un móvil, abrir una ficha desde la lista del grupo es decir «este soy yo»: es lo que
    // hace que «Mi ficha» y «Mi cara» sepan de quién hablan sin roles, sin logins y sin que
    // nadie tenga que configurar nada. Si te equivocas, tocas otra y ya está.
    if (enMando()) recordarMiPj(E.partida[+b.dataset.verficha]?.pj);
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
  // Con `imagenes`, como hace el cierre de sesión. Sin él, el botón dejaba el contador de
  // ilustraciones donde estaba y el coste volvía a salir a mitad de cero.
  E.gasto = { sttSeg: 0, entrada: 0, salida: 0, ttsCar: 0, imagenes: 0 };
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
  // La narración grabada es voz del DJ: suena en la tablet y en ningún móvil. El texto sí entra en
  // la conversación de todos por `apuntarNarracion`, que es lo que hace falta para seguirla.
  if (!puedeSonar()) { apuntarNarracion(); return; }
  const a = $("#esc-audio");
  if (!a.getAttribute("src") || $("#acc-narracion").disabled) return;
  a.currentTime = 0;
  a.volume = A.volVoz;
  // Si no se puede reproducir no se avisa: no lo ha pedido nadie, y un aviso rojo por algo que
  // pasa solo asusta más de lo que informa. El botón sigue ahí para intentarlo a mano.
  a.play().catch(() => {});
  apuntarNarracion();
}

/**
 * Mete la narración grabada en la conversación.
 *
 * Sin esto pasaban las dos cosas de las que se quejó la mesa. Una: la grabación sonaba y no
 * quedaba rastro, así que no había forma de releerla ni de volver a lanzarla. Y dos, que es peor:
 * **el director de juego no se enteraba de que había sonado**. Él solo veía el resultado de
 * `mover_escena`; el audio lo dispara la app por su cuenta. Así que la mesa oía a Domar pedir que
 * encontraran a su hija y, acto seguido, el DJ preguntaba qué querían hacer como si Domar no
 * hubiera abierto la boca — o peor, volvía a contarlo.
 *
 * Entra como turno de la conversación con `de: "grabada"`, que es lo que la distingue en pantalla
 * y lo que hace que el DJ la reciba como algo YA DICHO y no como algo que tenga que decir.
 */
function apuntarNarracion() {
  const l = actual();
  const texto = NARRACION[l.audio];
  if (!texto) return;
  const ultimo = E.charla[E.charla.length - 1];
  // Al volver a un sitio ya visitado se repite el audio; repetir la entrada no aporta nada.
  if (ultimo?.de === "grabada" && ultimo.audio === l.audio) return;
  E.charla.push({ de: "grabada", texto, audio: l.audio, lugar: l.nombre });
  guardarEstado();
  pintarCharla();
}

{
  const a = $("#esc-audio"), b = $("#acc-narracion");
  b.addEventListener("click", () => {
    if (!puedeSonar()) return avisar("La narración suena en la tablet de la mesa, no en los móviles.");
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
  // Con servidor de mesa no hay claves que probar en este aparato: se prueban las de él, por su
  // proxy, que es exactamente lo que interesa comprobar antes de empezar.
  if (!API.conServidor && !A.clave11 && !A.claveCl) {
    ponEstado("Pon las claves y dale a Guardar primero.", "mal"); return;
  }
  ponEstado(API.conServidor ? "Comprobando las claves del servidor…" : "Comprobando…", "neutro");
  const r = [];

  try {
    const a = await fetch(`${API.once}/user/subscription`, {
      headers: API.cab.eleven(A.clave11, { json: false }),
    });
    if (a.ok) {
      const s = await a.json();
      const quedan = (s.character_limit ?? 0) - (s.character_count ?? 0);
      r.push(`ElevenLabs ✓ (${quedan.toLocaleString("es")} car. disponibles)`);
    } else r.push(explicar("ElevenLabs", a.status));
  } catch (e) { r.push(explicar("ElevenLabs", 0, e)); }

  try {
    const b = await fetch(API.claude, {
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
 * El vigilante: si el turno se queda sin dar señales de vida, ofrece la salida ahí mismo.
 *
 * `desatascar()` está en Ajustes, pero en mesa nadie va a Ajustes cuando la app «no hace nada»:
 * se recarga la página, que corta la escena. Así que el aviso —que está al pie de la lateral,
 * mirando a la mesa— se convierte en el botón de desatascar cuando detecta el atasco.
 *
 * Se vigila el LATIDO, no el tiempo total: un turno largo del DJ puede tardar minuto y medio
 * legítimamente, hablando. Cada cambio de estado y cada frase que empieza a sonar dan un latido;
 * lo que no es normal es un minuto y medio entero sin ninguno.
 */
let ultimoLatido = 0, vigilante = null;
const latir = () => { ultimoLatido = Date.now(); };
const SIN_LATIR = 90_000;

function vigilar() {
  latir();
  clearInterval(vigilante);
  vigilante = setInterval(() => {
    if (!ocupado) return dejarDeVigilar();
    if (Date.now() - ultimoLatido < SIN_LATIR) return;
    const a = $("#aviso");
    a.dataset.tipo = "atasco";
    a.textContent = "Minuto y medio sin novedades: parece atascada. Toca aquí y sigue la partida " +
      "sin recargar; no se pierde nada de lo guardado.";
    a.hidden = false;
  }, 5_000);
}
function dejarDeVigilar() { clearInterval(vigilante); vigilante = null; }

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
// Con la app atascada el aviso ES el botón de desatascar: cerrarlo no arreglaría nada.
$("#aviso").addEventListener("click", () => {
  if ($("#aviso").dataset.tipo === "atasco") { limpiarAviso(); desatascar(); return; }
  limpiarAviso();
});

/**
 * Las cabeceras de Claude. Las monta `sesion.js` porque cambian según haya servidor o no: sin
 * servidor van la clave de Ajustes y la cabecera que el navegador exige para llamar a la API
 * directamente; con servidor van las de sesión y la clave la pone él.
 */
function cabecerasClaude() {
  return API.cab.claude(A.claveCl);
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
  latir();   // cada cambio de estado cuenta como señal de vida para el vigilante
  bHablar.dataset.modo = m;
  tHablar.textContent = txt;
  // El retrato del DJ refleja el mismo estado: en mesa se mira la cara, no el botón.
  $("#dj").dataset.estado = m;
  $("#dj-estado").textContent = TEXTO_DJ[m] ?? m;
  // Cancelar solo tiene sentido mientras hay algo en marcha.
  $("#cancelar").hidden = !(m === "pensando" || m === "hablando");
  // Y los móviles se enteran de en qué anda el DJ. Va aquí y no en cada llamada porque este es el
  // único sitio por el que pasan TODOS los cambios de estado.
  anunciarDj(m);
}
function actualizarBotonHablar() {
  // Un móvil no necesita claves para hablar: graba, sube el audio al servidor y él lo transcribe.
  // Así que su botón no se desactiva nunca; si el servidor no puede, lo dirá al intentarlo.
  if (enMando()) {
    bHablar.disabled = false;
    if (ocupado) return;
    return modo("listo", grabadora ? "Enviar a la mesa" : "Toca para hablar");
  }
  const falta = faltaOnce() || faltaClaude();
  // Ocupado NO desactiva el botón: mientras piensa sirve para cancelar.
  bHablar.disabled = falta;
  if (falta) {
    return modo("listo", API.conServidor ? "El servidor no tiene claves" : "Pon las claves en Ajustes");
  }
  if (ocupado) return;
  modo("listo", grabadora ? "Enviar" : "Toca para hablar");
}

// ── El parte del DJ: todo lo que está haciendo, en su lateral ─────────────────
/**
 * Lo que el DJ hace estaba repartido por tres sitios y ninguno lo contaba entero: los estados
 * («pensando», «transcribiendo») en dos rótulos de dos palabras, lo que CAMBIA en `E.hechos` —que
 * solo aparece cuando el turno ya ha acabado— y lo que dice, que tampoco se veía hasta el final
 * aunque llegara en streaming. En mesa eso se lee como «la app no hace nada»: pasan veinte
 * segundos con la palabra «pensando…» y nadie sabe si está pensando, pintando o colgada.
 *
 * El parte lo junta todo en el sitio donde la mesa ya está mirando: el último bloque de la
 * conversación, debajo del retrato. Se abre al empezar el turno, va apuntando cada herramienta que
 * el DJ llama y cada cambio que hace, muestra el texto según llega, y se cierra al acabar —porque
 * entonces el turno de verdad ya está en la conversación, con sus hechos debajo.
 */
let PARTE = [];        // los pasos, en orden
let parteTexto = "";   // lo que va diciendo, mientras llega
let partePintar = null;

/** Qué es cada herramienta, en palabras de la mesa. Es lo que se lee en el parte. */
const QUE_HACE = {
  cambiar_pg: "toca los puntos de golpe",
  anadir_herida: "apunta una herida",
  cambiar_agotamiento: "toca el agotamiento",
  gastar_suministro: "gasta suministros",
  mover_escena: "os cambia de sitio",
  avanzar_noche: "hace caer la noche",
  escribir_ficha: "reescribe una ficha",
  equipar: "equipa a alguien",
  dar_objeto: "reparte un objeto",
  cambiar_oro: "toca el oro",
  quitar_objeto: "quita un objeto",
  pedir_tirada: "pide una tirada",
  iniciativa: "monta la iniciativa",
  siguiente_turno: "pasa el turno",
  ambiente: "cambia el ambiente",
  ilustrar: "manda pintar la escena",
  mostrar: "abre una pantalla",
  escribir_entrevista: "apunta en la entrevista",
  registrar_accion: "apunta en el registro",
  sonido: "lanza un sonido",
  crear_reloj: "abre un reloj de tensión",
  girar_reloj: "gira un reloj",
  archivar_reloj: "archiva un reloj",
  revelar_secreto: "suelta un secreto",
  apuntar_npc: "apunta a alguien que habéis conocido",
  mostrar_documento: "pone un papel sobre la mesa",
};

function abrirParte(primero) {
  PARTE = [];
  parteTexto = "";
  if (primero) PARTE.push(primero);
  pintarParte();
}

function apuntarParte(txt) {
  if (!txt) return;
  PARTE.push(String(txt));
  // Tope: un turno de combate largo puede encadenar diez herramientas y el parte no es un diario,
  // es lo que está pasando ahora. Los hechos completos quedan bajo el turno al acabar.
  if (PARTE.length > 14) PARTE.splice(0, PARTE.length - 14);
  pintarParte();
}

function cerrarParte() {
  PARTE = [];
  parteTexto = "";
  clearTimeout(partePintar);
  partePintar = null;
  pintarParte();
}

/**
 * El texto que llega en streaming. Se repinta como mucho cada 120 ms: llamar a esto por token
 * (son cientos por turno) tira el navegador del tablet, y ya se vio que la fluidez no se nota por
 * encima de diez repintados por segundo.
 */
function parteDiciendo(texto) {
  parteTexto = texto;
  if (partePintar) return;
  partePintar = setTimeout(() => { partePintar = null; pintarParte(); }, 120);
}

function pintarParte() {
  // La línea corta va en la cabecera del DJ, junto a su cara: se ve TAMBIÉN con una capa abierta —el
  // mapa, la misión— que es cuando más falta hace saber si el DJ sigue trabajando. El detalle
  // completo va en la conversación, que es donde hay sitio para desplazarse.
  const hace = $("#dj-hace");
  if (hace) {
    const ultimo = PARTE[PARTE.length - 1] ?? "";
    hace.textContent = ultimo;
    hace.hidden = !ultimo;
  }

  const c = $("#charla");
  if (!c) return;
  let n = $("#dj-parte");
  if (!PARTE.length && !parteTexto) { n?.remove(); return; }
  if (!n) {
    n = document.createElement("div");
    n.id = "dj-parte";
    n.className = "turno";
    n.dataset.de = "dj";
    n.dataset.parte = "si";
    c.append(n);
  }
  n.innerHTML =
    `<div class="quien">director de juego · ahora mismo</div>` +
    (parteTexto ? `<p>${esc(parteTexto)}</p>` : "") +
    (PARTE.length
      ? `<ul class="hechos">${PARTE.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`
      : "");
  n.scrollIntoView({ block: "nearest" });
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

/**
 * TOCAR LA CARA DEL DJ ES HABLARLE.
 *
 * Lo pidió la mesa y tiene toda la razón: el retrato es lo que la gente mira y lo que señala cuando
 * le habla, y justo encima había un botón rectangular que hacía una cosa distinta de la cara que
 * tenía debajo. Ahora la cara hace lo mismo, y lo hace **reenviando el clic** al botón en vez de
 * duplicar la lógica: así tocar para empezar, tocar para enviar y cortar mientras habla se
 * comportan exactamente igual por las dos puertas, y no hay dos sitios donde arreglar un fallo.
 *
 * `click()` sobre un botón desactivado no dispara nada, así que la cara también queda muerta cuando
 * faltan las claves, que es justo lo que se quiere.
 *
 * `#dj-hablar` es el botón que envuelve el retrato en `index.html`. Se cae con elegancia a `#dj`
 * entero si esa versión del marcado no lo tiene: mejor una zona de toque más grande que ninguna.
 */
{
  const cara = $("#dj-hablar") ?? $("#dj");
  if (cara) {
    if (!cara.title) cara.title = "Tócame y te escucho. Otra vez para enviar; mientras hablo, me cortas.";
    if (cara.tagName !== "BUTTON") { cara.tabIndex = 0; cara.setAttribute("role", "button"); }
    cara.addEventListener("click", (ev) => { ev.stopPropagation(); bHablar.click(); });
    cara.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      ev.preventDefault();
      bHablar.click();
    });
  }
}

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
  if (!puedeSonar()) { avisar("La voz suena en la tablet de la mesa, no en los móviles."); return; }
  if (faltaOnce()) { avisar(sinClave("ElevenLabs", "repetir en voz")); return; }
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

  // Volver a poner la grabación de la escena. Se usa el reproductor que ya la tiene cargada, así
  // que suena al instante y no cuesta nada: el MP3 está en la caché del service worker.
  const g = ev.target.closest("button[data-regrabada]");
  if (g) {
    if (!puedeSonar()) { avisar("La grabación suena en la tablet, no en los móviles."); return; }
    const a = $("#esc-audio");
    if (!a.paused) { a.pause(); return; }
    a.currentTime = 0;
    a.volume = A.volVoz;
    a.play().catch(() => avisar("No he podido volver a poner la grabación."));
  }
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

/**
 * Desatascar: la salida de emergencia cuando la app se queda muerta en mesa.
 *
 * Existe porque un cuelgue ya pasó de verdad —cortar al DJ mientras hablaba dejaba `ocupado` en
 * true para siempre— y la única salida fue recargar. Ese fallo está arreglado, pero el patrón
 * («algo no resuelve su promesa y el estado se queda pillado») puede repetirse por otro sitio, y
 * en mesa nadie va a diagnosticarlo: se recarga, y recargar en medio de una escena corta el ritmo
 * y se lleva lo que no estuviera guardado.
 *
 * Suelta TODO lo que puede tener algo cogido, en vez de intentar adivinar qué está atascado:
 * la grabación, la petición en vuelo, las dos colas de voz, el cronómetro, la narración y el
 * gesto de mover objetos. No toca el estado de la partida —PG, inventario, escena—: eso está
 * guardado y no es lo que se atasca.
 */
function desatascar() {
  try { if (grabadora?.state === "recording") grabadora.stop(); } catch { /* da igual */ }
  grabadora = null; trozos = [];
  if (cronometro) { clearInterval(cronometro); cronometro = null; }
  try { enCurso?.ac.abort(new Error("desatascado a mano")); } catch { /* da igual */ }
  enCurso = null;
  cola?.cortar(); cola = null;
  pararRepeticion();
  try { $("#esc-audio").pause(); } catch { /* da igual */ }
  cogido = null;
  ocupado = false;
  actualizarBotonHablar();
  pintarTodo();
  avisar("Desatascado. Si ha hecho falta esto, dímelo: es un fallo que hay que arreglar.");
}
$("#desatascar").addEventListener("click", desatascar);

// ── La tarjeta X ─────────────────────────────────────────────────────────────
/**
 * Cualquiera de la mesa la toca y la escena para. **No hay que explicar por qué, y nadie
 * pregunta.** Las líneas y los velos se pactan en la sesión cero, antes de describir nada; esto
 * es la herramienta para el durante, que es cuando de verdad hace falta.
 *
 * Va en dos pulsaciones a propósito: la primera CALLA —corta la voz y la petición en curso— y
 * abre las opciones; la segunda es la que cambia la ficción. Así un roce con la palma produce
 * silencio y nada más, y el silencio se deshace solo.
 *
 * Se reutiliza el corte de `desatascar` porque ya resuelve el fallo que costó dos rondas: `pause()`
 * no dispara `ended` ni `error`, así que la promesa de la frase hay que cortarla a mano o la app
 * se queda colgada esperando a un audio que ya no va a sonar.
 */
function callarTodo() {
  try { enCurso?.ac.abort(new Error("la mesa ha parado la escena")); } catch { /* da igual */ }
  enCurso = null;
  cola?.cortar(); cola = null;
  pararRepeticion();
  try { $("#esc-audio").pause(); } catch { /* da igual */ }
  ocupado = false;
  actualizarBotonHablar();
}

function abrirTarjetaX() {
  callarTodo();
  // Desde un móvil, callar aquí no calla nada: la voz sale de la tablet. Y la tarjeta X es una
  // herramienta de seguridad, así que «para AHORA» no puede esperar a que el DJ acabe el turno y
  // lea un mensaje de la cola. Va por el cajón compartido, que llega por SSE en milisegundos.
  if (enMando()) MESA?.enviar({ tipo: "anexo", clave: "parar", valor: { cuando: Date.now() } });
  $("#tx-fondo").hidden = false;
  $("#tx-panel").hidden = false;
}

function cerrarTarjetaX() {
  $("#tx-fondo").hidden = true;
  $("#tx-panel").hidden = true;
}

$("#tarjeta-x").addEventListener("click", abrirTarjetaX);
$("#tx-fondo").addEventListener("click", cerrarTarjetaX);
$("#tx-seguir").addEventListener("click", cerrarTarjetaX);

/**
 * Lo que se le dice al DJ. Va como turno normal, así que se entera por el mismo camino que todo
 * lo demás, pero el texto es una ORDEN y no una pregunta: no debe contestar «¿qué ha pasado?».
 */
async function pedirCambioDeTercio(que) {
  cerrarTarjetaX();
  registrar("decision", "La mesa ha parado la escena.");
  guardarEstado();
  if (faltaClaude() && !enMando()) {
    avisar("Parado. Sin clave de Anthropic no puedo avisar al DJ, pero la escena ya está cortada.");
    return;
  }
  await turno(null, 0, que);
}

$("#tx-rebobinar").addEventListener("click", () =>
  pedirCambioDeTercio(
    "ALTO. Alguien de la mesa ha tocado la tarjeta X y hemos elegido REBOBINAR. Lo último que has " +
      "narrado no ha pasado: deshazlo y vuelve a justo antes. NO preguntes por qué, no lo " +
      "menciones, no pidas explicaciones y no lo conviertas en tema. Retoma la escena por otro " +
      "sitio, con otro tono, y sigue como si nada.",
  ),
);

$("#tx-saltar").addEventListener("click", () =>
  pedirCambioDeTercio(
    "ALTO. Alguien de la mesa ha tocado la tarjeta X y hemos elegido SALTAR. Da por resuelto lo " +
      "que estaba pasando sin describirlo, corta hasta después, y cuéntanos dónde estamos ahora. " +
      "NO preguntes por qué, no lo menciones y no pidas explicaciones.",
  ),
);

// La pausa es LOCAL y no habla con nadie: nadie tiene que oír al DJ decir nada mientras la mesa
// respira. Por eso no llama a `turno` ni gasta un token.
$("#tx-pausa").addEventListener("click", () => {
  cerrarTarjetaX();
  registrar("otro", "La mesa ha pedido una pausa.");
  guardarEstado();
  $("#pausa").hidden = false;
});
$("#pausa-reanudar").addEventListener("click", () => { $("#pausa").hidden = true; });

// El papel se quita desde la mesa sin tener que pedírselo al DJ: cuando han acabado de leerlo,
// han acabado. El DJ también puede quitarlo con `mostrar_documento` y `cerrar`.
$("#documento-cerrar").addEventListener("click", () => {
  E.documento = null;
  guardarEstado();
  pintarDocumento();
});

// ── Cantar una tirada ────────────────────────────────────────────────────────
// Es lo que más se hace en mesa, y dictar números por voz es justo lo que peor transcribe.
$("#tirada-forma").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const c = $("#tirada");
  const n = c.value.trim();
  if (!n || ocupado) return;
  if (faltaClaude() && !enMando()) { avisar(sinClave("Anthropic", "hablar con el DJ")); return; }
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
  if (faltaClaude() && !enMando()) { avisar(sinClave("Anthropic", "hablar con el DJ")); return; }
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
  if (faltaClaude() && !enMando()) { avisar(sinClave("Anthropic", "hablar con el DJ")); return; }
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
  // Un móvil no ejecuta el bucle del DJ: lo suyo va a la cola del servidor y lo resuelve la
  // tablet, que es la única que suena. Ver `turnoDeMando`.
  if (enMando()) return turnoDeMando(blob, textoEscrito);

  limpiarAviso();
  ocupado = true;
  vigilar();
  abrirParte(textoEscrito ? "Le habéis dicho algo." : "Escuchando lo que habéis dicho…");
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
      // `json: false` a propósito: poner `content-type: application/json` sobre un `FormData` hace
      // que el navegador no escriba la frontera del multipart y ElevenLabs contesta 400.
      const rs = await fetch(`${API.once}/speech-to-text`, {
        method: "POST",
        headers: API.cab.eleven(A.clave11, { json: false }),
        body: fd,
        signal: lim.señal,
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
    apuntarParte("Pensando la respuesta…");
    cola = new ColaVoz(VOZ_DJ);
    let respuesta = "";
    let pendiente = "";

    const res = await claudeStream(dicho, (t) => {
      respuesta += t;
      pendiente += t;
      // El texto se ve LLEGAR en el parte, no al final. Es lo que convierte veinte segundos de
      // «pensando…» en veinte segundos de leerle mientras escribe.
      parteDiciendo(respuesta);
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
    dejarDeVigilar();
    // El parte se cierra aquí: a partir de ahora lo que hizo el DJ vive bajo su turno, en la
    // conversación, que es donde se puede releer mañana.
    cerrarParte();
    actualizarBotonHablar();
    // Y si había más turnos de los móviles esperando, el siguiente. Sin esto, dos jugadores
    // hablando a la vez dejarían el segundo en la cola hasta que alguien tocara la tablet.
    if (enMesa()) atenderCola();
  }
}

/**
 * Un turno DESDE UN MÓVIL: no se resuelve aquí, se pone en la cola del servidor.
 *
 * El audio se manda en crudo a `/mesa/voz` y lo transcribe el servidor, que es quien tiene la clave
 * de ElevenLabs; el texto entra en la cola atribuido a ESTE aparato, así que se sabe quién habló
 * sin separar voces. La tablet lo recoge por SSE y lo ejecuta como si se hubiera dicho allí, y la
 * frase vuelve escrita a este móvil en el estado que publica.
 *
 * `ocupado` se usa igual que en la tablet para que el botón no mande dos veces, pero aquí nunca
 * suena nada ni hay nada que cancelar más allá de la subida.
 */
async function turnoDeMando(blob, textoEscrito) {
  limpiarAviso();
  const texto = textoEscrito?.trim();
  if (!texto && !blob) return;
  if (!MESA) return avisar("Este móvil ha perdido el servidor de la mesa. Recarga la página.");
  ocupado = true;
  modo("pensando", texto ? "Mandándolo a la mesa…" : "Transcribiendo…");
  actualizarBotonHablar();
  const lim = conLimite(45_000, "el servidor de la mesa");
  enCurso = lim;
  try {
    if (texto) {
      const ok = await MESA.decir(texto, { nombre: A.miPj ?? "" });
      if (!ok) {
        avisar("Sin conexión con la mesa: lo mando en cuanto vuelva. No lo repitas.");
      }
    } else {
      const tipo = blob.type || "audio/webm";
      const r = await MESA.pedir(`/mesa/voz?tipo=${encodeURIComponent(tipo)}`, {
        method: "POST",
        headers: { "content-type": tipo },
        body: blob,
        signal: lim.señal,
      });
      const d = await r.json().catch(() => null);
      // El servidor contesta con un `error` en español pensado para leerse en mesa: se enseña tal
      // cual en vez de traducir un número de estado que aquí no significa nada.
      if (!r.ok) throw new Error(d?.error ?? `el servidor de la mesa dice ${r.status}`);
      if (!d?.texto) throw new Error("no he entendido nada. Prueba a hablar más cerca");
    }
  } catch (e) {
    const m = e?.name === "AbortError" ? (e.message || "cancelado") : e.message;
    avisar(`No ha salido: ${m}`);
  } finally {
    lim.listo();
    enCurso = null;
    ocupado = false;
    actualizarBotonHablar();
  }
}


// ── Ejecutar lo que pide el DJ ───────────────────────────────────────────────
/** Minúsculas y sin acentos, para comparar lo que escribe el DJ con lo que hay guardado. */
const norm = (x) =>
  String(x ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

/**
 * Busca un reloj de tensión por título, tolerando que el DJ lo escriba a medias.
 *
 * Se buscan primero los que están en marcha: si archivas «La niebla» y luego abres otro con el
 * mismo nombre, girar_reloj tiene que mover el vivo, no el que ya está guardado.
 */
function buscarReloj(titulo) {
  const n = norm(titulo);
  if (!n) return null;
  const porOrden = [...E.relojes.filter((r) => !r.archivado), ...E.relojes.filter((r) => r.archivado)];
  return (
    porOrden.find((r) => norm(r.titulo) === n || norm(r.id) === n) ??
    porOrden.find((r) => norm(r.titulo).includes(n) || n.includes(norm(r.titulo))) ??
    null
  );
}

/** Para decirle al DJ qué relojes hay cuando se equivoca de nombre. */
function cualesHayRelojes() {
  const vivos = E.relojes.filter((r) => !r.archivado);
  if (!vivos.length) return "Ahora mismo no hay ninguno en marcha.";
  return `Los que hay son: ${vivos.map((r) => `«${r.titulo}» (${cuentaDeReloj(r)})`).join(", ")}.`;
}

/**
 * Gira un reloj y deja el mundo al día: registro, guardado, pantalla y aviso.
 *
 * El módulo `relojes.js` solo sabe de aritmética de segmentos; todo lo que se ve y se recuerda
 * pasa por aquí. Un reloj que se completa se anuncia en pantalla como se anuncia caer a 0 PG: la
 * mesa tiene que verlo llegar, porque en eso consiste la tensión.
 */
function girarReloj(reloj, avance, motivo) {
  const g = girar(reloj, avance);
  if (!g.movidos) return g;
  // `girar` es aritmética pura y no toca el reloj: aplicarlo es cosa de aquí.
  reloj.lleno = g.lleno;
  registrar(
    "decision",
    `«${reloj.titulo}»: ${cuentaDeReloj(reloj)}${motivo ? ` — ${motivo}` : ""}`,
  );
  guardarEstado();
  pintarRelojes();
  if (g.completado) {
    sonarSuceso("campana");
    alarma(`Se ha llenado «${reloj.titulo}». ${reloj.quePasa}`);
  }
  return g;
}

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
  // `nota` es lo que se le enseña a la mesa: va a `E.hechos` —que queda bajo el turno en la
  // conversación, para poder auditar al DJ después— y además al parte, que lo cuenta EN EL MOMENTO
  // en que pasa. Antes solo hacía lo primero, así que un cambio de números durante un turno largo
  // no se veía hasta que el DJ terminaba de hablar.
  const nota = (t) => { E.hechos ??= []; E.hechos.push(t); apuntarParte(`→ ${t}`); return t; };

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
    if (faltaFal()) {
      // El aviso va a la MESA, no solo al DJ. Antes esto devolvía un texto y el DJ decidía si lo
      // mencionaba o no: se pidió una ilustración, no salió nada, y nadie supo por qué.
      avisar(`El DJ ha querido ilustrar la escena. ${sinClave("fal.ai", "pintarla")}`);
      return "No hay clave de fal.ai, así que no puedo pintar. DILE A LA MESA que le " +
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
                     quienes: "quienes", cierre: "mision" };
    const destino = vistas[e.vista];
    if (!destino) {
      return `"${e.vista}" no es una vista. Son: mesa, mapa, mision, grupo, quienes, ficha, cierre.`;
    }
    irA(destino);
    // El cierre vive al final de la pestaña Misión, así que además hay que bajar hasta él.
    if (e.vista === "cierre") {
      $("#cierre-tabla")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    const comoSeLlama = { mesa: "la mesa", mapa: "el mapa", mision: "la misión",
                          grupo: "el grupo", quienes: "quién es quién",
                          cierre: "el cierre de la sesión" };
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

  if (nombre === "sonido") {
    // Si la mesa tiene el ambiente apagado no suena nada, y eso no es un error: se le contesta al
    // DJ que siga narrando, porque el sonido era un adorno y la frase es lo que cuenta.
    sonarSuceso(e.que);
    return A.ambiente
      ? `Suena. Sigue hablando encima, no esperes a que acabe.`
      : `La mesa tiene el ambiente apagado, así que no ha sonado. Cuéntalo con palabras.`;
  }

  if (nombre === "crear_reloj") {
    E.relojes ??= [];
    const vivos = E.relojes.filter((r) => !r.archivado);
    // Un DJ que no se acuerda de haberlo creado lo crea otra vez con el mismo nombre, y en pantalla
    // salen dos ritos de Corvalar por la mitad cada uno. Se le devuelve el que ya tenía.
    const repetido = vivos.find((r) => norm(r.titulo) === norm(e.titulo));
    if (repetido) {
      return `Ese reloj ya está en marcha: «${repetido.titulo}», ${cuentaDeReloj(repetido)}. ` +
        `Gíralo con girar_reloj en vez de crear otro igual.`;
    }
    if (vivos.length >= MAX_RELOJES) {
      return `Ya hay ${MAX_RELOJES} relojes en marcha (${vivos.map((r) => `«${r.titulo}»`).join(", ")}). ` +
        `Archiva uno con archivar_reloj antes de crear otro: cuatro relojes no los sigue nadie.`;
    }
    const r = crearReloj(
      { titulo: e.titulo, segmentos: e.segmentos, quePasa: e.que_pasa }, E.relojes,
    );
    E.relojes.push(r);
    registrar("decision", `Reloj nuevo: «${r.titulo}», de ${r.segmentos} — ${r.quePasa}`);
    guardarEstado();
    pintarRelojes();
    return nota(
      `Reloj nuevo en pantalla: «${r.titulo}», ${cuentaDeReloj(r)}. Al llenarse: ${r.quePasa}. ` +
        `DILO EN VOZ ALTA: la gracia del reloj es que sepan que corre.`,
    );
  }

  if (nombre === "girar_reloj") {
    E.relojes ??= [];
    const r = buscarReloj(e.reloj);
    if (!r) return `No hay ningún reloj llamado "${e.reloj}". ${cualesHayRelojes()}`;
    const g = girarReloj(r, e.avance, e.motivo);
    if (!g.movidos) {
      return `«${r.titulo}» se queda en ${cuentaDeReloj(r)}: ya estaba ` +
        `${g.lleno === 0 ? "vacío" : "completo"} y ahí no se puede mover más.`;
    }
    return nota(
      `«${r.titulo}»: ${cuentaDeReloj(r)}${e.motivo ? ` (${e.motivo})` : ""}.` +
        (g.completado
          ? ` SE HA COMPLETADO. Haz que pase YA lo que anunciaste —${r.quePasa}— en esta misma ` +
            `escena y sin volver a avisar.`
          : ""),
    );
  }

  if (nombre === "archivar_reloj") {
    E.relojes ??= [];
    const r = buscarReloj(e.reloj);
    if (!r) return `No hay ningún reloj llamado "${e.reloj}". ${cualesHayRelojes()}`;
    if (r.archivado) return `«${r.titulo}» ya estaba archivado, y sigue apuntado en la Misión.`;
    r.archivado = true;
    registrar("otro", `Archivado el reloj «${r.titulo}» (${cuentaDeReloj(r)})`);
    guardarEstado();
    pintarRelojes();
    return nota(
      `Archivado el reloj «${r.titulo}» (${cuentaDeReloj(r)}). No se borra: sigue en la Misión.`,
    );
  }

  if (nombre === "revelar_secreto") {
    E.secretos ??= [];
    const catalogo = CAMPANA.secretos ?? [];
    const dados = new Set(E.secretos.map((x) => x.id).filter(Boolean));
    const quedan = catalogo.filter((x) => !dados.has(x.id)).map((x) => x.id).join(", ");
    const id = String(e.id ?? "").trim();
    const s = id ? catalogo.find((x) => norm(x.id) === norm(id)) : null;
    const texto = (e.texto ?? "").trim() || s?.texto || "";
    if (!texto) {
      return id
        ? `No hay ningún secreto con id "${id}", y no me has dado texto. Quedan por soltar: ${quedan || "ninguno"}.`
        : `Para soltar un secreto necesito su \`id\` del catálogo o el \`texto\` de lo que ` +
          `averiguan. Quedan por soltar: ${quedan || "ninguno"}.`;
    }
    const yaEsta = E.secretos.find(
      (x) => (s && x.id === s.id) || norm(x.texto) === norm(texto),
    );
    if (yaEsta) return "Ese secreto ya lo soltaste antes y la mesa lo tiene apuntado. Suelta otro.";
    E.secretos.push({ id: s?.id ?? null, texto, escena: E.local });
    registrar("hallazgo", e.como?.trim() ? `${texto} — ${e.como.trim()}` : texto);
    guardarEstado();
    pintarSecretos();
    return nota(
      `Ya lo saben, y lo tienen apuntado en la Misión: ${texto} Dilo con tus palabras, no lo leas.`,
    );
  }

  if (nombre === "apuntar_npc") {
    E.npcs ??= {};
    const n = norm(e.npc);
    if (!n) return "Falta a quién apunto.";
    const catalogo = CAMPANA.npcs ?? [];
    const f =
      catalogo.find((x) => norm(x.id) === n || norm(x.nombre) === n) ??
      catalogo.find((x) => norm(x.nombre).startsWith(n) || n.startsWith(norm(x.nombre)));
    // Los NPC que el DJ se inventa también son gente que la mesa ha conocido, así que se apuntan
    // igual con una clave sacada del nombre; `quienes.js` sabe pintarlos sin ficha de catálogo.
    const suelto = n.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const clave = f?.id ?? (suelto || "npc");
    const nuevo = !E.npcs[clave]?.conocido;
    const ficha = (E.npcs[clave] ??= {});
    ficha.conocido = true;
    if (!f) ficha.nombre = String(e.npc).trim();
    if (e.disposicion) ficha.disposicion = e.disposicion;
    ficha.disposicion ??= "desconocido";
    if (e.nota?.trim()) ficha.nota = e.nota.trim();
    if (typeof e.muerto === "boolean") ficha.muerto = e.muerto;
    const quien = f?.nombre ?? ficha.nombre ?? clave;
    registrar(
      ficha.muerto ? "muerte" : "otro",
      `${quien}: ${ficha.disposicion}${ficha.muerto ? ", muerto" : ""}` +
        (ficha.nota ? ` — ${ficha.nota}` : ""),
    );
    guardarEstado();
    pintarQuienes();
    return nota(
      `${quien}, ${ficha.disposicion}${ficha.muerto ? ", muerto" : ""}. ` +
        (nuevo ? "Ya sale en «Quién es quién»." : "Actualizado en «Quién es quién».") +
        (f ? "" : " No estaba en el guion de la aventura, así que lo he apuntado como tuyo."),
    );
  }

  if (nombre === "mostrar_documento") {
    if (e.cerrar) {
      E.documento = null;
      guardarEstado();
      pintarDocumento();
      return nota("Documento quitado de la pantalla.");
    }
    const catalogo = CAMPANA.documentos ?? [];
    const cuales = catalogo.map((x) => `${x.id} (${x.titulo})`).join(", ") || "ninguno";
    const id = String(e.id ?? "").trim();
    const d = id ? catalogo.find((x) => norm(x.id) === norm(id)) : null;
    if (id && !d) return `No hay ningún documento con id "${id}". Los que hay son: ${cuales}.`;
    const titulo = (e.titulo ?? "").trim() || d?.titulo || "";
    const texto = (e.texto ?? "").trim() || d?.texto || "";
    const tipo = e.tipo || d?.tipo || "carta";
    if (!texto) {
      return `Para enseñar un papel me hace falta su \`id\` del catálogo o el \`texto\` de lo que ` +
        `pone. Los del catálogo son: ${cuales}.`;
    }
    E.documento = { titulo, texto, tipo };
    registrar("hallazgo", `Documento en pantalla: ${titulo || tipo}`);
    guardarEstado();
    pintarDocumento();
    return nota(
      `En pantalla: «${titulo || "el papel"}». Dales tiempo a leerlo y a discutirlo antes de ` +
        `seguir, y quítalo con \`cerrar\` cuando acabéis: si lo dejas puesto, tapa la escena.`,
    );
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
            // Los relojes van SIEMPRE, también cuando los gira la mesa a mano desde la Misión: si
            // no, el DJ sigue creyendo que el rito va por dos y narra una presión que ya no es la
            // que se ve en pantalla.
            (() => {
              const vivos = (E.relojes ?? []).filter((r) => !r.archivado);
              return vivos.length
                ? `Relojes en marcha: ${vivos
                    .map((r) => `«${r.titulo}» ${r.lleno}/${r.segmentos} (al llenarse: ${r.quePasa})`)
                    .join("; ")}.`
                : "";
            })(),
            // Los secretos que QUEDAN, con su id y su peso. Esto es lo único de toda la app que
            // sabe lo que la mesa todavía no sabe, y por eso no se pinta en ninguna pantalla: vive
            // aquí, en el bloque volátil del prompt —el que no se cachea—, y muere con la
            // petición. La lista mengua sola según se van soltando.
            (() => {
              const dados = new Set((E.secretos ?? []).map((s) => s.id).filter(Boolean));
              const quedan = (CAMPANA.secretos ?? []).filter((s) => !dados.has(s.id));
              return quedan.length
                ? "SECRETOS QUE AÚN NO SABEN (suelta el que cuadre con revelar_secreto, nunca los " +
                  `leas tal cual): ${quedan.map((s) => `[${s.id}|${s.peso}] ${s.texto}`).join(" ")}`
                : "";
            })(),
            Object.keys(E.npcs ?? {}).length
              ? `Ya han conocido a: ${Object.entries(E.npcs)
                  .map(([k, v]) => `${v.nombre ?? k} (${v.disposicion ?? "?"}${v.muerto ? ", muerto" : ""})`)
                  .join(", ")}.`
              : "",
            (CAMPANA.documentos ?? []).length
              ? `Papeles que puedes enseñar por id con mostrar_documento: ${CAMPANA.documentos
                  .map((d) => `${d.id} (${d.titulo})`).join(", ")}.`
              : "",
            (CAMPANA.relojesSugeridos ?? []).length
              ? `Relojes previstos para esta aventura: ${CAMPANA.relojesSugeridos
                  .map((r) => `«${r.titulo}» de ${r.segmentos}`).join(", ")}.`
              : "",
            E.documento ? `En pantalla hay un documento abierto: «${E.documento.titulo}».` : "",
            E.pausa ? "LA MESA TIENE LA PARTIDA EN PAUSA." : "",
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

  /**
   * Las narraciones grabadas van como ACOTACIÓN, no como turno del DJ.
   *
   * Si fueran `assistant`, el modelo las leería como algo que dijo él y acabaría imitando el
   * registro de la narración pregenerada, que es otro. Y si no van, pasa lo que se quejó la mesa:
   * suena Domar pidiendo que encuentren a su hija y el DJ contesta como si nadie hubiera hablado.
   * Como acotación de la mesa queda claro que ya se ha oído y que no hay que repetirlo.
   */
  const historial = E.charla.slice(-8).map((t) =>
    t.de === "grabada"
      ? {
          role: "user",
          content:
            `[Ha sonado la narración grabada de la escena. La mesa la ha oído entera, ` +
            `palabra por palabra: «${t.texto}» — NO la repitas ni la resumas: sigue desde ahí.]`,
        }
      : { role: t.de === "mesa" ? "user" : "assistant", content: t.texto });
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

      const r = await fetch(API.claude, {
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
        content: usos.map((b) => {
          // Se anuncia la herramienta ANTES de ejecutarla: si una tarda o falla, la mesa ve en qué
          // se ha quedado el DJ en vez de un «pensando…» que no dice nada.
          apuntarParte(`⚙ ${QUE_HACE[b.cb.name] ?? b.cb.name}`);
          return {
            type: "tool_result",
            tool_use_id: b.cb.id,
            content: ejecutarHerramienta(b.cb.name, parsearJson(b.json)),
          };
        }),
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
    // Un móvil no sintetiza ni suena: ni gasta caracteres de ElevenLabs ni añade un altavoz más a
    // la habitación. El texto lo ve igual en la conversación.
    if (!puedeSonar()) return;
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
      // Cada frase que arranca es una señal de vida: un turno largo del DJ tarda minuto y medio
      // hablando y no está atascado. Ver `vigilar()`.
      a.onplaying = latir;
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
        `${API.once}/text-to-speech/${this.voz}?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: API.cab.eleven(A.clave11),
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
  // El ambiente es sonido de mesa, y cuatro móviles con el mismo bucle desfasado es el mismo
  // problema que la voz. Se apunta el interruptor —para que se vea igual en todas las pantallas—
  // pero el motor solo arranca donde de verdad suena.
  if (si && !puedeSonar()) {
    avisar("El ambiente suena en la tablet de la mesa. Enciéndelo allí.");
    return;
  }
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
  if (!A.ambiente || !puedeSonar()) return;
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
  // Lo que era de esta sesión y de ninguna más: el papel que hubiera en pantalla, la pausa y la
  // cuenta de cortes. Los relojes, los secretos y la gente conocida NO se tocan: son avance de
  // campaña. Un reloj como «El rito de Corvalar» tarda tres sesiones en llenarse, y vaciarlo al
  // cerrar sería tirar a la basura justo la presión que la pieza existe para sostener.
  E.documento = null;
  E.pausa = false;
  E.cortes = [];
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

// ── «En capítulos anteriores…» ───────────────────────────────────────────────
/**
 * Arranque de sesión: la última entrada del diario, contada con la voz del DJ.
 *
 * Con cuatro jugadores nuevos y una semana entre partidas, lo primero que pasa siempre es diez
 * minutos de «¿dónde estábamos?». Esto lo resuelve en cuarenta segundos y además arranca la
 * sesión con la voz de la campaña, que es mejor sitio para empezar que un silencio.
 *
 * NO pasa por Claude a propósito: el resumen del diario ya está escrito para escucharse, así que
 * locutarlo tal cual no cuesta tokens, no tarda en pensar y, sobre todo, no puede inventarse nada
 * que no pasara. Un recap que se equivoca es peor que no tener recap.
 */
let urlRecap = null;

async function recapHablado() {
  const d = leerDiario();
  const ultima = d[d.length - 1];
  const b = $("#recap");
  const nota = $("#recap-nota");
  if (!ultima) {
    nota.textContent = "Todavía no hay ninguna sesión cerrada que resumir.";
    return;
  }
  if (!puedeSonar()) {
    nota.textContent = `El recap suena en la tablet. Aquí lo tienes escrito: «${ultima.texto}»`;
    return;
  }
  if (faltaOnce()) {
    // Sin clave no hay voz, pero el texto está y se puede leer en alto. Mejor eso que un botón
    // que no hace nada.
    nota.textContent = `Sin clave de ElevenLabs, así que léelo tú: «${ultima.texto}»`;
    return;
  }
  limpiarAviso();
  b.disabled = true;
  b.querySelector("span:last-child").textContent = "preparando la voz…";
  nota.textContent = "";

  const lim = conLimite(60_000, "el recap");
  try {
    const r = await fetch(
      `${API.once}/text-to-speech/${VOZ_DJ}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: API.cab.eleven(A.clave11),
        signal: lim.señal,
        body: JSON.stringify({
          text: `En capítulos anteriores. ${ultima.texto}`,
          model_id: A.vozModelo, language_code: "es",
          voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.35 },
        }),
      },
    );
    if (!r.ok) throw new Error(explicar("ElevenLabs", r.status));
    const blob = await r.blob();
    E.gasto.ttsCar += ultima.texto.length;
    guardarEstado();
    pintarGasto();

    if (urlRecap) URL.revokeObjectURL(urlRecap);
    urlRecap = URL.createObjectURL(blob);
    const au = new Audio(urlRecap);
    au.play().catch(() => {
      nota.textContent = "El navegador no ha dejado sonar el audio. Toca otra vez el botón.";
    });
    nota.textContent = `Sesión ${ultima.n} · ${ultima.fecha}`;
  } catch (e) {
    nota.textContent = `No he podido grabar el recap: ${e.message}`;
  } finally {
    lim.listo();
    b.disabled = false;
    b.querySelector("span:last-child").textContent = "En capítulos anteriores…";
  }
}

$("#recap").addEventListener("click", recapHablado);

/** La última ilustración de la sesión, para poder volver a ella y para que sobreviva a recargar. */
const CLAVE_ILUSTRACION = "corvalar.ilustracion.v1";
let ilustrando = false;

/**
 * La semilla del generador, fija POR LOCALIZACIÓN.
 *
 * Sin semilla, flux devuelve una aleatoria en cada llamada y dos imágenes seguidas del mismo sitio
 * no se parecen en nada: cambia la hora del día, el tipo de bosque y hasta la arquitectura. En una
 * campaña eso rompe el sitio, que es lo único que la mesa tiene para ubicarse.
 *
 * Se deriva del id de la localización, así que todas las imágenes de la iglesia comparten semilla
 * y salen del mismo mundo, mientras que el vado tiene el suyo. No es control de personaje —para
 * eso harían falta referencias de imagen— pero sí mantiene el aire del lugar.
 */
function semillaDeLugar() {
  const clave = `${A.aventura}:${E.local}`;
  let h = 2166136261;
  for (let i = 0; i < clave.length; i++) {
    h ^= clave.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 2_000_000_000;
}

async function ilustrarEscena(prompt, pie) {
  if (ilustrando) return; // una a la vez: dos en paralelo se pisan en pantalla y cuestan doble
  ilustrando = true;
  pintarIlustracion({ estado: "pintando", pie });
  const paraElChip = chipPintando();
  const semilla = semillaDeLugar();

  const lim = conLimite(90_000, "la ilustración");
  try {
    const r = await fetch(`${API.fal}/fal-ai/flux/dev`, {
      method: "POST",
      headers: API.cab.fal(A.claveFal),
      signal: lim.señal,
      body: JSON.stringify({
        prompt: `${prompt}. ${ESTILO_ILUSTRACION}`,
        image_size: { width: 1024, height: 576 },
        num_images: 1,
        enable_safety_checker: true,
        seed: semilla,
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
      guardarIlustracion({ datos, pie: pie ?? "", prompt, semilla });
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
    paraElChip();
    ilustrando = false;
    pintarGasto();
  }
}

/**
 * El aviso de «se está pintando», con los segundos corriendo.
 *
 * El indicador que va DENTRO del marco de la ilustración se queda tapado en cuanto alguien abre
 * una capa, y entonces la mesa no ve que la imagen viene en camino: a los diez segundos de nada,
 * eso ya parece que se ha colgado. Este va fijo y por fuera del escenario, así que se ve pase lo
 * que pase. Los segundos son lo que convierte «no responde» en «está tardando».
 *
 * Devuelve la función de pararlo, para que quien lo enciende no pueda olvidarse de apagarlo.
 */
function chipPintando() {
  const chip = $("#pintando");
  const desde = Date.now();
  chip.textContent = "pintando…";
  chip.hidden = false;
  const t = setInterval(() => {
    const s = Math.round((Date.now() - desde) / 1000);
    chip.textContent = `pintando… ${s}s`;
  }, 1000);
  return () => { clearInterval(t); chip.hidden = true; };
}

/**
 * Se guarda aparte del estado de la partida, no dentro: son cientos de kilobytes en base64 y
 * meterlos en `estado.json` haría que cada `guardarEstado()` —que pasa en cada golpe— reescribiera
 * medio megabyte. Y si no cabe, se descarta sin romper nada: la imagen ya está en pantalla.
 */
function guardarIlustracion(x) {
  try { localStorage.setItem(CLAVE_ILUSTRACION, JSON.stringify(x)); }
  catch { localStorage.removeItem(CLAVE_ILUSTRACION); }
  archivarMomento(x);
}

/**
 * LOS MEJORES MOMENTOS
 *
 * Cada ilustración se guardaba en la MISMA clave, así que la siguiente pisaba la anterior: de una
 * sesión entera sobrevivía una sola imagen, la última, y las demás se perdían sin avisar. Ahora se
 * archivan todas con lo que estaba pasando cuando se pintaron, que es lo que las convierte en un
 * recuerdo y no en un fondo de pantalla.
 *
 * Va aparte del estado de la partida por lo mismo que la ilustración suelta: son cientos de
 * kilobytes en base64 y `guardarEstado()` se llama en cada golpe.
 */
const CLAVE_MOMENTOS = "corvalar.momentos.v1";
const TOPE_MOMENTOS = 24;

function leerMomentos() {
  try { return JSON.parse(localStorage.getItem(CLAVE_MOMENTOS)) ?? []; }
  catch { return []; }
}

function archivarMomento(x) {
  if (!x?.datos) return;
  const l = actual();
  // El «qué pasó para llegar aquí»: las dos últimas cosas dichas y lo que el DJ acababa de anotar.
  // Sin eso, dentro de tres semanas es una imagen bonita de la que nadie se acuerda.
  const contexto = E.charla.slice(-2).map((t) => `${t.de === "mesa" ? "Vosotros" : "El DJ"}: ${t.texto}`);
  const momento = {
    datos: x.datos,
    pie: x.pie ?? "",
    semilla: x.semilla ?? null,
    lugar: `${l.id} · ${l.nombre}`,
    sesion: (leerDiario().length ?? 0) + 1,
    cuando: new Date().toLocaleDateString("es-ES", { day: "numeric", month: "long" }),
    contexto,
  };
  const todos = [...leerMomentos(), momento];
  // Si no cabe, se van cayendo los más viejos hasta que quepa. Perder el más antiguo es mucho
  // mejor que perderlos todos porque el navegador se plantó con el cupo.
  while (todos.length) {
    try { localStorage.setItem(CLAVE_MOMENTOS, JSON.stringify(todos.slice(-TOPE_MOMENTOS))); return; }
    catch { todos.shift(); }
  }
}

function pintarMomentos() {
  const caja = $("#momentos");
  if (!caja) return;
  const m = leerMomentos();
  caja.innerHTML = m.length
    ? [...m].reverse().map((x, i) => `
        <figure class="momento">
          <img src="${esc(x.datos)}" alt="${esc(x.pie)}" loading="lazy">
          <figcaption>
            <b>${esc(x.pie || "Sin pie")}</b>
            <span class="momento-donde">Sesión ${x.sesion} · ${esc(x.lugar)} · ${esc(x.cuando)}</span>
            ${x.contexto?.length
              ? `<span class="momento-que">${x.contexto.map((c) => esc(c)).join("<br>")}</span>`
              : ""}
            <a class="descargar" href="${esc(x.datos)}"
               download="momento-${m.length - i}.webp">⤓ Guardar</a>
          </figcaption>
        </figure>`).join("")
    : `<p class="vacio">Todavía ninguno. Cada vez que el DJ ilustre algo, la imagen se queda aquí
         con lo que estaba pasando.</p>`;
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
  if (faltaFal()) return avisar(sinClave("fal.ai", "poder ilustrar"));
  if (faltaClaude()) return avisar(sinClave("Anthropic", "describir la escena al generador"));
  limpiarAviso();
  const b = $("#acc-ilustrar");
  b.disabled = true;

  const l = actual();
  const ultimas = E.charla.slice(-4).map((t) => `${t.de === "mesa" ? "MESA" : "DJ"}: ${t.texto}`);
  const lim = conLimite(40_000, "el prompt de la ilustración");
  try {
    const r = await fetch(API.claude, {
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
  if (faltaClaude()) return avisar(sinClave("Anthropic", "escribir el resumen"));
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
    const r = await fetch(API.claude, {
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
  if (faltaOnce()) return avisar(sinClave("ElevenLabs", "grabar el audio del resumen"));
  limpiarAviso();
  const b = $("#cierre-audio");
  b.disabled = true;
  b.querySelector("span:last-child").textContent = "grabando la voz…";

  const lim = conLimite(60_000, "el audio del resumen");
  try {
    const r = await fetch(
      `${API.once}/text-to-speech/${VOZ.narrador}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: API.cab.eleven(A.clave11),
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
    // La tele asigna `E` entera desde fuera, así que aquí también hay que sanear: si el tablet
    // guardó con una versión anterior de la app, la pestaña de la tele sería la primera en
    // encontrarse un campo que no existe.
    if (nuevo) { E = nuevo; sanearEstado(); pintarTodo(); recuperarIlustracion(); }
  });
  // La ilustración vive en su propia clave, y esa sí avisa por `storage` entre pestañas.
  addEventListener("storage", (ev) => {
    if (ev.key === CLAVE_ILUSTRACION) recuperarIlustracion();
  });
}


// ═════════════════════════════════════════════════════════════════════════════
// EL CABLEADO DEL SERVIDOR DE MESA
// ═════════════════════════════════════════════════════════════════════════════
/**
 * Todo lo de aquí abajo está detrás de un `if (!MESA)`. Si el Pocophone no arranca mañana, nada de
 * esto corre y la app es la de siempre. Eso NO es una precaución teórica: es la única razón por la
 * que se puede probar esto el día antes de jugar.
 */

// ── Quién soy en este aparato ────────────────────────────────────────────────
/**
 * `A.miPj` es el nombre del personaje de quien tiene ESTE móvil. No es un rol ni un permiso —todos
 * los aparatos ven lo mismo, y eso está decidido— sino una comodidad: sirve para que «Mi ficha»
 * abra una ficha y no un menú, para que el selfie sepa a quién le pone la cara, y para encender el
 * marco de tu personaje en la banda. Se aprende de dos gestos que ya se hacen (hacerse la foto y
 * abrir tu ficha desde el grupo) en vez de pedir que alguien lo configure.
 */
function recordarMiPj(pj) {
  if (!pj || A.miPj === pj) return;
  A.miPj = pj;
  guardarAjustes();
  pintarBanda();
  pintarMio();
}

const miIndice = () => (A.miPj ? E.partida.findIndex((p) => p.pj === A.miPj) : -1);

/**
 * La fila «lo mío» del layout de mando. El marcado lo pone `index.html` con `hidden`; aquí solo se
 * decide si aparece, y solo aparece en un móvil: en la tablet ocuparía sitio para ir a un sitio al
 * que ya se llega tocando la cara de la banda.
 */
function pintarMio() {
  const n = $("#mio");
  if (!n) return;   // todavía no está en el marcado: no pasa nada, todo lo demás sigue
  n.hidden = !enMando();
  const i = miIndice();
  const f = $("#mi-ficha")?.querySelector("span:last-child");
  if (f) f.textContent = i >= 0 ? `Ficha de ${recortar(E.partida[i].pj, 14)}` : "Mi ficha";
}

$("#mi-ficha")?.addEventListener("click", () => {
  const i = miIndice();
  if (i >= 0) { irA("escena"); abrirFicha(i); return; }
  irA("grupo");
  avisar("Toca tu personaje en esta lista. A partir de ahí, «Mi ficha» te lo abre directo.");
});

$("#mi-cara")?.addEventListener("click", () => {
  irA("grupo");
  const i = miIndice();
  // Se dispara el mismo `input[type=file][capture=user]` que ya usa «Vuestras caras»: en un móvil
  // eso abre la cámara frontal directamente, que es todo el gesto que queremos.
  const inp = i >= 0 ? $(`#caras input[data-foto="${i}"]`) : null;
  if (inp) { inp.click(); return; }
  $("#caras")?.scrollIntoView({ block: "center" });
  avisar("Busca tu nombre en «Vuestras caras» y dale a «Hacer foto».");
});

// ── Los retratos, de un móvil a la tablet ────────────────────────────────────
/**
 * Reencoge un retrato ya pintado antes de compartirlo.
 *
 * El retrato que vuelve del generador es un cuadrado de 1024 px: como data URL son 200-400 KB, y
 * el servidor manda el documento ENTERO a los cinco aparatos en cada cambio. Cuatro retratos a
 * tamaño original serían más de un mega viajando por la wifi cada vez que alguien pierde un punto
 * de golpe. A 448 px y calidad 0,72 son unos 40 KB y en la banda —donde el marco mide 44 px— o en
 * la ficha no se distingue la diferencia.
 */
function encogerImagen(dataUrl, lado = 448, calidad = 0.72) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onerror = () => rej(new Error("no he podido releer el retrato"));
    img.onload = () => {
      const corte = Math.min(img.width, img.height);
      const c = document.createElement("canvas");
      c.width = c.height = Math.min(lado, corte);
      const cx = c.getContext("2d");
      cx.drawImage(img, (img.width - corte) / 2, (img.height - corte) / 2, corte, corte,
                   0, 0, c.width, c.height);
      res(c.toDataURL("image/jpeg", calidad));
    };
    img.src = dataUrl;
  });
}

/** La clave del anexo tiene que cumplir `^[\w.-]{1,64}$`, así que el nombre va sin acentos. */
const claveCara = (pj) =>
  `cara.${norm(pj).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "pj"}`;

/**
 * El retrato hecho en un móvil tiene que acabar en la tablet y en la tele.
 *
 * Va por el «anexo» del servidor, que es el cajón compartido, y **como un buzón, no como un
 * almacén**: la mesa lo recoge, se lo guarda en su propio `localStorage` y borra el anexo. Si se
 * quedara ahí, los cuatro retratos viajarían dentro de cada documento el resto de la partida —y el
 * documento se manda entero en cada cambio—. Los retratos ya viven donde tienen que vivir: en el
 * aparato que los pinta y en la tablet que los enseña.
 */
async function compartirCara(pj, datos) {
  if (!MESA || !pj || !datos) return;
  try {
    const chico = await encogerImagen(datos);
    await MESA.enviar({ tipo: "anexo", clave: claveCara(pj), valor: { pj, datos: chico } });
  } catch {
    // El retrato ya está en este aparato y se ve aquí: compartirlo es un extra, no la función.
  }
}

/** La otra mitad: la mesa vacía el buzón. Ver `compartirCara`. */
function recogerCaras(anexos) {
  if (!enMesa() || !MESA || !anexos) return;
  const entradas = Object.entries(anexos).filter(([k, v]) => k.startsWith("cara.") && v?.pj && v?.datos);
  if (!entradas.length) return;
  const caras = leerCaras();
  let algo = false;
  for (const [clave, v] of entradas) {
    if (caras[v.pj] !== v.datos) { caras[v.pj] = v.datos; algo = true; }
    MESA.enviar({ tipo: "anexo", clave, valor: null });
  }
  if (!algo) return;
  try { localStorage.setItem(CLAVE_CARAS, JSON.stringify(caras)); }
  catch { avisar("No caben más retratos en la tablet. Quita alguno en Grupo → Vuestras caras."); return; }
  pintarBanda(); pintarCaras(); pintarGrupo();
  // Y un guardado para que la pestaña de la tele se entere por `BroadcastChannel`: los retratos
  // viven en su propia clave y la tele los relee al repintar.
  guardarEstado();
  ponEstado(`Retrato nuevo de ${entradas.map(([, v]) => v.pj).join(", ")}.`, "ok");
}

// ── El estado, en las dos direcciones ────────────────────────────────────────
/**
 * La mesa publica la partida. **Agrupado, no por token.**
 *
 * `guardarEstado()` se llama varias veces por turno (al apuntar lo que dijo la mesa, después de
 * cada herramienta, al cerrar el turno) y publicar en cada una serían cinco documentos por frase
 * multiplicados por cuatro móviles escuchando: es tirar la batería de todos. Con medio segundo de
 * espera, un turno entero se convierte en dos o tres publicaciones y en mesa no se nota.
 *
 * Se manda envuelto en `{aventura, app, estado}` porque la aventura no vive en `E`: sin ella, un
 * móvil que se conecta mientras se juega la prueba pintaría las localizaciones de la campaña.
 */
let relojPublicar = null;

function publicarPartida() {
  if (!MESA || !enMesa()) return;
  clearTimeout(relojPublicar);
  relojPublicar = setTimeout(() => {
    relojPublicar = null;
    MESA.enviar({
      tipo: "partida",
      partida: { aventura: A.aventura, app: VERSION_APP, estado: E },
    });
  }, 500);
}

/**
 * Un móvil adopta la partida que publica la mesa.
 *
 * Se acepta la forma envuelta y también un `E` pelado, por si algún día lo publica otra cosa. Y
 * **no se llama a `guardarEstado()`**: eso volvería a publicar, y con dos aparatos publicándose el
 * uno al otro el bucle no lo para nada. Se escribe el almacén a mano, que además deja al móvil con
 * lo último que vio si el servidor se cae a mitad de partida.
 */
function adoptarPartida(p) {
  const nuevo = p?.estado && typeof p.estado === "object"
    ? p.estado
    : (p && typeof p === "object" && ("charla" in p || "partida" in p) ? p : null);
  if (!nuevo || !Array.isArray(nuevo.partida)) return;

  const av = p?.aventura;
  if (av && av !== A.aventura && CAMPANAS[av]) {
    A.aventura = av;
    guardarAjustes();
    CAMPANA = CAMPANAS[av];
    $("#aventura").value = av;
  }
  E = nuevo;
  // La misma red que en el arranque: si la escena guardada no existe en esta aventura, la app se
  // queda en blanco y no dice por qué.
  if (!CAMPANA.localizaciones.some((l) => l.id === E.local)) E.local = CAMPANA.localizaciones[0].id;
  sanearEstado();
  try { localStorage.setItem(claveEstado(A.aventura), JSON.stringify(E)); } catch { /* sin sitio */ }
  pintarTodo();
  recuperarIlustracion();
}

// ── La cola de turnos de los móviles ─────────────────────────────────────────
/** Lo que el servidor tiene pendiente. Se pinta al final de la conversación (ver `pintarCola`). */
let COLA_MESA = [];
let atendiendo = false;

/**
 * Los turnos que ESTE aparato ya ha resuelto, para no resolverlos dos veces.
 *
 * Hacía falta por un fallo que solo aparece con la wifi regular. Al acabar un turno se manda
 * «hecho» al servidor y se rearma `atenderCola()` a los 400 ms por si ese envío no sale. Pero si
 * el envío tarda MÁS de 400 ms —wifi que parpadea, o el POST agotando su tiempo—, el turno sigue
 * en la cola local y `find()` lo vuelve a coger: **el DJ resuelve otra vez la misma frase**, con su
 * gasto y su voz repetida encima. Y el segundo «hecho» llega cuando el servidor ya lo había
 * quitado, así que contesta 404, y el cliente trata eso como fallo de transporte y **corta el flujo
 * SSE vivo** para reconectar. Un turno duplicado tumbaba la conexión de la mesa.
 *
 * Es local a propósito y no se persiste: si la tablet se recarga a mitad de un turno, el conjunto
 * vuelve vacío y el turno se reintenta, que es justo lo que se quiere —nadie lo resolvió—.
 */
const RESUELTOS = new Set();

/**
 * La tablet se come la cola, de uno en uno y en orden.
 *
 * Se coge SIEMPRE la cabeza, sea cual sea su estado, en vez de buscar el primero «pendiente». Es a
 * propósito: si la tablet se recarga a mitad de un turno, ese turno se quedó marcado «atendido» en
 * el servidor y buscando por estado no lo cogería nadie nunca —la frase de un jugador se quedaría
 * ahí colgada—. Marcar «atendido» sirve solo para que el móvil vea que le han hecho caso; lo que de
 * verdad saca el turno de la cola es marcarlo «hecho» al acabar.
 *
 * Y de uno en uno porque dos turnos a la vez son dos voces del DJ hablando encima de la otra.
 */
async function atenderCola() {
  if (!MESA || !enMesa() || atendiendo || ocupado) return;
  const t = COLA_MESA.find((x) => x?.texto && x.estado !== "hecho" && !RESUELTOS.has(x.id));
  if (!t) return;
  atendiendo = true;
  // Con el nombre delante si se sabe: el DJ necesita saber quién habla para dirigirse a alguien,
  // y en la conversación queda constancia de quién dijo qué.
  const quien = String(t.nombre ?? "").trim();
  const dicho = quien ? `${quien}: ${t.texto}` : t.texto;
  try {
    MESA.enviar({ tipo: "turno", id: t.id, estado: "atendido" });

    // Sin clave de Anthropic —ni en el .env del servidor ni en Ajustes— no hay DJ, y la petición
    // no se intenta. Los otros tres sitios que arrancan un turno (el micrófono, el recuadro de
    // escribir y la tirada) ya lo comprobaban; este no, porque entra a `turno()` por dentro. Se
    // vio en pruebas: el turno de un móvil salía hacia api.anthropic.com SIN clave, con sus
    // cuatro reintentos, y lo que aparecía en la tablet era «el navegador ha bloqueado la
    // llamada… prueba por https», que manda a pelearse con el túnel cuando lo que falta es una
    // clave. Este aviso dice la verdad a la primera.
    if (faltaClaude()) {
      // La frase se queda en la conversación aunque el DJ no pueda contestar. Al marcar el turno
      // «hecho» desaparece de la cola, y sin esta constancia el jugador vería su frase esfumarse
      // del móvil sin explicación ninguna.
      E.charla.push({ de: "mesa", texto: dicho });
      guardarEstado(); pintarCharla(); pintarArrancar();
      avisar(sinClave("Anthropic", "hablar con el DJ"));
      return;
    }

    await turno(null, 0, dicho);
  } catch (e) {
    avisar(`No he podido resolver el turno de un móvil: ${e?.message ?? "error"}`);
  } finally {
    // «hecho» pase lo que pase: un turno que falla y se queda en la cola bloquea a los cuatro
    // móviles para siempre, y en mesa eso se lee como que la app no escucha.
    // Apuntado ANTES de avisar al servidor: lo que impide resolverlo dos veces es esto, no que el
    // envío llegue. Si se apuntara después, la ventana entre el envío y su respuesta es
    // exactamente el agujero por el que se colaba el turno duplicado.
    RESUELTOS.add(t.id);
    MESA.enviar({ tipo: "turno", id: t.id, estado: "hecho" });
    atendiendo = false;
    // Que no crezca sin fin en una partida de cuatro horas: en cuanto el servidor quita un turno
    // de la cola, su id ya no hace falta aquí.
    if (RESUELTOS.size > 200) {
      const vivos = new Set(COLA_MESA.map((x) => x?.id));
      for (const id of RESUELTOS) if (!vivos.has(id)) RESUELTOS.delete(id);
    }
    // Normalmente lo que despierta el siguiente turno es el documento que llega al quitar este de
    // la cola. Pero si ese envío no sale —wifi que parpadea— no llegaría ningún documento y los
    // demás se quedarían esperando en silencio, que es el fallo que hace parecer que la app no
    // escucha. Se rearma SOLO si queda algo sin resolver: rearmar a ciegas era lo que repetía el
    // turno cuando el «hecho» tardaba más de 400 ms.
    if (COLA_MESA.some((x) => x?.texto && x.estado !== "hecho" && !RESUELTOS.has(x.id))) {
      setTimeout(atenderCola, 400);
    }
  }
}

// ── Lo que el DJ está haciendo, para los móviles ─────────────────────────────
/**
 * El estado del DJ va al anexo `dj` para que los móviles lo vean sin tener que recibir la partida
 * entera. Solo cuando CAMBIA: `modo()` se llama cada segundo mientras se graba (el cronómetro), y
 * publicar eso serían sesenta documentos por minuto para cinco aparatos.
 */
let djPublicado = "";

function anunciarDj(m) {
  if (!MESA || !enMesa() || m === djPublicado) return;
  djPublicado = m;
  MESA.enviar({ tipo: "anexo", clave: "dj", valor: { estado: m, cuando: Date.now() } });
}

/**
 * La otra mitad de la tarjeta X: alguien la ha tocado en su móvil y la tablet CALLA.
 *
 * Se compara la marca de tiempo con la última atendida para no callar otra vez cada vez que llega
 * un documento nuevo, y se borra el anexo en cuanto se ha hecho caso. Se calla y se abre el panel
 * en la tablet también: la mesa tiene que ver que alguien ha parado la escena, sin que nadie tenga
 * que explicar por qué.
 */
let paradaAtendida = 0;

function atenderParada(anexos) {
  if (!enMesa()) return;
  const p = anexos?.parar;
  const cuando = Number(p?.cuando ?? 0);
  if (!cuando || cuando <= paradaAtendida) return;
  paradaAtendida = cuando;
  MESA?.enviar({ tipo: "anexo", clave: "parar", valor: null });
  callarTodo();
  $("#tx-fondo").hidden = false;
  $("#tx-panel").hidden = false;
}

/** Y al revés: en un móvil, la cara del DJ refleja lo que está haciendo en la tablet. */
function reflejarDj(v) {
  if (!enMando()) return;
  // Salvo mientras este móvil está grabando o mandando: entonces la cara cuenta lo de AQUÍ, que es
  // lo que su dueño necesita ver. Si no, empezar a hablar y que la cara vuelva a «esperando» un
  // segundo después parece que no ha cogido el micro.
  if (ocupado || grabadora) return;
  const m = v?.estado;
  if (!m) return;
  $("#dj").dataset.estado = m;
  $("#dj-estado").textContent = TEXTO_DJ[m] ?? m;
  // Y en palabras, para que en el móvil se entienda de quién es el turno. Sin esto, un jugador que
  // habla mientras el DJ está resolviendo lo de otro no sabe si le ha oído o si se ha colgado.
  const hace = $("#dj-hace");
  if (!hace) return;
  const txt = m === "hablando" ? "está hablando en la mesa · escucha"
    : m === "pensando" ? "está pensando la respuesta"
    : m === "grabando" ? "está escuchando a la mesa"
    : "";
  hace.textContent = txt;
  hace.hidden = !txt;
}

// ── El rótulo de la conexión ─────────────────────────────────────────────────
/**
 * Un aparato que miente sobre estar conectado es peor que uno que dice que no lo está.
 *
 * El chip vive en la cabecera del DJ (`#mesa-estado`, en `index.html`) y **está oculto mientras no
 * haya servidor**: en la app de siempre no hay nada que contar. Cuando no hay conexión dice de
 * cuándo es lo que se está viendo, que es el dato que evita jugar diez minutos con una pantalla
 * congelada creyendo que va al día.
 *
 * Tocarlo reintenta ya, sin esperar a que se cumpla la espera creciente de `sesion.js`.
 */
function pintarMesaEstado() {
  const chip = $("#mesa-estado");
  if (!chip) return;
  if (!MESA) { chip.hidden = true; return; }
  const c = MESA.conexion;
  const viejo = MESA.antiguedad;
  const minutos = viejo == null ? 0 : Math.round(viejo / 60_000);
  chip.hidden = false;
  chip.dataset.conexion = c;
  // «Viejo» es lo que enciende el aviso aunque el chip diga «conectado»: si el último estado tiene
  // más de dos minutos con la conexión en pie, algo va mal por encima del transporte.
  chip.dataset.viejo = viejo != null && viejo > 120_000 ? "si" : "no";
  const pend = MESA.pendientes ? ` · ${MESA.pendientes} sin enviar` : "";
  const txt =
    c === "conectado" ? (MODO === "mando" ? "en la mesa" : "mesa lista")
    : c === "clave" ? "falta la contraseña"
    : c === "cerrado" ? "sin la mesa"
    : c === "conectando" ? "conectando…"
    : viejo == null ? "sin conexión" : `sin conexión · de hace ${minutos || 1} min`;
  $("#mesa-estado-txt").textContent = txt + pend;
  chip.title = `Mesa ${MESA.id} · este aparato es ${
    MODO === "mesa" ? "la mesa (aquí suena la voz)" : MODO === "mando" ? "un mando (aquí no suena)" : "independiente"
  }. Tócalo para reintentar.`;
  pintarPanelMesa();
}

/** El panel de Ajustes/Grupo: para cantar el id a quien llega tarde y ver quién ha entrado. */
function pintarPanelMesa() {
  const panel = $("#mesa-panel");
  if (!panel) return;
  panel.hidden = !MESA;
  if (!MESA) return;
  $("#mesa-panel-sesion").textContent = MESA.id;
  // La dirección que hay que cantar es la de ESTA página: si se ha llegado aquí, funciona.
  $("#mesa-panel-url").textContent = location.origin.replace(/^https?:\/\//, "");
  $("#mesa-modo-txt").textContent =
    MODO === "mesa" ? "Este aparato es la mesa · cambiar"
    : MODO === "mando" ? "Este aparato es un mando · cambiar"
    : "Elegir qué es este aparato";
  const caja = $("#mesa-aparatos");
  const aparatos = Object.entries(MESA.estado?.aparatos ?? {});
  caja.innerHTML = aparatos.length
    ? aparatos
        .map(([id, a]) => `<div class="mesa-aparato" data-aqui="${id === MESA.dispositivo ? "si" : "no"}"
             data-conectado="${a?.conectado ? "si" : "no"}">
            <b>${esc(a?.nombre || (id === MESA.dispositivo ? "este aparato" : "alguien"))}</b>
            <span class="que">${esc(a?.modo ?? "?")}</span>
          </div>`)
        .join("")
    : `<div class="mesa-aparato"><b>solo este aparato</b><span class="que">${esc(MODO)}</span></div>`;
}

// ── La pantalla de entrada: qué papel hace este aparato ──────────────────────
/**
 * Se elige al entrar y se recuerda en el aparato. No es un permiso —todos ven lo mismo, y eso está
 * decidido— es reparto de trabajo: uno lleva el bucle del DJ y suena, los demás mandan turnos y
 * callan, porque la voz tiene que salir por un solo altavoz.
 *
 * El marcado es de `index.html` (`#entrada`). Aquí solo se rellena, se enseña y se espera. Devuelve
 * el modo elegido, `"solo"` si se ha pedido jugar sin la mesa, o `null` si no se puede preguntar
 * (por ejemplo en una versión de la app cuyo `index.html` todavía no tiene la pantalla).
 */
function pantallaEntrada({ pedirClave = false } = {}) {
  const caja = $("#entrada");
  if (!caja) return Promise.resolve(null);
  return new Promise((listo) => {
    const formaClave = $("#entrada-clave");
    const fallo = $("#entrada-fallo");
    const espera = $("#entrada-espera");

    $("#entrada-sesion").textContent = MESA?.id ?? "—";
    $("#entrada-donde").textContent = location.origin.replace(/^https?:\/\//, "");
    if (formaClave) formaClave.hidden = !pedirClave;
    if (fallo) { fallo.hidden = true; fallo.textContent = ""; }
    if (espera) espera.hidden = true;
    caja.hidden = false;
    if (pedirClave) $("#entrada-pase")?.focus();

    const cerrar = (m) => { caja.hidden = true; quitar(); listo(m); };
    const trabajando = (txt) => {
      if (!espera) return;
      espera.hidden = !txt;
      $("#entrada-espera-txt").textContent = txt ?? "";
    };
    const decirFallo = (txt) => {
      trabajando(null);
      if (!fallo) return;
      fallo.hidden = false;
      fallo.textContent = txt;
    };

    /**
     * La contraseña se comprueba ANTES de dejar entrar, y si falla se dice por qué y se deja el
     * campo puesto. Sin esto, elegir «la mesa» con una contraseña mala te metía en una app que
     * parecía funcionar y que no recibía nada, que es el peor de los dos fallos posibles.
     */
    const conClave = async () => {
      if (!pedirClave) return true;
      const pase = $("#entrada-pase")?.value.trim() ?? "";
      if (!pase) { decirFallo("Hace falta la contraseña. La dice quien ha puesto el servidor."); return false; }
      trabajando("comprobando la contraseña…");
      const vale = await MESA.entrar(pase);
      if (!vale) { decirFallo("Esa contraseña no vale. Pregúntala otra vez, en voz alta."); return false; }
      pedirClave = false;
      if (formaClave) formaClave.hidden = true;
      return true;
    };

    const elegir = async (m) => {
      if (!(await conClave())) return;
      trabajando("entrando…");
      cerrar(m);
    };

    const alMesa = () => elegir("mesa");
    const alMando = () => elegir("mando");
    const alSolo = () => cerrar("solo");
    const alClave = (ev) => { ev.preventDefault(); conClave().then((ok) => { if (ok) trabajando(null); }); };

    function quitar() {
      $("#entrada-mesa")?.removeEventListener("click", alMesa);
      $("#entrada-mando")?.removeEventListener("click", alMando);
      $("#entrada-solo")?.removeEventListener("click", alSolo);
      formaClave?.removeEventListener("submit", alClave);
    }
    $("#entrada-mesa")?.addEventListener("click", alMesa);
    $("#entrada-mando")?.addEventListener("click", alMando);
    $("#entrada-solo")?.addEventListener("click", alSolo);
    formaClave?.addEventListener("submit", alClave);
  });
}

/**
 * Jugar sin la mesa, teniéndola delante. Es la salida de emergencia del día de la partida: si el
 * Pocophone se pone tonto a mitad, esto devuelve el tablet a la app de siempre —estado local,
 * claves de Ajustes— sin recargar y sin perder nada de lo guardado.
 *
 * Se recuerda, porque quien lo pulsa no quiere que se le vuelva a preguntar en cada recarga; y el
 * camino de vuelta sigue a la vista en «La mesa en red», que es lo que hace que sea reversible.
 */
function pasarASolo({ recordar = true } = {}) {
  MODO = "solo";
  delete document.documentElement.dataset.modo;
  if (recordar) { A.sinMesa = true; guardarAjustes(); }
  API = apisPara(null);
  MESA?.cerrar();
  actualizarBotonHablar();
  pintarTodo();
  pintarMesaEstado();
  ponEstado("Este aparato juega solo, con sus claves y su estado. La mesa sigue ahí si la quieres.", "");
}

/** Y la vuelta: se vuelve a preguntar qué es este aparato y se reengancha el flujo. */
async function volverAElegir() {
  if (!MESA) return;
  A.sinMesa = false;
  guardarAjustes();
  MESA.reconectar();
  const m = await pantallaEntrada({ pedirClave: MESA.conexion === "clave" });
  if (m === "solo" || !m) { pasarASolo(); return; }
  recordarModo(m);
  aplicarModo(m);
  if (enMesa()) publicarPartida();
}

$("#mesa-modo")?.addEventListener("click", volverAElegir);
$("#mesa-solo")?.addEventListener("click", () => pasarASolo());
// Tocar el chip reintenta. Y **para la propagación**: el chip está DENTRO de `.dj`, cuya cara es el
// botón de hablar; sin esto, mirar la conexión arrancaría una grabación.
$("#mesa-estado")?.addEventListener("click", (ev) => {
  ev.stopPropagation();
  MESA?.reconectar();
  pintarMesaEstado();
});

// ── Arrancar la sesión de mesa ───────────────────────────────────────────────
/**
 * Se aplica el modo: al documento (para que `movil.css` haga su trabajo), a la sesión (que lo
 * recuerda y reabre el flujo con él) y a las APIs. Y se repinta todo, porque de esto depende qué
 * suena, qué botones están vivos y qué se ve.
 */
function aplicarModo(m) {
  MODO = m;
  document.documentElement.dataset.modo = m;
  MESA?.elegirModo(m);
  MESA?.enviar({ tipo: "presencia", modo: m, nombre: A.miPj ?? "" });
  API = apisPara(MESA);
  actualizarBotonHablar();
  pintarBotonAmbiente();
  pintarTodo();
  pintarMesaEstado();
}

async function arrancarMesa() {
  // La pestaña de la tele comparte `localStorage` con la tablet y se entera por `BroadcastChannel`:
  // si además se conectara al servidor sería un segundo aparato peleándose por el papel de mesa.
  if (ES_TELE) return;

  let m = null;
  try { m = await conectarMesa(); } catch { m = null; }
  if (!m) {
    // No hay servidor: la app de siempre. Y hay que DESHACER la apuesta del script de `index.html`,
    // que pone `data-modo` con lo que este aparato eligió la última vez para no pintar el tablero de
    // tablet y saltar al de móvil un instante después. Si no se quita, un móvil que jugó con mesa
    // ayer se quedaría con el reparto de mando sin mesa ninguna detrás.
    delete document.documentElement.dataset.modo;
    $("#mesa-estado") && ($("#mesa-estado").hidden = true);
    if ($("#mesa-panel")) $("#mesa-panel").hidden = true;
    return;
  }
  MESA = m;
  API = apisPara(m);

  // De qué claves dispone el servidor. Si no contesta se supone que las tiene todas: es mejor
  // intentar la llamada y enseñar el error de verdad que bloquear un botón por si acaso.
  try {
    const r = await m.pedir("/mesa/salud");
    const d = await r.json();
    if (d?.apis && typeof d.apis === "object") CLAVES_SERVIDOR = { ...CLAVES_SERVIDOR, ...d.apis };
    else CLAVES_SERVIDOR = { claude: true, once: true, fal: true };
  } catch {
    CLAVES_SERVIDOR = { claude: true, once: true, fal: true };
  }
  // Y con las claves ya sabidas se rehace el reparto: `apisPara` decide por servicio (ver allí).
  API = apisPara(m);
  actualizarBotonHablar();

  // El estado de la conexión, a la vista y contándose solo: `alConexion` se repite cada cinco
  // segundos mientras no hay conexión para que el «de hace 2 min» siga subiendo sin temporizador.
  m.alConexion(() => pintarMesaEstado());

  m.alCambiar((doc) => {
    if (!doc || typeof doc !== "object") return;
    COLA_MESA = Array.isArray(doc.cola) ? doc.cola : [];
    if (enMando()) {
      adoptarPartida(doc.partida);
      reflejarDj(doc.anexos?.dj);
    }
    recogerCaras(doc.anexos);
    atenderParada(doc.anexos);
    pintarCharla();          // la cola pendiente se ve al final de la conversación
    pintarMesaEstado();
    if (enMesa()) atenderCola();
  });

  // Quien pidió jugar sin la mesa no vuelve a que se le pregunte al recargar. Pero se conecta igual
  // —es barato— para que «La mesa en red» siga a la vista con el camino de vuelta.
  if (A.sinMesa) { pasarASolo({ recordar: false }); return; }

  // El papel de este aparato: el recordado, y si no hay ninguno se pregunta. Se pregunta también
  // cuando hace falta la contraseña, porque la pantalla de entrada es donde se mete.
  let elegido = m.modo ?? modoRecordado();
  if (!elegido || m.conexion === "clave") {
    elegido = (await pantallaEntrada({ pedirClave: m.conexion === "clave" })) ?? elegido;
  }
  if (elegido === "solo") { pasarASolo(); return; }
  if (!elegido) {
    // Sin papel elegido no se toca nada: la app sigue siendo la de siempre y el chip invita a
    // elegir. Mejor eso que decidir por la mesa y que suene la voz en cuatro móviles.
    pintarMesaEstado();
    return;
  }
  recordarModo(elegido);
  aplicarModo(elegido);

  // La mesa publica lo que tiene en cuanto entra: un móvil que se conecta después recibe el
  // documento íntegro, así que si la mesa no ha publicado nunca, vería una partida vacía.
  if (enMesa()) publicarPartida();
  else if (m.estado) adoptarPartida(m.estado.partida);
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
    // `puedeSonar()` se comprueba DENTRO y no fuera a propósito: cuando esto se registra todavía no
    // se sabe si este aparato va a ser un móvil (eso lo decide `arrancarMesa`, que va por la red).
    if (puedeSonar()) encenderAmbiente(true);
  };
  addEventListener("pointerdown", arrancar, { once: false });
  addEventListener("keydown", arrancar, { once: false });
}
actualizarBotonHablar();
irA(location.hash.slice(1) || "escena", false);

// Y por último, el servidor de mesa: si lo hay, este aparato entra en la sesión. Si no lo hay,
// `arrancarMesa` se va a la primera línea y aquí no ha pasado nada. Va al final y sin `await`
// porque la app tiene que estar pintada y usable antes de ir a preguntar nada por la red.
arrancarMesa();

/**
 * La versión, a la vista en Ajustes. `VERSION_APP` la sube a mano quien cambia la app; la del
 * service worker se le pregunta a él, y son dos cosas distintas a propósito: si no coinciden, el
 * tablet está sirviendo código viejo de la caché, que es lo primero que hay que descartar cuando
 * en mesa algo «no funciona».
 */
const VERSION_APP = "corvalar-v23";
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
