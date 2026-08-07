import { z } from "zod";

import { isRealDate } from "@/lib/api/dates";

// Zod bleibt die kanonische Request-Validierung der Nutzerverwaltung. Die
// `.openapi()`-Annotationen sind mit der Swagger-Doku entfallen: sie beschrieb
// nur 4 der 56 Routen und verschwieg den kompletten Japan-Teil.

/* ------------------------------------------------------------------ *
 *  Gemeinsame Bausteine
 * ------------------------------------------------------------------ */

export const roleSchema = z.enum(["EMPLOYEE", "MANAGER", "ADMIN"]);

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
  email: z.string().email("Ungültige E-Mail."),
  password: z.string().min(8, "Passwort mind. 8 Zeichen.").max(200),
  role: roleSchema,
});

export const userUpdateBody = z.object({
  /** true = aktivieren, false = deaktivieren. */
  active: z.boolean(),
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
