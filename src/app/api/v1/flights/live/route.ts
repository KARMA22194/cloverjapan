import type { NextRequest } from "next/server";

import { badRequest, handle, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { enforceRateLimit } from "@/lib/rate";
import { fetchLiveStatus } from "@/lib/services/flightStatus";

/**
 * GET /api/v1/flights/live?number=LH716&date=YYYY-MM-DD
 *
 * Live-Status über AeroDataBox: Status/Verspätung, Terminal, Check-in-Schalter,
 * Gate (Abflug) sowie Terminal, Gate und Kofferband (Ankunft).
 * Gate/Schalter/Band werden vom Dienst i. d. R. erst wenige Stunden vor Abflug
 * belegt — vorher sind die Felder leer. Ohne API-Key → 422.
 *
 * ⚠️ Der eigentliche Abruf steckt in `services/flightStatus.ts` und nicht mehr
 * hier: der Cron-Lauf (`/api/v1/cron/flight-status`) braucht denselben Weg, und
 * vor allem denselben **Monatszähler**. Zwei Abrufpfade hätten bedeutet, dass
 * die Kostenbremse nur für einen von beiden gilt.
 */
export function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await enforceRateLimit(`flight-live:${user.id}`, 60, 60 * 60 * 1000);

    const number = (req.nextUrl.searchParams.get("number") ?? "").toUpperCase().replace(/\s+/g, "");
    const date = req.nextUrl.searchParams.get("date") ?? "";
    if (!/^[A-Z0-9]{3,10}$/.test(number)) throw badRequest("Ungültige Flugnummer (z. B. LH716).");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw badRequest("Ungültiges Datum (YYYY-MM-DD).");

    return ok(await fetchLiveStatus(number, date));
  });
}
