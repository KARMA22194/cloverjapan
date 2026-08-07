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

/** Beleg-Foto einer eigenen Ausgabe abrufen. */
export function getExpenseReceipt(id: string, tripId: string) {
  return db.expense.findFirst({ where: { id, tripId }, select: { receipt: true } });
}

/** Beleg-Foto setzen/entfernen (null = entfernen); gibt Anzahl betroffener Zeilen zurück. */
export async function setExpenseReceipt(id: string, tripId: string, receipt: string | null) {
  // hasReceipt synchron halten (Grundlage der Listen-Anzeige ohne Blob-Load).
  const res = await db.expense.updateMany({
    where: { id, tripId },
    data: { receipt, hasReceipt: receipt !== null },
  });
  return res.count;
}

export async function clearExpenses(tripId: string) {
  const res = await db.expense.deleteMany({ where: { tripId } });
  return res.count;
}
