import type { NextRequest } from "next/server";

import { handle, notFound, ok } from "@/lib/api/http";
import { requireTripUser } from "@/lib/api/session";
import { deleteSettlementOwned } from "@/lib/services/settlements";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE /api/v1/settlements/{id} — verbuchte Zahlung rückgängig machen. */
export function DELETE(_req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { tripId } = await requireTripUser();
    const { id } = await ctx.params;
    const count = await deleteSettlementOwned(id, tripId);
    if (count === 0) throw notFound("Zahlung nicht gefunden.");
    return ok({ id, deleted: true });
  });
}
