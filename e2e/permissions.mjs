// Rollen (USER/ADMIN) und die zwei Beleg-Rechte.
//
// Deckt ab:
//  1. ohne `canAiScan` antwortet /expenses/scan mit 403 — und zwar **vor** dem
//     Body und vor dem Rate-Limit, damit ein abgewiesener Aufruf kein Budget frisst,
//  2. `canReceiptPhoto` steuert das Anhängen, aber NICHT den Kategorie-Wechsel,
//  3. die Oberfläche blendet beide Knöpfe passend aus (Bequemlichkeit),
//  4. nur ADMIN darf Rechte vergeben,
//  5. `MANAGER`/`EMPLOYEE` gibt es nicht mehr,
//  6. ein Admin darf seine eigenen Rechte ändern, sich aber nicht deaktivieren.
import { chromium } from "playwright";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const BASE = "http://localhost:3000";
const PASS = "Test-1234!";
const stamp = Date.now();

const mk = (tag, extra = {}) =>
  db.user.create({
    data: {
      email: `perm-${tag}-${stamp}@example.test`,
      name: `Perm ${tag}`,
      passwordHash: bcrypt.hashSync(PASS, 10),
      role: "USER",
      active: true,
      emailVerified: new Date(),
      ...extra,
    },
  });

const admin = await mk("admin", { role: "ADMIN", canAiScan: true });
const plain = await mk("plain"); // Vorgaben: kein Scan, aber Foto

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

const call = (page, url, method, body) =>
  page.evaluate(
    ([u, m, b]) =>
      fetch(u, {
        method: m,
        headers: { "content-type": "application/json" },
        body: b === null ? undefined : JSON.stringify(b),
      }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })),
    [url, method, body ?? null],
  );

// Ein winziges, gültiges PNG — reicht als Rumpf, ohne echten Beleg.
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

try {
  const pagePlain = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await login(pagePlain, plain.email);

  // ── 1. Scan ohne Recht ──────────────────────────────────────────────────
  // Leerer Rumpf: die Rechteprüfung läuft VOR der Zod-Prüfung. 403 = gesperrt,
  // 400 = durchgelassen. So ist der Test aussagekräftig, ohne ein Bild an die
  // Vision-API zu schicken (das kostet Kontingent).
  let r = await call(pagePlain, "/api/v1/expenses/scan", "POST", {});
  ok("ohne canAiScan → 403", r.status === 403, `status=${r.status}`);
  ok(
    "Meldung nennt den Ausweg",
    /von Hand/i.test(r.body?.error?.message ?? ""),
    r.body?.error?.message,
  );

  // ── 2. Foto-Recht: an by default ───────────────────────────────────────
  const created = await call(pagePlain, "/api/v1/expenses", "POST", {
    category: "ESSEN",
    label: "Testbeleg",
    yen: 500,
    shared: false,
  });
  const expenseId = created.body?.id;
  ok("Ausgabe angelegt", created.status === 201 && !!expenseId, `status=${created.status}`);

  r = await call(pagePlain, `/api/v1/expenses/${expenseId}`, "PATCH", { receipt: PNG });
  ok("mit canReceiptPhoto → Beleg wird angehängt", r.status === 200, `status=${r.status}`);

  // ── 3. Oberfläche ohne Scan-Recht ──────────────────────────────────────
  await pagePlain.goto(`${BASE}/geld?tab=ausgaben`, { waitUntil: "domcontentloaded" });
  await pagePlain.waitForResponse((x) => x.url().includes("/api/v1/fx/rate"), { timeout: 60000 });
  const scanVisible = await pagePlain.getByText("Beleg scannen").count();
  ok("Scan-Knopf ist ausgeblendet", scanVisible === 0, `gefunden=${scanVisible}`);

  // ── 4. Admin entzieht das Foto-Recht ───────────────────────────────────
  const pageAdmin = await browser.newPage();
  await login(pageAdmin, admin.email);
  r = await call(pageAdmin, `/api/v1/users/${plain.id}`, "PATCH", { canReceiptPhoto: false });
  ok("Admin darf Rechte setzen", r.status === 200, `status=${r.status}`);
  ok("Antwort trägt den neuen Stand", r.body?.canReceiptPhoto === false, JSON.stringify(r.body));
  const afterDb = await db.user.findUnique({
    where: { id: plain.id },
    select: { canReceiptPhoto: true, canAiScan: true, active: true },
  });
  ok("in der DB angekommen", afterDb.canReceiptPhoto === false);
  ok("andere Felder unberührt", afterDb.canAiScan === false && afterDb.active === true);

  const second = await call(pagePlain, "/api/v1/expenses", "POST", {
    category: "ESSEN",
    label: "Zweiter",
    yen: 600,
    shared: false,
  });
  r = await call(pagePlain, `/api/v1/expenses/${second.body.id}`, "PATCH", { receipt: PNG });
  ok("ohne canReceiptPhoto → 403", r.status === 403, `status=${r.status}`);

  // Der Kategorie-Wechsel darf davon NICHT betroffen sein.
  r = await call(pagePlain, `/api/v1/expenses/${second.body.id}`, "PATCH", {
    category: "KOSMETIK",
  });
  ok("Kategorie-Wechsel bleibt erlaubt", r.status === 200, `status=${r.status}`);

  await pagePlain.goto(`${BASE}/geld?tab=ausgaben`, { waitUntil: "domcontentloaded" });
  await pagePlain.waitForResponse((x) => x.url().includes("/api/v1/fx/rate"), { timeout: 60000 });
  await pagePlain.waitForFunction(() => document.querySelectorAll("ul li").length >= 2, null, {
    timeout: 20000,
  });
  const camera = await pagePlain.locator('li label[title="Beleg anhängen"]').count();
  ok("📷 in der Liste ist weg", camera === 0, `gefunden=${camera}`);

  // ── 5. Scan-Recht vergeben → Sperre fällt ──────────────────────────────
  r = await call(pageAdmin, `/api/v1/users/${plain.id}`, "PATCH", { canAiScan: true });
  ok("Scan-Recht vergeben", r.status === 200 && r.body?.canAiScan === true, `status=${r.status}`);
  r = await call(pagePlain, "/api/v1/expenses/scan", "POST", {});
  ok(
    "mit canAiScan → kein 403 mehr (400 vom leeren Rumpf)",
    r.status === 400,
    `status=${r.status}`,
  );

  await pagePlain.goto(`${BASE}/geld?tab=ausgaben`, { waitUntil: "domcontentloaded" });
  await pagePlain.waitForResponse((x) => x.url().includes("/api/v1/fx/rate"), { timeout: 60000 });
  ok(
    "Scan-Knopf erscheint",
    (await pagePlain.getByText("Beleg scannen").count()) === 1,
  );

  // ── 6. Nur ADMIN darf Rechte vergeben ──────────────────────────────────
  r = await call(pagePlain, `/api/v1/users/${admin.id}`, "PATCH", { canAiScan: false });
  ok("Nicht-Admin darf keine Rechte setzen → 403", r.status === 403, `status=${r.status}`);

  // ── 7. Alte Rollen sind weg ────────────────────────────────────────────
  r = await call(pageAdmin, "/api/v1/users", "POST", {
    name: "Alt Rolle",
    email: `old-role-${stamp}@example.test`,
    password: "Test-1234!",
    role: "MANAGER",
  });
  ok("Rolle MANAGER wird abgewiesen → 400", r.status === 400, `status=${r.status}`);

  // ── 8. Admin und das eigene Konto ──────────────────────────────────────
  r = await call(pageAdmin, `/api/v1/users/${admin.id}`, "PATCH", { active: false });
  ok("Admin kann sich nicht selbst deaktivieren → 403", r.status === 403, `status=${r.status}`);
  r = await call(pageAdmin, `/api/v1/users/${admin.id}`, "PATCH", { canAiScan: false });
  ok("eigene Rechte darf er ändern", r.status === 200, `status=${r.status}`);
  r = await call(pageAdmin, `/api/v1/users/${admin.id}`, "PATCH", {});
  ok("leerer Rumpf → 400", r.status === 400, `status=${r.status}`);
} finally {
  await browser.close();
  for (const u of [admin, plain]) {
    await db.expense.deleteMany({ where: { trip: { members: { some: { userId: u.id } } } } });
  }
  await db.user.deleteMany({ where: { email: { contains: `-${stamp}@example.test` } } });
  await db.user.deleteMany({ where: { email: `old-role-${stamp}@example.test` } });
  await db.$disconnect();
}

console.log(results.join("\n"));
const bad = results.filter((x) => x.startsWith("FEHL"));
console.log(bad.length ? `\n${bad.length} FEHLER` : "\nALLES OK");
process.exit(bad.length ? 1 : 0);
