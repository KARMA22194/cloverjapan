import type { NextRequest } from "next/server";

import { handle, ok, readJson } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { getActiveTripId } from "@/lib/services/trip";
import { createFlight, listFlights } from "@/lib/services/flightsService";
import { logActivity } from "@/lib/services/activityService";
import { flightBody, toFlightDto } from "./schema";

/** GET /api/v1/flights — Flüge der aktuellen Reise. */
export function GET() {
  return handle(async () => {
    const user = await requireUser();
    const tripId = await getActiveTripId(user.id);
    return ok((await listFlights(tripId)).map(toFlightDto));
  });
}

/** POST /api/v1/flights — Flug hinterlegen (Preis erzeugt eine verknüpfte Ausgabe). */
export function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const tripId = await getActiveTripId(user.id);
    const body = flightBody.parse(await readJson(req));
    const created = await createFlight(tripId, body, user.name);
    await logActivity({
      tripId,
      userId: user.id,
      userName: user.name,
      action: "flight.create",
      summary: created.flightNumber,
    });
    return ok(toFlightDto(created), 201);
  });
}
