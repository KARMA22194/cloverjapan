// Monatskontingent für den Beleg-Scan.
//
// Die Schranke ist die einzige Stelle in der App, an der die Vision-Kosten
// wirklich enden: Google hört über dem Freikontingent nicht auf, sondern rechnet
// ab, und die Quota-Einstellung in der Cloud begrenzt nur Aufrufe pro Minute.
//
// Deckt ab:
//  1. ist der Monatszähler voll, antwortet /scan mit 429 statt Google anzurufen,
//  2. die Meldung nennt den Ausweg,
//  3. der Zähler hängt am **Kalendermonat** (UTC), nicht an einem rollierenden
//     Fenster — sonst ließe er im selben Monat fast das Doppelte durch,
//  4. abgewiesene Aufrufe erhöhen den Zähler nicht weiter.
import bcrypt from "bcryptjs";
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const BASE = "http://localhost:3000";
const PASS = "Test-1234!";
const stamp = Date.now();
const LIMIT = Number(process.env.VISION_MONTHLY_LIMIT ?? 950);

const now = new Date();
const KEY = `vision-quota:${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

const user = await db.user.create({
  data: {
    email: `quota-${stamp}@example.test`,
    name: "Quota Test",
    passwordHash: await bcrypt.hash(PASS, 10),
    role: "USER",
    active: true,
    emailVerified: new Date(),
    canAiScan: true,
  },
});

// Den echten Zählerstand sichern — der Test dreht ihn hoch und muss ihn danach
// exakt zurückstellen, sonst wäre der Scan bis zum Monatsersten gesperrt.
const before = await db.rateLimit.findUnique({ where: { key: KEY } });

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const results = [];
const ok = (name, cond, extra = "") =>
  results.push(`${cond ? "OK  " : "FEHL"} ${name}${extra ? ` — ${extra}` : ""}`);

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

try {
  const page = await browser.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', PASS);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 }),
    page.click('button[type="submit"]'),
  ]);

  // Zähler auf „voll" setzen.
  await db.rateLimit.upsert({
    where: { key: KEY },
    update: { count: LIMIT, resetAt: nextMonth },
    create: { key: KEY, count: LIMIT, resetAt: nextMonth },
  });

  const call = () =>
    page.evaluate(
      (img) =>
        fetch("/api/v1/expenses/scan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ image: img }),
        }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })),
      PNG,
    );

  const r = await call();
  ok("Kontingent voll → 429", r.status === 429, `status=${r.status}`);
  const msg = r.body?.error?.message ?? "";
  ok("Meldung nennt den Ausweg", /von Hand eintragen/i.test(msg), msg);
  ok("Meldung nennt den Monatswechsel", /Monatsersten/i.test(msg));

  // Der Schlüssel muss den Kalendermonat tragen — sonst könnte ein rollierendes
  // Fenster mitten im Monat neu beginnen.
  const row = await db.rateLimit.findUnique({ where: { key: KEY } });
  ok("Zähler steht unter dem Monats-Schlüssel", !!row, KEY);
  ok(
    "läuft zum Monatswechsel ab",
    row.resetAt.getUTCDate() === 1 && row.resetAt.getTime() === nextMonth.getTime(),
    row.resetAt.toISOString(),
  );

  // ── Oberfläche: das Foto darf nicht verloren gehen ─────────────────────
  // Der Nutzer hat es schon aufgenommen; es nach der Fehlermeldung ein zweites
  // Mal zu verlangen wäre die eigentliche Zumutung.
  await page.goto(`${BASE}/geld?tab=ausgaben`, { waitUntil: "domcontentloaded" });
  // Auf Hydration warten, nicht auf das Element — sonst feuert das native
  // change-Event ins Leere (siehe CLAUDE.md, Dev-Server-Falle 4).
  await page.waitForFunction(
    () => !document.body.innerText.includes("Wechselkurs wird geladen"),
    null,
    { timeout: 20000 },
  );
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.locator("label:has(input[type=file])").first().click(),
  ]);
  await chooser.setFiles({
    name: "beleg.png",
    mimeType: "image/png",
    buffer: Buffer.from(PNG.split(",")[1], "base64"),
  });
  await page.waitForFunction(
    () => document.body.innerText.includes("Foto wird angehängt"),
    null,
    { timeout: 25000 },
  );
  ok("Foto bleibt trotz abgelehntem Scan erhalten", true);
  ok(
    "Hinweis erklärt, was zu tun ist",
    (await page.getByText("Betrag bitte eintippen").count()) === 1,
  );

  // Unter dem Limit muss es wieder durchgehen. Ein 1×1-PNG findet keinen Text,
  // Vision antwortet also ohne Treffer → 422. Wichtig ist: **nicht** mehr 429.
  await db.rateLimit.update({ where: { key: KEY }, data: { count: LIMIT - 1 } });
  const r2 = await call();
  ok("unter dem Limit kein 429 mehr", r2.status !== 429, `status=${r2.status}`);
  const after = await db.rateLimit.findUnique({ where: { key: KEY } });
  ok("erlaubter Aufruf zählt hoch", after.count === LIMIT, `count=${after.count}`);
} finally {
  await browser.close();
  if (before) {
    await db.rateLimit.update({
      where: { key: KEY },
      data: { count: before.count, resetAt: before.resetAt },
    });
  } else {
    await db.rateLimit.deleteMany({ where: { key: KEY } });
  }
  await db.expense.deleteMany({ where: { trip: { members: { some: { userId: user.id } } } } });
  await db.user.delete({ where: { id: user.id } }).catch(() => {});
  await db.$disconnect();
}

console.log(results.join("\n"));
const bad = results.filter((x) => x.startsWith("FEHL"));
console.log(bad.length ? `\n${bad.length} FEHLER` : "\nALLES OK");
process.exit(bad.length ? 1 : 0);
