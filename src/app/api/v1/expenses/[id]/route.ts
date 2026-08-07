import type { NextRequest } from "next/server";
import { z } from "zod";

import { handle, notFound, ok, readJson } from "@/lib/api/http";
import { requireTripUser } from "@/lib/api/session";
import { enforceRateLimit } from "@/lib/rate";
import {
  deleteExpenseOwned,
  getExpenseReceipt,
  setExpenseReceipt,
} from "@/lib/services/expensesService";

type Ctx = { params: Promise<{ id: string }> };

const receiptBody = z.object({
  receipt: z
    .string()
    .startsWith("data:image/", "Nur Bild-Data-URLs erlaubt.")
    .max(1_500_000, "Beleg zu groß.")
    .refine((s) => !/^data:image\/svg\+xml/i.test(s), "SVG-Bilder sind nicht erlaubt.")
    .nullable(),
});

/** GET /api/v1/expenses/{id} — Beleg-Foto der Ausgabe (Data-URL) abrufen. */
export function GET(_req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { tripId } = await requireTripUser();
    const { id } = await ctx.params;
    const row = await getExpenseReceipt(id, tripId);
    if (!row) throw notFound("Ausgabe nicht gefunden.");
    return ok({ receipt: row.receipt });
  });
}

/**
 * PATCH /api/v1/expenses/{id} — Beleg-Foto setzen/entfernen.
 * Ratenlimitiert: jeder Aufruf kann bis zu 1,5 MB Data-URL in die DB schreiben.
 */
export function PATCH(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, tripId } = await requireTripUser();
    await enforceRateLimit(`expense-receipt:${user.id}`, 120, 60 * 60 * 1000);
    const { id } = await ctx.params;
    const { receipt } = receiptBody.parse(await readJson(req));
    const count = await setExpenseReceipt(id, tripId, receipt);
    if (count === 0) throw notFound("Ausgabe nicht gefunden.");
    return ok({ id, hasReceipt: !!receipt });
  });
}

/** DELETE /api/v1/expenses/{id} — eigene Ausgabe löschen. */
export function DELETE(_req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { tripId } = await requireTripUser();
    const { id } = await ctx.params;
    const count = await deleteExpenseOwned(id, tripId);
    if (count === 0) throw notFound("Ausgabe nicht gefunden.");
    return ok({ id, deleted: true });
  });
}
