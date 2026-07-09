import { db } from "@/lib/db";

export function listExpenses(tripId: string) {
  return db.expense.findMany({ where: { tripId }, orderBy: { createdAt: "asc" } });
}

export function createExpense(
  tripId: string,
  input: { category: string; label: string; yen: number },
  createdByName: string,
) {
  return db.expense.create({
    data: {
      tripId,
      category: input.category,
      label: input.label.trim(),
      yen: input.yen,
      createdByName,
    },
  });
}

export async function deleteExpenseOwned(id: string, tripId: string) {
  const res = await db.expense.deleteMany({ where: { id, tripId } });
  return res.count;
}

export async function clearExpenses(tripId: string) {
  const res = await db.expense.deleteMany({ where: { tripId } });
  return res.count;
}
