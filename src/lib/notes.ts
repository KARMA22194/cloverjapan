// Kategorien für Notizen — zentrale Definition (Label + Kartenfarbe).
// Von der UI (Chips/Kartenfarbe) und der API-Validierung genutzt.
export const NOTE_CATEGORIES = [
  { value: "ARBEIT", label: "Arbeit", color: "#bbdefb" }, // blau
  { value: "SCHULE", label: "Schule", color: "#fff9c4" }, // gelb
  { value: "URLAUB", label: "Urlaub", color: "#c8e6c9" }, // grün
  { value: "WOCHENENDE", label: "Wochenende", color: "#f8bbd0" }, // pink
] as const;

export type NoteCategoryValue = (typeof NOTE_CATEGORIES)[number]["value"];

export const NOTE_CATEGORY_VALUES = NOTE_CATEGORIES.map((c) => c.value) as [
  NoteCategoryValue,
  ...NoteCategoryValue[],
];

export function noteCategoryMeta(value: string) {
  return NOTE_CATEGORIES.find((c) => c.value === value) ?? NOTE_CATEGORIES[0];
}

/** ISO-8601-Kalenderwoche eines `YYYY-MM-DD` (UTC-basiert, wie im Rest der App). */
export function isoWeek(dateParam: string): number {
  const [y, m, d] = dateParam.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  // Auf den Donnerstag dieser ISO-Woche schieben (Mo=0 … So=6).
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
}

/**
 * Automatische (erzwungene) Kategorie anhand des Wochentags:
 * - Sa/So → Wochenende
 * - Montag → Schule
 * - Dienstag in GERADER Kalenderwoche → Schule (14-Tage-Takt)
 * - sonst → Arbeit
 */
export function autoCategoryForDate(dateParam: string): NoteCategoryValue {
  const [y, m, d] = dateParam.split("-").map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // Mo=0 … So=6
  if (dow === 5 || dow === 6) return "WOCHENENDE";
  if (dow === 0) return "SCHULE";
  if (dow === 1 && isoWeek(dateParam) % 2 === 0) return "SCHULE";
  return "ARBEIT";
}
