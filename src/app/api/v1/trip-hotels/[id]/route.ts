import type { NextRequest } from "next/server";

import { handle, notFound, ok, readJson } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { getActiveTripId } from "@/lib/services/trip";
import { deleteTripHotelOwned, updateTripHotelOwned } from "@/lib/services/tripHotels";
import { hotelPatch, toHotelDto } from "../schema";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/v1/trip-hotels/{id} — Check-in/Check-out ändern. */
export function PATCH(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const tripId = await getActiveTripId(user.id);
    const { id } = await ctx.params;
    const patch = hotelPatch.parse(await readJson(req));
    const hotel = await updateTripHotelOwned(id, tripId, patch);
    if (!hotel) throw notFound("Unterkunft nicht gefunden.");
    return ok(toHotelDto(hotel));
  });
}

/** DELETE /api/v1/trip-hotels/{id} — Unterkunft löschen. */
export function DELETE(_req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const tripId = await getActiveTripId(user.id);
    const { id } = await ctx.params;
    const count = await deleteTripHotelOwned(id, tripId);
    if (count === 0) throw notFound("Unterkunft nicht gefunden.");
    return ok({ id, deleted: true });
  });
}
