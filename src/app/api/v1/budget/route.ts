import type { NextRequest } from "next/server";
import { z } from "zod";
import { ExpenseCategory } from "@prisma/client";

import { handle, ok, readJson } from "@/lib/api/http";
import { requireTripUser } from "@/lib/api/session";
import { getBudget, setBudget } from "@/lib/services/budgetService";

/**
 * Persönliches Reise-Budget.
 *
 * Es hängt am **Mitglied**: jedes Mitglied plant sein eigenes Geld, und niemand
 * sieht die Zahlen der anderen.
 *
 * ⚠️ `requireTripUser()`, nicht `requireUser()`. Die Mitgliedschaft entsteht
 * **lazy** beim ersten Trip-Zugriff — mit `requireUser()` hatte ein frisches
 * Konto noch keine, das Budget landete nirgends, und der Endpunkt meldete
 * trotzdem 200. Der Client konnte den Unterschied nicht sehen.
 *
 * Vorher lag beides im `localStorage`, also pro Gerät und pro Browser: auf dem
 * Handy war das am Rechner gesetzte Budget unsichtbar, und beim Leeren der
 * Browserdaten weg.
 */
const MAX_YEN = 100_000_000; // 100 Mio. ¥ — großzügig, aber nicht unbegrenzt

const yen = z.number().int().min(0).max(MAX_YEN);

const putBody = z.object({
  totalYen: yen,
  categories: z.record(z.nativeEnum(ExpenseCategory), yen).default({}),
});

/** GET /api/v1/budget — eigenes Budget. */
export function GET() {
  return handle(async () => {
    const { user } = await requireTripUser();
    return ok(await getBudget(user.id));
  });
}

/** PUT /api/v1/budget — eigenes Budget ersetzen. */
export function PUT(req: NextRequest) {
  return handle(async () => {
    const { user } = await requireTripUser();
    const body = putBody.parse(await readJson(req));
    // Antwort = der wirklich gespeicherte Stand, nicht das Gesendete.
    return ok(await setBudget(user.id, body));
  });
}
