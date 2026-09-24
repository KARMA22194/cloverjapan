// Beleg-Scan von Ende zu Ende — mit einem echt gerenderten japanischen Beleg.
//
// Prüft die Kette, die der Unit-Test (`e2e/receipt-parse.ts`) nicht abdeckt:
// Auth → Rate-Limit → Cloud-Vision-Aufruf → Zeilen aus Wortkoordinaten →
// Betragszuordnung → Antwort. Entscheidend ist, dass NICHT das hingelegte Geld
// (お預り ¥2,000) herauskommt, sondern die Summe (合計 ¥1,274).
//
// Verbraucht 1 Bild aus dem Vision-Gratis-Kontingent pro Lauf.
import { chromium } from "playwright";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const BASE = "http://localhost:3000";
const PASS = "Test-1234!";

const RECEIPT_HTML = `<!doctype html><meta charset="utf-8">
<style>
  body { margin:0; background:#fff; }
  .r { width:380px; padding:18px 20px; font-family:"Noto Sans CJK JP","IPAGothic",sans-serif;
       font-size:13px; color:#111; line-height:1.7; }
  .shop { font-size:16px; font-weight:700; text-align:center; }
  .meta { font-size:11px; color:#333; text-align:center; }
  .row { display:flex; justify-content:space-between; }
  .sep { border-top:1px dashed #444; margin:8px 0; }
  .tot { font-size:16px; font-weight:700; }
</style>
<div class="r">
  <div class="shop">セブン-イレブン</div>
  <div class="meta">渋谷駅前店</div>
  <div class="meta">2026年8月19日(水) 14:32</div>
  <div class="sep"></div>
  <div class="row"><span>おにぎり 鮭</span><span>¥150</span></div>
  <div class="row"><span>お茶 500ml</span><span>¥108</span></div>
  <div class="row"><span>サンドイッチ</span><span>¥342</span></div>
  <div class="row"><span>アイスクリーム</span><span>¥630</span></div>
  <div class="sep"></div>
  <div class="row"><span>小計</span><span>¥1,230</span></div>
  <div class="row"><span>消費税(8%)</span><span>¥44</span></div>
  <div class="row tot"><span>合計</span><span>¥1,274</span></div>
  <div class="sep"></div>
  <div class="row"><span>お預り</span><span>¥2,000</span></div>
  <div class="row"><span>お釣り</span><span>¥726</span></div>
</div>`;

const user = await db.user.create({
  data: {
    email: `scan-${Date.now()}@example.test`,
    name: "Scan Test",
    passwordHash: await bcrypt.hash(PASS, 10),
    role: "USER",
    active: true,
    emailVerified: new Date(),
    // Ohne dieses Recht antwortet /scan mit 403 — das ist der Sinn der Übung.
    canAiScan: true,
  },
});

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const results = [];
const ok = (name, cond, extra = "") =>
  results.push(`${cond ? "OK  " : "FEHL"} ${name}${extra ? ` — ${extra}` : ""}`);

try {
  // 1. Beleg rendern und als Data-URL aufnehmen (2× Skalierung ≈ Kameraschärfe).
  const shot = await browser.newPage({ deviceScaleFactor: 2 });
  await shot.setContent(RECEIPT_HTML, { waitUntil: "load" });
  const png = await shot.locator(".r").screenshot({ type: "jpeg", quality: 90 });
  await shot.close();
  const dataUrl = `data:image/jpeg;base64,${png.toString("base64")}`;
  ok("Beleg gerendert", png.length > 5000, `${Math.round(png.length / 1024)} kB`);

  // 2. Anmelden.
  const page = await browser.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', PASS);
  // Auf die **Navigation** warten, nicht auf eine Wartezeit: nach einem
  // Container-Neustart kompiliert Next die erste Seite erst, dann dauert der
  // Login länger als jede feste Frist — und ein `evaluate` mitten in der
  // Navigation stirbt mit „Execution context was destroyed".
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 }),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForLoadState("domcontentloaded");
  ok("angemeldet", !page.url().includes("/login"), page.url());

  // 3. Scan über die echte Route (Cookies kommen aus dem Seitenkontext).
  const res = await page.evaluate(async (image) => {
    const r = await fetch("/api/v1/expenses/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  }, dataUrl);

  console.log("Antwort:", JSON.stringify(res, null, 2));

  ok("Status 200", res.status === 200, `status=${res.status}`);
  ok(
    "Betrag = 合計 (1274), nicht お預り (2000)",
    res.body?.yen === 1274,
    `yen=${res.body?.yen}`,
  );
  ok("als Summe erkannt", res.body?.source === "total", `source=${res.body?.source}`);
  ok("Erkenner war Vision", res.body?.engine === "vision", `engine=${res.body?.engine}`);
  ok("Kategorie aus Stichwörtern", res.body?.categoryFrom === "keywords", `from=${res.body?.categoryFrom}`);
  ok("Kategorie ESSEN", res.body?.category === "ESSEN", `category=${res.body?.category}`);
  ok("Label 7-Eleven", res.body?.label === "7-Eleven", `label=${res.body?.label}`);

  // 4. Derselbe Weg durch die Oberfläche: Datei in den Scan-Knopf legen und
  //    prüfen, dass Betrag und Bezeichnung im Formular landen.
  await page.goto(`${BASE}/geld?tab=ausgaben`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#ausgabe-betrag", { timeout: 15000 });
  // ⚠️ `waitForSelector` belegt nur, dass das server-gerenderte HTML da ist —
  // NICHT, dass React schon hydriert hat. Wird die Datei vorher gesetzt, feuert
  // das native change-Event ins Leere: der React-`onChange` hängt noch nicht.
  // Der Kurs-Banner ist das sichtbare Zeichen, dass der Client-Effekt gelaufen
  // ist, also die Komponente lebt.
  await page.waitForFunction(
    () => !document.body.innerText.includes("Wechselkurs wird geladen"),
    null,
    { timeout: 20000 },
  );
  // Über den Datei-Dialog statt `setInputFiles` — das ist der Weg, den ein
  // Nutzer nimmt (Klick auf „📸 Beleg scannen"), inklusive des Labels.
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.locator("label:has(input[type=file])").first().click(),
  ]);
  await chooser.setFiles({ name: "beleg.jpg", mimeType: "image/jpeg", buffer: png });
  await page.waitForFunction(
    () => document.querySelector("#ausgabe-betrag")?.value?.length > 0,
    null,
    { timeout: 25000 },
  );
  const betrag = await page.inputValue("#ausgabe-betrag");
  const bez = await page.inputValue("#ausgabe-bezeichnung");
  const fotoHinweis = await page.getByText("Foto wird angehängt").count();
  ok("Formular: Betrag gefüllt", betrag === "1274", `Betrag="${betrag}"`);
  ok("Formular: Bezeichnung gefüllt", bez === "7-Eleven", `Bezeichnung="${bez}"`);
  ok("Formular: Foto wird angehängt", fotoHinweis === 1);

  // 5. Lernen aus der Historie: ein Laden, den KEIN Stichwort kennt. Erst mit
  //    Kategorie erfassen, dann einen Beleg desselben Ladens scannen — die
  //    Kategorie muss aus der Reise-Historie kommen.
  const shop = "よろずや";
  const created = await page.evaluate(
    (label) =>
      fetch("/api/v1/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category: "KLEIDUNG", label, yen: 500, shared: false }),
      }).then((r) => r.status),
    shop,
  );
  ok("Vorgeschichte angelegt", created === 200 || created === 201, `status=${created}`);

  const shot2 = await browser.newPage({ deviceScaleFactor: 2 });
  await shot2.setContent(`<!doctype html><meta charset="utf-8">
    <div id="r" style="width:360px;padding:18px;background:#fff;
         font-family:'Noto Sans CJK JP','IPAGothic',sans-serif;font-size:13px;line-height:1.8">
      <div style="font-size:16px;font-weight:700;text-align:center">${shop}</div>
      <div style="display:flex;justify-content:space-between"><span>商品</span><span>¥800</span></div>
      <div style="border-top:1px dashed #444;margin:8px 0"></div>
      <div style="display:flex;justify-content:space-between"><span>合計</span><span>¥800</span></div>
    </div>`);
  const png2 = await shot2.locator("#r").screenshot({ type: "jpeg", quality: 90 });
  await shot2.close();

  const res2 = await page.evaluate(async (image) => {
    const r = await fetch("/api/v1/expenses/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  }, `data:image/jpeg;base64,${png2.toString("base64")}`);
  console.log("Antwort (unbekannter Laden):", JSON.stringify(res2.body));

  ok("unbekannter Laden: Betrag", res2.body?.yen === 800, `yen=${res2.body?.yen}`);
  ok("Kategorie aus der Historie", res2.body?.category === "KLEIDUNG", `category=${res2.body?.category}`);
  ok("Herkunft = history", res2.body?.categoryFrom === "history", `from=${res2.body?.categoryFrom}`);

  // 6. Völlig unbekannt: kein Stichwort, keine Historie → SONSTIGES statt auf der
  //    Formular-Voreinstellung „Essen" liegen zu bleiben.
  const shot3 = await browser.newPage({ deviceScaleFactor: 2 });
  await shot3.setContent(`<!doctype html><meta charset="utf-8">
    <div id="r" style="width:360px;padding:18px;background:#fff;
         font-family:'Noto Sans CJK JP','IPAGothic',sans-serif;font-size:13px;line-height:1.8">
      <div style="font-size:16px;font-weight:700;text-align:center">たなか商会</div>
      <div style="display:flex;justify-content:space-between"><span>品物</span><span>¥1,200</span></div>
      <div style="border-top:1px dashed #444;margin:8px 0"></div>
      <div style="display:flex;justify-content:space-between"><span>合計</span><span>¥1,200</span></div>
    </div>`);
  const png3 = await shot3.locator("#r").screenshot({ type: "jpeg", quality: 90 });
  await shot3.close();

  const res3 = await page.evaluate(async (image) => {
    const r = await fetch("/api/v1/expenses/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  }, `data:image/jpeg;base64,${png3.toString("base64")}`);
  console.log("Antwort (nichts erkennbar):", JSON.stringify(res3.body));

  ok("nichts erkennbar: Betrag", res3.body?.yen === 1200, `yen=${res3.body?.yen}`);
  ok("Rückfall auf SONSTIGES", res3.body?.category === "SONSTIGES", `category=${res3.body?.category}`);
  ok("Herkunft = fallback", res3.body?.categoryFrom === "fallback", `from=${res3.body?.categoryFrom}`);
} finally {
  await browser.close();
  const m = await db.tripMember.findUnique({ where: { userId: user.id }, select: { tripId: true } });
  await db.user.delete({ where: { id: user.id } }).catch(() => {});
  if (m) await db.trip.delete({ where: { id: m.tripId } }).catch(() => {});
  await db.$disconnect();
}

console.log("\n" + results.join("\n"));
console.log(results.every((r) => r.startsWith("OK")) ? "\nALLES OK" : "\nFEHLER VORHANDEN");
