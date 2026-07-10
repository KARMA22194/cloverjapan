import type { NextRequest } from "next/server";

import { badRequest, handle, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { acceptIncomingInvitation, getActiveTripId } from "@/lib/services/trip";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/trip/invitations/{id}/accept — an den Nutzer gerichtete Einladung
 * annehmen: wechselt in die eingeladene Reise (verlässt die bisherige).
 */
export function POST(_req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    // Stellt sicher, dass der Nutzer eine (Solo-)Reise/Mitgliedschaft hat, die wechseln kann.
    await getActiveTripId(user.id);
    const { id } = await ctx.params;

    const accepted = await acceptIncomingInvitation(user.id, user.email, id);
    if (!accepted) throw badRequest("Einladung ungültig, abgelaufen oder bereits angenommen.");
    return ok({ id, accepted: true });
  });
}
