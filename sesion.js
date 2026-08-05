/**
 * SESIÓN DE MESA — el cliente del servidor que corre en el Pocophone
 * ==================================================================
 *
 * Hoy la app es una PWA sin servidor: todo vive en el `localStorage` del tablet y las claves las
 * pone el dueño en Ajustes. Eso sigue siendo el camino que TIENE que funcionar mañana aunque el
 * Pocophone no arranque, así que este módulo es **estrictamente opcional**: si no hay servidor,
 * `conectarMesa()` devuelve `null` en menos de un segundo y medio y la app se queda como está.
 *
 * Cuando SÍ hay servidor, este módulo aporta tres cosas:
 *   1. El estado autoritativo llega por SSE (`GET /mesa/flujo`) y se avisa por devolución de
 *      llamada. Es el mismo patrón que el modo tele con `BroadcastChannel`, con otro transporte:
 *      quien manda publica, los demás reciben y repintan.
 *   2. Las acciones salen por `POST /mesa/accion`, con **cola si estamos sin conexión**.
 *   3. Las tres APIs pasan por el servidor (`/api/claude`, `/api/11`, `/api/fal`), que pone las
 *      claves desde su `.env`. Así **ningún móvil necesita claves**.
 *
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 * QUÉ EXPORTA (firmas exactas; esto es el contrato para quien cablee `app/app.js`)
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 *
 *   conectarMesa(opciones?) → Promise<Mesa|null>
 *       opciones = {
 *         modo?: "mesa"|"mando",   // fuerza el modo y lo recuerda; si no, el recordado
 *         clave?: string,          // contraseña de la sesión; si no, la recordada
 *         limiteSalud?: number,    // ms de la sonda de detección (por defecto 1200)
 *         origen?: string,         // otro origen, solo para pruebas ("" = el de la página)
 *         abrirFlujo?: boolean,    // false para no abrir el SSE todavía (por defecto true)
 *       }
 *       Nunca lanza. `null` significa «no hay servidor de mesa detrás de esta página».
 *
 *   hayMesa(limiteMs = 1200) → Promise<boolean>      // solo sondea, no entra ni abre nada
 *   modoRecordado() → "mesa"|"mando"|null
 *   recordarModo(modo) → void
 *   olvidarMesa() → void                             // borra modo, clave y id recordados
 *   apis(mesa|null) → { claude, eleven, fal, cabeceras:{…} }   // ver más abajo
 *   claveEstadoDe(aventura) → string                 // espejo de `claveEstado()` de app.js
 *   API_DIRECTAS, API_MESA, CLAVE_MESA               // constantes
 *
 * El objeto `Mesa` que devuelve `conectarMesa()`:
 *
 *   mesa.id            → string      id de sesión, corto y legible en voz alta
 *   mesa.version       → string|null lo que diga el servidor en /mesa/salud
 *   mesa.dispositivo   → string      id de ESTE aparato (persistente, para saber quién habló)
 *   mesa.modo          → "mesa"|"mando"|null   (null = nadie ha elegido aún en este aparato)
 *   mesa.conexion      → "conectando"|"conectado"|"sin-conexion"|"clave"|"cerrado"
 *   mesa.dentro        → boolean     si el servidor nos ha admitido (entrar() ok o sin clave)
 *   mesa.estado        → objeto|null el último estado autoritativo recibido
 *   mesa.recibidoEn    → number|null ms epoch del último estado
 *   mesa.antiguedad    → number|null ms desde el último estado (para «esto es de hace 2 min»)
 *   mesa.pendientes    → number      acciones en la cola de salida
 *   mesa.descartadas   → number      acciones que se cayeron por desbordar la cola
 *   mesa.apis          → { claude, eleven, fal, cabeceras:{…} }
 *
 *   mesa.elegirModo(modo) → void                 // fija, recuerda y reabre el flujo
 *   mesa.entrar(clave?) → Promise<boolean>       // POST /mesa/entrar; true si estamos dentro
 *   mesa.enviar(accion) → Promise<boolean>       // true = el servidor la aceptó; false = encolada
 *   mesa.publicarEstado(estado, extra?) → Promise<boolean>   // solo tiene sentido en modo mesa
 *   mesa.decir(texto, extra?) → Promise<boolean>             // un turno de la mesa a la cola
 *   mesa.transcribir(blob, opciones?) → Promise<string>      // audio → texto por el proxy de 11
 *   mesa.alCambiar(fn) → función para dejar de escuchar      // fn(estado, meta)
 *   mesa.alConexion(fn) → función para dejar de escuchar     // fn(info)
 *   mesa.alMensaje(fn) → función para dejar de escuchar      // fn(dato, meta) — TODO evento SSE
 *   mesa.pedir(ruta, opciones?) → Promise<Response>          // fetch con las cabeceras de sesión
 *   mesa.reconectar() → void                     // reintento inmediato, sin esperar la espera
 *   mesa.cerrar() → void                         // cierra el SSE y deja de reintentar
 *
 *   `alCambiar(fn)` llama a `fn` en cuanto se suscribe si ya había un estado (así el que se engancha
 *   tarde pinta algo), y luego a cada estado nuevo. `meta` = `{crudo, evento, cuando, primero}`.
 *   `alConexion(fn)` recibe `{conexion, dentro, intentos, antiguedad, motivo}` y se repite cada
 *   cinco segundos mientras NO haya conexión, para que el rótulo «de hace 2 min» siga contando sin
 *   que la interfaz monte su propio temporizador.
 *
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 * LO QUE HABLA CON EL SERVIDOR (rutas literales del contrato)
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 *
 *   GET  /mesa/salud   → JSON. Se lee `id`/`sesion` (id de sesión), `version` y `clave`/
 *                        `requiereClave` (si hace falta contraseña). Si falta algo se sigue
 *                        adelante: la verdad definitiva sobre la clave es el 401 de /mesa/entrar.
 *   POST /mesa/entrar  → `{sesion, clave, dispositivo, modo}`. 200 = dentro. 401/403 = clave mala.
 *   GET  /mesa/flujo?sesion=…&dispositivo=…&modo=…&pase=…&desde=…  → text/event-stream.
 *                        La contraseña NO viaja aquí: `EventSource` no admite cabeceras, así que
 *                        autentica con la cookie de /mesa/entrar, y `?pase=` (un HMAC derivado,
 *                        no la contraseña) es el respaldo si la cookie falla.
 *   POST /mesa/accion  → el sobre de una acción (ver abajo).
 *
 * SOBRE DE UNA ACCIÓN. El servidor y este cliente los escriben dos agentes que no pueden
 * preguntarse nada, así que el cuerpo va **de las dos formas a la vez**: los campos de la acción
 * en la raíz y además la acción entera bajo `accion`. Son cien bytes de más y le quitan a mañana
 * un fallo de «el servidor esperaba otra forma»:
 *
 *   { ...accion, tipo, sesion, dispositivo, modo, eco, cuando, accion: {...accion} }
 *
 * `eco` es un identificador único por acción: si el servidor quiere descartar repeticiones (una
 * cola que se suelta dos veces porque la respuesta se perdió), ahí lo tiene.
 *
 * EVENTOS DEL SSE. Se escucha el evento por defecto (`message`) y también `estado`, `mesa`,
 * `cola`, `latido` y `error-mesa`. El dato se lee con manga ancha: si el JSON trae `estado`, eso
 * es el estado; si trae `que`/`tipo` de estado, se coge lo que venga dentro; y si el JSON es
 * directamente el estado, se usa tal cual. Cualquier evento, reconocido o no, se reparte por
 * `alMensaje(fn)` — así el tablet puede leer la cola de turnos de los móviles aunque el servidor
 * la mande en su propio evento y no dentro del estado.
 *
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 * ALMACÉN LOCAL
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 *
 *   `corvalar.mesa.v1` → `{modo, dispositivo, clave, sesion}`. La contraseña se guarda a propósito:
 *   es la de una sesión de wifi de casa que se dice en voz alta, y hacer que cuatro jugadores la
 *   reescriban cada vez que se recarga la página es peor que guardarla.
 *
 * La cola de salida NO se persiste. Un móvil que se recarga con tres turnos pendientes los
 * perdería... o los mandaría dos veces si el servidor sí los había recibido, y en mesa un turno
 * duplicado suena a que el DJ se ha vuelto loco. Se pierde antes de duplicar.
 */

// ── Constantes ───────────────────────────────────────────────────────────────
export const CLAVE_MESA = "corvalar.mesa.v1";

/** Los hosts de siempre: lo que se usa cuando NO hay servidor de mesa (la app de hoy). */
export const API_DIRECTAS = {
  claude: "https://api.anthropic.com/v1/messages",
  eleven: "https://api.elevenlabs.io/v1",
  fal: "https://fal.run",
};

/** Con servidor, todo es del mismo origen y las claves las pone él. */
export const API_MESA = {
  claude: "/api/claude",
  eleven: "/api/11",
  fal: "/api/fal",
};

/** Espejo de `claveEstado()` en app.js: una partida guardada por aventura. */
export const claveEstadoDe = (aventura) => `corvalar.estado.v1.${aventura}`;

const MODOS = ["mesa", "mando"];
const TOPE_COLA = 40;
const ESPERA_MIN = 1000;   // primera reconexión: al segundo
const ESPERA_MAX = 15_000; // techo: quince segundos, que en mesa ya es una eternidad
const AVISO_CAIDO = 5000;  // cada cuánto se repite el aviso mientras no hay conexión

// ── Almacén del dispositivo ──────────────────────────────────────────────────
function leerMemoria() {
  try { return JSON.parse(localStorage.getItem(CLAVE_MESA)) ?? {}; }
  catch { return {}; }
}

function escribirMemoria(parche) {
  const m = { ...leerMemoria(), ...parche };
  try { localStorage.setItem(CLAVE_MESA, JSON.stringify(m)); } catch { /* modo privado */ }
  return m;
}

export function modoRecordado() {
  const m = leerMemoria().modo;
  return MODOS.includes(m) ? m : null;
}

export function recordarModo(modo) {
  if (MODOS.includes(modo)) escribirMemoria({ modo });
}

export function olvidarMesa() {
  try { localStorage.removeItem(CLAVE_MESA); } catch { /* nada */ }
}

/**
 * Id de este aparato. Se guarda porque es lo que hace que el servidor sepa **quién habló** sin
 * tener que separar voces: si el id cambiara en cada recarga, un móvil dejaría de ser el mismo
 * jugador a mitad de partida.
 */
function idDispositivo() {
  const m = leerMemoria();
  if (typeof m.dispositivo === "string" && m.dispositivo.length >= 6) return m.dispositivo;
  const nuevo = "d-" + sorteo();
  escribirMemoria({ dispositivo: nuevo });
  return nuevo;
}

/** `crypto.randomUUID` no está en http:// en algunos navegadores, y la mesa va por http de casa. */
function sorteo() {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID().slice(0, 12);
    const b = new Uint8Array(6);
    crypto.getRandomValues(b);
    return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  } catch {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }
}

// ── URL de las APIs ──────────────────────────────────────────────────────────
/**
 * Las URL y las cabeceras de las tres APIs, en los dos mundos, con la MISMA forma.
 *
 * Se pasa `mesa` (o `null`) y se obtiene todo lo que hace falta para llamar. Las funciones de
 * cabeceras reciben la clave local de Ajustes y **la ignoran si hay servidor**, que es justo lo que
 * permite que un móvil sin claves funcione: el mismo código de llamada sirve para los dos casos.
 *
 *   const { claude, cabeceras } = apis(mesa);
 *   fetch(claude, { method: "POST", headers: cabeceras.claude(A.claveCl), body });
 *
 * Para `eleven` con `FormData` hay que pedir `cabeceras.eleven(clave, { json: false })`: si se
 * pone `content-type: application/json` sobre un `FormData`, el navegador no escribe la frontera
 * del multipart y ElevenLabs contesta 400.
 */
export function apis(mesa) {
  const conServidor = !!mesa;
  const base = conServidor ? API_MESA : API_DIRECTAS;
  const sesion = () => (conServidor ? mesa.cabecerasSesion() : {});
  return {
    ...base,
    conServidor,
    cabeceras: {
      claude(clave) {
        if (conServidor) return { "content-type": "application/json", ...sesion() };
        return {
          "x-api-key": clave ?? "",
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          // Sin esta cabecera el navegador no puede llamar a la API de Claude.
          "anthropic-dangerous-direct-browser-access": "true",
        };
      },
      eleven(clave, { json = true } = {}) {
        const h = conServidor ? { ...sesion() } : { "xi-api-key": clave ?? "" };
        if (json) h["content-type"] = "application/json";
        return h;
      },
      fal(clave, { json = true } = {}) {
        const h = conServidor ? { ...sesion() } : { Authorization: `Key ${clave ?? ""}` };
        if (json) h["content-type"] = "application/json";
        return h;
      },
    },
  };
}

// ── Detección ────────────────────────────────────────────────────────────────
/**
 * ¿Hay servidor de mesa detrás de esta página?
 *
 * Tres cosas importan aquí y las tres son «que la app arranque igual si no lo hay»:
 *   · Tiempo límite corto y propio. Sin `AbortController` un servidor a medio arrancar deja la
 *     petición colgada los treinta segundos del navegador y la app no pinta nada mientras.
 *   · No lanza nunca. Un `fetch` a un origen que no contesta es una excepción, y aquí es «no hay».
 *   · Exige que la respuesta sea JSON con pinta de salud. GitHub Pages (donde vive la app
 *     publicada) y cualquier host con relleno de SPA contestan 200 con HTML a rutas que no
 *     existen; sin esta comprobación la app publicada creería que tiene servidor de mesa.
 */
async function sondear({ origen = "", limiteSalud = 1200 } = {}) {
  // En `file://` no hay origen que sondear y el fetch relativo se comporta de formas raras.
  if (location.protocol === "file:") return null;
  const ac = new AbortController();
  const reloj = setTimeout(() => ac.abort(), Math.max(200, limiteSalud));
  try {
    const r = await fetch(`${origen}/mesa/salud`, {
      method: "GET", cache: "no-store", signal: ac.signal, credentials: "same-origin",
    });
    if (!r.ok) return null;
    const texto = await r.text();
    let d = null;
    try { d = JSON.parse(texto); } catch { return null; }
    if (!d || typeof d !== "object") return null;
    // Con que traiga UNA de estas ya es un servidor de mesa y no la página de error de un host.
    const suyo = ["mesa", "sesion", "id", "ok", "version", "clave", "requiereClave"]
      .some((k) => k in d);
    return suyo ? d : null;
  } catch {
    return null;
  } finally {
    clearTimeout(reloj);
  }
}

export async function hayMesa(limiteMs = 1200) {
  return !!(await sondear({ limiteSalud: limiteMs }));
}

// ── La sesión ────────────────────────────────────────────────────────────────
export async function conectarMesa(opciones = {}) {
  const salud = await sondear(opciones);
  if (!salud) return null;
  const mesa = crearMesa(salud, opciones);
  await mesa.arrancar();
  return mesa;
}

function crearMesa(salud, opciones) {
  const origen = opciones.origen ?? "";
  const memoria = leerMemoria();

  const id = String(salud.id ?? salud.sesion ?? memoria.sesion ?? "mesa");
  const version = salud.version ?? null;
  const dispositivo = idDispositivo();
  // La clave que dice el servidor que hace falta es una PISTA. La verdad es el 401 de /mesa/entrar:
  // un servidor que no informe de esto no debe dejarnos creer que estamos dentro.
  const pideClave = !!(salud.clave ?? salud.requiereClave ?? false);

  let modo = MODOS.includes(opciones.modo) ? opciones.modo : modoRecordado();
  if (MODOS.includes(opciones.modo)) recordarModo(opciones.modo);
  let clave = opciones.clave ?? memoria.clave ?? "";
  /**
   * El pase derivado que devuelve `/mesa/entrar`. Es lo único que puede ir en la URL del flujo
   * SSE: un HMAC de la sesión, no la contraseña. Ver `urlFlujo()` para el por qué.
   *
   * No se guarda en `localStorage`: se pide de nuevo al entrar. Un pase caducado en el almacén
   * daría un 401 desconcertante justo al arrancar, y volver a entrar cuesta una petición.
   */
  let pase = "";

  let conexion = "conectando";
  let dentro = false;
  let motivo = "";
  let fuente = null;      // el EventSource vivo
  let ultimoId = "";      // para pedir «desde» al reconectar y no perder el hilo
  let estado = null;
  let recibidoEn = null;
  let intentos = 0;
  let reintento = null;   // temporizador de la reconexión
  let repetidor = null;   // temporizador del aviso mientras estamos caídos
  let cerrado = false;
  let descartadas = 0;
  let primero = true;

  const cola = [];
  const oyentesEstado = new Set();
  const oyentesConexion = new Set();
  const oyentesMensaje = new Set();

  if (id !== memoria.sesion) escribirMemoria({ sesion: id });

  const antiguedad = () => (recibidoEn == null ? null : Date.now() - recibidoEn);

  function info() {
    return { conexion, dentro, intentos, antiguedad: antiguedad(), motivo, pendientes: cola.length };
  }

  /**
   * Un aparato que miente sobre estar conectado es peor que uno que dice que no está: cada cambio
   * de conexión se grita, y mientras estamos caídos se repite cada cinco segundos para que el
   * rótulo de «esto es de hace dos minutos» siga contando solo.
   */
  function anunciar(nuevo, porque = "") {
    if (nuevo) { conexion = nuevo; motivo = porque; }
    for (const fn of oyentesConexion) { try { fn(info()); } catch { /* la vista se apaña */ } }
    clearInterval(repetidor);
    repetidor = null;
    if (conexion !== "conectado") {
      repetidor = setInterval(() => {
        for (const fn of oyentesConexion) { try { fn(info()); } catch { /* nada */ } }
      }, AVISO_CAIDO);
    }
  }

  function cabecerasSesion() {
    const h = { "x-mesa-sesion": id, "x-mesa-dispositivo": dispositivo };
    if (modo) h["x-mesa-modo"] = modo;
    if (clave) h["x-mesa-clave"] = clave;
    return h;
  }

  function pedir(ruta, op = {}) {
    const cab = { ...cabecerasSesion(), ...(op.headers ?? {}) };
    return fetch(`${origen}${ruta}`, { credentials: "same-origin", ...op, headers: cab });
  }

  /** Un fetch con tiempo límite propio: en mesa, esperar treinta segundos es como no responder. */
  async function pedirConLimite(ruta, op = {}, limite = 8000) {
    const ac = new AbortController();
    const reloj = setTimeout(() => ac.abort(), limite);
    try { return await pedir(ruta, { ...op, signal: ac.signal }); }
    finally { clearTimeout(reloj); }
  }

  // ── Entrar ────────────────────────────────────────────────────────────────
  async function entrar(claveNueva) {
    if (typeof claveNueva === "string") clave = claveNueva;
    try {
      const r = await pedirConLimite("/mesa/entrar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sesion: id, clave, dispositivo, modo }),
      }, 6000);
      if (r.status === 401 || r.status === 403) {
        dentro = false;
        anunciar("clave", "la contraseña de la sesión no vale");
        return false;
      }
      if (!r.ok) {
        dentro = false;
        anunciar("sin-conexion", `el servidor ha contestado ${r.status} al entrar`);
        return false;
      }
      dentro = true;
      if (clave) escribirMemoria({ clave });
      // Puede venir el id de sesión definitivo o el modo que el servidor prefiera para este
      // aparato; se lee si viene y se ignora si no.
      const d = await r.json().catch(() => null);
      if (d && MODOS.includes(d.modo) && !modo) { modo = d.modo; recordarModo(modo); }
      // El pase derivado que devuelve el servidor. Es lo que se usa en el flujo SSE cuando la
      // cookie no llega, y NO la contraseña: ver `urlFlujo()`.
      if (d?.pase) pase = String(d.pase);
      // `abrirFlujo: false` es para quien quiera entrar ahora y escuchar más tarde (pruebas, o una
      // pantalla de bienvenida que aún no tiene dónde pintar el estado).
      if (opciones.abrirFlujo !== false) abrirFlujo();
      else anunciar("conectando", "el flujo no se ha abierto todavía");
      return true;
    } catch {
      dentro = false;
      anunciar("sin-conexion", "no he podido hablar con el servidor de mesa");
      return false;
    }
  }

  // ── El flujo (SSE) ────────────────────────────────────────────────────────
  /**
   * La URL del flujo. **La contraseña no va aquí, y esto es deliberado.**
   *
   * Antes iba: `EventSource` no admite cabeceras, así que la forma fácil de autenticarlo era
   * `?clave=` con la contraseña en claro. En una wifi de casa parecía inofensivo, pero con el
   * túnel de Cloudflare por delante la URL entera acaba en los logs del borde, en el historial
   * del navegador de cada jugador y en cualquier proxy de por medio. Y el flujo se reabre en cada
   * reconexión, que en un móvil que apaga la pantalla es todo el rato.
   *
   * El camino normal es la **cookie** que pone `/mesa/entrar`, que `EventSource` manda sola al ser
   * del mismo origen. `?pase=` es el respaldo si la cookie falla, y lleva el pase DERIVADO —un
   * HMAC de la sesión— que si se filtra a un log no revela la contraseña ni sirve en otra mesa.
   */
  function urlFlujo() {
    const q = new URLSearchParams({ sesion: id, dispositivo });
    if (modo) q.set("modo", modo);
    if (pase) q.set("pase", pase);
    if (ultimoId) q.set("desde", ultimoId);
    return `${origen}/mesa/flujo?${q}`;
  }

  function abrirFlujo() {
    if (cerrado) return;
    cerrarFuente();
    clearTimeout(reintento);
    reintento = null;
    anunciar("conectando");
    let f;
    try {
      f = new EventSource(urlFlujo(), { withCredentials: false });
    } catch {
      programarReintento("no he podido abrir el flujo");
      return;
    }
    fuente = f;

    f.onopen = () => {
      intentos = 0;
      dentro = true;
      anunciar("conectado");
      soltarCola();
    };
    f.onerror = () => {
      // `EventSource` reintenta solo, pero con una espera que no controlamos y sin decir nada.
      // Se cierra a mano y se reintenta con espera creciente, para poder CONTARLO en pantalla.
      if (fuente !== f) return;
      cerrarFuente();
      programarReintento("se ha cortado el flujo del servidor");
    };

    const recibir = (nombre) => (ev) => {
      if (fuente !== f) return;
      if (ev.lastEventId) ultimoId = ev.lastEventId;
      if (conexion !== "conectado") { intentos = 0; dentro = true; anunciar("conectado"); soltarCola(); }
      atender(nombre, ev.data);
    };
    f.onmessage = recibir("message");
    for (const nombre of ["estado", "mesa", "cola", "latido", "error-mesa"]) {
      f.addEventListener(nombre, recibir(nombre));
    }
  }

  function cerrarFuente() {
    if (!fuente) return;
    try { fuente.close(); } catch { /* nada */ }
    fuente = null;
  }

  function programarReintento(porque) {
    if (cerrado) return;
    intentos += 1;
    const espera = Math.min(ESPERA_MAX, ESPERA_MIN * 2 ** (intentos - 1));
    // Un poco de azar para que cinco aparatos que se quedaron sin wifi a la vez no vuelvan todos
    // en el mismo milisegundo.
    const con = espera + Math.floor(Math.random() * 400);
    anunciar("sin-conexion", porque);
    clearTimeout(reintento);
    reintento = setTimeout(abrirFlujo, con);
  }

  /** Lee un evento con manga ancha: no sé qué forma exacta le habrá dado el otro agente. */
  function atender(evento, datos) {
    let d = null;
    if (typeof datos === "string" && datos.trim()) {
      try { d = JSON.parse(datos); } catch { d = { texto: datos }; }
    }
    const meta = { crudo: d, evento, cuando: Date.now() };
    for (const fn of oyentesMensaje) { try { fn(d, meta); } catch { /* nada */ } }
    if (evento === "latido") return;   // solo sirve para saber que seguimos vivos

    const nuevo = estadoDe(d, evento);
    if (!nuevo) return;
    estado = nuevo;
    recibidoEn = Date.now();
    const m = { ...meta, primero };
    primero = false;
    for (const fn of oyentesEstado) { try { fn(estado, m); } catch { /* nada */ } }
  }

  /**
   * De un dato de SSE al estado de la partida. Se aceptan las tres formas plausibles porque el
   * servidor lo escribe otro agente y equivocarse aquí es quedarse sin sincronía en mesa.
   */
  function estadoDe(d, evento) {
    if (!d || typeof d !== "object") return null;
    if (d.estado && typeof d.estado === "object") return d.estado;
    if (d.E && typeof d.E === "object") return d.E;
    const etiqueta = d.que ?? d.tipo ?? evento;
    if (etiqueta === "estado" || etiqueta === "mesa") {
      // `{que:"estado", ...el estado}`: el estado es todo lo demás.
      const { que, tipo, ...resto } = d;
      return Object.keys(resto).length ? resto : null;
    }
    // Un estado pelado: lo reconocemos por los campos que app.js da por seguros.
    if ("local" in d || "partida" in d || "charla" in d) return d;
    return null;
  }

  // ── Acciones y cola ───────────────────────────────────────────────────────
  function sobre(accion) {
    const a = accion && typeof accion === "object" ? accion : { tipo: String(accion ?? "") };
    return {
      ...a,
      sesion: id,
      dispositivo,
      modo,
      eco: `${dispositivo}-${Date.now().toString(36)}-${sorteo().slice(0, 4)}`,
      cuando: Date.now(),
      accion: a,
    };
  }

  async function mandar(cuerpo) {
    const r = await pedirConLimite("/mesa/accion", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
    }, 12_000);
    if (r.status === 401 || r.status === 403) {
      dentro = false;
      anunciar("clave", "el servidor ya no nos admite; hace falta la contraseña");
      throw new Error("sin permiso");
    }
    if (!r.ok) throw new Error(`el servidor ha contestado ${r.status}`);
    return true;
  }

  async function enviar(accion) {
    const cuerpo = sobre(accion);
    try {
      await mandar(cuerpo);
      return true;
    } catch (e) {
      if (String(e?.message) === "sin permiso") return false;
      // Encolar y decirlo. Un POST que falla casi siempre significa que el flujo también está roto,
      // así que se fuerza la reconexión en vez de esperar a que el SSE se dé cuenta solo.
      encolar(cuerpo);
      if (conexion === "conectado") { cerrarFuente(); programarReintento("no ha salido una acción"); }
      return false;
    }
  }

  function encolar(cuerpo) {
    cola.push(cuerpo);
    while (cola.length > TOPE_COLA) { cola.shift(); descartadas += 1; }
    anunciar();
  }

  /** Se sueltan en orden y se para en el primer fallo: el orden de los turnos es la conversación. */
  async function soltarCola() {
    while (cola.length) {
      const cuerpo = cola[0];
      try { await mandar(cuerpo); }
      catch { return; }
      cola.shift();
      anunciar();
    }
  }

  // ── Ayudas de mesa ────────────────────────────────────────────────────────
  /**
   * El aparato en modo mesa publica el estado que acaba de calcular. Los nombres de `tipo` son los
   * de este contrato; si el servidor usa otros, se cambian estas dos líneas y nada más.
   */
  const publicarEstado = (estadoNuevo, extra = {}) =>
    enviar({ tipo: "estado", estado: estadoNuevo, ...extra });

  /** Un turno hablado o escrito, para que lo recoja quien lleva el bucle del DJ. */
  const decir = (texto, extra = {}) =>
    enviar({ tipo: "decir", texto: String(texto ?? "").trim(), ...extra });

  /**
   * Audio → texto **por el proxy del servidor**, que es lo que permite que un móvil sin claves
   * pueda hablarle al DJ. Devuelve el texto; lanza con un mensaje en español si no ha podido.
   */
  async function transcribir(blob, { idioma = "spa", modelo = "scribe_v1", limite = 30_000 } = {}) {
    const fd = new FormData();
    fd.append("file", blob, "voz.webm");
    fd.append("model_id", modelo);
    fd.append("language_code", idioma);
    const ac = new AbortController();
    const reloj = setTimeout(() => ac.abort(), limite);
    try {
      const r = await pedir(`${API_MESA.eleven}/speech-to-text`, {
        method: "POST", body: fd, signal: ac.signal,
      });
      if (!r.ok) throw new Error(`no he podido transcribir (el servidor dice ${r.status})`);
      const d = await r.json();
      const texto = d?.text?.trim();
      if (!texto) throw new Error("no he entendido nada. Prueba a hablar más cerca");
      return texto;
    } finally {
      clearTimeout(reloj);
    }
  }

  // ── Ciclo de vida ─────────────────────────────────────────────────────────
  async function arrancar() {
    // Si el servidor dice que pide clave y no tenemos ninguna, no se intenta entrar a ciegas: se
    // deja la sesión en «clave» y la interfaz pide la contraseña.
    if (pideClave && !clave) {
      anunciar("clave", "esta mesa tiene contraseña");
      return mesa;
    }
    const ok = await entrar();
    // Sin clave configurada en el servidor, `entrar` puede no existir o contestar 404: en ese caso
    // no hay nada que pedir y se abre el flujo igual.
    if (!ok && conexion !== "clave" && opciones.abrirFlujo !== false) abrirFlujo();
    return mesa;
  }

  function reconectar() {
    intentos = 0;
    abrirFlujo();
  }

  function cerrar() {
    cerrado = true;
    clearTimeout(reintento);
    clearInterval(repetidor);
    reintento = repetidor = null;
    cerrarFuente();
    anunciar("cerrado", "cerrado a mano");
  }

  function elegirModo(nuevo) {
    if (!MODOS.includes(nuevo) || nuevo === modo) return;
    modo = nuevo;
    recordarModo(nuevo);
    // El flujo lleva el modo en la URL, así que se reabre: el servidor puede querer mandar cosas
    // distintas a la mesa y a los mandos.
    if (!cerrado && conexion !== "clave") abrirFlujo();
  }

  /**
   * Un móvil en el bolsillo es una pestaña congelada, y al despertar el navegador NO avisa de que
   * el SSE murió mientras dormía. Volver a la pantalla o recuperar la wifi son las dos señales que
   * de verdad importan en una mesa, y las dos disparan un reintento inmediato.
   */
  addEventListener("online", () => {
    if (!cerrado && conexion !== "conectado" && conexion !== "clave") reconectar();
  });
  addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (cerrado || conexion === "clave") return;
    if (conexion !== "conectado" || !fuente || fuente.readyState !== 1) reconectar();
  });

  const mesa = {
    hayServidor: true,
    id,
    version,
    dispositivo,
    get modo() { return modo; },
    get conexion() { return conexion; },
    get dentro() { return dentro; },
    get estado() { return estado; },
    get recibidoEn() { return recibidoEn; },
    get antiguedad() { return antiguedad(); },
    get pendientes() { return cola.length; },
    get descartadas() { return descartadas; },
    get intentos() { return intentos; },
    get pideClave() { return pideClave; },

    elegirModo, entrar, enviar, publicarEstado, decir, transcribir,
    pedir, reconectar, cerrar, arrancar,
    cabecerasSesion,
    informe: info,

    alCambiar(fn) {
      if (typeof fn !== "function") return () => {};
      oyentesEstado.add(fn);
      // Al que se engancha tarde se le da lo que ya hay: si no, se queda en blanco hasta el
      // siguiente cambio, que puede tardar toda una escena.
      if (estado) queueMicrotask(() => {
        if (oyentesEstado.has(fn)) {
          try { fn(estado, { crudo: null, evento: "al-suscribir", cuando: recibidoEn, primero: false }); }
          catch { /* nada */ }
        }
      });
      return () => oyentesEstado.delete(fn);
    },
    alConexion(fn) {
      if (typeof fn !== "function") return () => {};
      oyentesConexion.add(fn);
      queueMicrotask(() => { if (oyentesConexion.has(fn)) { try { fn(info()); } catch { /* nada */ } } });
      return () => oyentesConexion.delete(fn);
    },
    alMensaje(fn) {
      if (typeof fn !== "function") return () => {};
      oyentesMensaje.add(fn);
      return () => oyentesMensaje.delete(fn);
    },
  };

  mesa.apis = apis(mesa);
  return mesa;
}
