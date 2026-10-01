// Flug-Live-Status in der Oberfläche: Vorhersage ≠ gemeldete Verspätung.
//
// ⚠️ AeroDataBox wird **nie** aufgerufen. Die Antwort des Live-Endpunkts wird im
// Browser abgefangen und ersetzt — ein Test, der Monatskontingent eines
// kostenpflichtigen Dienstes verbraucht, um eine Darstellung zu prüfen, wäre
// Unsinn. Geprüft wird genau das, was `e2e/flight-times.ts` ohne Browser nicht
// kann: dass die gerenderte Seite die drei Fälle unterscheidbar zeigt.
//
// Anlass: ein Flug stand auf „Planmäßig" und daneben rot durchgestrichen eine
// Verspätung um sechs Minuten — die niemand gemeldet hatte.
import { chromium } from "playwright";
import bcrypt from "bcryptjs";
import { testDb } from "./_db.mjs";

const db = testDb();
const BASE = "http://localhost:3000";
const PASS = "Test-1234!";
const stamp = Date.now();

const user = await db.user.create({
  data: {
    email: `flightui-${stamp}@example.test`,
    name: "Flug UI",
    passwordHash: await bcrypt.hash(PASS, 10),
    role: "USER",
    active: true,
    emailVerified: new Date(),
  },
});
const trip = await db.trip.create({ data: { name: `Flug-UI ${stamp}`, ownerId: user.id } });
await db.tripMember.create({ data: { tripId: trip.id, userId: user.id } });

// Abflug morgen — der Flugplaner zeigt den Live-Block dann aufklappbar an.
const dep = new Date(Date.now() + 24 * 3600_000);
const date = dep.toISOString().slice(0, 10);
await db.flight.create({
  data: {
    tripId: trip.id,
    flightNumber: "NH204",
    airline: "ANA",
    fromCode: "FRA",
    toCode: "HND",
    departure: new Date(`${date}T14:00:00.000Z`),
    arrival: new Date(`${date}T10:45:00.000Z`),
    createdByName: user.name,
  },
});

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const results = [];
const ok = (name, cond, extra = "") =>
  results.push(`${cond ? "OK  " : "FEHL"} ${name}${extra ? ` — ${extra}` : ""}`);

/** Eine Live-Antwort bauen; `arr` überschreibt die Ankunftszeiten. */
const liveBody = (arr) => ({
  found: true,
  flightNumber: "NH204",
  status: "Expected",
  departure: {
    airportIata: "FRA",
    scheduled: `${date} 14:00:00+02:00`,
    revised: null,
    predicted: null,
    terminal: "1",
    checkInDesk: null,
    gate: null,
  },
  arrival: {
    airportIata: "HND",
    scheduled: `${date} 10:45:00+09:00`,
    revised: null,
    predicted: null,
    terminal: "3",
    gate: null,
    baggageBelt: null,
    ...arr,
  },
  departureUtc: null,
  arrivalUtc: null,
});

try {
  const page = await browser.newPage();

  // Live-Endpunkt abfangen, Inhalt pro Szenario umschalten.
  let scenario = {};
  let hitApi = false;
  await page.route("**/api/v1/flights/live**", async (route) => {
    hitApi = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(liveBody(scenario)),
    });
  });
  // Sicherheitsnetz: AeroDataBox darf aus diesem Test heraus nicht erreichbar sein.
  let calledAerodatabox = false;
  await page.route("**aerodatabox**", async (route) => {
    calledAerodatabox = true;
    await route.abort();
  });

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', PASS);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 }),
    page.click('button[type="submit"]'),
  ]);

  /** Seite neu laden, Live-Block öffnen, Statuszeile als Text zurückgeben. */
  async function statusLine() {
    await page.goto(`${BASE}/fluege`, { waitUntil: "domcontentloaded" });
    const toggle = page.getByText(/Live-Status/i).first();
    await toggle.waitFor({ timeout: 30000 });
    await toggle.click();
    // Auf die geladene Antwort warten, nicht nur aufs Element (Dev-Server-Falle 4).
    await page.getByText("Planmäßig").first().waitFor({ timeout: 30000 });
    const row = page.locator("span", { hasText: "Planmäßig" }).first();
    return (await row.locator("xpath=..").innerText()).replace(/\s+/g, " ").trim();
  }

  /** Wie ist eine Zeit ausgezeichnet? */
  const styles = () =>
    page.evaluate(() =>
      [...document.querySelectorAll("span.tabular-nums span")].map((el) => ({
        text: el.textContent.trim(),
        lineThrough: getComputedStyle(el).textDecorationLine.includes("line-through"),
        color: getComputedStyle(el).color,
      })),
    );

  // ── 1. Nur Flugplan ─────────────────────────────────────────────────────
  scenario = {};
  let line = await statusLine();
  ok("Plan: zeigt 10:45", line.includes("10:45"), line);
  ok("Plan: nichts durchgestrichen", !(await styles()).some((s) => s.lineThrough));

  // ── 2. Der Fall aus dem Screenshot: 6-min-Vorhersage ────────────────────
  scenario = { predicted: `${date} 10:51:00+09:00` };
  line = await statusLine();
  ok("Vorhersage 6 min: 10:51 wird NICHT gezeigt", !line.includes("10:51"), line);
  ok("Vorhersage 6 min: nichts durchgestrichen", !(await styles()).some((s) => s.lineThrough));
  ok(
    "Vorhersage 6 min: kein Erklärtext nötig",
    !(await page.getByText(/Vorhersage des Datendienstes/).count()),
  );

  // ── 3. Vorhersage über der Schwelle ─────────────────────────────────────
  scenario = { predicted: `${date} 11:30:00+09:00` };
  line = await statusLine();
  ok("Vorhersage 45 min: als ca. gekennzeichnet", /ca\.\s*11:30/.test(line), line);
  ok("Vorhersage 45 min: Plan bleibt sichtbar", line.includes("10:45"), line);
  let st = await styles();
  ok("Vorhersage 45 min: nicht durchgestrichen", !st.some((s) => s.lineThrough));
  ok(
    "Vorhersage 45 min: nicht in der Fehlerfarbe",
    !st.some((s) => s.text.includes("11:30") && s.color === "rgb(226, 0, 26)"),
    JSON.stringify(st),
  );
  ok(
    "Vorhersage 45 min: wird erklärt",
    (await page.getByText(/Vorhersage des Datendienstes/).count()) === 1,
  );

  // ── 4. Gemeldete Verspätung ─────────────────────────────────────────────
  scenario = { revised: `${date} 12:30:00+09:00` };
  line = await statusLine();
  ok("Meldung: 12:30 hervorgehoben", line.includes("12:30"), line);
  ok("Meldung: kein „ca.“", !line.includes("ca."), line);
  st = await styles();
  ok(
    "Meldung: Plan durchgestrichen",
    st.some((s) => s.text === "10:45" && s.lineThrough),
    JSON.stringify(st),
  );
  ok(
    "Meldung: neue Zeit in der Fehlerfarbe",
    st.some((s) => s.text === "12:30" && s.color === "rgb(226, 0, 26)"),
    JSON.stringify(st),
  );

  // ── 5. Eine Meldung schlägt die Vorhersage ──────────────────────────────
  scenario = { revised: `${date} 12:30:00+09:00`, predicted: `${date} 11:30:00+09:00` };
  line = await statusLine();
  ok("Meldung schlägt Vorhersage", line.includes("12:30") && !line.includes("11:30"), line);

  ok("Live-Endpunkt wurde wirklich benutzt", hitApi);
  ok("AeroDataBox wurde NICHT aufgerufen", !calledAerodatabox);
} finally {
  await browser.close();
  await db.user.delete({ where: { id: user.id } }).catch(() => {});
  await db.trip.delete({ where: { id: trip.id } }).catch(() => {});
  await db.$disconnect();
}

console.log(results.join("\n"));
const failed = results.filter((r) => r.startsWith("FEHL")).length;
console.log(failed ? `\n${failed} Fehlschlag/Fehlschläge.` : "\nAlles grün.");
process.exit(failed ? 1 : 0);
