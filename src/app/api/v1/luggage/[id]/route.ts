import type { NextRequest } from "next/server";

import { handle, notFound, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { getActiveTripId } from "@/lib/services/trip";
import { deleteLuggageTagOwned } from "@/lib/services/luggageService";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE /api/v1/luggage/{id} — Kofferanhänger der eigenen Reise löschen. */
export function DELETE(_req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const tripId = await getActiveTripId(user.id);
    const { id } = await ctx.params;
    const count = await deleteLuggageTagOwned(id, tripId);
    if (count === 0) throw notFound("Kofferanhänger nicht gefunden.");
    return ok({ id, deleted: true });
  });
}
