// Prüft die eigenen Bereichs-Symbole von Ende zu Ende:
//  1. Standard = Emoji (kein <img> in den Kacheln),
//  2. Upload eines TRANSPARENTEN PNG → erscheint in Start-Kachel, Tab-Leiste, Nav,
//  3. Transparenz überlebt die Verkleinerung (Alphakanal noch da),
//  4. Zurücksetzen → wieder Emoji,
//  5. fremder Nutzer sieht seine eigenen Symbole (nicht die des anderen),
//  6. ungültige Eingaben (SVG, unbekannter Bereich) werden abgewiesen.
import { chromium } from "playwright";
import bcrypt from "bcryptjs";
import { testDb } from "./_db.mjs";

const db = testDb();
const BASE = "http://localhost:3000";
const PASS = "Test-1234!";
const stamp = Date.now();

async function mkUser(tag) {
  return db.user.create({
    data: {
      email: `icons-${tag}-${stamp}@example.test`,
      name: `Icon ${tag}`,
      passwordHash: await bcrypt.hash(PASS, 10),
      role: "USER",
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
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
}

try {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
  const page = await ctx.newPage();
  await login(page, a.email);

  // --- 1. Standard: Emoji, kein Bild ---
  await page.goto(`${BASE}/start`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  const tileImgs = await page.locator('a[href="/geld"] img').count();
  ok("Standard ohne eigenes Bild = Emoji", tileImgs === 0, `imgs=${tileImgs}`);

  // --- 2. Transparentes PNG hochladen (rotes Quadrat auf transparentem Grund) ---
  const uploaded = await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = c.height = 100;
    const g = c.getContext("2d");
    g.fillStyle = "rgba(255,0,0,1)";
    // **Kreis**, nicht Rechteck: der leere Rand wird beim Aufbereiten jetzt
    // weggeschnitten (das war ja der Fix). Transparenz lässt sich deshalb nur
    // noch INNERHALB der Motivgrenzen prüfen — bei einem Kreis sind das die
    // Ecken seiner Bounding-Box.
    g.beginPath();
    g.arc(50, 50, 40, 0, Math.PI * 2);
    g.fill();
    const src = c.toDataURL("image/png");
    // Denselben Weg wie die UI gehen: verkleinern + PUT.
    const img = new Image();
    await new Promise((r) => {
      img.onload = r;
      img.src = src;
    });
    const c2 = document.createElement("canvas");
    c2.width = c2.height = 96;
    c2.getContext("2d").drawImage(img, 0, 0, 96, 96);
    const data = c2.toDataURL("image/png");
    const res = await fetch("/api/v1/me/icons/geld", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data }),
    });
    return { status: res.status, bytes: data.length, isPng: data.startsWith("data:image/png") };
  });
  ok("PUT /me/icons/geld", uploaded.status === 200, `status=${uploaded.status}`);
  ok("als PNG gespeichert", uploaded.isPng, `${uploaded.bytes} Bytes`);

  // --- 3. Transparenz geprüft: Ecke muss alpha=0 haben ---
  const row = await db.userSectionIcon.findUnique({
    where: { userId_section: { userId: a.id, section: "geld" } },
  });
  const alpha = await page.evaluate(async (dataUrl) => {
    const img = new Image();
    await new Promise((r) => {
      img.onload = r;
      img.src = dataUrl;
    });
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    return { corner: g.getImageData(1, 1, 1, 1).data[3], middle: g.getImageData(48, 48, 1, 1).data[3] };
  }, row.data);
  ok("Transparenz erhalten (Ecke alpha=0)", alpha.corner === 0, `Ecke=${alpha.corner}`);
  ok("Motiv sichtbar (Mitte alpha>0)", alpha.middle > 0, `Mitte=${alpha.middle}`);

  // --- Flag gesetzt? ---
  const flagged = await db.user.findUnique({ where: { id: a.id }, select: { customIcons: true } });
  ok("Spiegel-Flag customIcons=true", flagged.customIcons === true);

  // --- 4. Anzeige in Kachel und Tab-Leiste ---
  await page.goto(`${BASE}/start`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);
  ok("Start-Kachel zeigt eigenes Bild", (await page.locator('a[href="/geld"] img').count()) === 1);

  await page.goto(`${BASE}/geld`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  const tabImg = await page.locator('[role="tab"]:has-text("Ausgaben") img').count();
  ok("Tab Ausgaben hat noch Emoji (nicht ueberschrieben)", tabImg === 0, `imgs=${tabImg}`);

  // --- 5. Anderer Nutzer sieht seine eigenen (= Standard) ---
  const ctxB = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
  const pageB = await ctxB.newPage();
  await login(pageB, b.email);
  await pageB.goto(`${BASE}/start`, { waitUntil: "domcontentloaded" });
  await pageB.waitForTimeout(700);
  ok(
    "anderes Mitglied sieht NICHT das fremde Bild",
    (await pageB.locator('a[href="/geld"] img').count()) === 0,
  );
  await ctxB.close();

  // --- 6. Ungültige Eingaben ---
  const bad = await page.evaluate(async () => {
    const put = (section, data) =>
      fetch(`/api/v1/me/icons/${section}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data }),
      }).then((r) => r.status);
    return {
      svg: await put("geld", "data:image/svg+xml,<svg onload='alert(1)'/>"),
      unknown: await put("gibtsnicht", "data:image/png;base64,AAA"),
      notImage: await put("geld", "javascript:alert(1)"),
      tooBig: await put("geld", "data:image/png;base64," + "A".repeat(30000)),
    };
  });
  ok("SVG abgewiesen", bad.svg === 400, `status=${bad.svg}`);
  ok("unbekannter Bereich abgewiesen", bad.unknown === 400, `status=${bad.unknown}`);
  ok("Nicht-Bild abgewiesen", bad.notImage === 400, `status=${bad.notImage}`);
  ok("zu großes Bild abgewiesen", bad.tooBig === 400, `status=${bad.tooBig}`);

  // --- 7. Zurücksetzen ---
  const del = await page.evaluate(() =>
    fetch("/api/v1/me/icons/geld", { method: "DELETE" }).then((r) => r.status),
  );
  ok("DELETE /me/icons/geld", del === 200, `status=${del}`);
  const after = await db.user.findUnique({ where: { id: a.id }, select: { customIcons: true } });
  ok("Flag fällt zurück auf false", after.customIcons === false);
  await page.goto(`${BASE}/start`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);
  ok("Kachel zeigt wieder Emoji", (await page.locator('a[href="/geld"] img').count()) === 0);
} finally {
  await browser.close();
  await db.user.deleteMany({ where: { id: { in: [a.id, b.id] } } }).catch(() => {});
  await db.$disconnect();
}

console.log(results.join("\n"));
console.log(results.every((r) => r.startsWith("OK")) ? "\nALLES OK" : "\nFEHLER VORHANDEN");
