import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import { NOTE_CATEGORY_VALUES } from "@/lib/notes";

// Zod um `.openapi()` erweitern — Schemas sind damit Single Source of Truth
// für Laufzeit-Validierung UND die generierte OpenAPI-Spec.
extendZodWithOpenApi(z);

/* ------------------------------------------------------------------ *
 *  Gemeinsame Bausteine
 * ------------------------------------------------------------------ */

export const roleSchema = z.enum(["EMPLOYEE", "MANAGER", "ADMIN"]);

export const dateParamSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum muss im Format YYYY-MM-DD vorliegen.")
  .openapi({ example: "2026-07-08", description: "Tag im Format YYYY-MM-DD" });

/** Stunden als Dezimalzahl; akzeptiert deutsche ("7,5") und englische ("7.5") Schreibweise. */
export const hoursSchema = z
  .preprocess(
    (v) => (typeof v === "string" ? v.replace(",", ".").trim() : v),
    z.coerce
      .number({ invalid_type_error: "Stunden müssen eine Zahl sein." })
      .positive("Stunden müssen größer als 0 sein.")
      .max(24, "Maximal 24 Stunden pro Eintrag."),
  )
  .openapi({ type: "number", example: 1.5, description: "Dauer in Stunden (Dezimal)" });

/* ------------------------------------------------------------------ *
 *  Request-Bodies (Writes)
 * ------------------------------------------------------------------ */

export const timeEntryCreateBody = z.object({
  date: dateParamSchema,
  projectId: z.string().min(1, "Projekt wählen."),
  hours: hoursSchema,
  note: z.string().max(500).nullish().openapi({ example: "Feature X umgesetzt" }),
});

export const timeEntryUpdateBody = z.object({
  projectId: z.string().min(1, "Projekt wählen."),
  hours: hoursSchema,
  note: z.string().max(500).nullish(),
});

export const projectCreateBody = z.object({
  name: z.string().min(2, "Name zu kurz.").max(100).openapi({ example: "Website Relaunch" }),
  code: z
    .string()
    .min(2, "Kürzel zu kurz.")
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, "Nur Buchstaben, Zahlen, Bindestrich.")
    .transform((v) => v.toUpperCase())
    .openapi({ type: "string", example: "WEB" }),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Ungültige Farbe.")
    .default("#3b82f6")
    .openapi({ example: "#3b82f6" }),
});

export const projectUpdateBody = z.object({
  archived: z.boolean().openapi({ description: "true = archivieren, false = reaktivieren" }),
});

export const userCreateBody = z.object({
  name: z.string().min(2, "Name zu kurz.").max(100).openapi({ example: "Erika Mustermann" }),
  email: z.string().email("Ungültige E-Mail.").openapi({ example: "erika@clover.japan" }),
  password: z.string().min(6, "Passwort mind. 6 Zeichen.").openapi({ example: "password123" }),
  role: roleSchema.openapi({ example: "EMPLOYEE" }),
});

export const userUpdateBody = z.object({
  active: z.boolean().openapi({ description: "true = aktivieren, false = deaktivieren" }),
});

export const noteCategorySchema = z
  .enum(NOTE_CATEGORY_VALUES)
  .openapi({ description: "Kategorie (färbt die Karte)", example: "ARBEIT" });

export const noteCreateBody = z.object({
  date: dateParamSchema,
  content: z.string().min(1, "Notiz darf nicht leer sein.").max(2000).openapi({
    example: "Feature X umgesetzt, Code-Review gemacht",
  }),
  category: noteCategorySchema.default("ARBEIT"),
});

export const noteUpdateBody = z
  .object({
    content: z.string().min(1, "Notiz darf nicht leer sein.").max(2000).optional(),
    category: noteCategorySchema.optional(),
  })
  .refine((d) => d.content !== undefined || d.category !== undefined, {
    message: "Nichts zu ändern.",
  });

/* ------------------------------------------------------------------ *
 *  Response-DTOs (Reads)
 * ------------------------------------------------------------------ */

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  color: z.string(),
  archived: z.boolean(),
});

/** Projekt-Kurzform, wie in Einträgen/Reports eingebettet. */
export const projectMetaSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  color: z.string(),
});

export const timeEntrySchema = z.object({
  id: z.string(),
  date: dateParamSchema,
  projectId: z.string(),
  minutes: z.number().int().openapi({ description: "Dauer in Minuten (Speicherformat)" }),
  hours: z.number().openapi({ description: "Dauer in Stunden (abgeleitet)" }),
  note: z.string().nullable(),
  project: projectMetaSchema,
});

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: roleSchema,
  active: z.boolean(),
  createdAt: z.string().openapi({ format: "date-time" }),
  timeEntryCount: z.number().int(),
});

export const meSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: roleSchema,
});

export const noteSchema = z.object({
  id: z.string(),
  date: dateParamSchema,
  content: z.string(),
  category: noteCategorySchema,
  createdAt: z.string().openapi({ format: "date-time" }),
});

const minutesByKey = z.record(z.string(), z.number().int());

export const monthReportSchema = z.object({
  year: z.number().int(),
  month: z.number().int().openapi({ description: "1-basiert (1 = Januar)" }),
  projects: z.array(projectMetaSchema),
  days: z.array(z.number().int()),
  cell: z.record(z.string(), minutesByKey).openapi({ description: "minutes[tag][projectId]" }),
  perDay: minutesByKey,
  perProject: minutesByKey,
  total: z.number().int(),
});

export const yearReportSchema = z.object({
  year: z.number().int(),
  projects: z.array(projectMetaSchema),
  months: z.array(z.number().int()),
  cell: z.record(z.string(), minutesByKey).openapi({ description: "minutes[monat][projectId]" }),
  perMonth: minutesByKey,
  perProject: minutesByKey,
  total: z.number().int(),
});

export const errorSchema = z.object({
  error: z.object({
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
