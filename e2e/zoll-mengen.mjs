// Mengen-Freimengen für Alkohol und Tabak im Zollrechner.
//
// Vorher meldete der Rechner "voraussichtlich keine Abgaben", solange man unter
// 430 € Warenwert blieb — auch bei drei Flaschen japanischem Whisky. Die
// Mengengrenzen sind eigene Freimengen neben der Wertgrenze, und Whisky ist das
// typische Mitbringsel aus Japan.
//
// Deckt ab:
//  1. innerhalb der Menge bleibt die Entwarnung stehen,
//  2. darüber erscheint die Warnung statt der Entwarnung,
//  3. anteilige Kombination: 100 Zigaretten + 25 Zigarren sind noch im Rahmen,
//     101 + 25 nicht mehr,
//  4. zwei Erwachsene dürfen das Doppelte,
//  5. Wein und Bier haben eigene Grenzen, unabhängig von den Spirituosen.
import { chromium } from "playwright";
import bcrypt from "bcryptjs";
import { testDb } from "./_db.mjs";

const db = testDb();
const BASE = "http://localhost:3000";
const PASS = "Test-1234!";
const stamp = Date.now();

const user = await db.user.create({
  data: {
    email: `zoll-m-${stamp}@example.test`,
    name: "Zoll Mengen",
    passwordHash: await bcrypt.hash(PASS, 10),
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
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', PASS);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 }),
    page.click('button[type="submit"]'),
  ]);

  await page.goto(`${BASE}/geld?tab=zoll`, { waitUntil: "domcontentloaded" });
  await page.waitForResponse((r) => r.url().includes("/api/v1/fx/rate"), { timeout: 60000 });
  await page.locator("summary", { hasText: "Alkohol" }).click(); // <details> aufklappen

  const set = async (label, value) => {
    await page.getByLabel(label, { exact: true }).fill(value);
  };
  const warnung = () => page.getByText("Mengen-Freimenge überschritten").count();
  const entwarnung = () => page.getByText("voraussichtlich").count();

  // ── 1. Leer: Entwarnung (kein Warenwert, keine Mengen) ─────────────────
  ok("leer → Entwarnung", (await entwarnung()) === 1 && (await warnung()) === 0);

  // ── 2. Eine Flasche Whisky ist genau die Freimenge ─────────────────────
  await set("Spirituosen über 22 % vol", "1");
  ok("1 l Spirituosen → noch im Rahmen", (await warnung()) === 0);

  // ── 3. Drei Flaschen sind es nicht ─────────────────────────────────────
  await set("Spirituosen über 22 % vol", "2.1");
  ok("2,1 l Spirituosen → Warnung", (await warnung()) === 1);
  ok("Entwarnung verschwindet", (await entwarnung()) === 0);
  ok(
    "Warnung nennt die Gruppe",
    (await page.getByText("Spirituosen/Alkohol").count()) >= 1,
  );

  // ── 4. Zwei Erwachsene dürfen das Doppelte ─────────────────────────────
  // Genau 2 l sind für zwei Erwachsene die Freimenge — 2,1 l bleiben zu viel.
  await page.getByLabel("Reisende ab 17", { exact: true }).fill("2");
  ok("zwei Erwachsene: 2,1 l bleiben zu viel", (await warnung()) === 1);
  await set("Spirituosen über 22 % vol", "2");
  ok("zwei Erwachsene: 2 l sind im Rahmen", (await warnung()) === 0);
  await page.getByLabel("Reisende ab 17", { exact: true }).fill("1");
  await set("Spirituosen über 22 % vol", "");

  // ── 5. Anteilige Kombination innerhalb der Tabak-Gruppe ────────────────
  await set("Zigaretten", "100"); // 50 %
  await set("Zigarren", "25"); // + 50 % = genau 100 %
  ok("100 Zigaretten + 25 Zigarren → genau die Freimenge", (await warnung()) === 0);
  await set("Zigaretten", "101");
  ok("eine Zigarette mehr → Warnung", (await warnung()) === 1);
  await set("Zigaretten", "");
  await set("Zigarren", "");

  // ── 6. Wein und Bier zählen getrennt ───────────────────────────────────
  await set("Wein (nicht schäumend)", "4");
  await set("Bier", "16");
  ok("4 l Wein + 16 l Bier → im Rahmen", (await warnung()) === 0);
  await set("Bier", "17");
  ok("17 l Bier → Warnung", (await warnung()) === 1);
  ok(
    "Warnung nennt Bier, nicht den Wein",
    (await page.getByText("Mengen-Freimenge überschritten: Bier").count()) === 1,
  );

  // ── 7. Handy-Layout ────────────────────────────────────────────────────
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  ok("kein Überlauf bei 390 px", overflow <= 0, `${overflow} px`);
} finally {
  await browser.close();
  await db.user.delete({ where: { id: user.id } }).catch(() => {});
  await db.$disconnect();
}

console.log(results.join("\n"));
const bad = results.filter((x) => x.startsWith("FEHL"));
console.log(bad.length ? `\n${bad.length} FEHLER` : "\nALLES OK");
process.exit(bad.length ? 1 : 0);
