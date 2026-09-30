// Offline-Betrieb — gegen einen ECHTEN Produktionsserver.
//
// ⚠️ Muss sein: der Service-Worker wird **nur in Produktion** registriert
// (`PwaRegister`). Im Dev-Server prüft man die halbe Sache — die Kacheln gehen
// zwar durchs Netz, landen aber nirgends. Genau in dieser Lücke steckten zwei
// Fehler, die monatelang niemand sah.
//
// SO LÄUFT ER:
//   docker compose exec -T app npm run build
//   docker compose exec -d app sh -c 'PORT=3001 npm start > /tmp/prod.log 2>&1'
//   docker compose exec -T app node e2e/offline-prod.mjs
//   docker compose restart app     # Dev-Server neu bauen (der Build hat .next überschrieben)
//
// Geprüft wird:
//   1. Der Service-Worker übernimmt die Seite,
//   2. besuchte Seiten UND ihre GET-Antworten liegen im DATA_CACHE,
//   3. das Vorladen füllt den Kachel-Cache,
//   4. ohne Netz lädt die Seite weiter — aus dem Cache, nicht als Ersatzseite,
//   5. und die Karte zeigt echte Kacheln.
import { chromium } from "playwright";
import bcrypt from "bcryptjs";
import { testDb } from "./_db.mjs";

const db = testDb();
const BASE = process.env.PROD_BASE ?? "http://localhost:3001";
const PASS = "Test-1234!";
const stamp = Date.now();

const user = await db.user.create({
  data: {
    email: `offlineprod-${stamp}@example.test`,
    name: "Offline Prod",
    passwordHash: bcrypt.hashSync(PASS, 10),
    role: "USER",
    active: true,
    emailVerified: new Date(),
  },
});

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const results = [];
const ok = (n, c, e = "") => results.push(`${c ? "OK  " : "FEHL"} ${n}${e ? ` — ${e}` : ""}`);

try {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', PASS);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 }),
    page.click('button[type="submit"]'),
  ]);

  await page.goto(`${BASE}/reiseplaner`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 60000 });
  ok("Service-Worker steuert die Seite", true);

  // Zweiter Aufruf: jetzt greift der Worker von Anfang an.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  const dataKeys = await page.evaluate(async () =>
    (await (await caches.open("tt-data-v1")).keys()).map((r) => new URL(r.url).pathname),
  );
  // ⚠️ Das hier war kaputt: `setOwner` leerte den Cache auch beim ALLERERSTEN
  // Mal und warf damit den gerade gespeicherten Seitenaufruf wieder weg.
  ok("Seite liegt im Daten-Cache", dataKeys.includes("/reiseplaner"), dataKeys.join(" "));
  ok("GET-Antworten liegen mit drin", dataKeys.some((k) => k.startsWith("/api/v1/")), `${dataKeys.length} Einträge`);

  const btn = page.getByRole("button", { name: "Diesen Ausschnitt laden" });
  await btn.waitFor({ state: "visible", timeout: 30000 });
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll("button")].find((n) =>
      n.textContent?.includes("Diesen Ausschnitt laden"));
    return b && !b.disabled;
  }, null, { timeout: 30000 });
  ok("Kein Dev-Warnhinweis (Worker ist aktiv)",
     !(await page.getByText("kein Service-Worker aktiv", { exact: false }).isVisible().catch(() => false)));

  for (let i = 0; i < 6; i++) {
    await page.click(".leaflet-control-zoom-in");
    await page.waitForTimeout(120);
  }
  await btn.click();
  await page.getByText(/Kacheln geladen/).waitFor({ state: "visible", timeout: 180000 });
  await page.waitForTimeout(4000); // die Puts im Worker laufen ohne await

  const tileCount = await page.evaluate(async () =>
    (await (await caches.open("tt-tiles-v1")).keys()).length);
  // ⚠️ Auch das war kaputt: per `no-cors` geholte Kacheln sind opak und werden
  // mit Aufschlag aufs Speicherkontingent gerechnet — von 138 kamen 63 an.
  ok("Kacheln liegen im Cache", tileCount > 100, `${tileCount} Einträge`);

  // ── Netz weg ────────────────────────────────────────────────────────────
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(10000);

  const body = await page.locator("body").innerText();
  ok("Keine Ersatzseite, sondern die echte Seite",
     !body.includes("Diese Seite wurde noch nicht geladen"), body.slice(0, 50).replace(/\n/g, " | "));
  ok("Offline-Hinweis erscheint", body.includes("Offline"));
  ok("Kartencontainer ist da", (await page.locator(".leaflet-container").count()) === 1);

  const tiles = await page.evaluate(() =>
    [...document.querySelectorAll("img.leaflet-tile")].map((i) => ({
      loaded: i.complete && i.naturalWidth > 0,
      src: i.getAttribute("src") || "",
    })),
  );
  const loaded = tiles.filter((t) => t.loaded).length;
  ok("Karte zeigt offline Kacheln", loaded > 0, `${loaded} von ${tiles.length}`);
  ok("Kacheln stammen aus dem Kachel-Cache",
     tiles.some((t) => t.loaded && t.src.includes("basemaps.cartocdn.com")));

  await context.setOffline(false);
} finally {
  console.log(results.join("\n"));
  const failed = results.filter((r) => r.startsWith("FEHL")).length;
  console.log(`\n${results.length - failed}/${results.length} OK`);
  await browser.close();
  const m = await db.tripMember.findUnique({ where: { userId: user.id } }).catch(() => null);
  await db.user.delete({ where: { id: user.id } }).catch(() => {});
  if (m) await db.trip.delete({ where: { id: m.tripId } }).catch(() => {});
  await db.$disconnect();
  process.exit(failed ? 1 : 0);
}
