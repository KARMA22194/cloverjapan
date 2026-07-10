// Minimaler Service-Worker: macht die App installierbar (fetch-Handler) und
// cached ausschließlich **statische, nicht personenbezogene** Assets.
//
// Bewusst NICHT gecacht:
//  - /api/*             → immer live.
//  - Navigations-/HTML-Responses (SSR-Seiten wie /admin, /day, /profil) → sie enthalten
//    personenbezogene Daten; ein persistenter Cache würde offline die zuletzt gesehene
//    Seite eines *anderen* Nutzers ausliefern (Cross-User-Leak).
// Nur App-Shell-Assets (JS/CSS/Fonts/Icons) landen im Cache — sie sind für alle gleich.
const CACHE = "tt-cache-v3";

// Allowlist: statische Assets ohne Nutzerbezug.
function isStaticAsset(url) {
  const p = url.pathname;
  return (
    p.startsWith("/_next/static/") ||
    p.startsWith("/fonts/") ||
    p.startsWith("/brand/") ||
    p.startsWith("/icon-") ||
    p === "/manifest.webmanifest" ||
    p === "/favicon.ico"
  );
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Nur eigene same-origin GET-Requests behandeln; alles andere direkt ans Netz.
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // Nur statische Assets werden vom SW gecacht. Navigationen/HTML & /api gehen
  // ohne respondWith direkt ans Netz (kein Caching personenbezogener Antworten).
  if (!isStaticAsset(url)) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Nur erfolgreiche, echte (basic) Responses cachen — keine 3xx/4xx/5xx
        // oder opaken Antworten (Cache-Poisoning-Schutz).
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches
            .open(CACHE)
            .then((cache) => cache.put(request, copy))
            .catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(request)),
  );
});
