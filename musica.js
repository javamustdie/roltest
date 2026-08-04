/**
 * musica.js — el ambiente sonoro de la mesa, SINTETIZADO en el navegador.
 *
 * No hay ficheros de audio, ni red, ni librerías: todo sale de osciladores y de ruido filtrado
 * con la Web Audio API. La razón es la mesa: la app es una PWA que tiene que funcionar con el wifi
 * que haya, unos loops pregenerados costarían dinero y megas, se oiría el bucle a la tercera vuelta
 * y cambiar de ambiente tendría que esperar a la descarga. Así el cambio es un fundido instantáneo,
 * no se repite nunca y no pesa nada. A cambio no suena a banda sonora compuesta: esto es FONDO,
 * suena DEBAJO de la voz del DJ y no tiene que llamar la atención.
 *
 * Folk horror en una turbera del siglo XIV: aire, madera que cede, agua bajo tierra, un cuerno
 * lejano. Nada de épica, nada de coros, nada de percusión de película, y sobre todo nada de
 * sonido sintetizador ochentero (ni ondas cuadradas peladas, ni barridos de resonancia, ni
 * arpegios). Si algo suena tonal, suena a bordón de zanfona, cuerda frotada, flauta de hueso o
 * campana muy lejana.
 *
 * ── EL FALLO NÚMERO UNO DE ESTE TIPO DE MÓDULO ────────────────────────────────────────────────
 *
 * Los navegadores NO dejan arrancar el audio sin un gesto del usuario. Por eso:
 *
 *   · Importar este módulo NO crea ningún `AudioContext` ni suena nada. Al cargarse solo se
 *     definen funciones y constantes.
 *   · `crearAmbiente()` TAMPOCO crea el contexto (salvo que se le pase uno). Se puede llamar
 *     mientras se monta la interfaz, sin peligro.
 *   · El contexto se crea en el primer `poner()` (o en `preparar()`, que existe para llamarlo
 *     desde el manejador de un toque). Si el contexto está `suspended` —porque el navegador lo
 *     ha suspendido o porque la pestaña estaba de fondo— cada `poner()` llama a `resume()`.
 *   · Si aun así no suena: es que no ha habido gesto. Enganchar `preparar()` al primer toque de
 *     la app y el problema desaparece.
 *
 * ── CONTRATO ──────────────────────────────────────────────────────────────────────────────────
 *
 *   crearAmbiente(opciones?) → mando
 *
 *     opciones = {
 *       volumen:  number   — 0..1, volumen inicial. Por defecto 0.7. Al 100% ya es discreto.
 *       sucesos:  number   — multiplicador de densidad de los sucesos sueltos (gotas, crujidos,
 *                            campanas). 1 = normal, 0 = ninguno, 2 = el doble. Por defecto 1.
 *       semilla:  number   — semilla del azar interno. Si se omite se toma del reloj, así que dos
 *                            partidas no suenan igual. Fijándola, el render es reproducible: es
 *                            lo que usa el banco de pruebas.
 *       contexto: BaseAudioContext — usar ESTE contexto en vez de crear uno. Acepta un
 *                            `OfflineAudioContext`, y entonces el motor entra en modo PROGRAMADO
 *                            (ver más abajo). Es la única forma honesta de medir el resultado.
 *       destino:  AudioNode — dónde enchufar la salida. Por defecto `contexto.destination`.
 *       dormir:   boolean  — suspender el contexto al acabar el fundido de `parar()`, para no
 *                            gastar batería en la mesa. Por defecto true.
 *     }
 *
 *   mando.poner(estado, opciones?) → Promise<mando>
 *     Cambia de ambiente CON FUNDIDO CRUZADO: el nuevo entra desde cero mientras el viejo se va,
 *     sin cortes. `estado` es una clave de AMBIENTES ("calma", "tension", "combate", "horror",
 *     "duelo"), uno de sus alias (ver ALIAS), o null/"silencio" —que equivale a `parar()`—.
 *     Una clave desconocida cae en "calma" y avisa por consola: en mitad de una escena es mejor
 *     que suene algo que reventar.
 *     Llamarlo con el ambiente que ya está puesto NO hace nada (no se apilan voces); para
 *     rearrancarlo, `{ reiniciar: true }`.
 *       opciones = {
 *         fundido:   number  — segundos de fundido cruzado. Por defecto, lo que pida el ambiente
 *                              (combate entra rápido, horror entra lento). Mínimo 0.05: nunca
 *                              hay cambios instantáneos, porque un salto de ganancia chasca.
 *         en:        number  — instante del reloj del contexto (`contexto.currentTime`) en el que
 *                              empieza el cambio. Por defecto, ahora. Sirve para preparar una
 *                              transición y, sobre todo, para programar un render offline.
 *         reiniciar: boolean — rearrancar aunque ya esté puesto ese ambiente.
 *       }
 *     La promesa se resuelve cuando termina el fundido. No hace falta esperarla.
 *
 *   mando.parar(opciones?) → Promise<mando>
 *     Funde a silencio y LIBERA DE VERDAD: para los osciladores, desconecta los nodos, mata el
 *     planificador y (si `dormir`) suspende el contexto. Encender y apagar veinte veces no deja
 *     nada sonando ni acumula nodos ni temporizadores. Acepta `{ fundido }`.
 *     La promesa se resuelve cuando ya está todo liberado: `activo()` es false a partir de ahí.
 *
 *   mando.volumen(v?) → number
 *     Con argumento, pone el volumen general (0..1) con una rampa corta, y devuelve el valor
 *     aplicado. Sin argumento, devuelve el actual. Nunca asigna `.value` de golpe.
 *
 *   mando.estado() → string | null      La clave del ambiente que suena ahora, o null.
 *   mando.activo() → boolean            ¿Hay algo sonando? (incluye lo que está fundiéndose).
 *
 *   mando.preparar() → Promise<BaseAudioContext>
 *     Crea y/o reanuda el contexto sin poner nada. Llamar desde un gesto del usuario.
 *
 *   mando.suceso(tipo, opciones?) → Promise<mando>
 *     Dispara UN sonido suelto, al margen del ambiente: "campana" cuando alguien muere, "gota"
 *     al fallar una tirada, "cuerno" cuando algo lejano contesta. Tipos en SUCESOS.
 *     opciones = { en, nivel, pan }.
 *
 *   mando.detalle() → objeto de diagnóstico { ambiente, volumen, activo, voces, contexto,
 *                     programado, sucesos }. Para depurar y para el banco de pruebas.
 *   mando.contexto() → BaseAudioContext | null   El contexto, si ya existe (para reutilizarlo).
 *   mando.destruir() → Promise<void>             Parar y CERRAR el contexto (si es nuestro).
 *
 *   Constantes exportadas: AMBIENTES (clave, nombre, cuando), CLAVES, ALIAS, SUCESOS.
 *
 * ── MODO PROGRAMADO (render offline) ──────────────────────────────────────────────────────────
 *
 * En vivo, los sucesos sueltos los va escribiendo un único `setInterval` que mira 1,5 s por
 * delante del reloj de audio. En un `OfflineAudioContext` los temporizadores del navegador no
 * corren al ritmo del render, así que el motor lo detecta y programa TODO de una vez, hasta el
 * final del render, sin usar ni un temporizador. Es el MISMO código de síntesis y de sucesos: lo
 * que se mide offline es lo que se oye en la mesa.
 *
 * ── CÓMO ESTÁ HECHO ───────────────────────────────────────────────────────────────────────────
 *
 * Cada `poner()` construye una VOZ nueva (su propio subgrafo) con su ganancia de fundido a 0, y
 * apaga las anteriores con la rampa contraria. Nunca se reafina un oscilador para pasar de un
 * ambiente a otro: se cruzan dos grafos y el viejo se libera. Cada voz tiene capas —bordón, aire,
 * pulso— y GENERADORES de sucesos con intervalos irregulares; los LFOs lentos mueven filtros y
 * ganancias para que no suene igual dos veces.
 *
 *   capas (seco) ─────────────┐
 *   capas (envío) → reverb ───┤→ mezcla → fundido ─┐
 *                                                  ├→ bus (volumen) → corte 26 Hz → tanh → salida
 *   (otra voz fundiéndose) ───────────────────────┘
 *
 * El `tanh` final es un techo blando: garantiza por construcción que la salida no pasa de ±0,70
 * aunque se sumen dos voces en el cruce, así que no hay forma de saturar.
 *
 * REGLAS QUE SE CUMPLEN EN TODO EL FICHERO:
 *   1. Ninguna ganancia se cambia asignando `.value`. Siempre `setValueAtTime` (valor inicial, con
 *      nada sonando aún) o rampas. Un chasquido en mitad de una escena de terror es cómico.
 *   2. Toda envolvente que baja a silencio termina con `linearRampToValueAtTime(0, …)`, porque
 *      `exponentialRamp` y `setTargetAtTime` no llegan nunca a cero y dejan un residuo.
 *   3. Todo lo que se crea se apunta en la voz y se libera al apagarla. Los sonidos de un disparo
 *      llevan su `stop()` puesto desde el principio: se limpian solos.
 *   4. El azar sale del generador interno (`semilla`), no de `Math.random()` directamente, para
 *      que se pueda reproducir un render exacto.
 */

// ── Catálogo ──────────────────────────────────────────────────────────────────────────────────

/** Los cinco ambientes, en el orden en el que conviene enseñarlos en la app. */
export const AMBIENTES = [
  { clave: "calma", nombre: "Calma", cuando: "La aldea, de día, hablando con alguien" },
  { clave: "tension", nombre: "Tensión", cuando: "Se acercan a algo y saben que hay algo" },
  { clave: "combate", nombre: "Combate", cuando: "Pelea" },
  { clave: "horror", nombre: "Horror", cuando: "El Bosque, el Corazón, lo que no se debería mirar" },
  { clave: "duelo", nombre: "Duelo", cuando: "Alguien ha muerto; un final" },
];

/** Solo las claves, por comodidad. */
export const CLAVES = AMBIENTES.map((a) => a.clave);

/**
 * Alias para que el DJ por voz no tenga que acertar la clave exacta. `null` significa silencio.
 * Todo lo que no esté aquí ni en CLAVES cae en "calma" con un aviso por consola.
 */
export const ALIAS = {
  aldea: "calma",
  dia: "calma",
  día: "calma",
  paz: "calma",
  taberna: "calma",
  viaje: "calma",
  acecho: "tension",
  tensión: "tension",
  peligro: "tension",
  noche: "tension",
  pelea: "combate",
  lucha: "combate",
  batalla: "combate",
  bosque: "horror",
  corazon: "horror",
  corazón: "horror",
  terror: "horror",
  pozo: "horror",
  muerte: "duelo",
  final: "duelo",
  luto: "duelo",
  silencio: null,
  nada: null,
  ninguno: null,
};

/** Sucesos que se pueden disparar a mano con `mando.suceso(tipo)`. */
export const SUCESOS = ["gota", "crujido", "campana", "cuerno", "golpe", "rasca", "susurro", "agudo"];

// ── Ajustes generales ─────────────────────────────────────────────────────────────────────────

const VOLUMEN_POR_DEFECTO = 0.7;
const FUNDIDO_MINIMO = 0.05; // nunca un cambio instantáneo: chascaría
const FUNDIDO_PARAR = 1.8;
const ADELANTO = 0.03; // las rampas empiezan un pelín en el futuro, nunca en el pasado
const HORIZONTE = 1.5; // segundos que mira por delante el planificador en vivo
const LATIDO_PLAN = 400; // ms entre pasadas del planificador
const COLA_VOZ = 0.12; // margen tras el fundido antes de parar los osciladores
const RUIDO_SEG = 8; // duración del buffer de ruido (se repite sin costura)
const RUIDO_CRUCE = 0.35; // crossfade del buffer de ruido para que el bucle no chasque
const REVERB_SEG = 1.9;

// ── Azar reproducible (mulberry32) ────────────────────────────────────────────────────────────

/**
 * Generador de azar con semilla. Se usa en vez de `Math.random()` para poder repetir un render
 * exacto en las pruebas; en la mesa la semilla sale del reloj y cada partida suena distinta.
 */
function azar(semilla) {
  let a = semilla >>> 0;
  return function siguiente() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const entre = (rnd, a, b) => a + (b - a) * rnd();
const limita = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);

/** ¿El sistema pide menos estímulo? No es una consulta de audio, pero es lo más cerca que hay. */
function menosEstimulo() {
  try {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

// ── Buffers compartidos: ruido sin costura y una reverberación oscura ─────────────────────────

/**
 * Ruido blanco en bucle SIN COSTURA. Un buffer de ruido normal chasca cada vuelta: aquí los
 * primeros `cruce` segundos son un fundido cruzado con lo que habría justo después del final,
 * compensado en energía, así que el empalme es continuo muestra a muestra.
 */
function bufferRuido(ctx, rnd) {
  const sr = ctx.sampleRate;
  const largo = Math.floor(RUIDO_SEG * sr);
  const cruce = Math.floor(RUIDO_CRUCE * sr);
  const crudo = new Float32Array(largo + cruce);
  for (let i = 0; i < crudo.length; i++) crudo[i] = rnd() * 2 - 1;
  const buf = ctx.createBuffer(1, largo, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < largo; i++) {
    if (i < cruce) {
      const w = i / cruce;
      // Compensación de energía: dos ruidos independientes sumados con pesos w y 1-w pierden
      // amplitud en el centro del cruce. Dividir por la norma lo deja plano.
      const norma = Math.sqrt(w * w + (1 - w) * (1 - w));
      d[i] = (crudo[i] * w + crudo[largo + i] * (1 - w)) / norma;
    } else {
      d[i] = crudo[i];
    }
  }
  return buf;
}

/**
 * Impulso de reverberación: una sala de piedra húmeda, oscura y no muy grande. Ruido con caída
 * exponencial, filtrado paso bajo a mano (un polo) para que no brille, y con los graves algo más
 * largos. No es un convolutor de estudio; es "esto pasa bajo tierra".
 */
function bufferReverb(ctx, rnd) {
  const sr = ctx.sampleRate;
  const largo = Math.floor(REVERB_SEG * sr);
  const buf = ctx.createBuffer(2, largo, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    const coef = 0.22 + c * 0.03; // los dos canales, ligeramente distintos: da anchura
    for (let i = 0; i < largo; i++) {
      const t = i / largo;
      const caida = Math.pow(1 - t, 2.6);
      lp += coef * ((rnd() * 2 - 1) - lp);
      // El arranque entra en 6 ms para que el impulso no tenga un escalón en la muestra 0.
      const ataque = Math.min(1, i / (0.006 * sr));
      d[i] = lp * caida * ataque * 0.6;
    }
  }
  return buf;
}

/**
 * Curva `tanh` para el techo blando final. Ganancia 1 para señales pequeñas (transparente a los
 * niveles que se usan aquí) y asíntota en tanh(1.2)/1.2 = 0.695, así que la salida NO PUEDE pasar
 * de ahí ni sumando dos voces en un cruce. Longitud impar para que el 0 caiga exacto en una
 * muestra de la curva y no se introduzca continua.
 */
function curvaSuave() {
  const n = 1025;
  const c = new Float32Array(n);
  const k = 1.2;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(k * x) / k;
  }
  return c;
}

// ── El motor ──────────────────────────────────────────────────────────────────────────────────

/**
 * Crea el motor de ambiente. NO crea el `AudioContext` ni suena nada hasta el primer `poner()`
 * (o `preparar()`), salvo que se le pase un `contexto` hecho. Devuelve el mando; ver la cabecera
 * del fichero para el contrato completo.
 */
export function crearAmbiente(opciones = {}) {
  const suave = menosEstimulo();
  const conf = {
    // Con `prefers-reduced-motion` se bajan los sucesos: menos sobresaltos, el fondo sigue.
    sucesos: (opciones.sucesos ?? 1) * (suave ? 0.55 : 1),
    semilla: (opciones.semilla ?? Math.floor(Date.now() % 2147483647) ^ 0x5bf03635) >>> 0,
    dormir: opciones.dormir !== false,
    nivelSuceso: suave ? 0.75 : 1,
  };

  let ctx = opciones.contexto ?? null;
  const ctxAjeno = !!opciones.contexto;
  const destinoPedido = opciones.destino ?? null;
  let programado = ctx ? esOffline(ctx) : false;

  let bus = null; // ganancia general (aquí vive el volumen)
  let corte = null; // paso alto a 26 Hz: fuera continua e infrasonidos
  let techo = null; // tanh: techo blando, garantiza que no satura
  let bufRuido = null;
  let bufRev = null;

  let vol = limita(opciones.volumen ?? VOLUMEN_POR_DEFECTO);
  let clave = null; // ambiente pedido
  const voces = [];
  let plan = null; // el ÚNICO setInterval del motor
  const temporizadores = new Set(); // todos los setTimeout vivos, para poder matarlos
  let contadorVoz = 0;
  let cerrado = false;

  const rndGlobal = azar(conf.semilla);

  function esOffline(c) {
    return typeof c.startRendering === "function" && typeof c.length === "number";
  }

  /** Fin del render en modo programado: hasta ahí hay que escribir los sucesos. */
  function finProgramado() {
    return ctx.length / ctx.sampleRate + 2;
  }

  function espera(seg) {
    if (programado || seg <= 0) return Promise.resolve();
    return new Promise((ok) => {
      const id = setTimeout(() => {
        temporizadores.delete(id);
        ok();
      }, seg * 1000);
      temporizadores.add(id);
    });
  }

  function luegoDe(seg, fn) {
    if (programado) return null; // offline: no hay temporizadores, todo va en el reloj de audio
    const id = setTimeout(() => {
      temporizadores.delete(id);
      fn();
    }, Math.max(0, seg) * 1000);
    temporizadores.add(id);
    return id;
  }

  // ── Contexto y cadena general ───────────────────────────────────────────────────────────────

  function asegurarContexto() {
    if (cerrado) throw new Error("musica.js: este motor ya está destruido.");
    if (!ctx) {
      const C = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!C) throw new Error("musica.js: este navegador no trae Web Audio API.");
      // `playback`: buffer grande, menos CPU y menos cortes. Aquí nadie necesita baja latencia.
      ctx = new C({ latencyHint: "playback" });
      programado = false;
    }
    if (!bus) construirCadena();
    return ctx;
  }

  function construirCadena() {
    const t = ctx.currentTime;
    bus = ctx.createGain();
    bus.gain.setValueAtTime(vol, t); // valor inicial, sin nada sonando: no puede chascar

    corte = ctx.createBiquadFilter();
    corte.type = "highpass";
    corte.frequency.setValueAtTime(26, t);
    corte.Q.setValueAtTime(0.7, t);

    techo = ctx.createWaveShaper();
    techo.curve = curvaSuave();
    techo.oversample = "2x";

    bus.connect(corte);
    corte.connect(techo);
    techo.connect(destinoPedido ?? ctx.destination);

    bufRuido = bufferRuido(ctx, azar(conf.semilla ^ 0x9e3779b9));
    bufRev = bufferReverb(ctx, azar(conf.semilla ^ 0x85ebca6b));
  }

  function reanudar() {
    if (!ctx || programado) return Promise.resolve(ctx);
    if (ctx.state === "suspended" && typeof ctx.resume === "function") {
      return ctx.resume().then(
        () => ctx,
        () => ctx, // si el navegador lo rechaza por falta de gesto, no reventamos la escena
      );
    }
    return Promise.resolve(ctx);
  }

  // ── Voces ───────────────────────────────────────────────────────────────────────────────────

  /**
   * Una voz es un ambiente sonando: su subgrafo, sus fuentes (para pararlas), sus nodos (para
   * desconectarlos) y sus generadores de sucesos.
   */
  function nuevaVoz(nombre, t0) {
    const v = {
      id: ++contadorVoz,
      clave: nombre,
      ctx,
      rnd: azar((conf.semilla + contadorVoz * 0x27d4eb2f) >>> 0),
      buf: bufRuido,
      t0,
      nodos: [],
      fuentes: [],
      // Los sonidos de un disparo (gotas, campanas, golpes del pulso) traen su `stop()` puesto y
      // se limpian solos… salvo que el contexto se suspenda antes de que llegue ese instante, y
      // entonces se quedan colgando para siempre. Por eso también se apuntan aquí, para poder
      // pararlos a mano al liberar la voz. Se borran solos al terminar, así que el conjunto solo
      // tiene lo que está sonando ahora mismo, no el historial de la sesión.
      efimeras: new Set(),
      generadores: [],
      fin: Infinity, // más allá de aquí no se programan sucesos (voz apagándose)
      hasta: t0, // hasta dónde están escritos los sucesos
      muerta: false,
      apagando: false,
      temporizador: null,
    };

    v.mezcla = ctx.createGain();
    v.mezcla.gain.setValueAtTime(1, t0);
    v.fundido = ctx.createGain();
    v.fundido.gain.setValueAtTime(0, t0);
    v.mezcla.connect(v.fundido);
    v.fundido.connect(bus);
    v.nodos.push(v.mezcla, v.fundido);

    // Envío a reverberación. Cada capa decide cuánto manda; el retorno entra en la mezcla, así
    // que el fundido de la voz también funde la cola. Con cruces de 2-3 s no se nota el corte.
    v.envio = ctx.createGain();
    v.envio.gain.setValueAtTime(1, t0);
    const rev = ctx.createConvolver();
    rev.buffer = bufRev;
    rev.normalize = true;
    v.retorno = ctx.createGain();
    v.retorno.gain.setValueAtTime(0.9, t0);
    v.envio.connect(rev);
    rev.connect(v.retorno);
    v.retorno.connect(v.mezcla);
    v.nodos.push(v.envio, rev, v.retorno);

    return v;
  }

  /** Programa los sucesos de una voz hasta `hasta` (reloj de audio). */
  function programarVoz(v, hasta) {
    const limite = Math.min(hasta, v.fin);
    if (limite <= v.hasta) return;
    for (const g of v.generadores) {
      let guarda = 0;
      while (g.siguiente < limite && guarda++ < 400) {
        g.dispara(g.siguiente, g.n++);
        g.siguiente += Math.max(0.02, g.paso(g.n));
      }
    }
    v.hasta = limite;
  }

  function bombear() {
    if (!ctx || !voces.length) return;
    const hasta = programado ? finProgramado() : ctx.currentTime + HORIZONTE;
    for (const v of voces) programarVoz(v, hasta);
  }

  function arrancarPlan() {
    if (programado || plan !== null) return;
    plan = setInterval(bombear, LATIDO_PLAN);
  }

  function pararPlan() {
    if (plan !== null) {
      clearInterval(plan);
      plan = null;
    }
  }

  /**
   * Baja una ganancia a `objetivo` desde donde esté, sin escalones. `cancelAndHoldAtTime` es la
   * forma correcta de interrumpir una rampa a medias; donde no exista, se congela el valor leído.
   */
  function rampa(param, objetivo, t, dur) {
    if (typeof param.cancelAndHoldAtTime === "function") param.cancelAndHoldAtTime(t);
    else {
      param.cancelScheduledValues(t);
      param.setValueAtTime(param.value, t);
    }
    param.linearRampToValueAtTime(objetivo, t + Math.max(FUNDIDO_MINIMO, dur));
  }

  /** Apaga una voz con fundido y la libera del todo cuando termina. */
  function apagarVoz(v, t, dur) {
    if (v.muerta || v.apagando) return;
    v.apagando = true;
    rampa(v.fundido.gain, 0, t, dur);
    // Durante el cruce la voz sigue viva (sus gotas y crujidos se apagan con ella), pero no se
    // programa nada más allá.
    v.fin = t + dur;
    programarVoz(v, v.fin);
    const tFin = t + dur + COLA_VOZ;
    for (const f of v.fuentes) {
      try {
        f.stop(tFin);
      } catch {
        /* ya paró */
      }
    }
    if (programado) {
      // Offline no hay temporizadores: los `stop` programados bastan y el grafo muere con el
      // render. Se saca de la lista para que no se le escriba nada más.
      quitarVoz(v);
      v.muerta = true;
    } else {
      const espera = Math.max(0, tFin - ctx.currentTime) + 0.05;
      v.temporizador = luegoDe(espera, () => liberarVoz(v));
    }
  }

  function quitarVoz(v) {
    const i = voces.indexOf(v);
    if (i >= 0) voces.splice(i, 1);
  }

  function liberarVoz(v) {
    if (v.muerta) return;
    v.muerta = true;
    if (v.temporizador !== null) {
      clearTimeout(v.temporizador);
      temporizadores.delete(v.temporizador);
      v.temporizador = null;
    }
    for (const f of [...v.fuentes, ...v.efimeras]) {
      try {
        f.stop();
      } catch {
        /* ya paró */
      }
    }
    v.efimeras.clear();
    for (const n of v.nodos) {
      try {
        n.disconnect();
      } catch {
        /* ya estaba */
      }
    }
    v.fuentes.length = 0;
    v.nodos.length = 0;
    v.generadores.length = 0;
    quitarVoz(v);
    if (!voces.length) pararPlan();
  }

  // ── Ladrillos de síntesis ───────────────────────────────────────────────────────────────────
  // Todos apuntan lo que crean en la voz. Los que llevan `t` son de un disparo y traen su
  // `stop()` puesto: se limpian solos aunque la voz muera antes.

  function gan(v, valor, t) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(valor, t);
    return g;
  }

  function filtro(v, tipo, hz, q, t) {
    const f = ctx.createBiquadFilter();
    f.type = tipo;
    f.frequency.setValueAtTime(hz, t);
    if (q != null) f.Q.setValueAtTime(q, t);
    return f;
  }

  function panea(v, x, t) {
    if (typeof ctx.createStereoPanner === "function") {
      const p = ctx.createStereoPanner();
      p.pan.setValueAtTime(limita(x, -1, 1), t);
      return p;
    }
    return gan(v, 1, t); // navegador viejo: mono y no pasa nada
  }

  /** Oscilador continuo de la voz (se para al apagarla). */
  function osc(v, tipo, hz, t) {
    const o = ctx.createOscillator();
    o.type = tipo;
    o.frequency.setValueAtTime(hz, t);
    o.start(t);
    v.fuentes.push(o);
    v.nodos.push(o);
    return o;
  }

  /** Fuente de ruido en bucle, con arranque en un punto al azar del buffer. */
  function ruido(v, t) {
    const s = ctx.createBufferSource();
    s.buffer = v.buf;
    s.loop = true;
    s.start(t, entre(v.rnd, 0, RUIDO_SEG * 0.9));
    v.fuentes.push(s);
    v.nodos.push(s);
    return s;
  }

  /** Apunta una fuente de un disparo en la voz y la desapunta cuando termina sola. */
  function efimera(v, fuente) {
    v.efimeras.add(fuente);
    fuente.onended = () => v.efimeras.delete(fuente);
    return fuente;
  }

  /** LFO lento sumado a un parámetro (filtro, ganancia, frecuencia). Lo que hace que respire. */
  function lfo(v, hz, profundidad, destino, t, fase = 0) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(hz, t);
    const g = gan(v, profundidad, t);
    o.connect(g);
    g.connect(destino);
    // La fase se falsea arrancando el oscilador un poco antes o después.
    o.start(Math.max(0, t - fase / Math.max(0.001, hz)));
    v.fuentes.push(o);
    v.nodos.push(o, g);
    return { osc: o, gan: g };
  }

  /** Enchufa una capa a la mezcla (seco) y al envío de reverberación. */
  function salida(v, nodo, t, seco = 1, humedo = 0) {
    if (seco > 0) {
      const g = gan(v, seco, t);
      nodo.connect(g);
      g.connect(v.mezcla);
      v.nodos.push(g);
    }
    if (humedo > 0) {
      const g = gan(v, humedo, t);
      nodo.connect(g);
      g.connect(v.envio);
      v.nodos.push(g);
    }
  }

  /**
   * Envolvente de un disparo: sube, cae y TERMINA EN CERO EXACTO. La rampa lineal final es la que
   * evita el residuo que dejan `exponentialRamp` y `setTargetAtTime`.
   */
  function envolvente(param, t, nivel, ataque, caida) {
    const a = Math.max(0.002, ataque);
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(nivel, t + a);
    param.exponentialRampToValueAtTime(Math.max(1e-5, nivel * 0.0008), t + a + caida);
    param.linearRampToValueAtTime(0, t + a + caida + 0.02);
    return t + a + caida + 0.03;
  }

  /** Un disparo de ruido filtrado (crujidos, golpes, siseos). */
  function golpeRuido(v, t, { hz, q, nivel, ataque, caida, barrido = 0, pan = 0, humedo = 0.3, tipo = "bandpass" }) {
    const s = ctx.createBufferSource();
    s.buffer = v.buf;
    s.loop = true;
    const f = filtro(v, tipo, hz, q, t);
    if (barrido) {
      f.frequency.setValueAtTime(hz, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(30, hz * barrido), t + ataque + caida);
    }
    const g = gan(v, 0.0001, t);
    const p = panea(v, pan, t);
    s.connect(f);
    f.connect(g);
    g.connect(p);
    p.connect(v.mezcla);
    if (humedo > 0) {
      const w = gan(v, humedo, t);
      p.connect(w);
      w.connect(v.envio);
    }
    const fin = envolvente(g.gain, t, nivel, ataque, caida);
    s.start(t, entre(v.rnd, 0, RUIDO_SEG * 0.9));
    s.stop(fin + 0.02);
    efimera(v, s);
    return fin;
  }

  /** Un disparo tonal (gotas, campanas, cuernos, agudos). */
  function golpeTono(v, t, { hz, tipo = "sine", nivel, ataque, caida, deriva = 0, corte = 0, pan = 0, humedo = 0.4 }) {
    const o = ctx.createOscillator();
    o.type = tipo;
    o.frequency.setValueAtTime(hz, t);
    if (deriva) o.frequency.exponentialRampToValueAtTime(Math.max(20, hz * deriva), t + ataque + caida * 0.6);
    let nodo = o;
    if (corte) {
      const f = filtro(v, "lowpass", corte, 0.8, t);
      o.connect(f);
      nodo = f;
    }
    const g = gan(v, 0.0001, t);
    const p = panea(v, pan, t);
    nodo.connect(g);
    g.connect(p);
    p.connect(v.mezcla);
    if (humedo > 0) {
      const w = gan(v, humedo, t);
      p.connect(w);
      w.connect(v.envio);
    }
    const fin = envolvente(g.gain, t, nivel, ataque, caida);
    o.start(t);
    o.stop(fin + 0.02);
    efimera(v, o);
    return fin;
  }

  // ── Sucesos sueltos ─────────────────────────────────────────────────────────────────────────
  // Agua bajo tierra, madera que cede, algo lejano que contesta. Nunca a compás.

  const sucesos = {
    /** Una gota que cae en agua parada, en algún sitio a la izquierda o a la derecha. */
    gota(v, t, nivel = 1) {
      const hz = entre(v.rnd, 620, 1150);
      golpeTono(v, t, {
        hz,
        tipo: "sine",
        nivel: 0.05 * nivel * conf.nivelSuceso,
        ataque: 0.004,
        caida: entre(v.rnd, 0.07, 0.14),
        deriva: 0.42,
        pan: entre(v.rnd, -0.75, 0.75),
        humedo: 0.7,
      });
    },
    /** Madera que cede: una viga, un árbol, un suelo. Dos tirones, no uno. */
    crujido(v, t, nivel = 1) {
      const hz = entre(v.rnd, 190, 420);
      const n = 0.03 * nivel * conf.nivelSuceso;
      golpeRuido(v, t, {
        hz,
        q: entre(v.rnd, 5, 11),
        nivel: n,
        ataque: entre(v.rnd, 0.05, 0.18),
        caida: entre(v.rnd, 0.3, 0.9),
        barrido: entre(v.rnd, 0.55, 0.85),
        pan: entre(v.rnd, -0.8, 0.8),
        humedo: 0.35,
      });
      if (v.rnd() < 0.6) {
        golpeRuido(v, t + entre(v.rnd, 0.25, 0.7), {
          hz: hz * entre(v.rnd, 0.7, 0.95),
          q: entre(v.rnd, 6, 13),
          nivel: n * 0.6,
          ataque: 0.03,
          caida: entre(v.rnd, 0.15, 0.4),
          barrido: 0.7,
          pan: entre(v.rnd, -0.8, 0.8),
          humedo: 0.4,
        });
      }
    },
    /** Una campana muy lejana. Parciales inarmónicos, todo apagado y con mucha sala. */
    campana(v, t, nivel = 1) {
      const f0 = entre(v.rnd, 250, 400);
      const parciales = [1, 2.01, 2.77, 4.15, 5.43];
      const niveles = [1, 0.42, 0.26, 0.14, 0.09];
      const caidas = [2.6, 1.7, 1.15, 0.7, 0.45];
      const pan = entre(v.rnd, -0.5, 0.5);
      for (let i = 0; i < parciales.length; i++) {
        golpeTono(v, t, {
          hz: f0 * parciales[i],
          tipo: "sine",
          nivel: 0.02 * niveles[i] * nivel * conf.nivelSuceso,
          ataque: 0.006 + i * 0.002,
          caida: caidas[i],
          corte: 2600,
          pan,
          humedo: 0.9,
        });
      }
    },
    /** Un cuerno a lo lejos, en la niebla. Entra despacio: no es una señal, es una respuesta. */
    cuerno(v, t, nivel = 1) {
      const hz = entre(v.rnd, 98, 132);
      const pan = entre(v.rnd, -0.6, 0.6);
      golpeTono(v, t, {
        hz,
        tipo: "sawtooth",
        nivel: 0.026 * nivel * conf.nivelSuceso,
        ataque: entre(v.rnd, 0.35, 0.7),
        caida: entre(v.rnd, 1.1, 2.0),
        corte: entre(v.rnd, 380, 620),
        pan,
        humedo: 0.85,
      });
      golpeTono(v, t + 0.02, {
        hz: hz * 1.503,
        tipo: "sawtooth",
        nivel: 0.013 * nivel * conf.nivelSuceso,
        ataque: 0.5,
        caida: 1.4,
        corte: 500,
        pan,
        humedo: 0.85,
      });
    },
    /** Un golpe sordo, lejos, bajo tierra. */
    golpe(v, t, nivel = 1) {
      golpeTono(v, t, {
        hz: entre(v.rnd, 48, 78),
        tipo: "sine",
        nivel: 0.06 * nivel * conf.nivelSuceso,
        ataque: 0.006,
        caida: entre(v.rnd, 0.18, 0.4),
        deriva: 0.7,
        pan: entre(v.rnd, -0.3, 0.3),
        humedo: 0.5,
      });
      golpeRuido(v, t, {
        hz: entre(v.rnd, 180, 320),
        q: 1.4,
        nivel: 0.02 * nivel * conf.nivelSuceso,
        ataque: 0.004,
        caida: 0.09,
        pan: entre(v.rnd, -0.3, 0.3),
        humedo: 0.5,
      });
    },
    /** Metal que raspa piedra. Corto y desagradable. */
    rasca(v, t, nivel = 1) {
      golpeRuido(v, t, {
        hz: entre(v.rnd, 1900, 3200),
        q: entre(v.rnd, 6, 12),
        nivel: 0.022 * nivel * conf.nivelSuceso,
        ataque: 0.01,
        caida: entre(v.rnd, 0.12, 0.3),
        barrido: entre(v.rnd, 0.35, 0.6),
        pan: entre(v.rnd, -0.9, 0.9),
        humedo: 0.3,
      });
    },
    /** Un siseo que aparece y se va. Puede ser aire. */
    susurro(v, t, nivel = 1) {
      const dur = entre(v.rnd, 1.4, 4.2);
      golpeRuido(v, t, {
        tipo: "highpass",
        hz: entre(v.rnd, 1500, 3400),
        q: 0.8,
        nivel: 0.016 * nivel * conf.nivelSuceso,
        ataque: dur * 0.45,
        caida: dur * 0.55,
        pan: entre(v.rnd, -0.9, 0.9),
        humedo: 0.25,
      });
    },
    /** Un agudo que asoma y se va: no está en la escala de nada. */
    agudo(v, t, nivel = 1) {
      const dur = entre(v.rnd, 1.6, 4.5);
      golpeTono(v, t, {
        hz: entre(v.rnd, 2100, 5200),
        tipo: "sine",
        nivel: 0.03 * nivel * conf.nivelSuceso,
        ataque: dur * 0.5,
        caida: dur * 0.5,
        pan: entre(v.rnd, -0.95, 0.95),
        humedo: 0.35,
      });
    },
  };

  /**
   * Añade un generador de sucesos a la voz: `tipo` cada `min`..`max` segundos, con el primero
   * retrasado al azar para que dos ambientes no arranquen igual.
   */
  function cada(v, min, max, tipo, nivel = 1) {
    if (conf.sucesos <= 0) return;
    const escala = 1 / conf.sucesos;
    const paso = () => entre(v.rnd, min, max) * escala;
    const g = {
      n: 0,
      siguiente: v.t0 + entre(v.rnd, 0.4, max * 0.9) * escala,
      paso,
      dispara: (t) => sucesos[tipo](v, t, nivel),
    };
    v.generadores.push(g);
  }

  // ── Los cinco ambientes ─────────────────────────────────────────────────────────────────────
  //
  // Notas de trabajo (afinación baja, como una zanfona destemplada):
  //   D2 = 73.42   Eb2 = 77.78   A2 = 110.0   Bb2 = 116.54   D3 = 146.83
  // "tension" es "calma" medio tono arriba, a propósito: se reconoce sin pensarlo.

  const RECETAS = {
    /**
     * CALMA — la aldea, de día. Casi nada: un bordón grave de zanfona con dos cuerdas que baten
     * despacio, un hilo de aire y algún crujido lejano. Si se nota que hay música, está mal.
     */
    calma: {
      fundido: 3.0,
      construir(v, t) {
        // Bordón: D2 y A2, cada uno con su gemelo desafinado unas décimas de hercio. El gemelo va
        // MUCHO más bajo que la cuerda principal: si van igualados, la pareja bate al 100% y el
        // ambiente "respira" demasiado para lo quieto que tiene que ser esto.
        const filtroB = filtro(v, "lowpass", 240, 0.8, t);
        const gB = gan(v, 0.042, t);
        for (const [hz, n] of [
          [36.71, 0.5],
          [73.42, 0.9],
          [73.6, 0.3],
          [110.0, 0.55],
          [110.28, 0.2],
        ]) {
          const o = osc(v, hz < 50 ? "triangle" : "sawtooth", hz, t);
          const g = gan(v, n, t);
          o.connect(g);
          g.connect(filtroB);
          v.nodos.push(g);
        }
        filtroB.connect(gB);
        v.nodos.push(filtroB, gB);
        salida(v, gB, t, 1, 0.12);
        lfo(v, 0.043, 0.009, gB.gain, t); // respira
        lfo(v, 0.031, 55, filtroB.frequency, t, 0.3); // y se abre y se cierra

        // Aire: un hilo de ruido en la banda de un sitio hueco.
        const aire = ruido(v, t);
        const hp = filtro(v, "highpass", 200, 0.7, t);
        const lp = filtro(v, "lowpass", 620, 0.7, t);
        const gA = gan(v, 0.01, t);
        aire.connect(hp);
        hp.connect(lp);
        lp.connect(gA);
        v.nodos.push(hp, lp, gA);
        salida(v, gA, t, 1, 0.2);
        lfo(v, 0.047, 0.007, gA.gain, t, 0.6);
        lfo(v, 0.019, 140, lp.frequency, t);

        cada(v, 8, 18, "crujido", 0.85);
        cada(v, 10, 24, "gota", 0.9);
        cada(v, 40, 95, "campana", 0.7);
      },
    },

    /**
     * TENSIÓN — saben que hay algo. El bordón sube medio tono (Eb2) y LATE, y por debajo entra un
     * pulso lento, muy bajo, que no es música: es alguien caminando lejos.
     */
    tension: {
      fundido: 2.2,
      construir(v, t) {
        // Mismo instrumento que "calma" pero medio tono arriba y con el filtro más abierto: se
        // reconoce el sitio y a la vez se nota que algo ha cambiado.
        const filtroB = filtro(v, "lowpass", 390, 0.9, t);
        const gB = gan(v, 0.05, t);
        for (const [hz, n] of [
          [38.89, 0.45],
          [77.78, 0.9],
          [78.0, 0.4],
          [116.54, 0.6],
          [116.95, 0.3],
        ]) {
          const o = osc(v, hz < 50 ? "triangle" : "sawtooth", hz, t);
          const g = gan(v, n, t);
          o.connect(g);
          g.connect(filtroB);
          v.nodos.push(g);
        }
        filtroB.connect(gB);
        v.nodos.push(filtroB, gB);
        salida(v, gB, t, 1, 0.14);
        // El latido: tremolo a ~0,9 Hz. Profundidad por debajo de la base, para que no se invierta.
        lfo(v, entre(v.rnd, 0.82, 0.98), 0.02, gB.gain, t);
        lfo(v, 0.027, 70, filtroB.frequency, t, 0.4);

        // Una quinta hueca arriba: pone algo en la banda media sin llegar a ser un acorde.
        const q = osc(v, "triangle", 155.56, t);
        const gQ = gan(v, 0.017, t);
        const lpQ = filtro(v, "lowpass", 950, 1.2, t);
        q.connect(lpQ);
        lpQ.connect(gQ);
        v.nodos.push(lpQ, gQ);
        salida(v, gQ, t, 1, 0.3);
        lfo(v, 0.055, 0.008, gQ.gain, t, 0.2);

        const aire = ruido(v, t);
        const hp = filtro(v, "highpass", 240, 0.7, t);
        const lp = filtro(v, "lowpass", 1100, 0.7, t);
        const gA = gan(v, 0.014, t);
        aire.connect(hp);
        hp.connect(lp);
        lp.connect(gA);
        v.nodos.push(hp, lp, gA);
        salida(v, gA, t, 1, 0.25);
        lfo(v, 0.063, 0.007, gA.gain, t, 0.5);

        // Pulso lento y muy grave: cada 2,1-2,5 s, apenas por encima del umbral.
        const periodo = entre(v.rnd, 2.1, 2.5);
        v.generadores.push({
          n: 0,
          siguiente: t + entre(v.rnd, 0.6, 1.4),
          paso: () => periodo * entre(v.rnd, 0.94, 1.06),
          dispara: (tt) => {
            golpeTono(v, tt, {
              hz: entre(v.rnd, 49, 55),
              tipo: "sine",
              nivel: 0.075,
              ataque: 0.02,
              caida: entre(v.rnd, 0.35, 0.55),
              deriva: 0.82,
              pan: 0,
              humedo: 0.25,
            });
            golpeRuido(v, tt, {
              tipo: "lowpass",
              hz: 260,
              q: 0.9,
              nivel: 0.014,
              ataque: 0.01,
              caida: 0.16,
              pan: entre(v.rnd, -0.2, 0.2),
              humedo: 0.3,
            });
          },
        });

        cada(v, 5, 12, "crujido", 1);
        cada(v, 6, 15, "gota", 0.9);
        cada(v, 18, 45, "cuerno", 0.8);
      },
    },

    /**
     * COMBATE — pulso marcado y rápido, disonancia y madera golpeada. NO heroico: no hay fanfarria,
     * ni acorde mayor, ni melodía. Segunda menor abajo (D2 + Eb2, bate a 4,4 Hz) y arriba una
     * cuerda frotada con un tritono dentro. Es trabajo sucio, no una carga de caballería.
     */
    combate: {
      fundido: 1.1,
      construir(v, t) {
        // Racimo grave disonante. Contenido a propósito: si los graves mandan, esto se convierte
        // en una película de acción con subwoofer, y lo que se quiere es leña y cuerda.
        const lpC = filtro(v, "lowpass", 270, 1.0, t);
        const gC = gan(v, 0.019, t);
        for (const hz of [73.42, 77.78]) {
          const o = osc(v, "sawtooth", hz, t);
          const g = gan(v, 0.9, t);
          o.connect(g);
          g.connect(lpC);
          v.nodos.push(g);
        }
        lpC.connect(gC);
        v.nodos.push(lpC, gC);
        salida(v, gC, t, 1, 0.1);

        // Cuerda frotada: 220 + 233.08 (segunda menor) + 311.13 (tritono sobre el 220). Pasa por
        // un paso banda que se mueve: es un arco, no un sintetizador.
        const bp = filtro(v, "bandpass", 700, 1.1, t);
        const gF = gan(v, 0.085, t);
        const pF = panea(v, -0.15, t);
        for (const [hz, n] of [
          [220.0, 1],
          [233.08, 0.85],
          [311.13, 0.6],
        ]) {
          const o = osc(v, "sawtooth", hz, t);
          const g = gan(v, n, t);
          o.connect(g);
          g.connect(bp);
          v.nodos.push(g);
          // Deriva de arco: el afinado perfecto suena a máquina.
          lfo(v, entre(v.rnd, 0.3, 1.1), hz * 0.004, o.frequency, t, v.rnd());
        }
        bp.connect(gF);
        gF.connect(pF);
        v.nodos.push(bp, gF, pF);
        salida(v, pF, t, 1, 0.18);
        lfo(v, 0.19, 280, bp.frequency, t);
        lfo(v, 0.7, 0.018, gF.gain, t, 0.25);

        // Ruido de arco (el rascado de la crin), en la banda media-alta.
        const arco = ruido(v, t);
        const bpA = filtro(v, "bandpass", 1700, 1.3, t);
        const gAr = gan(v, 0.015, t);
        const pAr = panea(v, 0.2, t);
        arco.connect(bpA);
        bpA.connect(gAr);
        gAr.connect(pAr);
        v.nodos.push(bpA, gAr, pAr);
        salida(v, pAr, t, 1, 0.15);
        lfo(v, 0.9, 0.006, gAr.gain, t, 0.7);
        lfo(v, 0.33, 600, bpA.frequency, t, 0.1);

        // EL PULSO: 156 por minuto (0,3846 s). Cada golpe lleva un bombo muy grave; el 1 y el 3
        // llevan madera; el 4 a veces raspa. Nada de caja, nada de platos.
        const periodo = 60 / 156;
        v.generadores.push({
          n: 0,
          siguiente: t + 0.08,
          paso: () => periodo,
          dispara: (tt, n) => {
            const paso = n % 4;
            const acento = paso === 0 ? 1 : 0.72;
            // Tambor de piel, no un bombo de discoteca: parche a 82 Hz que cae a 64, y CUERPO en
            // la banda media (el "pum" de la madera del aro). El cuerpo es lo que hace que se
            // reconozca como un tambor en el altavoz de un tablet, donde los 60 Hz no existen.
            golpeTono(v, tt, {
              hz: 82,
              tipo: "sine",
              nivel: 0.095 * acento,
              ataque: 0.004,
              caida: 0.1,
              deriva: 0.78,
              pan: 0,
              humedo: 0.12,
            });
            golpeRuido(v, tt, {
              hz: 330,
              q: 1.3,
              nivel: 0.062 * acento,
              ataque: 0.003,
              caida: 0.065,
              pan: entre(v.rnd, -0.12, 0.12),
              humedo: 0.2,
            });
            // Madera en los CUATRO tiempos, con acentos desiguales: un tambor de piel golpeado a
            // mano, no un metrónomo. Y en la banda media, que es donde se oye un tablet.
            golpeRuido(v, tt + (paso % 2 ? 0.006 : 0), {
              hz: entre(v.rnd, 1250, 1750),
              q: entre(v.rnd, 1.8, 3.0),
              nivel: 0.085 * [1, 0.45, 0.7, 0.45][paso],
              ataque: 0.003,
              caida: entre(v.rnd, 0.035, 0.07),
              pan: entre(v.rnd, -0.45, 0.45),
              humedo: 0.3,
            });
            if (paso === 3 && v.rnd() < 0.45) {
              golpeRuido(v, tt, {
                hz: entre(v.rnd, 2200, 3000),
                q: 8,
                nivel: 0.02,
                ataque: 0.006,
                caida: 0.1,
                barrido: 0.5,
                pan: entre(v.rnd, -0.8, 0.8),
                humedo: 0.25,
              });
            }
          },
        });

        cada(v, 3, 8, "rasca", 0.9);
        cada(v, 7, 16, "crujido", 0.8);
      },
    },

    /**
     * HORROR — el Bosque, el Corazón. Cuatro parejas de drones desafinadas ENTRE SÍ, así que la
     * energía sube y baja sola (baten a 1,3, 1,8, 2,4 y 2,7 Hz y ninguna coincide). Encima, agudos
     * que asoman y se van y un siseo que respira. Nada rítmico: si aparece un compás, se rompe.
     */
    horror: {
      fundido: 3.2,
      construir(v, t) {
        // Las cuatro parejas. Frecuencias que no pertenecen a ninguna escala.
        const parejas = [
          { a: 43.65, b: 45.0, tipo: "triangle", corte: 110, nivel: 0.026 },
          { a: 58.27, b: 61.0, tipo: "sawtooth", corte: 300, nivel: 0.03 },
          { a: 87.31, b: 89.11, tipo: "sawtooth", corte: 420, nivel: 0.024 },
          { a: 130.81, b: 133.2, tipo: "sine", corte: 0, nivel: 0.016 },
        ];
        for (const p of parejas) {
          const g = gan(v, p.nivel, t);
          let entrada = g;
          if (p.corte) {
            const f = filtro(v, "lowpass", p.corte, 0.9, t);
            f.connect(g);
            entrada = f;
            v.nodos.push(f);
            lfo(v, entre(v.rnd, 0.013, 0.04), p.corte * 0.28, f.frequency, t, v.rnd());
          }
          for (const hz of [p.a, p.b]) {
            const o = osc(v, p.tipo, hz, t);
            const gg = gan(v, 0.9, t);
            o.connect(gg);
            gg.connect(entrada);
            v.nodos.push(gg);
            // Un temblor mínimo en la afinación: el batido no queda clavado en una frecuencia.
            lfo(v, entre(v.rnd, 0.02, 0.09), hz * 0.0012, o.frequency, t, v.rnd());
          }
          v.nodos.push(g);
          salida(v, g, t, 1, 0.22);
          lfo(v, entre(v.rnd, 0.02, 0.06), p.nivel * 0.35, g.gain, t, v.rnd());
        }

        // Siseo de fondo, muy arriba: el aire de un sitio que no debería tener aire.
        const s = ruido(v, t);
        const hp = filtro(v, "highpass", 2200, 0.7, t);
        const gS = gan(v, 0.008, t);
        const pS = panea(v, entre(v.rnd, -0.3, 0.3), t);
        s.connect(hp);
        hp.connect(gS);
        gS.connect(pS);
        v.nodos.push(hp, gS, pS);
        salida(v, pS, t, 1, 0.3);
        lfo(v, 0.037, 0.006, gS.gain, t, 0.3);
        lfo(v, 0.021, 900, hp.frequency, t, 0.8);

        // Dos parciales agudos permanentes pero desiguales, batiendo entre ellos.
        for (const [hz, n] of [
          [2612, 0.011],
          [2634, 0.009],
          [3931, 0.007],
        ]) {
          const o = osc(v, "sine", hz, t);
          const g = gan(v, n, t);
          const p = panea(v, entre(v.rnd, -0.9, 0.9), t);
          o.connect(g);
          g.connect(p);
          v.nodos.push(g, p);
          salida(v, p, t, 1, 0.4);
          lfo(v, entre(v.rnd, 0.03, 0.11), n * 0.8, g.gain, t, v.rnd());
        }

        cada(v, 2.5, 7, "agudo", 1);
        cada(v, 3.5, 9, "susurro", 1);
        cada(v, 5, 14, "golpe", 0.8);
        cada(v, 4, 11, "crujido", 0.9);
      },
    },

    /**
     * DUELO — una sola nota larga que se apaga, y silencio. Campana de D3 con parciales
     * inarmónicos y una cola de bordón que se va a cero en once segundos. Si la escena se alarga,
     * vuelve a tañer al minuto largo: un funeral, no un ambiente.
     */
    duelo: {
      fundido: 1.4,
      construir(v, t) {
        const tanido = (tt, nivel) => {
          const f0 = 146.83;
          const parciales = [1, 2.02, 2.77, 4.16, 5.43, 6.8];
          const niveles = [1, 0.4, 0.26, 0.13, 0.08, 0.05];
          const caidas = [9.0, 5.5, 3.4, 2.1, 1.4, 0.9];
          for (let i = 0; i < parciales.length; i++) {
            golpeTono(v, tt, {
              hz: f0 * parciales[i],
              tipo: "sine",
              nivel: 0.062 * niveles[i] * nivel,
              ataque: 0.008 + i * 0.003,
              caida: caidas[i],
              corte: 3000,
              pan: entre(v.rnd, -0.25, 0.25),
              humedo: 0.8,
            });
          }
          // Cola de bordón: dos cuerdas casi al unísono que se apagan con la campana.
          for (const hz of [73.42, 73.68]) {
            golpeTono(v, tt, {
              hz,
              tipo: "sawtooth",
              nivel: 0.02 * nivel,
              ataque: 0.35,
              caida: 10.5,
              corte: 190,
              pan: 0,
              humedo: 0.2,
            });
          }
          // Un lecho de aire que también se va.
          golpeRuido(v, tt, {
            tipo: "lowpass",
            hz: 520,
            q: 0.7,
            nivel: 0.008 * nivel,
            ataque: 0.6,
            caida: 8.5,
            pan: 0,
            humedo: 0.4,
          });
        };
        tanido(t, 1);
        // El siguiente tañido, si la escena sigue ahí. Nunca antes de 50 s.
        v.generadores.push({
          n: 0,
          siguiente: t + entre(v.rnd, 52, 95),
          paso: () => entre(v.rnd, 52, 95),
          dispara: (tt) => tanido(tt, entre(v.rnd, 0.7, 1)),
        });
      },
    },
  };

  // ── API ─────────────────────────────────────────────────────────────────────────────────────

  /** Traduce lo que pida quien llama a una clave válida (o null = silencio). */
  function normaliza(estado) {
    if (estado == null) return null;
    const k = String(estado).trim().toLowerCase();
    if (!k) return null;
    if (RECETAS[k]) return k;
    if (k in ALIAS) return ALIAS[k];
    console.warn(`musica.js: ambiente desconocido "${estado}"; se pone "calma".`);
    return "calma";
  }

  function poner(estado, opciones = {}) {
    const nueva = normaliza(estado);
    if (nueva === null) return parar(opciones);
    asegurarContexto();
    const yaSuena = voces.some((v) => v.clave === nueva && !v.apagando);
    if (yaSuena && !opciones.reiniciar) {
      clave = nueva;
      return Promise.resolve(mando);
    }
    const arranca = reanudar();
    const ahora = ctx.currentTime;
    const t = Math.max(ahora + (programado ? 0 : ADELANTO), opciones.en ?? -Infinity);
    const dur = Math.max(FUNDIDO_MINIMO, opciones.fundido ?? RECETAS[nueva].fundido);

    for (const v of [...voces]) apagarVoz(v, t, dur);

    const v = nuevaVoz(nueva, t);
    voces.push(v);
    RECETAS[nueva].construir(v, t);
    rampa(v.fundido.gain, 1, t, dur);
    programarVoz(v, programado ? finProgramado() : ctx.currentTime + HORIZONTE);
    arrancarPlan();
    clave = nueva;
    return arranca.then(() => espera(t - ahora + dur)).then(() => mando);
  }

  function parar(opciones = {}) {
    clave = null;
    if (!ctx || !voces.length) {
      pararPlan();
      return Promise.resolve(mando);
    }
    const dur = Math.max(FUNDIDO_MINIMO, opciones.fundido ?? FUNDIDO_PARAR);
    const t = ctx.currentTime + (programado ? 0 : ADELANTO);
    const lista = [...voces];
    for (const v of lista) apagarVoz(v, t, dur);
    return espera(dur + COLA_VOZ + 0.1)
      .then(() => {
        for (const v of lista) liberarVoz(v);
        pararPlan();
        // OJO: aquí NO se puede suspender todavía. Los `stop()` que se acaban de dar los procesa
        // el hilo de audio en el siguiente bloque; si se suspende en el mismo instante, ese bloque
        // no llega a correr, los osciladores se quedan a medio parar y no lanzan su evento `ended`.
        // No es que suenen —están desconectados—, pero quedan colgando. Un cuarto de segundo de
        // margen y el hilo de audio termina su trabajo.
        return espera(0.25);
      })
      .then(() => {
        if (conf.dormir && !ctxAjeno && ctx && !voces.length && ctx.state === "running") {
          // Suspender ahorra batería en la mesa. El siguiente `poner()` reanuda.
          try {
            ctx.suspend();
          } catch {
            /* da igual */
          }
        }
        return mando;
      });
  }

  function volumen(v) {
    if (v === undefined) return vol;
    vol = limita(Number(v) || 0);
    if (bus) rampa(bus.gain, vol, ctx.currentTime + (programado ? 0 : ADELANTO), 0.12);
    return vol;
  }

  function suceso(tipo, opciones = {}) {
    const k = String(tipo || "").toLowerCase();
    if (!sucesos[k]) {
      console.warn(`musica.js: suceso desconocido "${tipo}".`);
      return Promise.resolve(mando);
    }
    asegurarContexto();
    const arranca = reanudar();
    const t = Math.max(ctx.currentTime + (programado ? 0 : ADELANTO), opciones.en ?? -Infinity);
    const destino = voces.find((v) => !v.apagando);
    if (destino) {
      sucesos[k](destino, t, opciones.nivel ?? 1);
      return arranca.then(() => mando);
    }
    // Sin ambiente puesto: una voz efímera solo para este sonido, que se libera sola.
    const v = nuevaVoz("suelto", t);
    voces.push(v);
    v.fundido.gain.setValueAtTime(1, t);
    sucesos[k](v, t, opciones.nivel ?? 1);
    v.fin = t;
    luegoDe(8, () => liberarVoz(v));
    return arranca.then(() => mando);
  }

  function preparar() {
    asegurarContexto();
    return reanudar();
  }

  function destruir() {
    return parar({ fundido: 0.12 }).then(() => {
      for (const v of [...voces]) liberarVoz(v);
      pararPlan();
      for (const id of temporizadores) clearTimeout(id);
      temporizadores.clear();
      cerrado = true;
      if (ctx && !ctxAjeno && typeof ctx.close === "function" && ctx.state !== "closed") {
        return ctx.close().catch(() => {});
      }
      return undefined;
    });
  }

  const mando = {
    poner,
    parar,
    volumen,
    estado: () => clave,
    activo: () => voces.length > 0,
    preparar,
    suceso,
    contexto: () => ctx,
    destruir,
    detalle: () => ({
      ambiente: clave,
      volumen: vol,
      activo: voces.length > 0,
      voces: voces.map((v) => ({ clave: v.clave, apagando: v.apagando, nodos: v.nodos.length })),
      contexto: ctx ? ctx.state : null,
      programado,
      sucesos: conf.sucesos,
      temporizadores: temporizadores.size + (plan === null ? 0 : 1),
    }),
  };

  return mando;
}
