import type { NextRequest } from "next/server";
import { z } from "zod";

import { handle, ok, readJson } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { getActiveTripId } from "@/lib/services/trip";
import { getTripStops, getTripStopsForDate, replaceTripStops } from "@/lib/services/tripStops";

const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum muss YYYY-MM-DD sein.")
  .nullish();

const stopSchema = z.object({
  id: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  date: dateStr,
});
const putBody = z.object({ stops: z.array(stopSchema).max(200) });

const toDto = (s: {
  id: string;
  label: string;
  lat: number;
  lng: number;
  date: string | null;
  createdByName: string;
}) => ({
  id: s.id,
  label: s.label,
  lat: s.lat,
  lng: s.lng,
  date: s.date,
  by: s.createdByName,
});

/**
 * GET /api/v1/trip-stops — Stopps der Reise (in Reihenfolge).
 * Mit `?date=YYYY-MM-DD`: nur Stopps dieses Reisetags (für den Tagesplaner).
 */
export function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const tripId = await getActiveTripId(user.id);
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
    const user = await requireUser();
    const tripId = await getActiveTripId(user.id);
    const { stops } = putBody.parse(await readJson(req));
    return ok((await replaceTripStops(tripId, stops, user.name)).map(toDto));
  });
}
