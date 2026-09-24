import type { NextRequest } from "next/server";
import { z } from "zod";
import { ExpenseCategory } from "@prisma/client";

import { ApiError, badRequest, handle, ok, readJson } from "@/lib/api/http";
import { requirePermission, requireTripUser } from "@/lib/api/session";
import { enforceRateLimit } from "@/lib/rate";
import { extractTotal, guessMeta, rowsFromWords, type AmountSource, type OcrWord } from "@/lib/receipt";
import { categoryForLabel } from "@/lib/services/expensesService";

// Beide Erkenner sind externe Aufrufe, im Rückfall auch zwei hintereinander.
// Ohne eigene Obergrenze bricht Vercel die Funktion vorher ab.
export const maxDuration = 30;

// Erlaubte Kategorien aus dem Prisma-Enum ableiten — eine Quelle statt einer
// zweiten Liste, die beim Erweitern vergessen werden kann.
const CATEGORIES = Object.values(ExpenseCategory);
type Category = ExpenseCategory;

// Anthropic lehnt Bilder über 5 MB ab. Die Data-URL ist Base64, also ~4/3 der
// Rohgröße — mit 8 MB String liefen ~6 MB Bilddaten durch und endeten verlässlich
// in einem 502 statt in einer verständlichen Meldung.
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

/* ──────────────────────────── Claude Vision ──────────────────────────────── */

const PROMPT =
  `Du bist ein Beleg-Parser für eine Japan-Reise-Budget-App. Lies von diesem ` +
  `Kassenzettel (meist japanisch):\n` +
  `1. den tatsächlich bezahlten GESAMTBETRAG in Yen (Ganzzahl, ohne Symbol/Tausenderpunkte),\n` +
  // ⚠️ Aus dem Enum abgeleitet, nicht abgetippt: eine neue Kategorie im Schema
  // muss auch hier ankommen, sonst schlägt Claude sie nie vor.
  `2. die passendste Kategorie aus [${CATEGORIES.join(", ")}],\n` +
  `3. ein kurzes deutsches Label (max. 40 Zeichen, z. B. Laden oder Art des Einkaufs).\n` +
  `Achtung: „お預り" ist das hingelegte Geld und „お釣り" das Wechselgeld — gemeint ist „合計".\n` +
  `Antworte AUSSCHLIESSLICH mit kompaktem JSON: {"yen": <number>, "category": "<KATEGORIE>", "label": "<text>"}. ` +
  `Wenn kein Gesamtbetrag lesbar ist, setze yen auf 0.`;

/** Extrahiert das erste JSON-Objekt aus einem (evtl. umschlossenen) Text. */
function parseJsonBlock(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("kein JSON");
  return JSON.parse(text.slice(start, end + 1));
}

async function readWithClaude(base64: string, mediaType: string, key: string): Promise<Reading | null> {
  const model = process.env.RECEIPT_MODEL ?? "claude-haiku-4-5-20251001";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    }),
  });
  if (!res.ok) return null;

  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = data.content?.find((c) => c.type === "text")?.text ?? "";

  let parsed: { yen?: unknown; category?: unknown; label?: unknown };
  try {
    parsed = parseJsonBlock(text) as typeof parsed;
  } catch {
    return null;
  }

  const yen = Math.max(0, Math.round(Number(parsed.yen) || 0));
  return {
    yen,
    category: CATEGORIES.includes(parsed.category as Category) ? (parsed.category as Category) : undefined,
    label: String(parsed.label ?? "").slice(0, 40),
    source: yen > 0 ? "total" : undefined,
  };
}

/* ────────────────────────────── Route ────────────────────────────────────── */

type Engine = "vision" | "claude";

/**
 * Reihenfolge der Erkenner.
 *
 * Standard `auto`: erst Vision (im Gratis-Kontingent von Google, 1.000
 * Bilder/Monat), und nur wenn dabei **kein** Betrag herauskommt, Claude — das
 * kostet Bruchteile eines Cents und rettet die schwierigen Belege. Über
 * `RECEIPT_ENGINE=vision|claude` lässt sich das festnageln.
 */
function engineOrder(): Engine[] {
  const mode = process.env.RECEIPT_ENGINE?.toLowerCase();
  if (mode === "vision") return ["vision"];
  if (mode === "claude") return ["claude"];
  return ["vision", "claude"];
}

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
async function withCategory(reading: Reading, engine: Engine, tripId: string) {
  if (reading.category) return { ...reading, engine, categoryFrom: "keywords" as const };
  const learned = reading.label ? await categoryForLabel(tripId, reading.label) : null;
  if (learned) return { ...reading, engine, category: learned, categoryFrom: "history" as const };
  return {
    ...reading,
    engine,
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
    const claudeKey = process.env.ANTHROPIC_API_KEY;

    let configured = false;
    let fallback: (Reading & { engine: Engine }) | null = null;

    for (const engine of engineOrder()) {
      const key = engine === "vision" ? visionKey : claudeKey;
      if (!key) continue;
      configured = true;

      const reading =
        engine === "vision"
          ? await readWithVision(base64, key)
          : await readWithClaude(base64, mediaType, key);
      if (!reading) continue;

      // Ein Betrag ist das Abbruchkriterium. Ohne Betrag das Ergebnis merken:
      // Kategorie und Name sind auch dann nützlich, und das Foto wird beim
      // Speichern ohnehin angehängt.
      if (reading.yen > 0) return ok(await withCategory(reading, engine, tripId));
      fallback ??= { ...reading, engine };
    }

    if (fallback) return ok(await withCategory(fallback, fallback.engine, tripId));
    if (!configured) {
      throw new ApiError(422, "Beleg-Scan ist nicht konfiguriert (kein API-Key). Bitte manuell eintragen.");
    }
    throw new ApiError(422, "Beleg konnte nicht gelesen werden. Bitte manuell eintragen.");
  });
}
