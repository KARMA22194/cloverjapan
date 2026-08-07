import { z } from "zod";
import { BookingKind } from "@prisma/client";

import { dateStr } from "@/lib/api/dates";
import { toDateParam } from "@/lib/time";

// Geteilte Validierung/DTO für die Buchungs-Endpunkte (nicht in route.ts — Next.js
// erlaubt dort nur Handler-Exporte).

// Aus dem Prisma-Enum abgeleitet — keine zweite Liste, die auseinanderlaufen kann.
export const BOOKING_KINDS = Object.values(BookingKind);

export const bookingBody = z.object({
  title: z.string().trim().min(1, "Titel fehlt.").max(200),
  kind: z.nativeEnum(BookingKind).optional().default(BookingKind.TICKET),
  date: dateStr,
  time: z.string().max(5).optional().default(""),
  ref: z.string().max(120).optional().default(""),
  // Absolute http(s)-URL erzwingen: „www.klook.com/x" würde sonst als *relativer*
  // Link gerendert und landete für alle Mitglieder auf /programm/www.klook.com/x.
  url: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "Link muss mit http:// oder https:// beginnen.")
    .optional()
    .default(""),
  note: z.string().max(1000).optional().default(""),
  priceYen: z.number().int().positive().max(100_000_000).nullish(),
});

export const toBookingDto = (b: {
  id: string;
  title: string;
  kind: BookingKind;
  date: Date | null;
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
  // DB hält ein echtes Date; nach außen bleibt es YYYY-MM-DD.
  date: b.date ? toDateParam(b.date) : null,
  time: b.time,
  ref: b.ref,
  url: b.url,
  note: b.note,
  priceYen: b.priceYen,
  by: b.createdByName,
});
