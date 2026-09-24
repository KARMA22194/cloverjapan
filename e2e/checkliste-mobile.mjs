// Checkliste UND Tagesplaner in Handy- und Desktop-Breite ansehen (mit mehreren
// Mitgliedern, damit die Zuweisungs-Auswahl überhaupt erscheint — sie war die
// Ursache der zerquetschten Zeilen).
import { chromium } from "playwright";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const PASS = "Test-1234!";
const s = Date.now();
const mk = async (t) => db.user.create({ data: { email: `cl-${t}-${s}@example.test`, name: t === "a" ? "Steve Brunner" : "Anna Beispiel",
  passwordHash: await bcrypt.hash(PASS, 10), role: "USER", active: true, emailVerified: new Date() } });
const a = await mk("a"); const b = await mk("b");
const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    deviceScaleFactor: 2, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', a.email);
  await page.fill('input[name="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  // Reise entsteht erst beim ersten Zugriff auf einen Trip-Endpunkt.
  await page.evaluate(() => fetch("/api/v1/checklist").then((r) => r.json()));
  await page.waitForTimeout(500);
  const m = await db.tripMember.findUnique({ where: { userId: a.id } });
  await db.tripMember.deleteMany({ where: { userId: b.id } });
  await db.tripMember.create({ data: { tripId: m.tripId, userId: b.id } });
  // Punkte anlegen (Vorlage + einer zugewiesen + einer erledigt)
  await page.evaluate(async (names) => {
    const items = [
      { id: "1", text: "Reisepass (mind. 6 Monate gültig)", done: true, assigneeName: "", completedByName: names[0] },
      { id: "2", text: "Visit Japan Web ausgefüllt (Einreise/Zoll)", done: false, assigneeName: names[1], completedByName: "" },
      { id: "3", text: "Suica/PASMO (IC-Karte für Bahn)", done: false, assigneeName: "", completedByName: "" },
      { id: "4", text: "Steckdosen-Adapter (Typ A, 100 V)", done: false, assigneeName: names[0], completedByName: "" },
    ];
    await fetch("/api/v1/checklist", { method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ items }) });
  }, ["Steve Brunner", "Anna Beispiel"]);
  // Tagesplaner-Aufgaben anlegen (hat denselben Zeilenaufbau)
  await page.evaluate(async () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const [time, text] of [["09:30", "teamLab Planets Zeitfenster abholen"], ["", "Suica aufladen am Automaten"]])
      await fetch("/api/v1/planner-tasks", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ date: today, time, text }) });
  });

  for (const [name, url] of [["checkliste", "/programm?tab=checkliste"], ["tagesplaner", "/programm?tab=tagesplaner"]]) {
    await page.goto(`http://localhost:3000${url}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `/app/e2e/shots/${name}-mobile.png`, fullPage: true });
  }

  // Gegenprobe Desktop: dort soll alles weiterhin in EINER Zeile stehen.
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const [name, url] of [["checkliste", "/programm?tab=checkliste"], ["tagesplaner", "/programm?tab=tagesplaner"]]) {
    await page.goto(`http://localhost:3000${url}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `/app/e2e/shots/${name}-desktop.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3000/programm?tab=checkliste", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  // Überlauf messen
  const overflow = await page.evaluate(() => ({
    docWidth: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    widest: [...document.querySelectorAll("*")]
      .map((el) => ({ w: Math.round(el.getBoundingClientRect().right), t: el.tagName + "." + (el.className?.toString?.().slice(0, 40) ?? "") }))
      .filter((x) => x.w > window.innerWidth + 1)
      .slice(0, 6),
  }));
  console.log("Seitenbreite:", overflow.docWidth, "Viewport:", overflow.viewport);
  console.log("Elemente über den Rand hinaus:", JSON.stringify(overflow.widest, null, 1));
} finally {
  await browser.close();
  await db.user.deleteMany({ where: { id: { in: [a.id, b.id] } } }).catch(() => {});
  await db.$disconnect();
}
