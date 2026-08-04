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
y NO te lo salgas. Una cosa por turno de voz, y espera respuesta antes de seguir.

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
  $(`#v-${nombre}`).setAttribute("data-activa", "");
  document.querySelector("main").scrollTop = 0;
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

  const a = $("#esc-audio"), boton = $("#esc-play");
  // El aviso se limpia en cada escena: si no, el de una escena sin audio se quedaría pegado
  // en la siguiente, que sí lo tiene.
  $("#esc-nota-audio").textContent = "";
  if (l.audio) a.src = `audio/${l.audio}.mp3`;
  else a.removeAttribute("src");
  const etiqueta = CAMPANA.voces[l.voz] ?? "narrador";
  boton.querySelector("span:last-child").textContent = `Reproducir · ${etiqueta}`;
  boton.disabled = !l.audio;
  $("#esc-progreso").style.width = "0";
}

function pintarCharla() {
  const c = $("#charla");
  if (!E.charla.length) {
    c.innerHTML = `<div class="turno" data-de="dj"><div class="quien">director de juego</div>
      <p>Toca el botón de abajo, habla, y vuelve a tocarlo para enviar. O escríbeme aquí.</p></div>`;
    return;
  }
  c.innerHTML = E.charla
    .slice(-12)
    .map((t) => `<div class="turno" data-de="${t.de}">
        <div class="quien">${t.de === "mesa" ? "la mesa" : "director de juego"}</div>
        <p>${esc(t.texto)}</p></div>`)
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
        <span class="marco"><span class="cara">${cara}</span><span class="vidrio"></span></span>
        <span class="nom">${esc(p.pj)}</span>
        <span class="medidor">
          <span class="pgbar"><i style="width:${pct}%"></i></span>
          <span class="agotbar"><i style="width:${(agot / 6) * 100}%"></i></span>
        </span>
        <span class="pgnum">${p.pg}/${p.pgMax}${agot ? ` · ago ${agot}` : ""}</span>
      </button>`;
    })
    .join("");
}

// Un tic cada pocos segundos en una cara al azar. Es lo que hace que la banda parezca viva
// en vez de cuatro fotos respirando en bucle: el bucle se nota, lo aleatorio no.
setInterval(() => {
  if (document.hidden) return; // no gastar animaciones con la app en segundo plano
  const caras = [...document.querySelectorAll('.pj-banda:not([data-estado="caido"]) .marco')];
  if (!caras.length) return;
  const m = caras[Math.floor(Math.random() * caras.length)];
  if (m.hasAttribute("data-tic")) return;
  m.setAttribute("data-tic", "");
  setTimeout(() => m.removeAttribute("data-tic"), 800);
}, 4200);

$("#banda").addEventListener("click", (ev) => {
  const b = ev.target.closest("button[data-pjbanda]");
  if (!b) return;
  irA("grupo");
  // Resaltar un momento la ficha del personaje tocado, para no dejar al dedo buscándola.
  const ficha = $("#grupo-lista").children[+b.dataset.pjbanda];
  ficha?.scrollIntoView({ block: "center", behavior: "smooth" });
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

function pintarMapa() {
  const L = CAMPANA.localizaciones;
  const aristas = [];
  const hechas = new Set();
  for (const a of L) {
    for (const bId of a.conecta) {
      const clave = [a.id, bId].sort().join("-");
      if (hechas.has(clave)) continue;
      hechas.add(clave);
      const b = loc(bId);
      if (!b) continue;
      const conocida = E.visitadas.includes(a.id) && E.visitadas.includes(bId);
      aristas.push(
        `<line class="arista ${conocida ? "conocida" : ""}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`,
      );
    }
  }

  const nodos = L.map((l) => {
    const clase = l.id === E.local ? "actual" : E.visitadas.includes(l.id) ? "visitada" : "";
    return `<g data-ir="${l.id}" role="button" tabindex="0" aria-label="${esc(l.nombre)}">
      <circle class="nodo ${clase}" cx="${l.x}" cy="${l.y}" r="3.4"/>
      <text x="${l.x}" y="${l.y - 5.2}">${esc(l.nombre)}</text>
    </g>`;
  }).join("");

  $("#mapa").innerHTML = aristas.join("") + nodos;
  for (const g of $("#mapa").querySelectorAll("g[data-ir]")) {
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

function pintarTodo() {
  pintarCabecera(); pintarEscena(); pintarCharla(); pintarGrupo(); pintarBanda();
  pintarMapa(); pintarGasto(); pintarArrancar();
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
      <label>Retrato <small>— el id que te diga el DJ; vacío deja las iniciales</small>
        <input data-e="retrato" data-i="${i}" value="${esc(p.retrato ?? "")}" autocomplete="off"
               placeholder="p. ej. javamustdie"></label>
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

$("#editor-lista").addEventListener("input", (ev) => {
  const c = ev.target.closest("input[data-e]");
  if (!c) return;
  const p = E.partida[+c.dataset.i];
  if (!p) return;

  if (c.dataset.e === "pj" || c.dataset.e === "clase") {
    p[c.dataset.e] = c.value;
  } else if (c.dataset.e === "retrato") {
    // El valor va a una ruta de fichero, así que se limpia a lo que puede ser un nombre.
    p.retrato = c.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
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
});

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
  const a = $("#esc-audio"), b = $("#esc-play");
  b.addEventListener("click", () => {
    if (a.paused) { a.play().catch(() => avisar("No he podido reproducir el audio.")); }
    else a.pause();
  });
  a.addEventListener("play", () => (b.querySelector(".icono").textContent = "❚❚"));
  a.addEventListener("pause", () => (b.querySelector(".icono").textContent = "▶"));
  a.addEventListener("timeupdate", () => {
    $("#esc-progreso").style.width = `${(a.currentTime / a.duration) * 100 || 0}%`;
  });
  // Falta el MP3 (aún sin pregenerar, o el service worker no lo tiene en caché). Se dice qué
  // pasa y qué lo arregla: un botón desactivado sin explicación, en mesa, parece la app rota.
  a.addEventListener("error", () => {
    if (!a.getAttribute("src")) return; // escena sin narración: ya viene desactivado
    b.disabled = true;
    b.querySelector("span:last-child").textContent = "Narración sin generar";
    $("#esc-nota-audio").textContent =
      "Falta el audio de esta escena. Se genera con node scripts/pregenerar.mjs --solo=voz " +
      "y hace falta la clave de ElevenLabs. La voz en vivo del botón de hablar funciona igual.";
  });
}

// ── Ajustes ──────────────────────────────────────────────────────────────────
$("#clave-11").value = A.clave11;
$("#clave-cl").value = A.claveCl;
$("#modelo").value = A.modelo;
$("#voz-modelo").value = A.vozModelo;
$("#aventura").value = A.aventura;
$("#sesion-cero").checked = !!A.sesionCero;

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

function modo(m, txt) {
  bHablar.dataset.modo = m;
  tHablar.textContent = txt;
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
    enCurso?.ac.abort(new Error("cancelado por la mesa"));
    return;
  }
  if (bHablar.disabled) return;
  grabadora ? pararGrabacion() : empezarGrabacion();
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
  $("#arrancar-nota").textContent = cero
    ? "El DJ empieza por las líneas y velos, luego el mundo y los arquetipos, y después os " +
      "pregunta a cada uno. No hace falta micrófono: puedes contestar escribiendo."
    : "El DJ describe dónde estáis y qué se puede hacer. Para crear personajes, marca «Modo " +
      "sesión cero» en Ajustes.";
  $("#sec-arrancar").hidden = E.charla.length > 0;
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
      const lim = conLimite(30_000, "la transcripción");
      enCurso = lim;
      const rs = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
        method: "POST", headers: { "xi-api-key": A.clave11 }, body: fd, signal: lim.señal,
      }).finally(lim.listo);
      if (!rs.ok) throw new Error(`no he podido transcribir. ${explicar("ElevenLabs", rs.status)}`);
      dicho = (await rs.json()).text?.trim();
      E.gasto.sttSeg += segundos;
      if (!dicho) throw new Error("no he entendido nada. Prueba a hablar más cerca, o escríbelo abajo");
    }

    E.charla.push({ de: "mesa", texto: dicho });
    guardarEstado(); pintarCharla(); pintarArrancar();

    // 2. Claude responde, en streaming, y se va troceando por frases para que
    //    la voz empiece antes de que termine de escribir.
    modo("pensando", "Pensando…");
    const cola = new ColaVoz(actual().voz ?? "narrador");
    let respuesta = "";
    let pendiente = "";

    await claudeStream(dicho, (t) => {
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

    E.charla.push({ de: "dj", texto: respuesta.trim() || "(silencio)" });
    guardarEstado(); pintarCharla(); pintarGasto();

    modo("hablando", "Hablando… · toca para cancelar");
    await cola.terminar();
    if (cola.fallo) avisar(cola.fallo);
  } catch (e) {
    const m = e?.name === "AbortError" ? (e.message || "cancelado") : e.message;
    avisar(`No ha salido: ${m}`);
  } finally {
    ocupado = false;
    enCurso = null;
    actualizarBotonHablar();
  }
}

/** Llama a Claude en streaming y va entregando el texto por trozos. */
async function claudeStream(pregunta, alRecibir) {
  const l = actual();
  const grupo = E.partida
    .map((p) => `${p.pj} (${p.clase}, ${p.pg}/${p.pgMax} PG${p.heridas.length ? ", herido: " + p.heridas.join(" y ") : ""})`)
    .join("; ");

  // En sesión cero no se manda escena ni reloj: si se manda, el DJ empieza a describir la
  // localización en vez de crear personajes, por muy claro que sea el resto del prompt.
  const contexto = (
    A.sesionCero
      ? [
          "Aún no ha empezado la partida: estás en sesión cero.",
          `En la pestaña Grupo hay de momento estos personajes, que son los pregenerados y se van a sustituir: ${grupo}.`,
        ]
      : [
          `Escena actual: ${l.id} · ${l.nombre}.`,
          l.sabeis?.length ? `Lo que la mesa ya sabe: ${l.sabeis.join(" ")}` : "",
          CAMPANA.reloj
            ? `Noche ${E.noche} de ${CAMPANA.reloj.noches} hasta ${CAMPANA.reloj.etiqueta}.`
            : "",
          `Grupo: ${grupo}.`,
          `Suministros: ${Object.entries(E.suministros).map(([k, v]) => `${k} ${v}`).join(", ")}.`,
        ]
  ).filter(Boolean).join("\n");

  const historial = E.charla.slice(-8).map((t) => ({
    role: t.de === "mesa" ? "user" : "assistant",
    content: t.texto,
  }));

  const cuerpo = {
    model: A.modelo,
    max_tokens: 400,
    stream: true,
    system: [
      // Las dos partes estables van cacheadas; el contexto de escena cambia cada turno.
      // En sesión cero manda GUIA_CERO y NO se manda la trama: aún no se juega ninguna escena,
      // y colar la trama aquí hace que el DJ empiece a narrar en vez de crear personajes.
      {
        type: "text",
        text: A.sesionCero ? `${GUIA}\n\n${GUIA_CERO}` : `${GUIA}\n\n${TRAMA[A.aventura]}`,
        cache_control: { type: "ephemeral" },
      },
      { type: "text", text: contexto },
    ],
    messages: [...historial, { role: "user", content: pregunta }],
  };
  // Sonnet 5 y Opus 5 piensan por defecto; en voz eso añade segundos.
  if (/sonnet-5|opus-5/.test(A.modelo)) cuerpo.thinking = { type: "disabled" };

  // Dos límites distintos: uno corto para que conteste ALGO, y uno largo para el total. Un
  // stream que se corta a medias dejaría la app colgada igual que si no contestara nunca.
  const lim = conLimite(90_000, "el DJ");
  enCurso = lim;
  const primerByte = setTimeout(() => lim.ac.abort(new Error("el DJ no ha contestado en 25 s")), 25_000);

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: cabecerasClaude(), body: JSON.stringify(cuerpo), signal: lim.señal,
  }).catch((e) => {
    clearTimeout(primerByte); lim.listo();
    throw new Error(e?.name === "AbortError" ? String(e.message || "cancelado") : explicar("Claude", 0, e));
  });
  clearTimeout(primerByte);

  if (!r.ok) {
    const d = await r.text().catch(() => "");
    lim.listo();
    throw new Error(`${explicar("Claude", r.status)}${d.includes("credit") ? " Sin saldo." : ""}`);
  }

  const lector = r.body.getReader(), dec = new TextDecoder();
  let resto = "";
  try {
  while (true) {
    const { done, value } = await lector.read();
    if (done) break;
    resto += dec.decode(value, { stream: true });
    const lineas = resto.split("\n");
    resto = lineas.pop() ?? "";
    for (const linea of lineas) {
      if (!linea.startsWith("data:")) continue;
      let ev; try { ev = JSON.parse(linea.slice(5).trim()); } catch { continue; }
      if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
        alRecibir(ev.delta.text);
      } else if (ev.type === "message_start") {
        E.gasto.entrada += ev.message?.usage?.input_tokens ?? 0;
      } else if (ev.type === "message_delta") {
        E.gasto.salida += ev.usage?.output_tokens ?? 0;
      }
    }
  }
  } finally {
    lim.listo();
  }
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
      if (url) await reproducir(url);
    });
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

function reproducir(url) {
  return new Promise((res) => {
    const a = new Audio(url);
    const fin = () => { URL.revokeObjectURL(url); res(); };
    a.onended = fin; a.onerror = fin;
    a.play().catch(fin);
  });
}

// ── Arranque ─────────────────────────────────────────────────────────────────
pintarTodo();
actualizarBotonHablar();
irA(location.hash.slice(1) || "escena", false);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
