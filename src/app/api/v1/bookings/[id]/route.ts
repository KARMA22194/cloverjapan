import type { NextRequest } from "next/server";

import { handle, notFound, ok, readJson } from "@/lib/api/http";
import { requireTripUser } from "@/lib/api/session";
import { deleteBookingOwned, updateBookingOwned } from "@/lib/services/bookingsService";
import { bookingBody, toBookingDto } from "../schema";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/v1/bookings/{id} — Buchung der eigenen Reise ändern. */
export function PATCH(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { tripId } = await requireTripUser();
    const { id } = await ctx.params;
    const body = bookingBody.parse(await readJson(req));
    const booking = await updateBookingOwned(id, tripId, body);
    if (!booking) throw notFound("Buchung nicht gefunden.");
    return ok(toBookingDto(booking));
  });
}

/** DELETE /api/v1/bookings/{id} — Buchung (und verknüpfte Ausgabe) löschen. */
export function DELETE(_req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { tripId } = await requireTripUser();
    const { id } = await ctx.params;
    const count = await deleteBookingOwned(id, tripId);
    if (count === 0) throw notFound("Buchung nicht gefunden.");
    return ok({ id, deleted: true });
  });
}
