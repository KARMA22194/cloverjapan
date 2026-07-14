import type { NextRequest } from "next/server";

import { handle, notFound, ok, readJson } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { getActiveTripId } from "@/lib/services/trip";
import { deleteFlightOwned, updateFlightOwned } from "@/lib/services/flightsService";
import { flightBody, toFlightDto } from "../schema";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/v1/flights/{id} — Flug der eigenen Reise ändern. */
export function PATCH(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const tripId = await getActiveTripId(user.id);
    const { id } = await ctx.params;
    const body = flightBody.parse(await readJson(req));

    const flight = await updateFlightOwned(id, tripId, body);
    if (!flight) throw notFound("Flug nicht gefunden.");
    return ok(toFlightDto(flight));
  });
}

/** DELETE /api/v1/flights/{id} — Flug (und verknüpfte Ausgabe) löschen. */
export function DELETE(_req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const tripId = await getActiveTripId(user.id);
    const { id } = await ctx.params;
    const count = await deleteFlightOwned(id, tripId);
    if (count === 0) throw notFound("Flug nicht gefunden.");
    return ok({ id, deleted: true });
  });
}
