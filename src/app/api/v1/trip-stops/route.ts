import type { NextRequest } from "next/server";
import { z } from "zod";

import { handle, ok, readJson } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { getActiveTripId } from "@/lib/services/trip";
import { getTripStops, replaceTripStops } from "@/lib/services/tripStops";

const stopSchema = z.object({
  id: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
const putBody = z.object({ stops: z.array(stopSchema).max(200) });

const toDto = (s: {
  id: string;
  label: string;
  lat: number;
  lng: number;
  createdByName: string;
}) => ({
  id: s.id,
  label: s.label,
  lat: s.lat,
  lng: s.lng,
  by: s.createdByName,
});

/** GET /api/v1/trip-stops — Stopps des aktuellen Nutzers (in Reihenfolge). */
export function GET() {
  return handle(async () => {
    const user = await requireUser();
    const tripId = await getActiveTripId(user.id);
    return ok((await getTripStops(tripId)).map(toDto));
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
