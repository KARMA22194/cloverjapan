import type { NextRequest } from "next/server";

import { handle, ok, readJson } from "@/lib/api/http";
import { requireTripUser } from "@/lib/api/session";
import { createBooking, listBookings } from "@/lib/services/bookingsService";
import { logActivity } from "@/lib/services/activityService";
import { bookingBody, toBookingDto } from "./schema";

/** GET /api/v1/bookings — Buchungen/Tickets der aktuellen Reise. */
export function GET() {
  return handle(async () => {
    const { tripId } = await requireTripUser();
    return ok((await listBookings(tripId)).map(toBookingDto));
  });
}

/** POST /api/v1/bookings — Buchung anlegen (Preis erzeugt eine verknüpfte Ausgabe). */
export function POST(req: NextRequest) {
  return handle(async () => {
    const { user, tripId } = await requireTripUser();
    const body = bookingBody.parse(await readJson(req));
    const created = await createBooking(tripId, body, user.name);
    logActivity({
      tripId,
      userId: user.id,
      userName: user.name,
      action: "booking.create",
      summary: created.title,
    });
    return ok(toBookingDto(created), 201);
  });
}
