import type { ExpenseCategory } from "@prisma/client";

import { db } from "@/lib/db";

export function listExpenses(tripId: string) {
  // Explizites select OHNE `receipt`: der (bis 1,5 MB große) Beleg-Blob gehört nicht
  // in die Liste — `hasReceipt` genügt für die Anzeige.
  return db.expense.findMany({
    where: { tripId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      category: true,
      label: true,
      yen: true,
      createdByName: true,
      createdAt: true,
      paidById: true,
      shared: true,
      hasReceipt: true,
    },
  });
}

export function createExpense(
  tripId: string,
  input: {
    category: ExpenseCategory;
    label: string;
    yen: number;
    paidById?: string | null;
    shared?: boolean;
  },
  createdByName: string,
) {
  return db.expense.create({
    data: {
      tripId,
      category: input.category,
      label: input.label.trim(),
      yen: input.yen,
      createdByName,
      paidById: input.paidById ?? null,
      shared: input.shared ?? true,
    },
  });
}

export async function deleteExpenseOwned(id: string, tripId: string) {
  const res = await db.expense.deleteMany({ where: { id, tripId } });
  return res.count;
}

/**
 * Beleg-Foto einer Ausgabe der eigenen Reise abrufen.
 * `null`, wenn die Ausgabe nicht existiert, nicht zur Reise gehört oder keinen Beleg hat.
 */
export async function getExpenseReceipt(
  id: string,
  tripId: string,
): Promise<{ receipt: string | null } | null> {
  // Tenant-Prüfung über die Relation: die Ausgabe muss zu dieser Reise gehören.
  const expense = await db.expense.findFirst({
    where: { id, tripId },
    select: { receiptFile: { select: { data: true } } },
  });
  if (!expense) return null;
  return { receipt: expense.receiptFile?.data ?? null };
}

/**
 * Beleg-Foto setzen/entfernen (null = entfernen); gibt Anzahl betroffener Zeilen zurück.
 *
 * Beleg und `hasReceipt` werden in **einer** Transaktion geschrieben, damit das Flag
 * (Grundlage der Listen-Anzeige ohne Blob-Load) nie vom Bestand abweicht.
 */
export async function setExpenseReceipt(id: string, tripId: string, receipt: string | null) {
  return db.$transaction(async (tx) => {
    // Ownership zuerst — danach steht die Zugehörigkeit für beide Schreibvorgänge fest.
    const owned = await tx.expense.updateMany({
      where: { id, tripId },
      data: { hasReceipt: receipt !== null },
    });
    if (owned.count === 0) return 0;

    if (receipt === null) {
      await tx.expenseReceipt.deleteMany({ where: { expenseId: id } });
    } else {
      await tx.expenseReceipt.upsert({
        where: { expenseId: id },
        create: { expenseId: id, data: receipt },
        update: { data: receipt },
      });
    }
    return owned.count;
  });
}

export async function clearExpenses(tripId: string) {
  const res = await db.expense.deleteMany({ where: { tripId } });
  return res.count;
}
