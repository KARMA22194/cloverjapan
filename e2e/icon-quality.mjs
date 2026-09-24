// Misst, wie viel vom Motiv nach dem Upload übrig bleibt.
//
// Kennzahl „Füllgrad": Anteil der Fläche, den das sichtbare Motiv im gespeicherten
// Symbol einnimmt. Bei 100 % berührt es alle vier Kanten; bei 10 % ist es ein
// Pünktchen in der Mitte — und genau dann erkennt man auf 16–22 px nichts mehr.
import { chromium } from "playwright";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import { testDb } from "./_db.mjs";

const db = testDb();
const BASE = "http://localhost:3000";
const PASS = "Test-1234!";

/** PNG mit transparentem Rand: Motiv `m`×`m` mittig auf `s`×`s`. */
async function pngWithMargin(s, m, color = { r: 220, g: 30, b: 40 }) {
  const motif = await sharp({
    create: { width: m, height: m, channels: 4, background: { ...color, alpha: 1 } },
  })
    .png()
    .toBuffer();
  return sharp({
    create: { width: s, height: s, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: motif, top: Math.round((s - m) / 2), left: Math.round((s - m) / 2) }])
    .png()
    .toBuffer();
}

/** JPEG mit weißem Rand (kein Alphakanal). */
async function jpgWithMargin(s, m) {
  const motif = await sharp({
    create: { width: m, height: m, channels: 3, background: { r: 20, g: 90, b: 200 } },
  })
    .jpeg()
    .toBuffer();
  return sharp({
    create: { width: s, height: s, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite([{ input: motif, top: Math.round((s - m) / 2), left: Math.round((s - m) / 2) }])
    .jpeg()
    .toBuffer();
}

/** Breites Banner ohne Rand. */
async function wideBanner(w, h) {
  return sharp({
    create: { width: w, height: h, channels: 4, background: { r: 10, g: 150, b: 90, alpha: 1 } },
  })
    .png()
    .toBuffer();
}

/** Füllgrad + Maße eines gespeicherten Data-URL-Symbols. */
async function measure(dataUrl) {
  const b64 = dataUrl.split(",")[1];
  const buf = Buffer.from(b64, "base64");
  const img = sharp(buf);
  const meta = await img.metadata();
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels } = info;
  // Sichtbar = alpha > 16 UND nicht (nahezu) weiß — Weiß ist bei JPEG der Rand.
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * channels;
      const [r, g, bl, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      const visible = a > 16 && !(r > 244 && g > 244 && bl > 244);
      if (!visible) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return { w, h, fill: 0, motif: "0×0", bytes: dataUrl.length, format: meta.format };
  const mw = maxX - minX + 1;
  const mh = maxY - minY + 1;
  return {
    w,
    h,
    motif: `${mw}×${mh}`,
    // Anteil der längeren Motivkante an der längeren Bildkante — das entscheidet,
    // wie groß das Motiv in der quadratischen Anzeigefläche erscheint.
    fill: Math.round((Math.max(mw, mh) / Math.max(w, h)) * 100),
    bytes: dataUrl.length,
    format: meta.format,
  };
}

const u = await db.user.create({
  data: {
    email: `iconq-${Date.now()}@example.test`,
    name: "Icon Q",
    passwordHash: await bcrypt.hash(PASS, 10),
    role: "USER",
    active: true,
    emailVerified: new Date(),
  },
});

const cases = [
  ["PNG 512², Motiv 64² (viel Rand)", "geld", await pngWithMargin(512, 64), "geld.png", "image/png"],
  ["PNG 512², Motiv 300²", "info", await pngWithMargin(512, 300), "info.png", "image/png"],
  ["JPG 512², Motiv 64² (weißer Rand)", "fluege", await jpgWithMargin(512, 64), "f.jpg", "image/jpeg"],
  ["PNG Banner 600×120", "programm", await wideBanner(600, 120), "b.png", "image/png"],
];

const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', u.email);
  await page.fill('input[name="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  await page.goto(`${BASE}/profil`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  console.log("Motiv-Füllgrad im gespeicherten Symbol (100 % = füllt die Fläche):\n");
  for (const [label, section, buffer, name, mimeType] of cases) {
    // Echten Weg gehen: Knopf klickt das versteckte Input an, wir setzen die Datei.
    await page.evaluate((s) => {
      const rows = [...document.querySelectorAll("li")];
      const row = rows.find((r) => r.textContent?.includes(s));
      row?.querySelector("button")?.click();
    }, { geld: "Geld", info: "Info", fluege: "Flüge", programm: "Programm" }[section]);
    await page.setInputFiles('input[type="file"][accept*="png"]', { name, mimeType, buffer });
    await page.waitForTimeout(1200);

    const row = await db.userSectionIcon.findUnique({
      where: { userId_section: { userId: u.id, section } },
    });
    if (!row) {
      console.log(`  ${label.padEnd(38)} → NICHT GESPEICHERT`);
      continue;
    }
    const m = await measure(row.data);
    console.log(
      `  ${label.padEnd(38)} → ${String(m.w).padStart(3)}×${String(m.h).padEnd(3)} ${m.format.padEnd(4)}` +
        ` Motiv ${m.motif.padEnd(9)} Füllgrad ${String(m.fill).padStart(3)} %   ${Math.round(m.bytes / 1024)} KB`,
    );
  }
  // Sichtprüfung: so sehen die vier Fälle in den Kacheln aus.
  await page.goto(`${BASE}/start`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "/app/e2e/shots/icons-nachher.png", fullPage: true });
} finally {
  await browser.close();
  await db.user.delete({ where: { id: u.id } }).catch(() => {});
  await db.$disconnect();
}
