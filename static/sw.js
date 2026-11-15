// Lets Celestial install to the home screen and open without a connection. The app's
// own code is fetched fresh when online (so a deploy reaches everyone at once) and
// from the cache when not; card art, sounds and fonts are cached as they are used.
// The API is never cached: it needs the server.
const CACHE = "celestial-v1";
const SHELL = [
    "/",
    "/static/css/style.css",
    "/static/js/main.js",
    "/static/js/util.js",
    "/static/js/store.js",
    "/static/js/api.js",
    "/static/js/sheet.js",
    "/static/js/places.js",
    "/static/js/kolam.js",
    "/static/js/today.js",
    "/static/js/ask.js",
    "/static/js/timeline.js",
    "/static/js/family.js",
    "/static/js/calendar.js",
    "/static/js/jataka.js",
    "/static/js/journal.js",
    "/static/js/share.js",
    "/static/js/cards.js",
    "/static/js/kaudi.js",
    "/static/js/ritual.js",
    "/static/js/sigil.js",
    "/static/js/sound.js",
    "/static/js/tour.js",
    "/static/icons/icon-192.png",
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches
            .open(CACHE)
            .then((cache) => cache.addAll(SHELL))
            .catch(() => {})
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

async function networkFirst(request) {
    const cache = await caches.open(CACHE);
    try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
    } catch {
        return (await cache.match(request)) || (await cache.match("/")) || Response.error();
    }
}

async function cacheFirst(request) {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(request);
    if (hit) return hit;
    const response = await fetch(request);
    if (response.ok || response.type === "opaque") cache.put(request, response.clone());
    return response;
}

self.addEventListener("fetch", (event) => {
    const { request } = event;
    if (request.method !== "GET") return;
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return;
    if (url.origin === location.origin) {
        const lasting = /^\/static\/(cards|audio|icons)\//.test(url.pathname);
        event.respondWith(lasting ? cacheFirst(request) : networkFirst(request));
    } else if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
        event.respondWith(cacheFirst(request));
    }
});
