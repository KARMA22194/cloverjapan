// Wechselkurs je Ausgabe einfrieren.
//
// Vorher rechnete die Liste JEDE Ausgabe mit dem heutigen Kurs um: der
// Euro-Betrag einer zwei Wochen alten Rechnung änderte sich täglich, ebenso
// Summen, Kategorie-Anteile und die Verlaufsbalken.
//
// Deckt ab:
//  1. beim Anlegen wird der Kurs mitgeschrieben (API und DB),
//  2. die Liste rechnet mit DIESEM Kurs, nicht mit dem Tageskurs,
//  3. Summen werden in Euro aufaddiert — bei zwei verschiedenen Kursen gibt es
//     keinen einen Kurs mehr, mit dem die Yen-Summe richtig umrechenbar wäre,
//  4. Altbestand ohne Kurs fällt sauber auf den Tageskurs zurück.
import { chromium } from "playwright";
import bcrypt from "bcryptjs";
import { testDb } from "./_db.mjs";

const db = testDb();
const BASE = "http://localhost:3000";
const PASS = "Test-1234!";
const stamp = Date.now();

const user = await db.user.create({
  data: {
    email: `rate-${stamp}@example.test`,
    name: "Rate Test",
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
const eurFmt = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
// ⚠️ Intl setzt ein geschütztes Leerzeichen vor das €-Zeichen. Wer den DOM-Text
// mit /\s+/ normalisiert, macht daraus ein normales — dann vergleicht man zwei
// optisch gleiche Strings, die es nicht sind.
const norm = (x) => (x ?? "").replace(/\s+/g, " ");

try {
  const page = await browser.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', PASS);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 }),
    page.click('button[type="submit"]'),
  ]);

  // ── 1. Anlegen schreibt den Kurs mit ───────────────────────────────────
  const created = await page.evaluate(() =>
    fetch("/api/v1/expenses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category: "ESSEN", label: "Heute", yen: 10000, shared: false }),
    }).then((r) => r.json()),
  );
  ok("Antwort trägt rateEur", typeof created.rateEur === "number", `${created.rateEur}`);
  const row = await db.expense.findUnique({ where: { id: created.id }, select: { rateEur: true } });
  ok("Kurs steht in der DB", typeof row.rateEur === "number", `${row.rateEur}`);

  const live = await page.evaluate(() =>
    fetch("/api/v1/fx/rate?from=JPY&to=EUR").then((r) => r.json()).then((x) => x.rate),
  );
  ok("Kurs entspricht dem Tageskurs", Math.abs(row.rateEur - live) < 1e-9, `${row.rateEur} vs ${live}`);

  // ── 2. Alte Ausgabe mit ABWEICHENDEM Kurs ──────────────────────────────
  // So sieht eine Ausgabe vom Reisebeginn aus, als der Yen anders stand.
  const oldRate = 0.004; // deutlich unter dem heutigen Kurs
  const alt = await page.evaluate(() =>
    fetch("/api/v1/expenses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category: "ESSEN", label: "Damals", yen: 10000, shared: false }),
    }).then((r) => r.json()),
  );
  await db.expense.update({ where: { id: alt.id }, data: { rateEur: oldRate } });

  // Und eine dritte ganz ohne Kurs (Altbestand vor der Migration).
  const legacy = await page.evaluate(() =>
    fetch("/api/v1/expenses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category: "ESSEN", label: "Altbestand", yen: 10000, shared: false }),
    }).then((r) => r.json()),
  );
  await db.expense.update({ where: { id: legacy.id }, data: { rateEur: null } });

  await page.goto(`${BASE}/geld?tab=ausgaben`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => !document.body.innerText.includes("Wechselkurs wird geladen"),
    null,
    { timeout: 20000 },
  );
  // ⚠️ NICHT auf „drei <li>" warten: die Wetter-Kacheln der Seite sind auch <li>
  // und erfüllen die Bedingung, bevor die Ausgabenliste überhaupt geladen ist.
  // Auf den eigenen Text warten.
  await page.waitForFunction(() => document.body.innerText.includes("Altbestand"), null, {
    timeout: 20000,
  });

  const euroOf = (label) =>
    page.evaluate((l) => {
      const li = [...document.querySelectorAll("ul li")].find((e) => e.textContent.includes(l));
      return li ? li.querySelector("span.w-20")?.textContent?.trim() : null;
    }, label);

  ok(
    "alte Ausgabe nutzt ihren eigenen Kurs",
    (await euroOf("Damals")) === eurFmt.format(10000 * oldRate),
    `${await euroOf("Damals")} erwartet ${eurFmt.format(10000 * oldRate)}`,
  );
  ok(
    "neue Ausgabe nutzt den Kurs von heute",
    (await euroOf("Heute")) === eurFmt.format(10000 * live),
    `${await euroOf("Heute")}`,
  );
  ok(
    "Altbestand ohne Kurs fällt auf den Tageskurs zurück",
    (await euroOf("Altbestand")) === eurFmt.format(10000 * live),
    `${await euroOf("Altbestand")}`,
  );

  // ── 3. Die Gesamtsumme addiert Euro, nicht Yen ─────────────────────────
  const soll = 10000 * live + 10000 * oldRate + 10000 * live;
  const gesamt = await page.evaluate(() => {
    // Die Summenzeile: „Gesamt" + „30.000 ¥ · xx,xx €" im selben Kasten.
    const el = [...document.querySelectorAll("div")].find(
      (d) =>
        d.children.length === 2 &&
        d.children[0].textContent.trim() === "Gesamt" &&
        d.children[1].textContent.includes("·"),
    );
    return el ? el.textContent.replace(/\s+/g, " ").trim() : null;
  });
  ok(
    "Summe ist die Summe der Einzelbeträge",
    norm(gesamt).includes(norm(eurFmt.format(soll))),
    `${gesamt} · erwartet ${eurFmt.format(soll)}`,
  );
  ok(
    "Summe ist NICHT Yen-Summe × Tageskurs",
    !norm(gesamt).includes(norm(eurFmt.format(30000 * live))),
    `falsch wäre ${eurFmt.format(30000 * live)}`,
  );
} finally {
  await browser.close();
  await db.expense.deleteMany({ where: { trip: { members: { some: { userId: user.id } } } } });
  await db.user.delete({ where: { id: user.id } }).catch(() => {});
  await db.$disconnect();
}

console.log(results.join("\n"));
const bad = results.filter((x) => x.startsWith("FEHL"));
console.log(bad.length ? `\n${bad.length} FEHLER` : "\nALLES OK");
process.exit(bad.length ? 1 : 0);
