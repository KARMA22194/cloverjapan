import type { NextRequest } from "next/server";

import { handle, notFound, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { getActiveTripId, removeFromTrip } from "@/lib/services/trip";

type Ctx = { params: Promise<{ userId: string }> };

/** DELETE /api/v1/trip/members/{userId} — Mitglied aus der Reise entfernen. */
export function DELETE(_req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const tripId = await getActiveTripId(user.id);
    const { userId } = await ctx.params;
    const removed = await removeFromTrip(tripId, userId);
    if (!removed) throw notFound("Mitglied nicht gefunden.");
    return ok({ removed: userId });
  });
}
