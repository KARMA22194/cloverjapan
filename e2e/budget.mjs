// Persönliches Budget: pro Nutzer UND pro Reise, in der DB.
//
// Vorher lag es im localStorage — pro Gerät, und beim Leeren der Browserdaten
// weg. Deckt ab:
//  1. Tippen landet in der DB (gebündelt, nicht pro Tastendruck),
//  2. ein zweiter Browser desselben Nutzers sieht denselben Stand,
//  3. das Budget ist PERSÖNLICH: der Mitreisende sieht es nicht,
//  4. ein im Browser vorhandener Altstand wird einmalig übernommen,
//  5. gelöschte Teilbudgets verschwinden auch in der DB (PUT ersetzt).
import { chromium } from "playwright";
import bcrypt from "bcryptjs";
import { testDb } from "./_db.mjs";

const db = testDb();
const BASE = "http://localhost:3000";
const PASS = "Test-1234!";
const stamp = Date.now();

const mk = (tag) =>
  db.user.create({
    data: {
      email: `budget-${tag}-${stamp}@example.test`,
      name: `Budget ${tag}`,
      passwordHash: bcrypt.hashSync(PASS, 10),
      role: "USER",
      active: true,
      emailVerified: new Date(),
    },
  });

const a = await mk("a");
const b = await mk("b");

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const results = [];
const ok = (name, cond, extra = "") =>
  results.push(`${cond ? "OK  " : "FEHL"} ${name}${extra ? ` — ${extra}` : ""}`);

async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASS);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 }),
    page.click('button[type="submit"]'),
  ]);
}

const budgetOf = (userId) =>
  db.tripMember.findUnique({
    where: { userId },
    select: { budgetYen: true, categoryBudgets: { select: { category: true, yen: true } } },
  });

try {
  // ── 1. Über die API setzen und lesen ───────────────────────────────────
  const pageA = await browser.newPage();
  await login(pageA, a.email);

  let r = await pageA.evaluate(() =>
    fetch("/api/v1/budget", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ totalYen: 200000, categories: { ESSEN: 50000, KOSMETIK: 20000 } }),
    }).then((x) => x.status),
  );
  ok("PUT /budget", r === 200, `status=${r}`);

  let row = await budgetOf(a.id);
  ok("Gesamtbudget in der DB", row.budgetYen === 200000, `${row.budgetYen}`);
  ok(
    "zwei Teilbudgets in der DB",
    row.categoryBudgets.length === 2 &&
      row.categoryBudgets.some((c) => c.category === "KOSMETIK" && c.yen === 20000),
    JSON.stringify(row.categoryBudgets),
  );

  // ── 2. PUT ersetzt, führt nicht zusammen ───────────────────────────────
  await pageA.evaluate(() =>
    fetch("/api/v1/budget", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ totalYen: 180000, categories: { ESSEN: 50000 } }),
    }),
  );
  row = await budgetOf(a.id);
  ok(
    "gelöschtes Teilbudget ist weg",
    row.categoryBudgets.length === 1 && row.categoryBudgets[0].category === "ESSEN",
    JSON.stringify(row.categoryBudgets),
  );

  // ── 3. Persönlich: B sieht nichts von A ────────────────────────────────
  const pageB = await browser.newPage();
  await login(pageB, b.email);
  const seenByB = await pageB.evaluate(() =>
    fetch("/api/v1/budget").then((x) => x.json()),
  );
  ok(
    "Budget ist persönlich",
    seenByB.totalYen === 0 && Object.keys(seenByB.categories).length === 0,
    JSON.stringify(seenByB),
  );

  // ── 4. Oberfläche: Tippen wird gespeichert ─────────────────────────────
  // Die Budget-Karte rendert nur bei `items.length > 0` — ohne Ausgabe gibt es
  // nichts zu budgetieren, und das Feld existiert gar nicht.
  for (const page of [pageA, pageB]) {
    await page.evaluate(() =>
      fetch("/api/v1/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category: "ESSEN", label: "Damit die Karte rendert", yen: 100, shared: false }),
      }),
    );
  }
  await pageA.goto(`${BASE}/geld?tab=ausgaben`, { waitUntil: "domcontentloaded" });
  await pageA.waitForFunction(
    () => !document.body.innerText.includes("Wechselkurs wird geladen"),
    null,
    { timeout: 20000 },
  );
  await pageA.waitForFunction(
    () => document.querySelector("#budget")?.value === "180000",
    null,
    { timeout: 20000 },
  );
  ok("geladener Stand steht im Feld", true);

  await pageA.fill("#budget", "123456");
  // Gebündelt (800 ms) — auf die DB warten statt auf eine feste Pause.
  await pageA.waitForFunction(() => true);
  let saved = false;
  for (let i = 0; i < 40 && !saved; i++) {
    const cur = await budgetOf(a.id);
    saved = cur.budgetYen === 123456;
    if (!saved) await new Promise((res) => setTimeout(res, 250));
  }
  ok("getipptes Budget landet in der DB", saved);

  // ── 5. Zweiter Browser desselben Nutzers ───────────────────────────────
  const pageA2 = await browser.newPage();
  await login(pageA2, a.email);
  await pageA2.goto(`${BASE}/geld?tab=ausgaben`, { waitUntil: "domcontentloaded" });
  await pageA2.waitForFunction(
    () => document.querySelector("#budget")?.value === "123456",
    null,
    { timeout: 25000 },
  );
  ok("zweites Gerät sieht denselben Stand", true);

  // ── 6. Übernahme aus dem localStorage ──────────────────────────────────
  // B hat noch nichts in der DB, aber einen Altstand im Browser.
  await pageB.goto(`${BASE}/geld?tab=ausgaben`, { waitUntil: "domcontentloaded" });
  await pageB.evaluate(() => {
    localStorage.setItem("japan-budget", "99000");
    localStorage.setItem("japan-cat-budgets", JSON.stringify({ FIGUREN: "7000" }));
  });
  await pageB.reload({ waitUntil: "domcontentloaded" });
  let migrated = null;
  for (let i = 0; i < 40 && !migrated; i++) {
    const cur = await budgetOf(b.id);
    if (cur?.budgetYen === 99000) migrated = cur;
    else await new Promise((res) => setTimeout(res, 250));
  }
  ok("Altstand aus dem Browser übernommen", !!migrated, JSON.stringify(migrated));
  ok(
    "auch das Teilbudget",
    migrated?.categoryBudgets?.some((c) => c.category === "FIGUREN" && c.yen === 7000),
    JSON.stringify(migrated?.categoryBudgets),
  );
  const leftover = await pageB.evaluate(() => localStorage.getItem("japan-budget"));
  ok("lokaler Altstand danach gelöscht", leftover === null, `${leftover}`);
} finally {
  await browser.close();
  await db.user.deleteMany({ where: { email: { contains: `-${stamp}@example.test` } } });
  await db.$disconnect();
}

console.log(results.join("\n"));
const bad = results.filter((x) => x.startsWith("FEHL"));
console.log(bad.length ? `\n${bad.length} FEHLER` : "\nALLES OK");
process.exit(bad.length ? 1 : 0);
