import { z } from "zod";

/**
 * Prüft, ob ein `YYYY-MM-DD`-String ein **real existierendes** Datum bezeichnet.
 *
 * Die Regex allein lässt „2026-13-45" durch; der Wert flog dann erst tief unten in
 * `parseDateParam` als nackter Error hoch (→ 500 statt 400) bzw. wurde bei den
 * String-Spalten (Buchungen, Stopps, Hotels) still gespeichert und zerlegte die
 * Sortierung der Timeline. Round-Trip über `Date.UTC` fängt genau das ab.
 */
export function isRealDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return (
    date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d
  );
}

/**
 * Gemeinsames Zod-Schema für optionale Datums-Strings im Format YYYY-MM-DD.
 * `nullish` = Feld darf fehlen (undefined) oder explizit `null` sein (löschen).
 * Zentral, damit nicht mehrere Endpunkte dieselbe Regex duplizieren.
 */
export const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum muss YYYY-MM-DD sein.")
  .refine(isRealDate, "Dieses Datum gibt es nicht.")
  .nullish();
