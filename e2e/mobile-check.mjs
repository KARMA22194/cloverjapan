// Sucht auf allen Hauptansichten in Handy-Breite nach horizontalem Überlauf und
// nach gequetschten Textspalten (< 60 px breit = Text bricht nach jedem Wort).
import { chromium } from "playwright";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const PASS = "Test-1234!";
const u = await db.user.create({ data: { email: `mob-${Date.now()}@example.test`, name: "Mobil Test",
  passwordHash: await bcrypt.hash(PASS, 10), role: "ADMIN", active: true, emailVerified: new Date() } });
const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', u.email);
  await page.fill('input[name="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  // Etwas Inhalt, damit die Listen nicht leer sind
  await page.evaluate(async () => {
    const post = (u, b) => fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
    await post("/api/v1/expenses", { category: "ESSEN", label: "Ramen Ichiran in Shibuya", yen: 1980 });
    await post("/api/v1/bookings", { title: "teamLab Planets · Zeitfenster 10:30", kind: "TICKET", date: "2026-12-01", time: "10:30", ref: "ABC-12345" });
    await post("/api/v1/wishlist", { label: "Gunpla RG Zaku II Char Custom", priceYen: 3400 });
    await post("/api/v1/luggage", { ownerName: "Mobil Test", label: "Großer Koffer" });
  });
  const routes = ["/start", "/geld?tab=ausgaben", "/geld?tab=abrechnung", "/geld?tab=zoll",
    "/geld?tab=wunschliste", "/programm?tab=ablauf", "/programm?tab=tagesplaner",
    "/programm?tab=buchungen", "/programm?tab=checkliste", "/info?tab=uebersicht",
    "/info?tab=stempel", "/info?tab=koffer", "/info?tab=notfall", "/fluege", "/mitglieder", "/profil", "/admin"];
  for (const r of routes) {
    await page.goto(`http://localhost:3000${r}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1300);
    const res = await page.evaluate(() => {
      const vw = window.innerWidth;
      const over = document.documentElement.scrollWidth - vw;
      // Textknoten, die in eine sehr schmale Spalte gepresst werden
      const squeezed = [...document.querySelectorAll("p, span, div")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          const t = el.textContent?.trim() ?? "";
          return t.length > 25 && r.width > 0 && r.width < 60 && el.children.length === 0;
        })
        .map((el) => (el.textContent ?? "").trim().slice(0, 30));
      return { over, squeezed: squeezed.slice(0, 3) };
    });
    const flag = res.over > 0 || res.squeezed.length ? "  ⚠" : "OK";
    console.log(`${flag} ${r.padEnd(28)} Überlauf ${String(res.over).padStart(3)} px` +
      (res.squeezed.length ? `  gequetscht: ${JSON.stringify(res.squeezed)}` : ""));
  }
} finally {
  await browser.close();
  await db.user.delete({ where: { id: u.id } }).catch(() => {});
  await db.$disconnect();
}
