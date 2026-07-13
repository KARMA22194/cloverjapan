import type { NextRequest } from "next/server";
import { z } from "zod";
import type { Flight } from "@prisma/client";

import { handle, ok, readJson } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { getActiveTripId } from "@/lib/services/trip";
import { createFlight, listFlights } from "@/lib/services/flightsService";

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
  priceYen: f.priceYen,
  by: f.createdByName,
});

/** GET /api/v1/flights — Flüge der aktuellen Reise. */
export function GET() {
  return handle(async () => {
    const user = await requireUser();
    const tripId = await getActiveTripId(user.id);
    return ok((await listFlights(tripId)).map(toFlightDto));
  });
}

/** POST /api/v1/flights — Flug hinterlegen (Preis erzeugt eine verknüpfte Ausgabe). */
export function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const tripId = await getActiveTripId(user.id);
    const body = flightBody.parse(await readJson(req));
    return ok(toFlightDto(await createFlight(tripId, body, user.name)), 201);
  });
}
