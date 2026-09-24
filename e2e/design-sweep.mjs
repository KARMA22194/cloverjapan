// Regressionsprüfung: alle Routen einmal öffnen, Konsolenfehler sammeln und von
// den noch nicht umgestellten Bereichen je einen Screenshot ablegen.
import { chromium } from "playwright";
import bcrypt from "bcryptjs";
import { testDb } from "./_db.mjs";

const db = testDb();
const EMAIL = `design-sweep-${Date.now()}@example.test`;
const PASS = "Test-1234!";
const BASE = "http://localhost:3000";
const OUT = "/app/e2e/shots";

const user = await db.user.create({
  data: {
    email: EMAIL,
    name: "Sweep",
    passwordHash: await bcrypt.hash(PASS, 10),
    role: "ADMIN",
    active: true,
    emailVerified: new Date(),
  },
});

const problems = [];
const browser = await chromium.launch({ args: ["--no-sandbox"] });

try {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    const t = m.text();
    // Kartenkacheln scheitern im Container am MITM-Zertifikat des Proxys, und die
    // nonce-Warnung des Theme-Scripts ist ein Dev-Artefakt des Root-Layouts.
    if (m.type() === "error" && !t.includes("ERR_CERT_AUTHORITY_INVALID") && !t.includes("hydrated"))
      problems.push(`console ${page.url()}: ${t.slice(0, 160)}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror ${page.url()}: ${e.message}`));

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/sweep-login.png`, fullPage: true });

  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASS);
  await page.click('button[type="submit"]');
  // Nach dem Login landet man über „/" auf „/start"; auf die Zwischenstation zu
  // warten ist ein Rennen — es genügt, dass die Session steht.
  await page.waitForTimeout(3000);
  await page.goto(`${BASE}/start`, { waitUntil: "domcontentloaded" });
  if (page.url().includes("/login")) throw new Error("Login fehlgeschlagen");

  const routes = [
    "/programm",
    "/info",
    "/fluege",
    "/mitglieder",
    "/profil",
    "/admin",
    "/geld?tab=ausgaben",
    "/geld?tab=abrechnung",
    "/geld?tab=zoll",
    "/programm?tab=buchungen",
    "/programm?tab=checkliste",
    "/info?tab=stempel",
    "/info?tab=koffer",
    "/info?tab=notfall",
  ];

  for (const r of routes) {
    await page.goto(`${BASE}${r}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    const h1 = await page.locator("h1").first().textContent().catch(() => null);
    console.log(`${r} → h1: ${(h1 ?? "—").trim().slice(0, 40)}`);
  }

  for (const [name, url] of [
    ["programm", `${BASE}/programm`],
    ["info", `${BASE}/info`],
    ["mitglieder", `${BASE}/mitglieder`],
  ]) {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${OUT}/sweep-${name}.png`, fullPage: true });
  }
} finally {
  await browser.close();
  await db.user.delete({ where: { id: user.id } }).catch(() => {});
  await db.$disconnect();
}

console.log(problems.length ? `PROBLEME:\n${problems.join("\n")}` : "keine Konsolen-/Seitenfehler");
