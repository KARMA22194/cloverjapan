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
