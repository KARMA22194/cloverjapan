import type { ExpenseCategory } from "@prisma/client";

import { api } from "@/lib/api/client";

// Ausgaben-Kategorien für den Japan-Rechner (Label + Farbe). Rein clientseitig genutzt.
//
// ⚠️ **`Record<ExpenseCategory, …>` ist der Build-Wächter.** Vorher stand hier ein
// Array mit `satisfies readonly { value: ExpenseCategory … }[]` — das prüft nur die
// eine Richtung („jeder Eintrag ist eine gültige Kategorie"), **nicht** die andere.
// Eine neu ins Prisma-Enum aufgenommene Kategorie wäre also still aus Auswahl,
// Pillen, Donut und Zollrechner herausgefallen, ohne dass der Build etwas merkt.
// Mit dem Record fehlt sie hier nicht mehr unbemerkt.
//
// Die **Reihenfolge der Schlüssel ist zugleich die Anzeigereihenfolge** —
// `Object.keys` liefert String-Schlüssel spezifikationsgemäß in Einfügereihenfolge.
const CATEGORY_META = {
  ESSEN: { label: "Essen", color: "#fca5a5" }, // rot
  FIGUREN: { label: "Figuren", color: "#c4b5fd" }, // lila
  KLEIDUNG: { label: "Kleidung", color: "#93c5fd" }, // blau
  KOSMETIK: { label: "Kosmetik", color: "#f9a8d4" }, // rosa (Drogerie/Apotheke)
  ELEKTRONIK: { label: "Elektronik", color: "#a5b4fc" }, // indigo
  SIGHTSEEING: { label: "Sightseeing", color: "#86efac" }, // grün
  TRANSPORT: { label: "Transport", color: "#cbd5e1" }, // grau (Zug/Fahrt)
  UNTERKUNFT: { label: "Unterkunft", color: "#fdba74" }, // orange (Hotel/Ryokan)
  SONSTIGES: { label: "Sonstiges", color: "#fcd34d" }, // gelb
} as const satisfies Record<ExpenseCategory, { label: string; color: string }>;

export const EXPENSE_CATEGORIES = (Object.keys(CATEGORY_META) as ExpenseCategory[]).map(
  (value) => ({ value, ...CATEGORY_META[value] }),
);

export type ExpenseCategoryValue = ExpenseCategory;

export function expenseCategoryMeta(value: string) {
  // Unbekannter Wert (Altbestand, fremde Quelle) → „Sonstiges" **namentlich**,
  // nicht „letzter Eintrag der Liste": Letzteres hing an der Sortierung.
  return CATEGORY_META[value as ExpenseCategory] ?? CATEGORY_META.SONSTIGES;
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
  /** JPY→EUR-Kurs beim Erfassen; null/fehlend = unbekannt → Tageskurs. */
  rateEur?: number | null;
  createdAt?: string; // ISO; von der API geliefert, u. a. für den Zeitverlauf-Chart
  /**
   * Offline erfasst und noch nicht beim Server angekommen (Outbox).
   * ⚠️ Kommt **nie** von der API, sondern nur aus dem Platzhalter in
   * `queueMutation` — nach dem Nachholen ersetzt die echte Antwort den Eintrag.
   */
  pendingSync?: boolean;
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
