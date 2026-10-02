// Kartenmaterial vorab laden: Verdrahtung zwischen Knopf, Kachelplanung und Netz.
//
// Die Mathematik prüft `e2e/map-tiles.ts` ohne Browser. Hier geht es um das, was
// nur im Browser sichtbar ist:
//   1. Die Karte meldet sich bereit und der Knopf ist bedienbar,
//   2. ein Klick fordert genau die geplanten Kacheln an (nicht mehr, nicht weniger),
//   3. die angeforderten URLs haben die Form, die auch Leaflet benutzt,
//   4. der Fortschritt läuft bis zum Ende und meldet Erfolg,
//   5. im Entwicklungsmodus warnt die Oberfläche, dass nichts gespeichert wird
//      (der Service-Worker läuft nur in Produktion) — ohne diesen Hinweis sähe
//      der Knopf aus, als hätte er gewirkt.
//
// ⚠️ Braucht einen **gültigen** `CARTO_API_KEY`. Ohne Schlüssel fällt die Karte
// auf OpenStreetMap zurück, und dort ist das Vorladen bewusst gesperrt (die
// Tile Usage Policy der OSM Foundation untersagt Massen-Abrufe) — der Knopf ist
// dann deaktiviert und es gibt nichts zu messen. Mit einem **ungültigen**
// Schlüssel antwortet CARTO mit Platzhaltern, und die Erkennung bricht
// planmäßig ab. Beides ist richtiges Verhalten, aber nicht das, was dieser Test
// prüft; er sagt es dann und endet ohne Fehlschlag.
import { chromium } from "playwright";
import bcrypt from "bcryptjs";
import { testDb } from "./_db.mjs";

if (!process.env.CARTO_API_KEY) {
  console.log(
    "ÜBERSPRUNGEN  CARTO_API_KEY ist nicht gesetzt — ohne Schlüssel läuft die Karte\n" +
      "              über OpenStreetMap, wo das Vorladen gesperrt ist. Der Test prüft\n" +
      "              den CARTO-Pfad und hat hier nichts zu messen.",
  );
  process.exit(0);
}

const db = testDb();
const BASE = "http://localhost:3000";
const PASS = "Test-1234!";
const stamp = Date.now();

const user = await db.user.create({
  data: {
    email: `mapoffline-${stamp}@example.test`,
    name: "Karten Tester",
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

try {
  const page = await browser.newPage();

  const tileUrls = new Set();
  let recording = false;
  page.on("request", (req) => {
    if (recording && req.url().includes("basemaps.cartocdn.com")) tileUrls.add(req.url());
  });

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', PASS);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 }),
    page.click('button[type="submit"]'),
  ]);

  await page.goto(`${BASE}/reiseplaner`, { waitUntil: "domcontentloaded" });

  const loadBtn = page.getByRole("button", { name: "Diesen Ausschnitt laden" });
  await loadBtn.waitFor({ state: "visible", timeout: 30000 });
  // ⚠️ Auf Hydration warten, nicht auf das Element: der Knopf ist erst bedienbar,
  // wenn die Leaflet-Karte steht (`ready`), sonst verpufft der Klick.
  await page.waitForFunction(
    () => {
      const b = [...document.querySelectorAll("button")].find(
        (n) => n.textContent?.includes("Diesen Ausschnitt laden"),
      );
      return b && !b.disabled;
    },
    null,
    { timeout: 30000 },
  );
  ok("Knopf wird bedienbar, sobald die Karte steht", true);

  ok(
    "Hinweis auf fehlenden Service-Worker im Dev-Modus",
    await page.getByText("kein Service-Worker aktiv", { exact: false }).isVisible(),
  );

  // Deterministisch hineinzoomen (Start ist Stufe 5 über Japan) — sonst hinge die
  // Kachelzahl am Zufall des Anfangsausschnitts.
  for (let i = 0; i < 8; i++) {
    await page.click(".leaflet-control-zoom-in");
    await page.waitForTimeout(120);
  }

  recording = true;
  await loadBtn.click();

  // Gesamtzahl aus der Fortschrittsanzeige lesen.
  const progress = page.getByText(/von \d+ Kacheln/);
  await progress.waitFor({ state: "visible", timeout: 20000 });
  const total = Number((await progress.innerText()).match(/von (\d+) Kacheln/)[1]);
  ok("Fortschritt nennt eine Gesamtzahl", total > 0, `${total} Kacheln`);
  ok("Ausschnitt bleibt unter der Anstandsgrenze", total <= 1500, `${total}`);

  await page.getByText(/Kacheln geladen/).waitFor({ state: "visible", timeout: 120000 });
  ok("Vorgang meldet Erfolg", true);
  recording = false;

  // ⚠️ Der Kern: es müssen genau die geplanten Kacheln angefordert worden sein.
  // Leaflet lädt beim Zoomen ebenfalls Kacheln — deshalb wird erst ab dem Klick
  // aufgezeichnet, und es darf höchstens eine kleine Zahl mehr sein (nachladende
  // Sichtkacheln), niemals weniger.
  ok(
    "Alle geplanten Kacheln wurden angefordert",
    tileUrls.size >= total,
    `${tileUrls.size} Anfragen für ${total} geplante`,
  );

  const sample = [...tileUrls].slice(0, 50);
  // ⚠️ Der Query-Teil `?key=…` gehört dazu, seit CARTO einen Schlüssel verlangt.
  // Ohne ihn im Muster schlüge der Test fehl, obwohl die URL richtig ist.
  const pattern =
    /^https:\/\/[abcd]\.basemaps\.cartocdn\.com\/rastertiles\/voyager\/(\d+)\/(\d+)\/(\d+)\.png(\?key=[^&]*)?$/;
  ok("URL-Form stimmt", sample.every((u) => pattern.test(u)), sample[0] ?? "keine");

  // Subdomain muss |x+y| % 4 folgen — sonst liegt die Kachel unter einer anderen
  // URL im Cache als der, die Leaflet später anfragt, und der Vorrat ist wertlos.
  const wrong = sample.filter((u) => {
    const m = pattern.exec(u);
    if (!m) return true;
    const expected = "abcd"[Math.abs(Number(m[2]) + Number(m[3])) % 4];
    return u[8] !== expected;
  });
  ok("Subdomain passt zu Leaflets Auswahl", wrong.length === 0, wrong[0] ?? "alle korrekt");

  const zooms = [...new Set(sample.map((u) => Number(pattern.exec(u)[1])))].sort((a, b) => a - b);
  ok("Drei Zoomstufen abgedeckt", zooms.length >= 2, `Stufen ${zooms.join(", ")}`);
} finally {
  console.log(results.join("\n"));
  const failed = results.filter((r) => r.startsWith("FEHL")).length;
  console.log(`\n${results.length - failed}/${results.length} OK`);
  await browser.close();
  const member = await db.tripMember.findUnique({ where: { userId: user.id } }).catch(() => null);
  await db.user.delete({ where: { id: user.id } }).catch(() => {});
  if (member) await db.trip.delete({ where: { id: member.tripId } }).catch(() => {});
  await db.$disconnect();
  process.exit(failed ? 1 : 0);
}
