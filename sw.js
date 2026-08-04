/**
 * Service worker: hace que la app funcione SIN CONEXIÓN una vez instalada.
 *
 * Importa en mesa: el tablet puede quedarse sin wifi y la narración pregenerada,
 * las fichas, el mapa y el estado siguen funcionando. Solo la conversación por
 * voz necesita red, porque llama a las APIs.
 *
 * Sube VERSION al cambiar cualquier fichero de app/ para forzar la actualización.
 */
const VERSION = "corvalar-v17";

const BASE = [
  "./",
  "./index.html",
  "./app.js",
  "./campana.js",
  "./retratos.js",
  "./rasgos.js",
  "./mapa.js",
  "./objetos.js",
  "./musica.js",
  "./figura.js",
  "./acciones.js",
  "./ornado.css",
  "./manifest.webmanifest",
  "./icono.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) =>
      // addAll falla entero si un fichero falta; se añaden de uno en uno para
      // que un arte o un audio ausente no rompa la instalación.
      Promise.all(BASE.map((u) => c.add(u).catch(() => {}))),
    ).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Quién eres, para que Ajustes pueda decir qué versión está sirviendo de verdad. Es la primera
// pregunta cuando algo «no funciona» en el tablet: si el código es el nuevo o uno de caché.
self.addEventListener("message", (e) => {
  if (e.data === "version") e.source?.postMessage({ version: VERSION });
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // SOLO lo de esta misma web. Todo lo de fuera —las APIs de voz y de Claude, el generador de
  // imágenes, las imágenes que devuelve— va a la red sin pasar por aquí.
  //
  // Antes se filtraban las APIs por nombre de host una a una, y cualquier otra cosa de fuera caía
  // en el «resto» de abajo, que ante un fallo contesta con index.html. Eso significa que una
  // ilustración que no se puede descargar devolvía la PÁGINA con estado 200: quien la pedía no
  // tenía forma de saber que había fallado, y en pantalla salía una imagen rota sin explicación.
  if (url.origin !== self.location.origin) return;
  if (e.request.method !== "GET") return;

  // Los medios (audio y arte) son inmutables: caché primero, y si no está, red
  // y se guarda para la próxima.
  if (/\/(audio|arte|retratos)\//.test(url.pathname)) {
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ??
          fetch(e.request).then((r) => {
            if (r.ok) caches.open(VERSION).then((c) => c.put(e.request, r.clone()));
            return r;
          }),
      ),
    );
    return;
  }

  // El resto: red primero para recibir actualizaciones, con la caché de reserva
  // cuando no hay cobertura.
  //
  // El respaldo a index.html es SOLO para navegaciones. Devolver la página cuando lo que falta es
  // un módulo o una imagen es peor que fallar: el navegador intenta parsear HTML como JavaScript
  // y la app se queda en blanco sin decir por qué.
  const esNavegacion = e.request.mode === "navigate";
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) caches.open(VERSION).then((c) => c.put(e.request, r.clone()));
        return r;
      })
      .catch(() =>
        caches.match(e.request).then((hit) => {
          if (hit) return hit;
          if (esNavegacion) return caches.match("./index.html");
          return new Response("", { status: 504, statusText: "sin conexión" });
        }),
      ),
  );
});
