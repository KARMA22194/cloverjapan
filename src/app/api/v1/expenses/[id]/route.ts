import type { NextRequest } from "next/server";

import { handle, notFound, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { getActiveTripId } from "@/lib/services/trip";
import { deleteExpenseOwned } from "@/lib/services/expensesService";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE /api/v1/expenses/{id} — eigene Ausgabe löschen. */
export function DELETE(_req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const tripId = await getActiveTripId(user.id);
    const { id } = await ctx.params;
    const count = await deleteExpenseOwned(id, tripId);
    if (count === 0) throw notFound("Ausgabe nicht gefunden.");
    return ok({ id, deleted: true });
  });
}
