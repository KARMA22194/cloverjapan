// Offline erfasste Mutationen: Outbox + Nachholen.
//
// Der Service-Worker beantwortet nur GETs aus dem Cache — alles Schreibende lief
// vorher ins Leere. Hier wird geprüft, dass eine ohne Verbindung eingetippte
// Ausgabe nicht verloren geht:
//   1. offline angelegt → erscheint in der Liste, aber als wartend markiert,
//   2. der Server kennt sie in dem Moment NICHT,
//   3. die Statusleiste nennt die Zahl der wartenden Änderungen,
//   4. zurück online → sie landet unverändert in der DB,
//   5. die Wartemarkierung verschwindet wieder,
//   6. eine offline geänderte Kategorie wird ebenfalls nachgeholt (Reihenfolge!),
//   7. Idempotenz: dieselbe Anfrage ein zweites Mal legt NICHTS doppelt an,
// Die Allowlist selbst (welcher Endpunkt überhaupt eingereiht werden darf)
// prüft `e2e/offline-queueable.ts` ohne Browser.
import { chromium } from "playwright";
import bcrypt from "bcryptjs";
import { testDb } from "./_db.mjs";

const db = testDb();
const BASE = "http://localhost:3000";
const PASS = "Test-1234!";
const stamp = Date.now();

const user = await db.user.create({
  data: {
    email: `offline-${stamp}@example.test`,
    name: "Offline Tester",
    passwordHash: bcrypt.hashSync(PASS, 10),
    role: "USER",
    active: true,
    emailVerified: new Date(),
  },
});

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const results = [];
const ok = (name, cond, extra = "") =>
  results.push(`${cond ? "OK  " : "FEHL"} ${name}${extra ? ` — ${extra}` : ""}`);

const LABEL = `Ramen offline ${stamp}`;

try {
  const context = await browser.newContext();
  const page = await context.newPage();

  // ── Anmelden ──────────────────────────────────────────────────────────
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', PASS);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 }),
    page.click('button[type="submit"]'),
  ]);

  await page.goto(`${BASE}/geld?tab=ausgaben`, { waitUntil: "domcontentloaded" });
  // ⚠️ Auf Hydration warten, nicht auf das Element: der Kurs-Text wechselt erst,
  // wenn der Client-Effekt gelaufen ist — vorher verpufft jeder Klick (CLAUDE.md,
  // Dev-Server-Falle 4).
  await page.waitForFunction(
    () => !document.body.innerText.includes("Wechselkurs wird geladen"),
    null,
    { timeout: 30000 },
  );

  const tripId = (await db.tripMember.findUnique({ where: { userId: user.id } }))?.tripId;
  ok("Reise existiert", Boolean(tripId), String(tripId));

  // ── 1. Offline eine Ausgabe erfassen ──────────────────────────────────
  await context.setOffline(true);

  await page.fill("#ausgabe-betrag", "1200");
  await page.fill("#ausgabe-bezeichnung", LABEL);
  await page.click('form button[type="submit"]');

  const row = page.locator("li", { hasText: LABEL }).first();
  await row.waitFor({ state: "visible", timeout: 15000 });
  ok("Ausgabe erscheint trotz Offline in der Liste", true);

  const rowText = await row.innerText();
  ok("Zeile ist als wartend markiert", rowText.includes("⏳"), JSON.stringify(rowText.slice(0, 60)));

  // ── 2. Der Server weiß davon (noch) nichts ────────────────────────────
  const beforeSync = await db.expense.count({ where: { tripId, label: LABEL } });
  ok("Server kennt die Ausgabe noch nicht", beforeSync === 0, `count=${beforeSync}`);

  // ── 3. Statusleiste nennt die Wartenden ───────────────────────────────
  const banner = page.locator('[data-testid="offline-banner"]');
  await banner.waitFor({ state: "visible", timeout: 10000 });
  const pending = await banner.getAttribute("data-pending");
  ok("Statusleiste zählt 1 wartende Änderung", pending === "1", `data-pending=${pending}`);
  ok(
    "Statusleiste nennt den Offline-Zustand",
    (await banner.innerText()).toLowerCase().includes("offline"),
    await banner.innerText(),
  );

  // ── 4. Offline zusätzlich die Kategorie ändern (zweiter Eintrag) ──────
  await row.locator("select").selectOption("FIGUREN");
  await page.waitForFunction(
    () => document.querySelector('[data-testid="offline-banner"]')?.dataset.pending === "2",
    null,
    { timeout: 10000 },
  );
  ok("Zweite Änderung wird ebenfalls eingereiht", true);

  // ── 5. Zurück online → Warteschlange läuft leer ───────────────────────
  await context.setOffline(false);
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="offline-banner"]'),
    null,
    { timeout: 30000 },
  );
  ok("Statusleiste verschwindet nach dem Nachholen", true);

  // ── 6. Die Ausgabe liegt jetzt vollständig in der DB ──────────────────
  const saved = await db.expense.findFirst({ where: { tripId, label: LABEL } });
  ok("Ausgabe ist in der DB angekommen", Boolean(saved), saved ? saved.id : "fehlt");
  ok("Betrag unverändert", saved?.yen === 1200, `yen=${saved?.yen}`);
  ok(
    "Die offline geänderte Kategorie wurde nachgeholt",
    saved?.category === "FIGUREN",
    `category=${saved?.category}`,
  );
  ok(
    "Die Id stammt vom Client (offline vergeben)",
    typeof saved?.id === "string" && saved.id.length >= 8,
    saved?.id,
  );

  // ── 7. Wartemarkierung ist wieder weg ─────────────────────────────────
  await page.waitForFunction(
    (label) => {
      const li = [...document.querySelectorAll("li")].find((n) => n.innerText.includes(label));
      return li && !li.innerText.includes("⏳");
    },
    LABEL,
    { timeout: 20000 },
  );
  ok("Wartemarkierung verschwindet nach dem Nachholen", true);

  // ── 8. Idempotenz: dieselbe Anfrage erneut legt nichts doppelt an ─────
  // Genau das passiert, wenn die Antwort auf dem Rückweg verloren geht und die
  // Warteschlange es erneut versucht.
  const replay = await page.evaluate(
    ([id, label]) =>
      fetch("/api/v1/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, category: "ESSEN", label, yen: 1200 }),
      }).then((r) => r.status),
    [saved.id, LABEL],
  );
  ok("Wiederholte Anfrage wird abgewiesen", replay === 409, `status=${replay}`);
  const afterReplay = await db.expense.count({ where: { tripId, label: LABEL } });
  ok("Keine doppelte Ausgabe", afterReplay === 1, `count=${afterReplay}`);

  // ── 9. Eine unbekannte Id wird weiterhin normal angenommen ────────────
  // ⚠️ Id je Lauf verschieden — eine feste Id kollidierte beim zweiten Lauf mit
  // dem eigenen Altbestand und meldete fälschlich einen Fehler.
  const fresh = await page.evaluate(
    (id) =>
      fetch("/api/v1/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, category: "ESSEN", label: "Client-Id", yen: 5 }),
      }).then((r) => r.status),
    `neu-${stamp}-abcdefgh`,
  );
  ok("Neue Client-Id wird angenommen", fresh === 200 || fresh === 201, `status=${fresh}`);

  // ── 10. Ungültige Id wird abgelehnt ───────────────────────────────────
  const bad = await page.evaluate(() =>
    fetch("/api/v1/expenses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "kurz", category: "ESSEN", label: "x", yen: 5 }),
    }).then((r) => r.status),
  );
  ok("Ungültige Client-Id wird abgelehnt", bad === 400, `status=${bad}`);

  // ── 12. Netz da, aber der Schreibweg blockiert ────────────────────────
  // Der Fall „WLAN verbunden, kommt aber nichts durch" (Hotel-Anmeldeseite,
  // Funkzelle am Rand). `navigator.onLine` bleibt dabei true, es gibt also KEIN
  // online-Ereignis — nachgeholt wird dann über den Takt in der Statusleiste.
  // Zugleich der einzige Weg, die Einblendung wartender Anlagen zu prüfen: der
  // GET muss gelingen, während der POST scheitert.
  const LABEL2 = `Gunpla offline ${stamp}`;
  await page.route("**/api/v1/expenses", (route) =>
    route.request().method() === "POST" ? route.abort("failed") : route.continue(),
  );

  await page.fill("#ausgabe-betrag", "3500");
  await page.fill("#ausgabe-bezeichnung", LABEL2);
  await page.click('form button[type="submit"]');

  await page.waitForFunction(
    () => document.querySelector('[data-testid="offline-banner"]')?.dataset.pending === "1",
    null,
    { timeout: 15000 },
  );
  ok("Trotz bestehender Verbindung eingereiht", true);

  // Liste frisch laden (der GET geht durch) — der wartende Eintrag muss dabei
  // erhalten bleiben, sonst tippt man ihn ein zweites Mal ein.
  await page.evaluate(() => window.dispatchEvent(new Event("clover:synced")));
  await page.waitForTimeout(1500);
  const stillVisible = await page.locator("li", { hasText: LABEL2 }).count();
  ok("Wartender Eintrag überlebt das Neuladen der Liste", stillVisible === 1, `count=${stillVisible}`);

  // Blockade aufheben → der Takt der Statusleiste holt es nach (ohne online-Event).
  await page.unroute("**/api/v1/expenses");
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="offline-banner"]'),
    null,
    { timeout: 60000 },
  );
  const saved2 = await db.expense.findFirst({ where: { tripId, label: LABEL2 } });
  ok("Nachgeholt ohne online-Ereignis", Boolean(saved2), saved2 ? `yen=${saved2.yen}` : "fehlt");

} finally {
  console.log(results.join("\n"));
  const failed = results.filter((r) => r.startsWith("FEHL")).length;
  console.log(`\n${results.length - failed}/${results.length} OK`);
  await browser.close();
  // ⚠️ `Trip` hängt NICHT per Cascade am User (Trip.ownerId ist kein harter FK) —
  // ohne diese Zeile bliebe nach jedem Lauf eine Reise samt Ausgaben zurück.
  const member = await db.tripMember.findUnique({ where: { userId: user.id } }).catch(() => null);
  await db.user.delete({ where: { id: user.id } }).catch(() => {});
  if (member) await db.trip.delete({ where: { id: member.tripId } }).catch(() => {});
  await db.$disconnect();
  process.exit(failed ? 1 : 0);
}
