import type { NextRequest } from "next/server";
import { z } from "zod";

import { handle, ok, readJson } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { getActiveTripId } from "@/lib/services/trip";
import { clearExpenses, createExpense, listExpenses } from "@/lib/services/expensesService";

const createBody = z.object({
  category: z.string().min(1).max(40),
  label: z.string().max(200).optional().default(""),
  yen: z.number().int().positive().max(100_000_000),
});

const toDto = (e: { id: string; category: string; label: string; yen: number; createdAt: Date }) => ({
  id: e.id,
  category: e.category,
  label: e.label,
  yen: e.yen,
  createdAt: e.createdAt.toISOString(),
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
    return ok(toDto(await createExpense(tripId, body)), 201);
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
