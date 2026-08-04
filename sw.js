/**
 * Service worker: hace que la app funcione SIN CONEXIÓN una vez instalada.
 *
 * Importa en mesa: el tablet puede quedarse sin wifi y la narración pregenerada,
 * las fichas, el mapa y el estado siguen funcionando. Solo la conversación por
 * voz necesita red, porque llama a las APIs.
 *
 * Sube VERSION al cambiar cualquier fichero de app/ para forzar la actualización.
 */
const VERSION = "corvalar-v2";

const BASE = [
  "./",
  "./index.html",
  "./app.js",
  "./campana.js",
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

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Las APIs nunca se cachean: siempre a la red.
  if (url.hostname.endsWith("elevenlabs.io") || url.hostname.endsWith("anthropic.com")) return;
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
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) caches.open(VERSION).then((c) => c.put(e.request, r.clone()));
        return r;
      })
      .catch(() => caches.match(e.request).then((hit) => hit ?? caches.match("./index.html"))),
  );
});
