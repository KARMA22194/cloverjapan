import type { ExpenseCategory } from "@prisma/client";

import { api } from "@/lib/api/client";

// Ausgaben-Kategorien für den Japan-Rechner (Label + Farbe). Rein clientseitig genutzt.
export const EXPENSE_CATEGORIES = [
  { value: "ESSEN", label: "Essen", color: "#fca5a5" }, // rot
  { value: "FIGUREN", label: "Figuren", color: "#c4b5fd" }, // lila
  { value: "KLEIDUNG", label: "Kleidung", color: "#93c5fd" }, // blau
  { value: "SIGHTSEEING", label: "Sightseeing", color: "#86efac" }, // grün
  { value: "TRANSPORT", label: "Transport", color: "#cbd5e1" }, // grau (Zug/Fahrt)
  { value: "SONSTIGES", label: "Sonstiges", color: "#fcd34d" }, // gelb
  // `satisfies` bindet diese Liste an das Prisma-Enum, ohne den Prisma-Client ins
  // Client-Bundle zu ziehen (type-only Import): weicht ein Wert ab oder kommt im
  // Schema eine Kategorie hinzu, bricht der Build statt still auseinanderzulaufen.
] as const satisfies readonly { value: ExpenseCategory; label: string; color: string }[];

export type ExpenseCategoryValue = (typeof EXPENSE_CATEGORIES)[number]["value"];

export function expenseCategoryMeta(value: string) {
  return (
    EXPENSE_CATEGORIES.find((c) => c.value === value) ??
    EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1]
  );
}

export interface ExpenseItem {
  id: string;
  category: ExpenseCategoryValue;
  label: string;
  yen: number;
  by?: string;
  paidById?: string | null;
  shared?: boolean;
  hasReceipt?: boolean;
  createdAt?: string; // ISO; von der API geliefert, u. a. für den Zeitverlauf-Chart
}

/**
 * Legt eine Ausgabe im Konto an (REST-API). Wird z. B. vom Reiseplaner genutzt,
 * um Zugfahrten in den Ausgabenrechner zu übernehmen.
 */
export async function addExpenseItem(
  item: { category: string; label: string; yen: number },
): Promise<boolean> {
  try {
    await api.post("/api/v1/expenses", item);
    return true;
  } catch {
    return false;
  }
}
