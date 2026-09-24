import type { NextRequest } from "next/server";
import { z } from "zod";
import { ExpenseCategory } from "@prisma/client";

import { handle, notFound, ok, readJson } from "@/lib/api/http";
import { requirePermission, requireTripUser } from "@/lib/api/session";
import { enforceRateLimit } from "@/lib/rate";
import { logActivity } from "@/lib/services/activityService";
import {
  deleteExpenseOwned,
  getExpenseReceipt,
  setExpenseReceipt,
  updateExpenseCategory,
} from "@/lib/services/expensesService";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Zwei unabhängige Änderungen an einer Ausgabe — beide optional, mindestens eine.
 *
 * ⚠️ `receipt` ist `nullable` **und** `optional`, und der Unterschied trägt
 * Bedeutung: `null` heißt „Beleg entfernen", `undefined`/fehlend heißt „Beleg
 * nicht anfassen". Ohne diese Trennung würde ein reiner Kategorie-Wechsel das
 * Beleg-Foto mitlöschen.
 */
const patchBody = z
  .object({
    receipt: z
      .string()
      .startsWith("data:image/", "Nur Bild-Data-URLs erlaubt.")
      .max(1_500_000, "Beleg zu groß.")
      .refine((s) => !/^data:image\/svg\+xml/i.test(s), "SVG-Bilder sind nicht erlaubt.")
      .nullable()
      .optional(),
    category: z.enum(ExpenseCategory).optional(),
  })
  .refine((b) => b.receipt !== undefined || b.category !== undefined, {
    message: "Nichts zu ändern (receipt oder category erwartet).",
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
 * PATCH /api/v1/expenses/{id} — Beleg-Foto setzen/entfernen und/oder Kategorie ändern.
 *
 * Das Rate-Limit gilt **nur** für den Beleg-Teil: dort kann jeder Aufruf bis zu
 * 1,5 MB Data-URL in die DB schreiben. Ein Kategorie-Wechsel ist eine gewöhnliche
 * kleine Mutation und läuft wie die übrigen PATCH-Endpunkte ohne Limit — sonst
 * verbrauchte das Umsortieren der Liste das Budget für Beleg-Uploads.
 */
export function PATCH(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { user, tripId } = await requireTripUser();
    const { id } = await ctx.params;
    const body = patchBody.parse(await readJson(req));

    const result: { id: string; hasReceipt?: boolean; category?: ExpenseCategory } = { id };

    if (body.receipt !== undefined) {
      // Nur der Beleg-Teil braucht das Recht. Ein Kategorie-Wechsel ist davon
      // unberührt — sonst könnte jemand ohne Foto-Recht seine eigene Ausgabe
      // nicht mehr umsortieren.
      requirePermission(user, "canReceiptPhoto");
      await enforceRateLimit(`expense-receipt:${user.id}`, 120, 60 * 60 * 1000);
      const count = await setExpenseReceipt(id, tripId, body.receipt);
      if (count === 0) throw notFound("Ausgabe nicht gefunden.");
      result.hasReceipt = !!body.receipt;
    }

    if (body.category !== undefined) {
      const count = await updateExpenseCategory(id, tripId, body.category);
      if (count === 0) throw notFound("Ausgabe nicht gefunden.");
      result.category = body.category;
      logActivity({
        tripId,
        userId: user.id,
        userName: user.name,
        action: "expense.recategorize",
        summary: body.category,
      });
    }

    return ok(result);
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
