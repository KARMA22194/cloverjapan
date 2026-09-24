import type { ExpenseCategory } from "@prisma/client";

import { ApiError } from "@/lib/api/http";
import { db } from "@/lib/db";

export interface Budget {
  /** Gesamtbudget der Reise in Yen; 0 = keins gesetzt. */
  totalYen: number;
  /** Teilbudgets je Kategorie; nur gesetzte Kategorien stehen drin. */
  categories: Partial<Record<ExpenseCategory, number>>;
}

/**
 * Persönliches Budget eines Mitglieds.
 *
 * Gelesen wird über die **Mitgliedschaft**, nicht über (userId, tripId) einzeln:
 * `TripMember.userId` ist unique, die Zeile ist also eindeutig — und der
 * Fremdschlüssel der Teilbudgets zeigt ohnehin auf sie.
 */
export async function getBudget(userId: string): Promise<Budget> {
  const member = await db.tripMember.findUnique({
    where: { userId },
    select: {
      budgetYen: true,
      categoryBudgets: { select: { category: true, yen: true } },
    },
  });
  if (!member) return { totalYen: 0, categories: {} };

  const categories: Partial<Record<ExpenseCategory, number>> = {};
  for (const c of member.categoryBudgets) categories[c.category] = c.yen;
  return { totalYen: member.budgetYen, categories };
}

/**
 * Budget ersetzen (PUT-Semantik).
 *
 * Bewusst **ersetzen statt zusammenführen**: die Oberfläche schickt immer den
 * vollständigen Stand, und ein gelöschtes Teilbudget muss auch verschwinden.
 * Mit „nur Gesetztes schreiben" bliebe jede einmal gesetzte Kategorie für immer
 * stehen.
 *
 * Alles in **einer** Transaktion — sonst gäbe es einen Moment, in dem die alten
 * Teilbudgets gelöscht und die neuen noch nicht da sind.
 *
 * ⚠️ Aufrufer müssen `requireTripUser()` benutzen, nicht `requireUser()`: die
 * Mitgliedschaft entsteht **lazy** beim ersten Trip-Zugriff. Mit `requireUser()`
 * fand diese Abfrage bei einem frischen Konto nichts, das Budget wurde still
 * verworfen und der Endpunkt meldete trotzdem Erfolg — der Fehler fiel erst im
 * Test auf, weil die Zahl nach dem Neuladen wieder verschwand.
 */
export async function setBudget(userId: string, budget: Budget): Promise<Budget> {
  const member = await db.tripMember.findUnique({ where: { userId }, select: { id: true } });
  if (!member) throw new ApiError(404, "Keine Reise gefunden.");

  // 0 heißt „nicht gesetzt" und wird gar nicht erst als Zeile abgelegt.
  const rows = Object.entries(budget.categories)
    .filter(([, yen]) => typeof yen === "number" && yen > 0)
    .map(([category, yen]) => ({
      tripMemberId: member.id,
      category: category as ExpenseCategory,
      yen: yen as number,
    }));

  const totalYen = Math.max(0, Math.round(budget.totalYen));
  await db.$transaction([
    db.tripMember.update({ where: { id: member.id }, data: { budgetYen: totalYen } }),
    db.memberCategoryBudget.deleteMany({ where: { tripMemberId: member.id } }),
    db.memberCategoryBudget.createMany({ data: rows }),
  ]);
  // Den gespeicherten Stand zurückgeben, damit der Client nicht raten muss,
  // was wirklich angekommen ist.
  return {
    totalYen,
    categories: Object.fromEntries(rows.map((r) => [r.category, r.yen])),
  };
}
