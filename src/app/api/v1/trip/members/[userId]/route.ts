import type { NextRequest } from "next/server";
import { z } from "zod";

import { ApiError, handle, notFound, ok, readJson } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { getActiveTripId, removeFromTrip, setMemberManage } from "@/lib/services/trip";

type Ctx = { params: Promise<{ userId: string }> };

/**
 * DELETE /api/v1/trip/members/{userId} — Mitglied aus der Reise entfernen.
 * Berechtigung siehe removeFromTrip: Owner/Verwalter dürfen andere entfernen,
 * jeder darf sich selbst entfernen (außer dem Owner).
 */
export function DELETE(_req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const tripId = await getActiveTripId(user.id);
    const { userId } = await ctx.params;
    const result = await removeFromTrip(tripId, user.id, userId);
    switch (result) {
      case "ok":
        return ok({ removed: userId });
      case "not_found":
        throw notFound("Mitglied nicht gefunden.");
      case "forbidden":
        throw new ApiError(403, "Du darfst dieses Mitglied nicht entfernen.");
      case "owner_protected":
        throw new ApiError(403, "Der Ersteller der Reise kann nicht entfernt werden.");
      case "owner_cannot_leave":
        throw new ApiError(
          409,
          "Als Ersteller kannst du die Reise nicht verlassen (Rechte müssten erst übertragen werden).",
        );
    }
  });
}

const patchBody = z.object({ canManage: z.boolean() });

/**
 * PATCH /api/v1/trip/members/{userId} — Verwalter-Recht setzen/entziehen.
 * Nur der Owner darf das.
 */
export function PATCH(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const tripId = await getActiveTripId(user.id);
    const { userId } = await ctx.params;
    const { canManage } = patchBody.parse(await readJson(req));
    const result = await setMemberManage(tripId, user.id, userId, canManage);
    switch (result) {
      case "ok":
        return ok({ userId, canManage });
      case "not_found":
        throw notFound("Mitglied nicht gefunden.");
      case "owner_self":
        throw new ApiError(409, "Der Ersteller hat das Verwalten-Recht bereits.");
      case "forbidden":
        throw new ApiError(403, "Nur der Ersteller der Reise darf Rechte vergeben.");
    }
  });
}
