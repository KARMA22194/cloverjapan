import type { NextRequest } from "next/server";

import { handle, ok, readJson } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { getActiveTripId } from "@/lib/services/trip";
import { addTripHotel, getTripHotels } from "@/lib/services/tripHotels";
import { hotelBody, toHotelDto } from "./schema";

/** GET /api/v1/trip-hotels — Unterkünfte der Reise. */
export function GET() {
  return handle(async () => {
    const user = await requireUser();
    const tripId = await getActiveTripId(user.id);
    return ok((await getTripHotels(tripId)).map(toHotelDto));
  });
}

/** POST /api/v1/trip-hotels — Unterkunft hinzufügen. */
export function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const tripId = await getActiveTripId(user.id);
    const body = hotelBody.parse(await readJson(req));
    const hotel = await addTripHotel(tripId, body, user.name);
    return ok(toHotelDto(hotel), 201);
  });
}
