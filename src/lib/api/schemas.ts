import { z } from "zod";

import { isRealDate } from "@/lib/api/dates";

// Zod bleibt die kanonische Request-Validierung der Nutzerverwaltung. Die
// `.openapi()`-Annotationen sind mit der Swagger-Doku entfallen: sie beschrieb
// nur 4 der 56 Routen und verschwieg den kompletten Japan-Teil.

/* ------------------------------------------------------------------ *
 *  Gemeinsame Bausteine
 * ------------------------------------------------------------------ */

export const roleSchema = z.enum(["USER", "ADMIN"]);

/**
 * Optionale, vom **Client** vergebene Id beim Anlegen.
 *
 * Gebraucht wird sie für offline erfasste Einträge: die App legt sie in die
 * Outbox (`src/lib/offline/outbox.ts`) und schickt sie nach, sobald wieder
 * Netz da ist. Vergäbe der Server die Id, wüsste der Client nach einer
 * **verlorenen Antwort** nicht, ob der Datensatz schon existiert — der zweite
 * Versuch legte ihn ein zweites Mal an, und eine doppelte Ausgabe verfälscht
 * still die Abrechnung. Mit eigener Id läuft der zweite Versuch in den
 * Primärschlüssel und kommt als 409 zurück, was die Warteschlange als „war
 * schon da" liest.
 *
 * Ein Missbrauch bringt nichts: eine bereits belegte Id (auch die einer
 * fremden Reise) scheitert am Primärschlüssel — es wird nichts überschrieben
 * und nichts sichtbar.
 */
export const clientIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,64}$/, "Ungültige Id.")
  .optional();

// Datums-Parameter (YYYY-MM-DD) — u. a. vom Tagesplaner genutzt.
// `isRealDate` zusätzlich zur Regex: sonst käme „2026-13-45" bis in `parseDateParam`
// durch und würde dort als 500 statt als 400 enden.
export const dateParamSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum muss im Format YYYY-MM-DD vorliegen.")
  .refine(isRealDate, "Dieses Datum gibt es nicht.");

/* ------------------------------------------------------------------ *
 *  Request-Bodies (Writes) — Nutzerverwaltung
 * ------------------------------------------------------------------ */

export const userCreateBody = z.object({
  name: z.string().min(2, "Name zu kurz.").max(100),
  email: z.email("Ungültige E-Mail."),
  password: z.string().min(8, "Passwort mind. 8 Zeichen.").max(200),
  role: roleSchema,
});

// Alle Felder optional, aber mindestens eines verlangt: derselbe Endpunkt
// schaltet das Konto scharf **und** vergibt die Rechte. Wäre `active` weiter
// Pflicht, müsste jede Rechte-Änderung den Aktiv-Zustand mitschicken — und ein
// Fehler dabei hätte jemanden ausgesperrt.
export const userUpdateBody = z
  .object({
    /** true = aktivieren, false = deaktivieren. */
    active: z.boolean().optional(),
    /** Recht: KI-Beleg-Scan auslösen. */
    canAiScan: z.boolean().optional(),
    /** Recht: Belegfotos anhängen. */
    canReceiptPhoto: z.boolean().optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: "Nichts zu ändern (active, canAiScan oder canReceiptPhoto erwartet).",
  });

/* ------------------------------------------------------------------ *
 *  Response-DTOs (Reads)
 * ------------------------------------------------------------------ */

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: roleSchema,
  active: z.boolean(),
  createdAt: z.string(),
});

export const meSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: roleSchema,
});

export const errorSchema = z.object({
  error: z.object({
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
