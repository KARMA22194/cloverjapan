import { z } from "zod";

// Deutsche Dezimal-Eingabe ("7,5") tolerieren.
const hoursSchema = z.preprocess(
  (val) => (typeof val === "string" ? val.replace(",", ".").trim() : val),
  z.coerce
    .number({ invalid_type_error: "Bitte eine Stundenzahl eingeben." })
    .positive("Stunden müssen größer als 0 sein.")
    .max(24, "Maximal 24 Stunden pro Eintrag."),
);

const dateParamSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum.");

export const timeEntryCreateSchema = z.object({
  date: dateParamSchema,
  projectId: z.string().min(1, "Projekt wählen."),
  hours: hoursSchema,
  note: z.string().max(500).optional().or(z.literal("")),
});

export const timeEntryUpdateSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1, "Projekt wählen."),
  hours: hoursSchema,
  note: z.string().max(500).optional().or(z.literal("")),
});

export const projectCreateSchema = z.object({
  name: z.string().min(2, "Name zu kurz.").max(100),
  code: z
    .string()
    .min(2, "Kürzel zu kurz.")
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, "Nur Buchstaben, Zahlen, Bindestrich.")
    .transform((v) => v.toUpperCase()),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Ungültige Farbe.")
    .default("#3b82f6"),
});

export const userCreateSchema = z.object({
  name: z.string().min(2, "Name zu kurz.").max(100),
  email: z.string().email("Ungültige E-Mail."),
  password: z.string().min(6, "Passwort mind. 6 Zeichen."),
  role: z.enum(["EMPLOYEE", "MANAGER", "ADMIN"]),
});

export type TimeEntryCreateInput = z.infer<typeof timeEntryCreateSchema>;
export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type UserCreateInput = z.infer<typeof userCreateSchema>;
