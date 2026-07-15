import { z } from "zod";

// Geteilte Validierung/DTO für die Buchungs-Endpunkte (nicht in route.ts — Next.js
// erlaubt dort nur Handler-Exporte).

export const BOOKING_KINDS = ["TICKET", "RESTAURANT", "AKTIVITAET", "TRANSPORT", "SONSTIGES"] as const;

export const bookingBody = z.object({
  title: z.string().trim().min(1, "Titel fehlt.").max(200),
  kind: z.enum(BOOKING_KINDS).optional().default("TICKET"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum muss YYYY-MM-DD sein.")
    .nullish(),
  time: z.string().max(5).optional().default(""),
  ref: z.string().max(120).optional().default(""),
  url: z.string().max(500).optional().default(""),
  note: z.string().max(1000).optional().default(""),
  priceYen: z.number().int().positive().max(100_000_000).nullish(),
});

export const toBookingDto = (b: {
  id: string;
  title: string;
  kind: string;
  date: string | null;
  time: string;
  ref: string;
  url: string;
  note: string;
  priceYen: number | null;
  createdByName: string;
}) => ({
  id: b.id,
  title: b.title,
  kind: b.kind,
  date: b.date,
  time: b.time,
  ref: b.ref,
  url: b.url,
  note: b.note,
  priceYen: b.priceYen,
  by: b.createdByName,
});
