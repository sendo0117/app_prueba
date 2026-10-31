// Service worker: guarda los archivos de la app para que funcione sin conexión.
// Si cambias algún archivo de la app, sube el número de VERSION para que
// los navegadores descarguen la versión nueva.
const VERSION = "v1";
const CACHE = `lista-tareas-${VERSION}`;

// Archivos que forman la app (rutas relativas, para que funcione en cualquier subcarpeta)
const ARCHIVOS = [
    "./",
    "./index.html",
    "./style.css",
    "./app.js",
    "./manifest.json",
    "./icons/icon-192.png",
    "./icons/icon-512.png",
];

// Al instalar, se descargan y guardan todos los archivos de la app
self.addEventListener("install", (evento) => {
    evento.waitUntil(
        caches.open(CACHE).then((cache) => cache.addAll(ARCHIVOS))
    );
    self.skipWaiting();
});

// Al activarse, se borran las cachés de versiones anteriores
self.addEventListener("activate", (evento) => {
    evento.waitUntil(
        caches.keys().then((nombres) =>
            Promise.all(
                nombres
                    .filter((nombre) => nombre.startsWith("lista-tareas-") && nombre !== CACHE)
                    .map((nombre) => caches.delete(nombre))
            )
        )
    );
    self.clients.claim();
});

// Primero busca en la caché; si no está, pide a la red y lo guarda para la próxima vez
self.addEventListener("fetch", (evento) => {
    if (evento.request.method !== "GET") return;

    evento.respondWith(
        caches.match(evento.request).then((respuesta) => {
            if (respuesta) return respuesta;

            return fetch(evento.request)
                .then((respuestaRed) => {
                    // Solo se guardan respuestas válidas del mismo sitio
                    if (respuestaRed.ok && respuestaRed.type === "basic") {
                        const copia = respuestaRed.clone();
                        caches.open(CACHE).then((cache) => cache.put(evento.request, copia));
                    }
                    return respuestaRed;
                })
                .catch(() => caches.match("./index.html"));
        })
    );
});
