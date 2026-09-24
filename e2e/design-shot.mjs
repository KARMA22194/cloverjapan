// Optische Abnahme der Design-Auffrischung: legt einen temporären, bestätigten
// Nutzer an, loggt ein, schießt Screenshots (hell + dunkel) und räumt auf.
// Nebenbei werden Konsolen- und CSP-Fehler mitgeschrieben.
import { chromium } from "playwright";
import bcrypt from "bcryptjs";
import { testDb } from "./_db.mjs";

const db = testDb();
const EMAIL = `design-check-${Date.now()}@example.test`;
const PASS = "Test-1234!";
const BASE = "http://localhost:3000";
const OUT = "/app/e2e/shots";

const user = await db.user.create({
  data: {
    email: EMAIL,
    name: "Design Check",
    passwordHash: await bcrypt.hash(PASS, 10),
    role: "USER",
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
    if (m.type() === "error") problems.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/start/, { timeout: 20000 });

  // Reisedaten anlegen, sonst blendet sich das Dashboard aus (kein Countdown,
  // keine Ausgaben) — und genau die Kacheln sollen begutachtet werden.
  const seeded = await page.evaluate(async () => {
    const post = (url, body) =>
      fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => (r.ok ? "ok" : `${url} → ${r.status}`));
    const d = new Date(Date.now() + 47 * 86400000).toISOString().slice(0, 10);
    const out = [];
    out.push(
      await post("/api/v1/bookings", {
        title: "teamLab Planets · Zeitfenster 10:30",
        kind: "TICKET",
        date: d,
        time: "10:30",
        priceYen: 3800,
      }),
    );
    out.push(await post("/api/v1/expenses", { category: "ESSEN", label: "Ramen Ichiran", yen: 1980 }));
    out.push(
      await post("/api/v1/expenses", { category: "TRANSPORT", label: "JR Pass 7 Tage", yen: 50000 }),
    );
    out.push(
      await fetch("/api/v1/checklist", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: [
            { id: "a", text: "Reisepass prüfen", done: true },
            { id: "b", text: "Suica aufladen", done: false },
            { id: "c", text: "Adapter kaufen", done: false },
          ],
        }),
      }).then((r) => (r.ok ? "ok" : `checklist → ${r.status}`)),
    );
    localStorage.setItem("japan-budget", "200000");
    return out;
  });
  console.log("Seed:", seeded.join(", "));

  // Wunschliste füllen, damit die Listen-Optik zu sehen ist.
  await page.evaluate(async () => {
    for (const [label, priceYen] of [["Gunpla RG Zaku", 3400], ["Kitkat Matcha", 480], ["Kimono", 12000]])
      await fetch("/api/v1/wishlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label, priceYen }),
      });
  });

  const views = [
    ["start", `${BASE}/start`],
    ["geld-ausgaben", `${BASE}/geld?tab=ausgaben`],
    ["geld-abrechnung", `${BASE}/geld?tab=abrechnung`],
    ["geld-zoll", `${BASE}/geld?tab=zoll`],
    ["geld-wunschliste", `${BASE}/geld?tab=wunschliste`],
    ["programm-tagesplaner", `${BASE}/programm?tab=tagesplaner`],
    ["programm-buchungen", `${BASE}/programm?tab=buchungen`],
    ["programm-checkliste", `${BASE}/programm?tab=checkliste`],
    ["info-uebersicht", `${BASE}/info?tab=uebersicht`],
    ["info-wetter", `${BASE}/info?tab=wetter`],
    ["info-stempel", `${BASE}/info?tab=stempel`],
    ["info-koffer", `${BASE}/info?tab=koffer`],
    ["fluege", `${BASE}/fluege`],
    ["mitglieder", `${BASE}/mitglieder`],
    ["profil", `${BASE}/profil`],
    ["reiseplaner", `${BASE}/reiseplaner`],
  ];

  for (const theme of ["light", "dark"]) {
    for (const [name, url] of views) {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.evaluate((t) => {
        localStorage.setItem("theme", t);
        document.documentElement.classList.toggle("dark", t === "dark");
      }, theme);
      // Daten der Client-Komponenten abwarten (Dashboard/Wetter laden per fetch).
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${OUT}/${theme}-${name}.png`, fullPage: true });
    }
  }

  // Klebt die Leiste beim Scrollen wirklich oben – und liegt sie über der Karte?
  await page.goto(`${BASE}/reiseplaner`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await page.mouse.wheel(0, 700);
  await page.waitForTimeout(400);
  const headerTop = await page.evaluate(() => {
    const h = document.querySelector("header");
    return h ? Math.round(h.getBoundingClientRect().top) : null;
  });
  console.log("header top nach Scroll:", headerTop, "(0 = klebt)");
  await page.screenshot({ path: `${OUT}/sticky-scroll.png` });
} finally {
  await browser.close();
  await db.user.delete({ where: { id: user.id } }).catch(() => {});
  await db.$disconnect();
}

console.log(problems.length ? `PROBLEME:\n${problems.join("\n")}` : "keine Konsolen-/Seitenfehler");
