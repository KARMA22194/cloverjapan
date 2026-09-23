/**
 * Prüft die Belegtext-Auswertung gegen typische japanische Kassenzettel.
 *
 * Läuft ohne Netz und ohne Datenbank — reine Funktionen:
 *   docker compose exec -T app node --experimental-strip-types e2e/receipt-parse.ts
 */
import { extractTotal, guessMeta, rowsFromWords, type OcrWord } from "../src/lib/receipt.ts";

interface Case {
  name: string;
  text: string;
  yen: number;
  source: string;
  category?: string;
  label?: string;
}

const CASES: Case[] = [
  {
    name: "7-Eleven — お預り größer als die Summe (die Hauptfalle)",
    text: [
      "セブン-イレブン 渋谷駅前店",
      "東京都渋谷区道玄坂1-2-3",
      "TEL 03-1234-5678",
      "2026年8月19日(水) 14:32",
      "おにぎり 鮭          ¥150",
      "お茶 500ml           ¥108",
      "サンドイッチ          ¥342",
      "小計                ¥556",
      "消費税(8%)           ¥44",
      "合計                ¥600",
      "お預り             ¥1,000",
      "お釣り               ¥400",
    ].join("\n"),
    yen: 600,
    source: "total",
    category: "ESSEN",
    label: "7-Eleven",
  },
  {
    name: "Innensteuer in Klammern auf der Summenzeile",
    text: [
      "ドン・キホーテ 新宿店",
      "Tシャツ              1,980",
      "合計 ¥2,178 (内消費税等 ¥198)",
      "お預り ¥3,000",
      "お釣り ¥822",
    ].join("\n"),
    yen: 2178,
    source: "total",
    // Gemischtwarenladen (1) gegen Artikelbegriff „Tシャツ" (2) → Kleidung.
    category: "KLEIDUNG",
    label: "ドン・キホーテ新宿店",
  },
  {
    name: "Stückzahl auf der Summenzeile (合計 3点)",
    text: ["ローソン 池袋東口店", "合計 3点 ¥1,274", "お預り ¥1,300", "お釣り ¥26"].join("\n"),
    yen: 1274,
    source: "total",
    category: "ESSEN",
    label: "Lawson",
  },
  {
    name: "Steuersatz-Zeilen (10%対象 / 8%対象) dürfen nicht gewinnen",
    text: [
      "イオン 大阪店",
      "小計 ¥3,000",
      "10%対象 ¥1,100",
      "8%対象 ¥1,900",
      "合計 ¥3,000",
      "お預り ¥5,000",
      "お釣り ¥2,000",
    ].join("\n"),
    yen: 3000,
    source: "total",
    category: "ESSEN",
    label: "Supermarkt",
  },
  {
    name: "Nur Zwischensumme vorhanden",
    text: ["カフェ ド クリエ", "ブレンドコーヒー ¥380", "小計 ¥380"].join("\n"),
    yen: 380,
    source: "subtotal",
    category: "ESSEN",
  },
  {
    name: "Vollbreiten-Ziffern (Zenkaku)",
    text: ["ファミリーマート", "合計　￥１，２７４", "お預り　￥２，０００"].join("\n"),
    yen: 1274,
    source: "total",
    category: "ESSEN",
    label: "FamilyMart",
  },
  {
    name: "Ohne Schlüsselwort — schwächste Stufe",
    text: ["自動販売機", "コーヒー", "¥150"].join("\n"),
    yen: 150,
    source: "guess",
    category: "ESSEN",
  },
  {
    name: "OCR-Lücken im Markennamen (セブン - イレブン)",
    text: ["セブン - イレブン 渋谷 駅前 店", "合計 ¥1,274", "お預り ¥2,000"].join("\n"),
    yen: 1274,
    source: "total",
    category: "ESSEN",
    label: "7-Eleven",
  },
  {
    name: "Fachgeschäft schlägt einzelnen Artikelbegriff",
    text: ["JR東日本 新宿駅", "サンドイッチ ¥380", "乗車券 ¥200", "合計 ¥580"].join("\n"),
    yen: 580,
    source: "total",
    category: "TRANSPORT",
  },
  {
    // Auf Modulebene bleibt „unbekannt" = undefined (prüfbar). Die Route macht
    // daraus SONSTIGES — das ist eine Produktentscheidung, kein Parser-Ergebnis.
    name: "Gleichstand → hier KEINE Kategorie (Route setzt SONSTIGES)",
    text: ["よろずや", "Tシャツ ¥1,000", "電池 ¥1,000", "合計 ¥2,000"].join("\n"),
    yen: 2000,
    source: "total",
    category: undefined,
  },
  {
    name: "Fahrkarte → TRANSPORT",
    text: ["JR東日本 東京駅", "乗車券 東京→京都", "運賃 ¥13,320", "合計 ¥13,320"].join("\n"),
    yen: 13320,
    source: "total",
    category: "TRANSPORT",
    label: "JR東日本東京駅",
  },
  {
    // Regression: „パン" (Brot) steckt in „ジャパン" — der Beleg wurde Essen.
    name: "ジャパンレールパス ist Transport, nicht Essen (パン-Kollision)",
    text: ["ジャパンレールパス", "JAPAN RAIL PASS 576", "普通車 7日間", "¥39,600"].join("\n"),
    yen: 39600,
    source: "guess",
    category: "TRANSPORT",
  },
  {
    name: "Englischer JR-Pass-Voucher",
    text: [
      "JAPAN RAIL PASS",
      "EXCHANGE ORDER",
      "ORDINARY 7 DAYS",
      "PRICE  ¥39,600",
      "TOTAL  ¥39,600",
    ].join("\n"),
    yen: 39600,
    source: "total",
    category: "TRANSPORT",
    label: "JAPAN RAIL PASS",
  },
  {
    name: "Englischer Museumsbeleg",
    text: ["TOKYO NATIONAL MUSEUM", "ADMISSION ADULT 1", "TOTAL ¥1,000"].join("\n"),
    yen: 1000,
    source: "total",
    category: "SIGHTSEEING",
  },
  {
    // Regression: „TEL" ohne Wortgrenze traf „HOTEL" und verwarf die Namenszeile.
    name: "Hotelrechnung — HOTEL wird nicht als TEL verworfen",
    text: ["HOTEL SUNROUTE", "ROOM CHARGE 2 NIGHTS", "TOTAL ¥28,000"].join("\n"),
    yen: 28000,
    source: "total",
    category: "UNTERKUNFT",
    label: "HOTEL SUNROUTE",
  },
  {
    // Regression: „(水)" ist die Abkürzung für Mittwoch — stand früher als
    // „Wasser" in der Essens-Liste und hätte jeden Mittwochsbeleg verfälscht.
    name: "Mittwochs-Datum macht keinen Beleg zu Essen",
    text: ["よろずや", "2026年8月19日(水)", "商品 ¥500", "合計 ¥500"].join("\n"),
    yen: 500,
    source: "total",
    category: undefined,
  },
  {
    name: "Drogerie \u2192 KOSMETIK",
    text: ["\u30de\u30c4\u30e2\u30c8\u30ad\u30e8\u30b7 \u6e0b\u8c37\u5e97", "\u65e5\u713c\u3051\u6b62\u3081 1,280", "\u5316\u7ca7\u6c34 980", "\u5408\u8a08 \u00a52,260"].join("\n"),
    yen: 2260,
    source: "total",
    category: "KOSMETIK",
  },
  {
    // Regression: \u30e8\u30c9\u30d0\u30b7 stand fr\u00fcher als Gemischtwarenladen mit Gewicht 1
    // und verlor damit gegen jeden Artikelbegriff.
    name: "Elektronikmarkt \u2192 ELEKTRONIK",
    text: ["\u30e8\u30c9\u30d0\u30b7\u30ab\u30e1\u30e9 \u65b0\u5bbf\u897f\u53e3\u5e97", "\u30a4\u30e4\u30db\u30f3 4,980", "\u5408\u8a08 \u00a54,980"].join("\n"),
    yen: 4980,
    source: "total",
    category: "ELEKTRONIK",
  },
  {
    // Regression: \u5165\u6d74 (Sightseeing) steckt in \u5165\u6d74\u5264 (Drogerie) \u2014 das gab 2:2
    // und damit gar keine Kategorie. Sightseeing hei\u00dft deshalb \u5165\u6d74\u6599.
    name: "Badezusatz ist Drogerie, nicht Sightseeing",
    text: ["\u30c9\u30f3\u30fb\u30ad\u30db\u30fc\u30c6 \u65b0\u5bbf\u5e97", "\u5165\u6d74\u5264 \u00a5880", "\u5408\u8a08 \u00a5880"].join("\n"),
    yen: 880,
    source: "total",
    category: "KOSMETIK",
  },
  {
    name: "Onsen-Eintritt bleibt Sightseeing",
    text: ["\u5927\u6c5f\u6238\u6e29\u6cc9\u7269\u8a9e", "\u5165\u6d74\u6599 \u5927\u4eba1\u540d", "\u5408\u8a08 \u00a52,800"].join("\n"),
    yen: 2800,
    source: "total",
    category: "SIGHTSEEING",
  },
  {
    name: "Ryokan \u2192 UNTERKUNFT (nicht Sonstiges)",
    text: ["\u5bbf\u576a\u65c5\u9928", "\u5bbf\u6cca\u6599 2\u540d\u69d8", "\u5408\u8a08 \u00a532,000"].join("\n"),
    yen: 32000,
    source: "total",
    category: "UNTERKUNFT",
  },
  {
    name: "Betrag erst in der Folgezeile",
    text: ["すき家", "牛丼 並", "合計", "¥500"].join("\n"),
    yen: 500,
    source: "total",
    category: "ESSEN",
  },
];

let failed = 0;
for (const c of CASES) {
  const r = extractTotal(c.text);
  const meta = guessMeta(c.text);
  const problems: string[] = [];
  if (!r) problems.push("kein Betrag gefunden");
  else {
    if (r.yen !== c.yen) problems.push(`Betrag ${r.yen} statt ${c.yen}`);
    if (r.source !== c.source) problems.push(`source "${r.source}" statt "${c.source}"`);
  }
  if ("category" in c && meta.category !== c.category)
    problems.push(`Kategorie ${meta.category ?? "—"} statt ${c.category ?? "—"}`);
  if (c.label && meta.label !== c.label) problems.push(`Label "${meta.label ?? "—"}" statt "${c.label}"`);

  if (problems.length === 0) {
    console.log(`✓ ${c.name}`);
    console.log(`    ¥${r!.yen} · ${r!.source} · ${meta.category ?? "—"} · "${meta.label ?? "—"}"`);
  } else {
    failed++;
    console.log(`✗ ${c.name}`);
    for (const p of problems) console.log(`    ${p}`);
  }
}

// ── Zweispaltiger Beleg: warum die Wortkoordinaten nötig sind ──────────────
// Die OCR gibt hier erst alle Beschriftungen, dann alle Werte aus.
const scrambled: OcrWord[] = [
  { text: "ローソン", x: 10, y: 10, h: 12 },
  { text: "合計", x: 10, y: 40, h: 12 },
  { text: "お預り", x: 10, y: 70, h: 12 },
  { text: "お釣り", x: 10, y: 100, h: 12 },
  { text: "¥1,274", x: 200, y: 41, h: 12 },
  { text: "¥2,000", x: 200, y: 69, h: 12 },
  { text: "¥726", x: 200, y: 101, h: 12 },
];

const naive = extractTotal(scrambled.map((w) => w.text).join("\n"));
const rows = rowsFromWords(scrambled);
const geo = extractTotal(rows.join("\n"));

console.log("\n── Zweispaltiger Beleg ──");
console.log(`  Leserichtung der OCR : ¥${naive?.yen} (${naive?.source})  ← das hingelegte Geld`);
console.log(`  Zeilen aus Koordinaten: ${rows.map((r) => `"${r}"`).join(" | ")}`);
console.log(`  danach               : ¥${geo?.yen} (${geo?.source})`);

if (geo?.yen !== 1274 || geo.source !== "total") {
  failed++;
  console.log("✗ Zeilenrekonstruktion liefert nicht 1274/total");
} else {
  console.log("✓ Zeilenrekonstruktion korrigiert den Fehler");
}

console.log(`\n${failed === 0 ? "Alle Fälle bestanden." : `${failed} Fall/Fälle fehlgeschlagen.`}`);
process.exit(failed === 0 ? 0 : 1);
