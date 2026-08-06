import type { NextRequest } from "next/server";
import { z } from "zod";

import { ApiError, handle, ok, readJson } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { enforceRateLimit } from "@/lib/rate";
import { getActiveTripId } from "@/lib/services/trip";
import { geocodeJapan } from "@/lib/services/geo";
import { addTripStop } from "@/lib/services/tripStops";

const body = z.object({
  q: z.string().min(2, "Text zu kurz.").max(300),
  // optionaler Reisetag (wenn aus einem Tagesplaner-Tag übernommen)
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
});

/**
 * POST /api/v1/trip-stops/from-text — löst Freitext (z. B. eine Tagesplaner-Aufgabe)
 * zu einem Ort in Japan auf und hängt ihn als Stopp an den Reiseplaner an.
 * 422, wenn kein Ort erkannt wurde.
 */
export function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    // Nominatim-Politeness: begrenzte Auflöse-Versuche pro Nutzer.
    await enforceRateLimit(`geocode:${user.id}`, 30, 60 * 1000);

    const { q, date } = body.parse(await readJson(req));
    const tripId = await getActiveTripId(user.id);

    const hit = await geocodeJapan(q);
    if (!hit) throw new ApiError(422, "Kein Ort in Japan erkannt.");

    const stop = await addTripStop(tripId, { ...hit, date: date ?? null }, user.name);
    // Dem Client die stabile Kennung (clientId) als `id` zurückgeben (wie im GET-DTO).
    return ok(
      { id: stop.clientId, label: stop.label, lat: stop.lat, lng: stop.lng, by: stop.createdByName },
      201,
    );
  });
}
