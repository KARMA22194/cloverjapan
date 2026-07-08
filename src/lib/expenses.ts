// Ausgaben-Kategorien für den Japan-Rechner (Label + Farbe). Rein clientseitig genutzt.
export const EXPENSE_CATEGORIES = [
  { value: "ESSEN", label: "Essen", color: "#fca5a5" }, // rot
  { value: "FIGUREN", label: "Figuren", color: "#c4b5fd" }, // lila
  { value: "KLEIDUNG", label: "Kleidung", color: "#93c5fd" }, // blau
  { value: "SIGHTSEEING", label: "Sightseeing", color: "#86efac" }, // grün
  { value: "TRANSPORT", label: "Transport", color: "#cbd5e1" }, // grau (Zug/Fahrt)
  { value: "SONSTIGES", label: "Sonstiges", color: "#fcd34d" }, // gelb
] as const;

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
}

/** Gemeinsamer localStorage-Schlüssel von Ausgabenrechner und Reiseplaner. */
export const EXPENSES_STORAGE_KEY = "japan-ausgaben";

/**
 * Hängt eine Ausgabe an die gespeicherte Rechnung an (localStorage).
 * Erhält die vorhandene „speichern"-Einstellung; default = speichern.
 * Wird z. B. vom Reiseplaner genutzt, um Zugfahrten in den Rechner zu übernehmen.
 */
export function addExpenseItem(item: Omit<ExpenseItem, "id">): boolean {
  try {
    const raw = localStorage.getItem(EXPENSES_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as { persist?: boolean; items?: ExpenseItem[] }) : null;
    const persist = typeof parsed?.persist === "boolean" ? parsed.persist : true;
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    const next = [...items, { ...item, id: crypto.randomUUID() }];
    localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify({ persist, items: next }));
    return true;
  } catch {
    return false;
  }
}
