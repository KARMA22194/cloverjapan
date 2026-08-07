import type { NextRequest } from "next/server";

import { handle, ok, readJson } from "@/lib/api/http";
import { requireTripUser } from "@/lib/api/session";
import { createFlight, listFlights } from "@/lib/services/flightsService";
import { logActivity } from "@/lib/services/activityService";
import { flightBody, toFlightDto } from "./schema";

/** GET /api/v1/flights — Flüge der aktuellen Reise. */
export function GET() {
  return handle(async () => {
    const { tripId } = await requireTripUser();
    return ok((await listFlights(tripId)).map(toFlightDto));
  });
}

/** POST /api/v1/flights — Flug hinterlegen (Preis erzeugt eine verknüpfte Ausgabe). */
export function POST(req: NextRequest) {
  return handle(async () => {
    const { user, tripId } = await requireTripUser();
    const body = flightBody.parse(await readJson(req));
    const created = await createFlight(tripId, body, user.name);
    logActivity({
      tripId,
      userId: user.id,
      userName: user.name,
      action: "flight.create",
      summary: created.flightNumber,
    });
    return ok(toFlightDto(created), 201);
  });
}
