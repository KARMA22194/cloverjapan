import type { NextRequest } from "next/server";

import { handle, notFound, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { getActiveTripId, revokeInvitation } from "@/lib/services/trip";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE /api/v1/trip/invitations/{id} — offene Einladung der eigenen Reise widerrufen. */
export function DELETE(_req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const tripId = await getActiveTripId(user.id);
    const { id } = await ctx.params;

    const removed = await revokeInvitation(tripId, id);
    if (!removed) throw notFound("Einladung nicht gefunden.");
    return ok({ id, revoked: true });
  });
}
