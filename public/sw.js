// Service-Worker: macht die App installierbar UND offline-lesbar.
//
// Zwei Caches:
//  1. STATIC_CACHE — statische, nicht personenbezogene App-Shell-Assets
//     (JS/CSS/Fonts/Icons). Für alle Nutzer gleich, unbedenklich persistent.
//  2. DATA_CACHE   — Navigations-/HTML-Seiten UND GET /api/*-Antworten, damit
//     der zuletzt gesehene Reiseplan offline verfügbar ist.
//
// Strategie durchgehend NETWORK-FIRST: online kommt immer die frische Antwort
// (kein veraltetes Bundle/keine veralteten Daten), der Cache dient nur als
// Offline-Fallback.
//
// Cross-User-Schutz: DATA_CACHE ist an genau einen Nutzer gebunden (Marker
// "/__owner"). Meldet der Client einen anderen Nutzer (Login-Wechsel) oder einen
// Logout, wird DATA_CACHE vollständig geleert — so sieht nie jemand offline die
// personenbezogenen Seiten/Daten eines anderen Kontos.
const STATIC_CACHE = "tt-static-v4";
const DATA_CACHE = "tt-data-v1";
const OWNER_KEY = "/__owner";

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

// Cacheln, was offline sinnvoll lesbar ist: eigene GET-Navigationen und GET /api/*.
function isDataRequest(request, url) {
  if (url.origin !== self.location.origin) return false;
  if (request.mode === "navigate") return true;
  return url.pathname.startsWith("/api/");
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== STATIC_CACHE && k !== DATA_CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Owner-Handling: Daten-Cache leeren, wenn ein anderer Nutzer aktiv wird / sich abmeldet.
async function setOwner(userId) {
  const cache = await caches.open(DATA_CACHE);
  const prev = await cache.match(OWNER_KEY);
  const prevId = prev ? await prev.text() : null;
  if (prevId !== userId) {
    await caches.delete(DATA_CACHE);
    const fresh = await caches.open(DATA_CACHE);
    await fresh.put(OWNER_KEY, new Response(userId || ""));
  }
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "session" && data.userId) {
    event.waitUntil(setOwner(String(data.userId)));
  } else if (data.type === "logout") {
    event.waitUntil(caches.delete(DATA_CACHE));
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (isStaticAsset(url)) {
    // Statisch: network-first, Fallback auf Cache.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }

  if (isDataRequest(request, url)) {
    // Daten/Navigation: network-first, Fallback auf zuletzt gesehene Version.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(DATA_CACHE).then((c) => c.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          // Navigation ohne Cache → einfache Offline-Antwort.
          if (request.mode === "navigate") {
            return new Response(
              "<!doctype html><meta charset=utf-8><title>Offline</title><body style='font-family:sans-serif;padding:2rem;color:#0A314C'><h1>Offline</h1><p>Diese Seite wurde noch nicht geladen. Sobald du wieder online bist, ist sie verfügbar.</p></body>",
              { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 200 },
            );
          }
          return new Response("", { status: 504 });
        }),
    );
  }
});

// --- Web-Push: Team-Benachrichtigungen ---------------------------------------
// Zeigt eine System-Benachrichtigung, auch wenn die App geschlossen ist.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    /* kein/ungültiges Payload → Standardtext */
  }
  const title = data.title || "Clover Japan";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "clover-activity",
      data: { url: data.url || "/start" },
    }),
  );
});

// Klick auf die Benachrichtigung → App-Fenster fokussieren bzw. öffnen.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/start";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) client.navigate(url).catch(() => {});
          return undefined;
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
