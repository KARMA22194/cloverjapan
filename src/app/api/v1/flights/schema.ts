import { z } from "zod";
import type { Flight } from "@prisma/client";

// Geteilte Validierung/DTO für die Flights-Endpunkte. Bewusst NICHT in route.ts:
// Next.js erlaubt in Route-Dateien ausschließlich Handler-Exporte.

const isoOrNull = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), "Ungültiges Datum.")
  .nullish();

export const flightBody = z.object({
  flightNumber: z.string().trim().min(2, "Flugnummer fehlt.").max(10),
  airline: z.string().max(80).optional().default(""),
  fromCode: z.string().max(4).optional().default(""),
  fromName: z.string().max(100).optional().default(""),
  toCode: z.string().max(4).optional().default(""),
  toName: z.string().max(100).optional().default(""),
  departure: isoOrNull,
  arrival: isoOrNull,
  durationMin: z.number().int().positive().max(6000).nullish(),
  bookingRef: z.string().max(40).optional().default(""),
  seats: z.string().max(60).optional().default(""),
  priceYen: z.number().int().positive().max(100_000_000).nullish(),
});

export const toFlightDto = (f: Flight) => ({
  id: f.id,
  flightNumber: f.flightNumber,
  airline: f.airline,
  fromCode: f.fromCode,
  fromName: f.fromName,
  toCode: f.toCode,
  toName: f.toName,
  departure: f.departure?.toISOString() ?? null,
  arrival: f.arrival?.toISOString() ?? null,
  durationMin: f.durationMin,
  bookingRef: f.bookingRef,
  seats: f.seats,
  priceYen: f.priceYen,
  by: f.createdByName,
});
