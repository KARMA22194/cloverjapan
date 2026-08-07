// Prüft dreierlei am Theme-Script im Root-Layout:
//  1. keine Hydration-Warnung mehr in der Konsole,
//  2. keine CSP-Verletzung (das Script darf trotz Nonce laufen),
//  3. es wirkt tatsächlich — `.dark` steht schon beim ersten Paint am <html>.
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const problems = [];

try {
  for (const theme of ["dark", "light"]) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    page.on("console", (m) => {
      const t = m.text();
      if (m.type() !== "error") return;
      if (t.includes("ERR_CERT_AUTHORITY_INVALID")) return;
      problems.push(`[${theme}] console: ${t.slice(0, 200)}`);
    });
    page.on("pageerror", (e) => problems.push(`[${theme}] pageerror: ${e.message}`));

    // Vorbelegen, damit das Script beim nächsten Laden etwas zu tun hat.
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => localStorage.setItem("theme", t), theme);

    // Klasse VOR dem ersten Paint messen: Wert direkt nach domcontentloaded lesen.
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    const cls = await page.evaluate(() => document.documentElement.className);
    const nonceAttr = await page.evaluate(
      () => document.head.querySelector("script[nonce]")?.getAttribute("nonce") ?? "(kein Attribut)",
    );
    const hasDark = cls.includes("dark");
    console.log(
      `${theme}: html.class="${cls}" → dark=${hasDark} ${hasDark === (theme === "dark") ? "OK" : "FALSCH"}`,
    );
    console.log(`  nonce im DOM: "${nonceAttr}" (leer = Browser hat es versteckt, wie erwartet)`);
    await page.waitForTimeout(1500);
    await ctx.close();
  }
} finally {
  await browser.close();
}

const hydration = problems.filter((p) => p.includes("hydrat"));
const csp = problems.filter((p) => /Content Security Policy|CSP|EvalError/i.test(p));
console.log(`\nHydration-Warnungen: ${hydration.length}`);
console.log(`CSP-Verstöße:        ${csp.length}`);
if (problems.length) console.log("\nalle Meldungen:\n" + problems.join("\n"));
else console.log("keine Konsolenmeldungen");
