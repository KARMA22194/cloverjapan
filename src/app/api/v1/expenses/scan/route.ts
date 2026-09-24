import type { NextRequest } from "next/server";
import { z } from "zod";
import { ExpenseCategory } from "@prisma/client";

import { ApiError, badRequest, handle, ok, readJson } from "@/lib/api/http";
import { requirePermission, requireTripUser } from "@/lib/api/session";
import { consumeRateLimit, enforceRateLimit } from "@/lib/rate";
import { extractTotal, guessMeta, rowsFromWords, type AmountSource, type OcrWord } from "@/lib/receipt";
import { categoryForLabel } from "@/lib/services/expensesService";

// Der Erkenner ist ein externer Aufruf mit einem mehrere MB großen Bild im
// Rumpf. Ohne eigene Obergrenze bricht Vercel die Funktion vorher ab.
export const maxDuration = 30;

/* ─────────────────────── Monatskontingent (Kosten) ──────────────────────── */

/**
 * Obergrenze für Vision-Aufrufe **pro Kalendermonat, über alle Nutzer und Reisen**.
 *
 * Die bestehenden Grenzen (30/h pro Nutzer, 40/Tag pro Reise) sind lokal: sie
 * bremsen Einzelne, nicht die Summe. Das Gratis-Kontingent von Google hängt aber
 * am **Projekt** — alle Reisen zahlen auf denselben Zähler ein, und schon eine
 * einzige Reise dürfte damit rechnerisch 1.200 Bilder im Monat verbrauchen.
 *
 * ⚠️ Über dem Freikontingent hört Google nicht auf, sondern **rechnet ab** (Cloud
 * Vision setzt ein aktives Rechnungskonto voraus). Die Quota-Einstellung in der
 * Google Cloud hilft dagegen nicht: sie begrenzt Aufrufe pro **Minute**, nicht pro
 * Monat. Diese Schranke hier ist deshalb die einzige Stelle in der App, an der die
 * Kosten wirklich enden — entsprechend konservativ (950 von 1.000).
 */
const VISION_MONTHLY_LIMIT = Number(process.env.VISION_MONTHLY_LIMIT ?? 950);

/**
 * Schlüssel **pro Kalendermonat** (UTC), weil Google genau so abrechnet.
 *
 * Ein rollierendes 30-Tage-Fenster wäre hier falsch: läuft es Mitte des Monats
 * ab, ließe es im selben Kalendermonat fast das Doppelte durch. Mit dem Monat im
 * Schlüssel beginnt am Monatsersten automatisch ein frischer Zähler.
 */
function visionQuotaKey(now: Date): string {
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `vision-quota:${now.getUTCFullYear()}-${month}`;
}

/** Millisekunden bis zum Monatswechsel — so verfällt die Zeile von selbst. */
function msUntilNextMonth(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) - now.getTime();
}

// Erlaubte Kategorien aus dem Prisma-Enum ableiten — eine Quelle statt einer
// zweiten Liste, die beim Erweitern vergessen werden kann.
const CATEGORIES = Object.values(ExpenseCategory);
type Category = ExpenseCategory;

// 5 MB Rohbild. Die Grenze stammt ursprünglich von Anthropic (zweite Stufe,
// inzwischen entfernt), bleibt aber richtig: die Data-URL ist Base64 und damit
// ~4/3 der Rohgröße, und beides muss in den 30 s der Vercel-Funktion hoch- und
// weitergeladen werden. Ohne die Grenze endete ein großes Handyfoto verlässlich
// in einem Timeout oder 502 statt in einer verständlichen Meldung.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_DATA_URL_LEN = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 100; // + Präfix

/** Vom Anbieter unterstützte Bildtypen — kein SVG (aktive Inhalte), kein Freitext. */
const ALLOWED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** Signatur der erlaubten Formate (Magic Bytes) — belegt, dass es wirklich ein Bild ist. */
function sniffImageType(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return "image/png";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP")
    return "image/webp";
  if (buf.length >= 6 && buf.subarray(0, 6).toString("ascii").startsWith("GIF8")) return "image/gif";
  return null;
}

const bodySchema = z.object({
  image: z.string().startsWith("data:image/", "Bild als Data-URL erwartet.").max(MAX_DATA_URL_LEN),
});

/** Ergebnis eines Erkenners. `category`/`source` bleiben offen, wenn unklar. */
interface Reading {
  yen: number;
  category?: Category;
  label: string;
  source?: AmountSource;
}

/* ────────────────────────── Google Cloud Vision ──────────────────────────── */

interface VisionVertex {
  x?: number;
  y?: number;
}
interface VisionAnnotation {
  description?: string;
  boundingPoly?: { vertices?: VisionVertex[] };
}

/**
 * Vision-Wortkästen in das Format der Zeilenrekonstruktion übersetzen.
 *
 * `textAnnotations[0]` ist der Gesamttext, ab Index 1 kommen die Einzelwörter —
 * die brauchen wir, weil erst die Koordinaten Beschriftung und Betrag verlässlich
 * derselben Zeile zuordnen (siehe `rowsFromWords`).
 */
function toOcrWords(annotations: VisionAnnotation[]): OcrWord[] {
  const words: OcrWord[] = [];
  for (const a of annotations.slice(1)) {
    const text = a.description?.trim();
    const vs = a.boundingPoly?.vertices;
    if (!text || !vs || vs.length === 0) continue;
    const xs = vs.map((v) => v.x ?? 0);
    const ys = vs.map((v) => v.y ?? 0);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    words.push({ text, x: Math.min(...xs), y: (top + bottom) / 2, h: Math.max(1, bottom - top) });
  }
  return words;
}

/**
 * Beleg per Cloud Vision lesen (OCR) und den Text selbst auswerten.
 *
 * `DOCUMENT_TEXT_DETECTION` statt `TEXT_DETECTION`: es ist auf dicht bedruckte
 * Vorlagen ausgelegt und liefert bei Thermodruck spürbar weniger Ausfälle.
 * `languageHints` verhindert, dass Kana als lateinische Zeichen geraten werden.
 *
 * Vision liefert **nur Text** — Betrag, Kategorie und Name entstehen in
 * `@/lib/receipt`, geprüft über `e2e/receipt-parse.ts`.
 */
async function readWithVision(base64: string, key: string): Promise<Reading | null> {
  const res = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            image: { content: base64 },
            features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
            imageContext: { languageHints: ["ja", "en"] },
          },
        ],
      }),
    },
  );
  if (!res.ok) return null;

  const data = (await res.json()) as {
    responses?: {
      error?: { message?: string };
      textAnnotations?: VisionAnnotation[];
      fullTextAnnotation?: { text?: string };
    }[];
  };
  const first = data.responses?.[0];
  if (!first || first.error) return null;

  // Zeilen bevorzugt aus den Koordinaten; nur wenn Vision keine Wortkästen
  // mitgibt, bleibt die (unzuverlässige) Leserichtung des Gesamttexts.
  const words = toOcrWords(first.textAnnotations ?? []);
  const text = words.length > 0 ? rowsFromWords(words).join("\n") : (first.fullTextAnnotation?.text ?? "");
  if (!text.trim()) return null;

  const total = extractTotal(text);
  const meta = guessMeta(text);
  return {
    yen: total?.yen ?? 0,
    category: meta.category,
    label: meta.label ?? "",
    source: total?.source,
  };
}

/* ────────────────────────────── Route ────────────────────────────────────── */

/**
 * Kategorie festlegen — drei Quellen, `categoryFrom` sagt welche.
 *
 * 1. `keywords` — Stichwörter/Artikelbegriffe aus `@/lib/receipt`.
 * 2. `history` — dieselbe Bezeichnung wurde in dieser Reise schon einmal
 *    einsortiert (`categoryForLabel`).
 * 3. `fallback` — **`SONSTIGES`**, wenn beides nichts ergibt.
 *
 * ⚠️ Stufe 3 ist wichtiger, als sie aussieht. Das Feld einfach *nicht* zu setzen
 * war die schlechtere Wahl: das Formular steht auf `ESSEN` voreingestellt
 * (`ExpenseCalculator`), „nicht überschreiben" hieß also in der Praxis „bleibt
 * Essen" — ein unbekannter Beleg wurde still zu Essen. `SONSTIGES` ist die
 * Sammelkategorie und benennt das Nichtwissen, statt es zu verstecken.
 *
 * Die Entscheidung liegt hier und **nicht** in `guessMeta`: das Modul bleibt bei
 * „unbekannt = undefined" und damit prüfbar; welche Kategorie ein unbekannter
 * Beleg bekommt, ist eine Produktfrage und gehört an eine Stelle.
 */
async function withCategory(reading: Reading, tripId: string) {
  if (reading.category) return { ...reading, categoryFrom: "keywords" as const };
  const learned = reading.label ? await categoryForLabel(tripId, reading.label) : null;
  if (learned) return { ...reading, category: learned, categoryFrom: "history" as const };
  return {
    ...reading,
    category: "SONSTIGES" as Category,
    categoryFrom: "fallback" as const,
  };
}

/**
 * POST /api/v1/expenses/scan { image: dataURL }
 * Liest Betrag/Kategorie/Label vom Kassenzettel.
 * Ohne konfigurierten Erkenner → 422 (dann manuell eintippen).
 */
export function POST(req: NextRequest) {
  return handle(async () => {
    const { user, tripId } = await requireTripUser();
    // Recht **vor** dem Rate-Limit: ein abgewiesener Aufruf soll kein Budget
    // verbrauchen, sonst könnte ein Unberechtigter das Kontingent der
    // Berechtigten leerlaufen lassen.
    requirePermission(user, "canAiScan");
    // Zwei Grenzen: die persönliche gegen versehentliche Schleifen, die
    // reiseweite gegen sechs Mitglieder, die gemeinsam das Monatskontingent
    // von Vision aufbrauchen (40/Tag hält eine zweiwöchige Reise unter ~560
    // der 1.000 freien Bilder).
    await enforceRateLimit(`receipt-scan:${user.id}`, 30, 60 * 60 * 1000);
    await enforceRateLimit(`receipt-scan-trip:${tripId}`, 40, 24 * 60 * 60 * 1000);

    const { image } = bodySchema.parse(await readJson(req));

    const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(image);
    if (!m) throw badRequest("Ungültiges Bildformat.");
    const [, declaredType, base64] = m;
    if (!ALLOWED_MEDIA_TYPES.has(declaredType)) {
      throw badRequest("Nur JPEG, PNG, WebP oder GIF werden unterstützt.");
    }

    // Dem angegebenen Typ nicht vertrauen: an den Magic Bytes prüfen, dass es
    // wirklich ein Bild dieses Formats ist, und die **Roh**größe begrenzen.
    const buf = Buffer.from(base64, "base64");
    if (buf.byteLength > MAX_IMAGE_BYTES) {
      throw badRequest("Bild zu groß (max. 5 MB). Bitte mit weniger Auflösung aufnehmen.");
    }
    const mediaType = sniffImageType(buf);
    if (!mediaType || mediaType !== declaredType) {
      throw badRequest("Die Datei ist kein gültiges Bild.");
    }

    const visionKey = process.env.GOOGLE_VISION_API_KEY;
    if (!visionKey) {
      throw new ApiError(422, "Beleg-Scan ist nicht konfiguriert (kein API-Key). Bitte manuell eintragen.");
    }

    // Erst unmittelbar vor dem externen Aufruf zählen — alles davor (falsches
    // Format, zu großes Bild) kostet nichts und darf das Kontingent nicht
    // schmälern.
    const now = new Date();
    const withinQuota = await consumeRateLimit(
      visionQuotaKey(now),
      VISION_MONTHLY_LIMIT,
      msUntilNextMonth(now),
    );
    if (!withinQuota) {
      throw new ApiError(
        429,
        `Das Kontingent für den Beleg-Scan ist für diesen Monat aufgebraucht ` +
          `(${VISION_MONTHLY_LIMIT} Belege). Bitte den Betrag von Hand eintragen — ` +
          `am Monatsersten geht es wieder.`,
      );
    }

    const reading = await readWithVision(base64, visionKey);
    // Auch ohne Betrag ist das Ergebnis brauchbar: Kategorie und Name stehen
    // im Formular, und das Foto wird beim Speichern ohnehin angehängt.
    if (reading) return ok(await withCategory(reading, tripId));

    throw new ApiError(422, "Beleg konnte nicht gelesen werden. Bitte manuell eintragen.");
  });
}
