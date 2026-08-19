// Kategorie einer bereits erfassten Ausgabe ändern.
//
// Deckt ab:
//  1. Änderung über die Liste (echtes <select> in der Oberfläche) landet in der DB,
//  2. das Beleg-Foto überlebt den Wechsel (receipt: undefined ≠ null),
//  3. fremde Ausgaben sind unerreichbar (404 statt stiller Änderung),
//  4. unbekannte Kategorie wird abgewiesen (400).
import { chromium } from "playwright";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const BASE = "http://localhost:3000";
const PASS = "Test-1234!";
const stamp = Date.now();

async function mkUser(tag) {
  return db.user.create({
    data: {
      email: `cat-${tag}-${stamp}@example.test`,
      name: `Cat ${tag}`,
      passwordHash: await bcrypt.hash(PASS, 10),
      role: "EMPLOYEE",
      active: true,
      emailVerified: new Date(),
    },
  });
}

const a = await mkUser("a");
const b = await mkUser("b");
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
  await page.waitForLoadState("domcontentloaded");
}

const createExpense = (page, body) =>
  page.evaluate(
    (b) =>
      fetch("/api/v1/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(b),
      }).then((r) => r.json()),
    body,
  );

try {
  // ── Vorbereitung: A legt eine Ausgabe mit Beleg an ──────────────────────
  const pageA = await browser.newPage();
  await login(pageA, a.email);
  const mine = await createExpense(pageA, {
    category: "ESSEN",
    label: "Testladen",
    yen: 1000,
    shared: false,
  });
  ok("Ausgabe angelegt", mine?.id && mine.category === "ESSEN", `category=${mine?.category}`);

  // Winziges 1x1-JPEG als Beleg anhängen.
  const tinyJpeg =
    "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwcJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPDIzNP/AABEIAAEAAQMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1trfAwcLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==";
  const attached = await pageA.evaluate(
    ({ id, image }) =>
      fetch(`/api/v1/expenses/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ receipt: image }),
      }).then((r) => r.status),
    { id: mine.id, image: tinyJpeg },
  );
  ok("Beleg angehängt", attached === 200, `status=${attached}`);

  // ── 1. Änderung über die Oberfläche ────────────────────────────────────
  await pageA.goto(`${BASE}/geld?tab=ausgaben`, { waitUntil: "domcontentloaded" });
  // Auf Hydration warten, nicht auf das Element (siehe CLAUDE.md).
  await pageA.waitForFunction(
    () => !document.body.innerText.includes("Wechselkurs wird geladen"),
    null,
    { timeout: 30000 },
  );
  const sel = pageA.locator("ul select").first();
  ok("Auswahl in der Liste vorhanden", (await sel.count()) === 1);
  ok("zeigt aktuelle Kategorie", (await sel.inputValue()) === "ESSEN");
  await sel.selectOption("TRANSPORT");
  await pageA.waitForResponse(
    (r) => r.url().includes(`/api/v1/expenses/${mine.id}`) && r.request().method() === "PATCH",
    { timeout: 15000 },
  );
  await pageA.waitForTimeout(400);

  const after = await db.expense.findUnique({
    where: { id: mine.id },
    select: { category: true, hasReceipt: true },
  });
  ok("Kategorie in der DB geändert", after?.category === "TRANSPORT", `db=${after?.category}`);
  // ── 2. Beleg überlebt den Wechsel ──────────────────────────────────────
  ok("Beleg-Foto unangetastet", after?.hasReceipt === true, `hasReceipt=${after?.hasReceipt}`);
  const blob = await db.expenseReceipt.findUnique({ where: { expenseId: mine.id } });
  ok("Beleg-Blob noch vorhanden", !!blob);

  // ── 2a. Pillenbreite folgt dem GEWÄHLTEN Text, nicht der längsten Option ─
  //     Regression: als sichtbares <select> war jede Pille so breit wie
  //     „Sightseeing" — „Essen" hatte dadurch eine große Leerstelle.
  await createExpense(pageA, { category: "ESSEN", label: "Kurz", yen: 100, shared: false });
  await createExpense(pageA, { category: "SIGHTSEEING", label: "Lang", yen: 100, shared: false });
  await pageA.reload({ waitUntil: "domcontentloaded" });
  await pageA.waitForFunction(
    () => !document.body.innerText.includes("Wechselkurs wird geladen"),
    null,
    { timeout: 30000 },
  );
  // ⚠️ `page.evaluate` wartet NICHT (anders als ein Locator). Das <ul> entsteht
  // erst, wenn die Ausgaben-Abfrage zurück ist — ohne dieses Warten maß der Test
  // eine noch leere Liste und lieferte {}.
  await pageA.waitForFunction(() => document.querySelectorAll("ul li select").length >= 3, null, {
    timeout: 20000,
  });
  const widths = await pageA.evaluate(() => {
    const out = {};
    for (const li of document.querySelectorAll("ul li")) {
      const pill = li.querySelector("span:has(select)") ?? li.querySelector("span");
      const sel = li.querySelector("select");
      if (!pill || !sel) continue;
      out[sel.value] = Math.round(pill.getBoundingClientRect().width);
    }
    return out;
  });
  console.log("Pillenbreiten:", JSON.stringify(widths));
  ok(
    "Essen-Pille ist schmaler als Sightseeing-Pille",
    widths.ESSEN > 0 && widths.SIGHTSEEING > 0 && widths.ESSEN < widths.SIGHTSEEING,
    `Essen=${widths.ESSEN} px, Sightseeing=${widths.SIGHTSEEING} px`,
  );
  await pageA.screenshot({ path: "e2e/shots/kategorie-pillen.png", clip: { x: 0, y: 0, width: 900, height: 600 } });

  // ── 2b. Handy-Breite: die Auswahl ist breiter als die alte Pille ────────
  //     `mobile-check.mjs` sieht die Zeile nicht, weil es ohne Daten läuft.
  await pageA.setViewportSize({ width: 390, height: 844 });
  await pageA.waitForTimeout(500);
  const mob = await pageA.evaluate(() => {
    const row = document.querySelector("ul li");
    const sel = row?.querySelector("select");
    return {
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      rowOverflow: row ? row.scrollWidth - row.clientWidth : -1,
      selWidth: sel ? Math.round(sel.getBoundingClientRect().width) : -1,
      labelVisible: (row?.querySelector("p")?.getBoundingClientRect().width ?? 0) > 20,
    };
  });
  ok("390 px: kein Seiten-Überlauf", mob.pageOverflow <= 0, `${mob.pageOverflow} px`);
  ok("390 px: kein Zeilen-Überlauf", mob.rowOverflow <= 0, `${mob.rowOverflow} px`);
  ok("390 px: Bezeichnung nicht zerquetscht", mob.labelVisible, `select=${mob.selWidth} px`);
  await pageA.setViewportSize({ width: 1280, height: 900 });

  // ── 3. Fremde Ausgabe ist unerreichbar ─────────────────────────────────
  const pageB = await browser.newPage();
  await login(pageB, b.email);
  const foreign = await createExpense(pageB, {
    category: "ESSEN",
    label: "Fremd",
    yen: 500,
    shared: false,
  });
  ok("fremde Ausgabe angelegt", !!foreign?.id);

  const cross = await pageA.evaluate(
    (id) =>
      fetch(`/api/v1/expenses/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category: "FIGUREN" }),
      }).then((r) => r.status),
    foreign.id,
  );
  ok("fremde Ausgabe → 404", cross === 404, `status=${cross}`);
  const stillThere = await db.expense.findUnique({
    where: { id: foreign.id },
    select: { category: true },
  });
  ok("fremde Kategorie unverändert", stillThere?.category === "ESSEN", `db=${stillThere?.category}`);

  // ── 4. Ungültige Eingaben ──────────────────────────────────────────────
  const bad = await pageA.evaluate(
    (id) =>
      Promise.all([
        fetch(`/api/v1/expenses/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ category: "GEMUESE" }),
        }).then((r) => r.status),
        fetch(`/api/v1/expenses/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        }).then((r) => r.status),
      ]),
    mine.id,
  );
  ok("unbekannte Kategorie → 400", bad[0] === 400, `status=${bad[0]}`);
  ok("leerer Rumpf → 400", bad[1] === 400, `status=${bad[1]}`);
} finally {
  await browser.close();
  const ms = await db.tripMember.findMany({
    where: { userId: { in: [a.id, b.id] } },
    select: { tripId: true },
  });
  await db.user.deleteMany({ where: { id: { in: [a.id, b.id] } } }).catch(() => {});
  await db.trip.deleteMany({ where: { id: { in: ms.map((m) => m.tripId) } } }).catch(() => {});
  await db.$disconnect();
}

console.log(results.join("\n"));
console.log(results.every((r) => r.startsWith("OK")) ? "\nALLES OK" : "\nFEHLER VORHANDEN");
