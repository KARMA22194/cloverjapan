import type { NextRequest } from "next/server";
import { z } from "zod";

import { handle, ok, readJson } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { getActiveTripId } from "@/lib/services/trip";
import { clearExpenses, createExpense, listExpenses } from "@/lib/services/expensesService";
import { logActivity } from "@/lib/services/activityService";

const createBody = z.object({
  category: z.string().min(1).max(40),
  label: z.string().max(200).optional().default(""),
  yen: z.number().int().positive().max(100_000_000),
  paidById: z.string().max(40).nullish(),
  shared: z.boolean().optional().default(true),
});

const toDto = (e: {
  id: string;
  category: string;
  label: string;
  yen: number;
  createdByName: string;
  createdAt: Date;
  paidById: string | null;
  shared: boolean;
  hasReceipt: boolean;
}) => ({
  id: e.id,
  category: e.category,
  label: e.label,
  yen: e.yen,
  by: e.createdByName,
  createdAt: e.createdAt.toISOString(),
  paidById: e.paidById,
  shared: e.shared,
  hasReceipt: e.hasReceipt, // Blob (receipt) wird in der Liste nie geladen/ausgeliefert
});

/** GET /api/v1/expenses — Ausgaben des aktuellen Nutzers. */
export function GET() {
  return handle(async () => {
    const user = await requireUser();
    const tripId = await getActiveTripId(user.id);
    return ok((await listExpenses(tripId)).map(toDto));
  });
}

/** POST /api/v1/expenses — Ausgabe anlegen. */
export function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const tripId = await getActiveTripId(user.id);
    const body = createBody.parse(await readJson(req));
    // Standard-Zahler = der/die Erfassende, falls nicht anders angegeben.
    const paidById = body.paidById ?? user.id;
    const created = await createExpense(tripId, { ...body, paidById }, user.name);
    logActivity({
      tripId,
      userId: user.id,
      userName: user.name,
      action: "expense.create",
      summary: created.label || created.category,
    });
    return ok(toDto(created), 201);
  });
}

/** DELETE /api/v1/expenses — alle Ausgaben löschen. */
export function DELETE() {
  return handle(async () => {
    const user = await requireUser();
    const tripId = await getActiveTripId(user.id);
    return ok({ cleared: await clearExpenses(tripId) });
  });
}
