import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Zod um `.openapi()` erweitern — Schemas sind damit Single Source of Truth
// für Laufzeit-Validierung UND die generierte OpenAPI-Spec.
extendZodWithOpenApi(z);

/* ------------------------------------------------------------------ *
 *  Gemeinsame Bausteine
 * ------------------------------------------------------------------ */

export const roleSchema = z.enum(["EMPLOYEE", "MANAGER", "ADMIN"]);

// Datums-Parameter (YYYY-MM-DD) — u. a. vom Tagesplaner genutzt.
export const dateParamSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum muss im Format YYYY-MM-DD vorliegen.")
  .openapi({ example: "2026-07-08", description: "Tag im Format YYYY-MM-DD" });

/* ------------------------------------------------------------------ *
 *  Request-Bodies (Writes) — Nutzerverwaltung
 * ------------------------------------------------------------------ */

export const userCreateBody = z.object({
  name: z.string().min(2, "Name zu kurz.").max(100).openapi({ example: "Erika Mustermann" }),
  email: z.string().email("Ungültige E-Mail.").openapi({ example: "erika@clover.japan" }),
  password: z.string().min(8, "Passwort mind. 8 Zeichen.").max(200).openapi({ example: "password123" }),
  role: roleSchema.openapi({ example: "EMPLOYEE" }),
});

export const userUpdateBody = z.object({
  active: z.boolean().openapi({ description: "true = aktivieren, false = deaktivieren" }),
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
  createdAt: z.string().openapi({ format: "date-time" }),
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
