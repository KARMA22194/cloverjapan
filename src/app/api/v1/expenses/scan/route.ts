import type { NextRequest } from "next/server";
import { z } from "zod";

import { ApiError, badRequest, handle, ok, readJson } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { enforceRateLimit } from "@/lib/rate";

const CATEGORIES = ["ESSEN", "FIGUREN", "KLEIDUNG", "SIGHTSEEING", "TRANSPORT", "SONSTIGES"] as const;
type Category = (typeof CATEGORIES)[number];

const bodySchema = z.object({
  image: z.string().startsWith("data:image/", "Bild als Data-URL erwartet.").max(8_000_000),
});

const PROMPT =
  `Du bist ein Beleg-Parser für eine Japan-Reise-Budget-App. Lies von diesem ` +
  `Kassenzettel (meist japanisch):\n` +
  `1. den tatsächlich bezahlten GESAMTBETRAG in Yen (Ganzzahl, ohne Symbol/Tausenderpunkte),\n` +
  `2. die passendste Kategorie aus [ESSEN, FIGUREN, KLEIDUNG, SIGHTSEEING, TRANSPORT, SONSTIGES],\n` +
  `3. ein kurzes deutsches Label (max. 40 Zeichen, z. B. Laden oder Art des Einkaufs).\n` +
  `Antworte AUSSCHLIESSLICH mit kompaktem JSON: {"yen": <number>, "category": "<KATEGORIE>", "label": "<text>"}. ` +
  `Wenn kein Gesamtbetrag lesbar ist, setze yen auf 0.`;

/** Extrahiert das erste JSON-Objekt aus einem (evtl. umschlossenen) Text. */
function parseJsonBlock(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("kein JSON");
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * POST /api/v1/expenses/scan { image: dataURL }
 * Liest per Claude Vision Betrag/Kategorie/Label vom Kassenzettel.
 * Ohne ANTHROPIC_API_KEY → 422 (dann manuell eintippen).
 */
export function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await enforceRateLimit(`receipt-scan:${user.id}`, 30, 60 * 60 * 1000);

    const { image } = bodySchema.parse(await readJson(req));
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new ApiError(422, "Beleg-Scan ist nicht konfiguriert (kein API-Key). Bitte manuell eintragen.");
    }

    const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(image);
    if (!m) throw badRequest("Ungültiges Bildformat.");
    const [, mediaType, base64] = m;

    const model = process.env.RECEIPT_MODEL ?? "claude-haiku-4-5-20251001";
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
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
    if (!res.ok) throw new ApiError(502, "Beleg-Erkennung nicht erreichbar.");

    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.find((c) => c.type === "text")?.text ?? "";

    let parsed: { yen?: unknown; category?: unknown; label?: unknown };
    try {
      parsed = parseJsonBlock(text) as typeof parsed;
    } catch {
      throw new ApiError(422, "Beleg konnte nicht gelesen werden. Bitte manuell eintragen.");
    }

    const yen = Math.max(0, Math.round(Number(parsed.yen) || 0));
    const category: Category = CATEGORIES.includes(parsed.category as Category)
      ? (parsed.category as Category)
      : "SONSTIGES";
    const label = String(parsed.label ?? "").slice(0, 40);

    return ok({ yen, category, label });
  });
}
