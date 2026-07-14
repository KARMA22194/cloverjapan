import { z } from "zod";

/**
 * Gemeinsames Zod-Schema für optionale Datums-Strings im Format YYYY-MM-DD.
 * `nullish` = Feld darf fehlen (undefined) oder explizit `null` sein (löschen).
 * Zentral, damit nicht mehrere Endpunkte dieselbe Regex duplizieren.
 */
export const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum muss YYYY-MM-DD sein.")
  .nullish();
