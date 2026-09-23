// Neue Ausgaben-Kategorien (Kosmetik, Elektronik, Unterkunft) — Ende zu Ende.
//
// Deckt ab:
//  1. die neuen Enum-Werte kommen durch API und DB,
//  2. die Auswahl im Formular zeigt alle neun Kategorien,
//  3. der Zollrechner übernimmt genau die WAREN — Kosmetik/Elektronik zählen mit,
//     Unterkunft/Essen/Transport bleiben draußen (das war der eigentliche Fehler:
//     eine Hotelrechnung lief vorher als „Sonstiges" zu ≈4 % in die Verzollung),
//  4. Kosmetik und Elektronik werden mit 0 % Zoll angesetzt,
//  5. die breiteren Pillen sprengen das Handy-Layout (390 px) nicht.
import { chromium } from "playwright";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const BASE = "http://localhost:3000";
const PASS = "Test-1234!";
const stamp = Date.now();

const user = await db.user.create({
  data: {
    email: `zoll-${stamp}@example.test`,
    name: "Zoll Test",
    passwordHash: await bcrypt.hash(PASS, 10),
    role: "EMPLOYEE",
    active: true,
    emailVerified: new Date(),
  },
});

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const results = [];
const ok = (name, cond, extra = "") =>
  results.push(`${cond ? "OK  " : "FEHL"} ${name}${extra ? ` — ${extra}` : ""}`);

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', PASS);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 }),
    page.click('button[type="submit"]'),
  ]);

  // ── 1. Die neuen Werte müssen durch Zod (nativeEnum) und Prisma kommen ────
  const posted = [];
  for (const [category, label, yen] of [
    ["ESSEN", "Lawson", 1000],
    ["UNTERKUNFT", "Hotel Sunroute", 28000],
    ["KOSMETIK", "Matsumoto Kiyoshi", 3000],
    ["ELEKTRONIK", "Yodobashi", 5000],
    ["KLEIDUNG", "Uniqlo", 2000],
    ["TRANSPORT", "JR Pass", 39600],
  ]) {
    const r = await page.evaluate(
      (b) =>
        fetch("/api/v1/expenses", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(b),
        }).then(async (res) => ({ status: res.status, body: await res.json() })),
      { category, label, yen, shared: false },
    );
    posted.push([category, r.status]);
  }
  ok(
    "alle sechs Kategorien werden angelegt (201)",
    posted.every(([, s]) => s === 201),
    posted.map(([c, s]) => `${c}:${s}`).join(" "),
  );
  const rows = await db.expense.findMany({
    where: { trip: { members: { some: { userId: user.id } } } },
    select: { category: true },
  });
  const cats = new Set(rows.map((r) => r.category));
  for (const c of ["KOSMETIK", "ELEKTRONIK", "UNTERKUNFT"])
    ok(`${c} steht in der DB`, cats.has(c));

  // ── 2. Auswahl im Ausgaben-Formular ──────────────────────────────────────
  await page.goto(`${BASE}/geld?tab=ausgaben`, { waitUntil: "domcontentloaded" });
  // Auf Hydration warten, nicht auf das Element: der Kurs-Abruf ist ein
  // Client-Effekt und damit der Beleg, dass React übernommen hat.
  await page.waitForResponse((r) => r.url().includes("/api/v1/fx/rate"), { timeout: 60000 });
  const chips = await page
    .locator('button[aria-pressed]')
    .evaluateAll((els) => els.map((e) => e.textContent.trim()));
  const expected = [
    "Essen", "Figuren", "Kleidung", "Kosmetik", "Elektronik",
    "Sightseeing", "Transport", "Unterkunft", "Sonstiges",
  ];
  ok(
    "Formular zeigt alle neun Kategorien in Reihenfolge",
    JSON.stringify(chips) === JSON.stringify(expected),
    chips.join("|"),
  );

  // ── 3./4. Zollrechner: nur Waren, mit den richtigen Sätzen ───────────────
  await page.goto(`${BASE}/geld?tab=zoll`, { waitUntil: "domcontentloaded" });
  await page.waitForResponse((r) => r.url().includes("/api/v1/fx/rate"), { timeout: 60000 });
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/v1/expenses") && r.request().method() === "GET"),
    page.getByRole("button", { name: "Aus Ausgaben übernehmen" }).click(),
  ]);
  // Auf die Warenliste des Zollrechners eingrenzen — „li" allein traf auch die
  // Wetter-Kacheln der Seite und zählte acht statt drei Gruppen.
  const goodsList = page.locator("ul", {
    has: page.locator("li", { hasText: "% Zoll" }),
  });
  await goodsList.locator("li").first().waitFor({ timeout: 20000 });
  const goods = await goodsList
    .locator("li")
    .evaluateAll((els) => els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
  const joined = goods.join(" || ");
  ok("Kosmetik ist zollrelevant", /Kosmetik\/Drogerie ?· 0 % Zoll/.test(joined), joined);
  ok("Elektronik ist zollrelevant", /Elektronik ?· 0 % Zoll/.test(joined));
  ok("Kleidung weiterhin 12 %", /Kleidung\/Textilien ?· 12 % Zoll/.test(joined));
  ok("Unterkunft zählt NICHT als Ware", !/Unterkunft/.test(joined));
  ok("Essen zählt NICHT als Ware", !/Essen/.test(joined));
  ok("Transport zählt NICHT als Ware", !/Transport/.test(joined));
  ok("genau drei Warengruppen übernommen", goods.length === 3, `${goods.length}`);

  // Warenwert = 3.000 + 5.000 + 2.000 = 10.000 ¥ (ohne Hotel/Essen/Transport).
  const warenwert = await page
    .locator("dl div", { hasText: "Warenwert" })
    .first()
    .innerText();
  const eur = Number(warenwert.replace(/[^\d,]/g, "").replace(",", "."));
  const rate = await page.evaluate(() =>
    fetch("/api/v1/fx/rate?from=JPY&to=EUR").then((r) => r.json()).then((r) => r.rate),
  );
  const soll = 10000 * rate;
  ok(
    "Warenwert = nur die Waren (¥10.000)",
    Math.abs(eur - soll) < 0.5,
    `${eur} € vs. erwartet ${soll.toFixed(2)} €`,
  );

  // ── 5. Handy-Layout 390 px ───────────────────────────────────────────────
  await page.goto(`${BASE}/geld?tab=ausgaben`, { waitUntil: "domcontentloaded" });
  await page.waitForResponse((r) => r.url().includes("/api/v1/fx/rate"), { timeout: 60000 });
  await page.waitForFunction(() => document.querySelectorAll("ul li").length >= 6, null, { timeout: 20000 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  ok("kein waagerechter Überlauf bei 390 px", overflow <= 0, `${overflow} px`);
  const pillWidths = await page.evaluate(() => {
    const out = {};
    for (const s of document.querySelectorAll("li select")) {
      const pill = s.parentElement;
      out[pill.textContent.replace(/[▾\s]/g, "")] = Math.round(pill.getBoundingClientRect().width);
    }
    return out;
  });
  ok(
    "Pillen folgen ihrem eigenen Text (nicht der längsten Option)",
    Object.keys(pillWidths).length >= 3 &&
      new Set(Object.values(pillWidths)).size > 1,
    JSON.stringify(pillWidths),
  );
} finally {
  await browser.close();
  await db.expense.deleteMany({ where: { trip: { members: { some: { userId: user.id } } } } });
  await db.user.delete({ where: { id: user.id } }).catch(() => {});
  await db.$disconnect();
}

console.log(results.join("\n"));
const bad = results.filter((r) => r.startsWith("FEHL"));
console.log(bad.length ? `\n${bad.length} FEHLER` : "\nALLES OK");
process.exit(bad.length ? 1 : 0);
