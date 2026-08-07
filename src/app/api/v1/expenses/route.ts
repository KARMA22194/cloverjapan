import type { NextRequest } from "next/server";
import { z } from "zod";

import { badRequest, forbidden, handle, ok, readJson } from "@/lib/api/http";
import { requireTripUser } from "@/lib/api/session";
import { areTripMembers, canManageMembers } from "@/lib/services/trip";
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
    const { tripId } = await requireTripUser();
    return ok((await listExpenses(tripId)).map(toDto));
  });
}

/** POST /api/v1/expenses — Ausgabe anlegen. */
export function POST(req: NextRequest) {
  return handle(async () => {
    const { user, tripId } = await requireTripUser();
    const body = createBody.parse(await readJson(req));
    // Standard-Zahler = der/die Erfassende, falls nicht anders angegeben.
    const paidById = body.paidById ?? user.id;
    if (!(await areTripMembers(tripId, [paidById]))) {
      throw badRequest("Der Zahler muss Mitglied dieser Reise sein.");
    }
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

/**
 * DELETE /api/v1/expenses — **alle** Ausgaben der Reise löschen.
 * Destruktiv und teamweit → nur Owner/Verwalter, und immer mit Eintrag im Feed
 * (sonst verschwindet die gesamte Historie inkl. Belege spurlos).
 */
export function DELETE() {
  return handle(async () => {
    const { user, tripId } = await requireTripUser();
    if (!(await canManageMembers(tripId, user.id))) {
      throw forbidden("Nur Verwalter dürfen alle Ausgaben löschen.");
    }
    const cleared = await clearExpenses(tripId);
    logActivity({
      tripId,
      userId: user.id,
      userName: user.name,
      action: "expense.clear",
      summary: `${cleared} Ausgaben gelöscht`,
    });
    return ok({ cleared });
  });
}
