import type { NextRequest } from "next/server";
import { z } from "zod";

import { handle, ok, readJson } from "@/lib/api/http";
import { requireTripUser } from "@/lib/api/session";
import { enforceRateLimit } from "@/lib/rate";
import { dateStr } from "@/lib/api/dates";
import { toDateParam } from "@/lib/time";
import { getTripStops, getTripStopsForDate, replaceTripStops } from "@/lib/services/tripStops";

const stopSchema = z.object({
  id: z.string().min(1).max(100),
  // Lange Geocoder-Labels kürzen statt ablehnen (siehe trip-hotels/schema.ts).
  label: z
    .string()
    .trim()
    .min(1)
    .max(5000)
    .transform((s) => s.slice(0, 300)),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  active: z.boolean().optional().default(true),
  date: dateStr,
  note: z.string().max(500).optional().default(""),
});
const putBody = z.object({ stops: z.array(stopSchema).max(200) });

const toDto = (s: {
  clientId: string;
  label: string;
  lat: number;
  lng: number;
  active: boolean;
  date: Date | null;
  note: string;
  createdByName: string;
}) => ({
  // Dem Client seine stabile Kennung als `id` zurückgeben (der server-seitige PK
  // bleibt intern) — so bleibt der Client-Code unverändert.
  id: s.clientId,
  label: s.label,
  lat: s.lat,
  lng: s.lng,
  active: s.active,
  // DB hält ein echtes Date; nach außen bleibt es YYYY-MM-DD.
  date: s.date ? toDateParam(s.date) : null,
  note: s.note,
  by: s.createdByName,
});

/**
 * GET /api/v1/trip-stops — Stopps der Reise (in Reihenfolge).
 * Mit `?date=YYYY-MM-DD`: nur Stopps dieses Reisetags (für den Tagesplaner).
 */
export function GET(req: NextRequest) {
  return handle(async () => {
    const { tripId } = await requireTripUser();
    const date = req.nextUrl.searchParams.get("date");
    const stops = date
      ? await getTripStopsForDate(tripId, date)
      : await getTripStops(tripId);
    return ok(stops.map(toDto));
  });
}

/** PUT /api/v1/trip-stops — komplette Stopp-Liste ersetzen. */
export function PUT(req: NextRequest) {
  return handle(async () => {
    const { user, tripId } = await requireTripUser();
    // Voll-Replace mit bis zu 200 Stopps (~1 MB Request) — drosseln, damit ein
    // einzelnes Konto die DB nicht in einer Schleife vollschreibt.
    await enforceRateLimit(`trip-stops-put:${user.id}`, 120, 60 * 60 * 1000);
    const { stops } = putBody.parse(await readJson(req));
    return ok((await replaceTripStops(tripId, stops, user.name)).map(toDto));
  });
}
