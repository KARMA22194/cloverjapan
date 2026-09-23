import type { ExpenseCategory } from "@prisma/client";

/**
 * Kassenzettel-Text auswerten — die Nachbearbeitung der OCR.
 *
 * Google Cloud Vision liefert nur den **Text** eines Belegs; welche der Zahlen
 * darauf der Gesamtbetrag ist, steht nicht dabei. Diese Datei enthält genau
 * diese Zuordnung, als reine Funktionen ohne Netz und ohne Prisma-Client
 * (type-only Import) — prüfbar mit echten Belegtexten über
 * `e2e/receipt-parse.ts`.
 *
 * ⚠️ Das Ergebnis ist ein **Vorschlag fürs Formular**, keine Wahrheit. Betrag
 * und Kategorie stehen vor dem Speichern editierbar im Eingabefeld; `source`
 * sagt, wie belastbar der Fund ist.
 *
 * Die zentrale Falle japanischer Belege: der **größte** Betrag ist meist nicht
 * die Summe, sondern お預り (hingelegtes Geld) — darunter steht お釣り
 * (Wechselgeld). Eine Regel „größte Zahl gewinnt" greift also systematisch den
 * Schein ab, nicht den Preis. Deshalb wird nach Schlüsselwörtern gewichtet und
 * jede Zeile mit 預 oder 釣 hart ausgeschlossen.
 */

/** Wie sicher der Betrag gefunden wurde (absteigend). */
export type AmountSource = "total" | "taxIncluded" | "subtotal" | "guess";

export interface ReceiptReading {
  yen: number;
  source: AmountSource;
}

/**
 * Vollbreiten-Zeichen (Zenkaku) auf ASCII bringen.
 *
 * Japanische Kassen drucken Ziffern häufig als ０-９ und das Yen-Zeichen als ￥.
 * Ohne diesen Schritt bräuchte jedes Muster unten eine zweite Variante.
 */
export function normalizeReceiptText(raw: string): string {
  return raw
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0),
    )
    .replace(/，/g, ",")
    .replace(/．/g, ".")
    .replace(/￥/g, "¥")
    .replace(/　/g, " ")
    .replace(/\r\n?/g, "\n");
}

/**
 * Zeilen, die nie den Gesamtbetrag tragen.
 *
 * 預/釣 als **einzelne Kanji**, damit alle Schreibweisen erfasst sind
 * (お預り / お預かり / 預り / お釣り / おつり / 釣銭 …). Dazu Punkte- und
 * Guthaben-Zeilen sowie Nummern, die betragsähnlich aussehen.
 */
const HARD_EXCLUDE = /預|釣|ポイント|残高|チャージ|point|TEL|電話|登録番号|No\./i;

/** Eindeutig die Summe. */
const TOTAL_STRONG = /合計|総計|お支払|支払金額|請求|TOTAL/i;
/** „inkl. Steuer" — steht oft auf der Summenzeile, ist aber schwächer. */
const TOTAL_TAXINC = /税込/;
/** Zwischensumme — nur als letzte Wahl vor dem Raten. */
const TOTAL_WEAK = /小計|計/;

/** Währungs-Marker: unterscheidet Geldbeträge von Nummern und Mengen. */
const HAS_CURRENCY = /[¥]|円/;

/**
 * Einheiten direkt hinter einer Zahl, die sie als Menge, Anteil oder Datum
 * ausweisen — „合計 3点 ¥1,274" darf nicht als 3 gelesen werden, „10%対象" nicht
 * als 10.
 */
const COUNT_SUFFIX = /^[点個品名回枚人杯本冊台％%年月日時分秒]/;

const AMOUNT_RE = /(\d{1,3}(?:,\d{3})+|\d+)/g;

/** Plausible Yen-Beträge einer Zeile (ohne Mengen, Nummern, Datumsangaben). */
function amountsInLine(line: string): number[] {
  const out: number[] = [];
  AMOUNT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = AMOUNT_RE.exec(line)) !== null) {
    const token = m[1];
    const rest = line.slice(m.index + token.length).replace(/^[ \t]+/, "");
    if (COUNT_SUFFIX.test(rest)) continue;
    const digits = token.replace(/,/g, "");
    // Ohne Tausendertrennung und siebenstellig: Barcode, Datum oder Belegnummer.
    if (!token.includes(",") && digits.length >= 7) continue;
    // Führende Null bei vier Stellen und mehr: Telefon-/Filialnummer.
    if (digits.length >= 4 && digits.startsWith("0")) continue;
    const v = Number(digits);
    if (!Number.isFinite(v) || v < 1 || v > 999_999) continue;
    out.push(v);
  }
  return out;
}

/** Stärke der Summen-Kennzeichnung einer Zeile; 0 = keine. */
function tierOf(compact: string): 0 | 1 | 2 | 3 {
  if (HARD_EXCLUDE.test(compact)) return 0;
  if (TOTAL_STRONG.test(compact)) return 3;
  if (TOTAL_TAXINC.test(compact)) return 2;
  if (TOTAL_WEAK.test(compact)) return 1;
  return 0;
}

const SOURCE_BY_TIER: Record<1 | 2 | 3, AmountSource> = {
  3: "total",
  2: "taxIncluded",
  1: "subtotal",
};

/**
 * Gesamtbetrag aus dem Belegtext lesen.
 *
 * Vorgehen: jede Zeile nach Summen-Schlüsselwörtern gewichten, den Betrag aus
 * der **stärksten** Gruppe nehmen (dort den größten — eine Summe ist nie
 * kleiner als ihre Teilsummen). Steht neben dem Schlüsselwort keine Zahl, wird
 * in den beiden Folgezeilen gesucht: bei zweispaltigen Belegen trennt die OCR
 * Beschriftung und Wert gelegentlich in eigene Zeilen.
 *
 * Findet sich kein Schlüsselwort, bleibt nur der größte Betrag **mit**
 * Währungszeichen (`source: "guess"`) — bewusst die schwächste Stufe.
 */
export function extractTotal(text: string): ReceiptReading | null {
  const lines = normalizeReceiptText(text).split("\n");
  const compact = lines.map((l) => l.replace(/[\s　]/g, ""));

  const best: Partial<Record<1 | 2 | 3, number>> = {};
  for (let i = 0; i < lines.length; i++) {
    const tier = tierOf(compact[i]);
    if (tier === 0) continue;

    let found = amountsInLine(lines[i]);
    // Wert in einer Folgezeile? Nur, solange die keine eigene Kennzeichnung
    // trägt — sonst würde die Summe den Betrag der Zwischensumme erben.
    for (let j = i + 1; found.length === 0 && j <= i + 2 && j < lines.length; j++) {
      if (tierOf(compact[j]) !== 0 || HARD_EXCLUDE.test(compact[j])) break;
      found = amountsInLine(lines[j]);
    }
    if (found.length === 0) continue;

    const value = Math.max(...found);
    if (best[tier] === undefined || value > best[tier]!) best[tier] = value;
  }

  for (const tier of [3, 2, 1] as const) {
    const v = best[tier];
    if (v !== undefined) return { yen: v, source: SOURCE_BY_TIER[tier] };
  }

  // Letzte Stufe: größter Betrag mit Währungszeichen, ohne Ausschlusszeilen.
  let guess = 0;
  for (let i = 0; i < lines.length; i++) {
    if (HARD_EXCLUDE.test(compact[i]) || !HAS_CURRENCY.test(lines[i])) continue;
    for (const v of amountsInLine(lines[i])) if (v > guess) guess = v;
  }
  return guess > 0 ? { yen: guess, source: "guess" } : null;
}

/**
 * Bereich der CJK-Schriftzeichen (Hiragana, Katakana, Kanji, Halbbreiten-Katakana).
 */
const CJK = "\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\uff66-\\uff9f";
const CJK_GAP = new RegExp(`(?<=[${CJK}])[ \\t]+(?=[${CJK}])`, "g");
const PUNCT_GAP = /\s*([-‐・･])\s*/g;

/**
 * Von der OCR eingestreute Wortabstände entfernen.
 *
 * Cloud Vision zerlegt japanischen Text in Wörter und liefert sie einzeln; beim
 * Zusammensetzen einer Zeile entstehen dadurch Lücken, die auf dem Beleg nicht
 * stehen — „セブン - イレブン" statt „セブン-イレブン". Japanisch setzt keine
 * Wortabstände, solche Lücken sind also immer Artefakt. Ohne diesen Schritt
 * greift kein einziges Markenmuster.
 *
 * Lateinische Wörter bleiben getrennt (die Lücke muss **beidseitig** von
 * CJK-Zeichen stehen); um Bindestrich und Nakaguro wird zusätzlich aufgeräumt.
 */
export function tightenJapanese(text: string): string {
  return text.replace(CJK_GAP, "").replace(PUNCT_GAP, "$1");
}

/**
 * Begriffe, die auf eine Kategorie hindeuten — mit Gewicht.
 *
 * Zwei Sorten, und der Unterschied ist Absicht:
 *  - **Fachgeschäft** (3): der Laden bestimmt die Kategorie praktisch allein.
 *    Ein Konbini-Beleg ist Essen, eine Fahrkarte ist Transport.
 *  - **Artikelbegriff** (2): schlägt einen Gemischtwarenladen, aber nicht ein
 *    Fachgeschäft.
 *  - **Gemischtwarenladen** (1): Don Quijote, Daiso, Loft verkaufen alles —
 *    dort sollen die gekauften *Artikel* entscheiden. Ein T-Shirt-Beleg von
 *    Donki ist Kleidung, nicht „Sonstiges". Mit gleichem Gewicht gäbe es
 *    stattdessen Gleichstand und damit **keine** Kategorie.
 *
 * Artikelbegriffe sind der wichtigere Teil: auf einem Kassenzettel steht der
 * Ladenname einmal, die Artikel stehen zeilenweise. Nur nach Marken zu suchen
 * lässt jeden unbekannten Laden ohne Kategorie zurück.
 */
interface Hint {
  re: RegExp;
  category: ExpenseCategory;
  weight: number;
  /** Sauberer Anzeigename — nur bei eindeutigen Marken gesetzt. */
  label?: string;
  /**
   * Worauf das Muster angewendet wird.
   *
   * `compact` (Standard) = Text **ohne** Leerzeichen — nötig für Japanisch, weil
   * die OCR dort willkürlich Lücken einstreut.
   * `text` = Text **mit** Leerzeichen — Pflicht für lateinische Begriffe, damit
   * `\b` greift. Ohne Wortgrenzen traf „TEL" in „HOTEL" und „GAP" in beliebigen
   * Wörtern; Teilwort-Kollisionen sind hier die Hauptfehlerquelle.
   */
  on?: "compact" | "text";
}

/**
 * ⚠️ **Kurze japanische Begriffe sind gefährlich.** Sie stehen als Teilwort in
 * ganz anderen Wörtern, und der Fehler ist im Ergebnis nicht zu sehen:
 *  - `パン` (Brot) steckt in „ジャパン" → jeder JAPAN-RAIL-PASS wurde „Essen".
 *  - `水` (Wasser) ist die Abkürzung für **Mittwoch**: „2026年8月19日(水)" steht
 *    auf jedem an einem Mittwoch gedruckten Beleg.
 * Beide sind deshalb durch eindeutige Varianten ersetzt. Bei neuen Begriffen
 * unter drei Zeichen erst prüfen, in welchen Wörtern sie noch vorkommen.
 *
 * ⚠️ Dieselbe Falle gibt es **zwischen** Kategorien, und dort ist sie tückischer,
 * weil sie keinen falschen Treffer erzeugt, sondern einen Gleichstand — also gar
 * keine Kategorie. Beim Einbau von KOSMETIK trat sie sofort auf: `入浴` (Baden →
 * SIGHTSEEING) steckt in `入浴剤` (Badezusatz aus der Drogerie). Ein Badezusatz
 * hätte beide Muster getroffen, 2:2 gestanden und wäre in „Sonstiges" gelandet.
 * Deshalb heißt der Sightseeing-Begriff jetzt `入浴料` (Badegebühr). Beim
 * Ergänzen also nicht nur gegen die eigene Liste prüfen, sondern gegen alle.
 */
const HINTS: readonly Hint[] = [
  // ── Fachgeschäfte (japanisch) ────────────────────────────────────────────
  { re: /セブン[-‐]?イレブン/gi, category: "ESSEN", weight: 3, label: "7-Eleven" },
  { re: /ローソン/gi, category: "ESSEN", weight: 3, label: "Lawson" },
  { re: /ファミリーマート|ファミマ/gi, category: "ESSEN", weight: 3, label: "FamilyMart" },
  { re: /ミニストップ/gi, category: "ESSEN", weight: 3, label: "Ministop" },
  { re: /スーパー|イオン|マルエツ|西友|イトーヨーカドー|業務スーパー/gi, category: "ESSEN", weight: 3, label: "Supermarkt" },
  { re: /すき家|吉野家|松屋|スターバックス|マクドナルド|居酒屋|食堂/gi, category: "ESSEN", weight: 3 },
  { re: /ポケモンセンター|アニメイト|ジャンプショップ|駿河屋|まんだらけ|ガシャポン|一番くじ/gi, category: "FIGUREN", weight: 3 },
  { re: /ユニクロ|しまむら/gi, category: "KLEIDUNG", weight: 3 },
  { re: /薬局|ドラッグ|マツモトキヨシ|マツキヨ|ツルハ|サンドラッグ|ココカラファイン|ウエルシア|コスメ|化粧品/gi, category: "KOSMETIK", weight: 3 },
  { re: /ヨドバシ|ビックカメラ|ヤマダ電機|エディオン|ケーズデンキ|ジョーシン|ソフマップ|家電/gi, category: "ELEKTRONIK", weight: 3 },
  { re: /新幹線|地下鉄|メトロ|ジャパンレールパス|レールパス/gi, category: "TRANSPORT", weight: 3 },
  { re: /美術館|博物館|水族館|動物園|展望台|スカイツリー|神社|寺/gi, category: "SIGHTSEEING", weight: 3 },
  { re: /ホテル|旅館|宿泊|民宿|ゲストハウス|素泊/gi, category: "UNTERKUNFT", weight: 3 },

  // ── Fachgeschäfte (lateinisch, mit Wortgrenzen) ──────────────────────────
  { re: /\b7[- ]?ELEVEN\b/gi, category: "ESSEN", weight: 3, label: "7-Eleven" },
  { re: /\bLAWSON\b/gi, category: "ESSEN", weight: 3, label: "Lawson" },
  { re: /\bFAMILY ?MART\b/gi, category: "ESSEN", weight: 3, label: "FamilyMart" },
  { re: /\b(AEON|MINISTOP)\b/gi, category: "ESSEN", weight: 3 },
  { re: /\b(UNIQLO|ZARA|H&M|GAP)\b/gi, category: "KLEIDUNG", weight: 3 },
  { re: /\b(MATSUMOTO ?KIYOSHI|MATSUKIYO|WELCIA|TSURUHA|SUN ?DRUG|COCOKARA|PHARMACY|DRUG ?STORE|COSMETICS?)\b/gi, category: "KOSMETIK", weight: 3, on: "text" },
  { re: /\b(YODOBASHI|BIC ?CAMERA|YAMADA ?DENKI|EDION|SOFMAP|JOSHIN)\b/gi, category: "ELEKTRONIK", weight: 3, on: "text" },
  { re: /\b(JR|RAIL ?PASS|SHINKANSEN|SUBWAY|METRO|SUICA|PASMO|ICOCA|LIMITED EXPRESS)\b/gi, category: "TRANSPORT", weight: 3, on: "text" },
  { re: /\b(MUSEUM|AQUARIUM|ZOO|TEMPLE|SHRINE|OBSERVATORY|EXHIBITION|ADMISSION)\b/gi, category: "SIGHTSEEING", weight: 3, on: "text" },
  { re: /\b(HOTEL|RYOKAN|HOSTEL|GUEST ?HOUSE|INN|ACCOMMODATION|ROOM CHARGE)\b/gi, category: "UNTERKUNFT", weight: 3, on: "text" },
  { re: /\b(ANIMATE|POKEMON CENTER)\b/gi, category: "FIGUREN", weight: 3, on: "text" },

  // ── Gemischtwarenläden: sollen von Artikeln überstimmbar sein ────────────
  // ⚠️ ヨドバシ/ビックカメラ standen früher hier. Das sind aber **Elektronik**-
  // Fachmärkte, keine Gemischtwarenläden — mit Gewicht 1 verlor der Laden gegen
  // jeden beliebigen Artikelbegriff. Jetzt oben mit Gewicht 3.
  { re: /ドン[・･]?キホーテ|ドンキ|ダイソー|セリア|ロフト|東急ハンズ/gi, category: "SONSTIGES", weight: 1 },
  { re: /\b(DON ?QUIJOTE|DAISO|LOFT|TOKYU ?HANDS)\b/gi, category: "SONSTIGES", weight: 1, on: "text" },

  // ── Artikelbegriffe (japanisch) ─────────────────────────────────────────
  { re: /おにぎり|弁当|食パン|菓子パン|サンドイッチ|お茶|コーヒー|ビール|ラーメン|うどん|そば|寿司|定食|カレー|アイス|牛丼|唐揚|サラダ|牛乳|ジュース|チョコ|菓子|飲料水|ミネラルウォーター/gi, category: "ESSEN", weight: 2 },
  { re: /フィギュア|ぬいぐるみ|ガチャ|プライズ|アクリル|キーホルダー|バッジ|トレカ|プラモ|くじ|ミニカー/gi, category: "FIGUREN", weight: 2 },
  { re: /Tシャツ|シャツ|パンツ|ズボン|靴下|スカート|ジャケット|パーカー|帽子|キャップ|下着|手袋|マフラー/gi, category: "KLEIDUNG", weight: 2 },
  { re: /化粧水|乳液|美容液|シャンプー|コンディショナー|トリートメント|日焼け止め|ファンデーション|口紅|リップ|マスカラ|アイシャドウ|洗顔|クレンジング|ハンドクリーム|香水|石鹸|ボディソープ|歯磨|入浴剤|目薬|絆創膏|風邪薬|胃腸薬|サプリメント|マスク/gi, category: "KOSMETIK", weight: 2 },
  { re: /充電器|モバイルバッテリー|イヤホン|ヘッドホン|カメラ|メモリーカード|SDカード|変換プラグ|ケーブル|電池|炊飯器|ドライヤー|ゲーム機|スマホ/gi, category: "ELEKTRONIK", weight: 2 },
  { re: /乗車券|特急券|指定席|自由席|運賃|きっぷ|切符|タクシー|チャージ|バス(?!タオル|ケット|ソルト|ローブ)/gi, category: "TRANSPORT", weight: 2 },
  { re: /入場料|入館料|拝観料|入園|温泉|入浴料|ガイド/gi, category: "SIGHTSEEING", weight: 2 },
  { re: /宿泊料|泊分|チェックアウト/gi, category: "UNTERKUNFT", weight: 2 },
  { re: /洗剤|文房具|ノート(?!パソコン|PC)|傘|タオル|雑貨/gi, category: "SONSTIGES", weight: 2 },

  // ── Artikelbegriffe (lateinisch) ────────────────────────────────────────
  { re: /\b(RESTAURANT|CAFE|COFFEE|RAMEN|SUSHI|BAKERY|BEER|LUNCH|DINNER|BENTO)\b/gi, category: "ESSEN", weight: 2, on: "text" },
  { re: /\b(T-?SHIRT|SHIRT|JACKET|TROUSERS|SOCKS|HOODIE)\b/gi, category: "KLEIDUNG", weight: 2, on: "text" },
  { re: /\b(SHAMPOO|LOTION|SUNSCREEN|SKIN ?CARE|SERUM|LIPSTICK|PERFUME|MASCARA|TOOTHPASTE|SOAP)\b/gi, category: "KOSMETIK", weight: 2, on: "text" },
  { re: /\b(CHARGER|EARPHONES?|HEADPHONES?|CAMERA|ADAPTER|POWER ?BANK|SD ?CARD|CABLE|BATTER(Y|IES))\b/gi, category: "ELEKTRONIK", weight: 2, on: "text" },
  { re: /\b(FARE|ONE-?WAY|RESERVED SEAT|EXCHANGE ORDER)\b/gi, category: "TRANSPORT", weight: 2, on: "text" },
  { re: /\b(FIGURE|PLUSH|KEYCHAIN|TRADING CARD)\b/gi, category: "FIGUREN", weight: 2, on: "text" },
  { re: /\b(ROOM RATE|LODGING|PER NIGHT|NIGHTS? STAY)\b/gi, category: "UNTERKUNFT", weight: 2, on: "text" },
  { re: /\b(SOUVENIR|STATIONERY|UMBRELLA|TOWEL)\b/gi, category: "SONSTIGES", weight: 2, on: "text" },
];

/** Zeilen, die als Name nichts hergeben (Kopfzeilen, Kundenanrede, Nummern). */
// ⚠️ Lateinische Begriffe MIT Wortgrenze: „TEL" ohne \b traf „HOTEL" und
// verwarf damit genau die Zeile, die den Ladennamen trug.
const LABEL_NOISE = /領収|レシート|明細|様|御中|株式会社|電話|〒|住所|登録番号|\b(TEL|RECEIPT|INVOICE)\b/i;

/**
 * Wie oft ein Muster trifft — nach oben begrenzt.
 *
 * Ohne Deckel würde ein einziges häufiges Wort („水" auf einem Getränkebeleg)
 * jede andere Kategorie überstimmen. Drei Treffer sind aussagekräftig, jeder
 * weitere fügt nichts hinzu.
 */
function hitCount(text: string, re: RegExp): number {
  const m = text.match(re);
  return m ? Math.min(m.length, 3) : 0;
}

export interface ReceiptGuess {
  /** Nur gesetzt, wenn ein Begriff wirklich passte — sonst nicht überschreiben. */
  category?: ExpenseCategory;
  label?: string;
}

/**
 * Kategorie und Bezeichnung schätzen.
 *
 * **Punkte statt erster Treffer:** die Treffer aller Muster werden je Kategorie
 * summiert (Gewicht × Häufigkeit), gewinnt die höchste Summe. Ein
 * `find()`-Ansatz hing an der Reihenfolge der Liste — wer ein Muster einfügte,
 * verschob unbemerkt Ergebnisse.
 *
 * Beides bleibt bewusst leer, wenn nichts sicher passt — auch bei **Gleichstand**:
 * einen falschen Wert ins Formular zu schreiben ist schlechter, als das Feld dem
 * Nutzer zu überlassen. Eine falsche Kategorie fällt in der Auswertung erst
 * Wochen später auf.
 */
export function guessMeta(text: string): ReceiptGuess {
  const norm = tightenJapanese(normalizeReceiptText(text));
  // Gegen den vollständig lückenlosen Text prüfen: so greifen die Muster auch,
  // wenn die OCR mitten in einen Markennamen ein Leerzeichen gesetzt hat.
  const compact = norm.replace(/[\s　]/g, "");

  const scores = new Map<ExpenseCategory, number>();
  let brand: Hint | undefined;
  for (const h of HINTS) {
    const hits = hitCount(h.on === "text" ? norm : compact, h.re);
    if (hits === 0) continue;
    scores.set(h.category, (scores.get(h.category) ?? 0) + hits * h.weight);
    // Ersten Markennamen für die Bezeichnung merken.
    if (h.label && !brand) brand = h;
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const clear = ranked.length > 0 && (ranked.length === 1 || ranked[0][1] > ranked[1][1]);
  const category = clear ? ranked[0][0] : undefined;

  let label = brand?.label;
  if (!label) {
    // Ohne Markentreffer die erste Zeile nehmen, die wie ein Name aussieht —
    // auf Belegen steht der Laden oben.
    label = norm
      .split("\n")
      .map((l) => l.trim())
      .find(
        (l) =>
          l.length >= 2 &&
          l.length <= 40 &&
          !LABEL_NOISE.test(l) &&
          // nicht überwiegend Zahlen/Zeichen (Datum, Betrag, Belegnummer)
          l.replace(/[^0-9\s.,:/¥円-]/g, "").length / l.length < 0.5,
      );
  }

  return { category, label: label?.slice(0, 40) };
}

/** Ein von der OCR erkanntes Wort mit seiner Lage im Bild. */
export interface OcrWord {
  text: string;
  /** Linke Kante (für die Sortierung innerhalb einer Zeile). */
  x: number;
  /** Vertikale Mitte. */
  y: number;
  /** Höhe — Maßstab für „liegt das noch in derselben Zeile?". */
  h: number;
}

/**
 * Zeilen aus Wortkoordinaten rekonstruieren.
 *
 * **Warum nicht einfach `fullTextAnnotation.text`?** Dessen Leserichtung ist bei
 * zweispaltigen Belegen nicht verlässlich: die OCR liefert dann gern erst alle
 * Beschriftungen (合計 / お預り / お釣り) und danach alle Werte. „合計" stünde
 * ohne Zahl da, und der Rückfall „größter Betrag" würde ausgerechnet das
 * hingelegte Geld greifen — also genau den Fehler, den dieses Modul vermeiden
 * soll. Über die y-Koordinaten ist die Zuordnung eindeutig, unabhängig davon,
 * in welcher Reihenfolge die OCR die Wörter ausgibt.
 *
 * Toleranz relativ zur **mittleren** Worthöhe (nicht absolut): Belegfotos kommen
 * in jeder Auflösung, ein Pixelwert wäre je nach Kamera zu streng oder zu grob.
 */
export function rowsFromWords(words: readonly OcrWord[]): string[] {
  if (words.length === 0) return [];

  const heights = words.map((w) => w.h).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)] || 1;
  const tolerance = medianH * 0.6;

  const rows: { y: number; items: OcrWord[] }[] = [];
  for (const w of [...words].sort((a, b) => a.y - b.y)) {
    const row = rows.find((r) => Math.abs(r.y - w.y) <= tolerance);
    if (row) {
      row.items.push(w);
      // Laufender Mittelwert: hält die Zeile auch bei leicht schräg
      // fotografierten Belegen zusammen.
      row.y = row.items.reduce((s, i) => s + i.y, 0) / row.items.length;
    } else {
      rows.push({ y: w.y, items: [w] });
    }
  }

  return rows
    .sort((a, b) => a.y - b.y)
    .map((r) =>
      r.items
        .sort((a, b) => a.x - b.x)
        .map((i) => i.text)
        .join(" "),
    );
}
