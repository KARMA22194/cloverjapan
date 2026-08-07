import { twMerge } from "tailwind-merge";

/**
 * Klassen zusammenführen — Falsy-Werte fallen weg, **widersprüchliche Utilities
 * gewinnt die letzte**.
 *
 * Die Auflösung ist nicht optional, sondern Voraussetzung dafür, dass die
 * UI-Primitives ein `className` als Escape-Hatch anbieten dürfen: bei bloßer
 * String-Verkettung entscheidet die Reihenfolge im **generierten Stylesheet**,
 * nicht die im Attribut. `cn(FIELD, "w-24")` ließ deshalb `w-full` aus der Basis
 * gewinnen und das Feld auf Vollbreite aufgehen — und ein `py-1.5` gegen ein
 * `py-2` der Basis blieb stillschweigend wirkungslos. Solche Fehler sind im Code
 * nicht zu sehen, nur im Bild.
 *
 * `twMerge` kennt die Utility-Gruppen (width, padding, rounded, shadow, …) und
 * wirft die früheren Klassen derselben Gruppe weg. Eigene Theme-Werte wie
 * `rounded-card` oder `bg-surface` ordnet es über das Präfix korrekt ein;
 * Klassen, die es nicht kennt, bleiben unangetastet erhalten.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return twMerge(parts.filter(Boolean).join(" "));
}
