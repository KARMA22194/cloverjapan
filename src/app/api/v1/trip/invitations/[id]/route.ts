import type { NextRequest } from "next/server";

import { handle, notFound, ok } from "@/lib/api/http";
import { requireTripUser } from "@/lib/api/session";
import { canManageMembers, declineIncomingInvitation, revokeInvitation } from "@/lib/services/trip";

type Ctx = { params: Promise<{ id: string }> };

/**
 * DELETE /api/v1/trip/invitations/{id} — Einladung entfernen.
 * Deckt beide Rollen ab: ausgehend **widerrufen** (Einladung der eigenen Reise) oder
 * eingehend **ablehnen** (an die eigene E-Mail gerichtet).
 */
export function DELETE(_req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, tripId } = await requireTripUser();
    const { id } = await ctx.params;

    // Ausgehende Einladungen der Reise widerrufen dürfen nur Owner/Verwalter;
    // eine an die eigene E-Mail gerichtete Einladung darf jeder selbst ablehnen.
    const canManage = await canManageMembers(tripId, user.id);
    const revoked = canManage ? await revokeInvitation(tripId, id) : false;
    const removed = revoked || (await declineIncomingInvitation(user.email, id));
    if (!removed) throw notFound("Einladung nicht gefunden.");
    return ok({ id, removed: true });
  });
}
