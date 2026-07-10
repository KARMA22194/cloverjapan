import type { NextRequest } from "next/server";

import { handle, notFound, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import {
  declineIncomingInvitation,
  getActiveTripId,
  revokeInvitation,
} from "@/lib/services/trip";

type Ctx = { params: Promise<{ id: string }> };

/**
 * DELETE /api/v1/trip/invitations/{id} — Einladung entfernen.
 * Deckt beide Rollen ab: ausgehend **widerrufen** (Einladung der eigenen Reise) oder
 * eingehend **ablehnen** (an die eigene E-Mail gerichtet).
 */
export function DELETE(_req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const tripId = await getActiveTripId(user.id);
    const { id } = await ctx.params;

    const revoked = await revokeInvitation(tripId, id);
    const removed = revoked || (await declineIncomingInvitation(user.email, id));
    if (!removed) throw notFound("Einladung nicht gefunden.");
    return ok({ id, removed: true });
  });
}
