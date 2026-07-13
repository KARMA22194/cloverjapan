import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

export interface FlightInput {
  flightNumber: string;
  airline?: string;
  fromCode?: string;
  fromName?: string;
  toCode?: string;
  toName?: string;
  departure?: string | null; // ISO (UTC-naive Wall-Clock)
  arrival?: string | null;
  durationMin?: number | null;
  bookingRef?: string;
  priceYen?: number | null;
}

export function listFlights(tripId: string) {
  return db.flight.findMany({
    where: { tripId },
    orderBy: [{ departure: "asc" }, { createdAt: "asc" }],
  });
}

function toDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function expenseLabel(f: { flightNumber: string; fromCode: string; toCode: string }): string {
  const route = f.fromCode && f.toCode ? ` ${f.fromCode}→${f.toCode}` : "";
  return `✈ ${f.flightNumber}${route}`;
}

/** Hält die verknüpfte Ausgabe synchron: Preis gesetzt → Ausgabe (TRANSPORT); sonst weg. */
async function syncExpense(
  tx: Prisma.TransactionClient,
  flight: {
    id: string;
    tripId: string;
    priceYen: number | null;
    flightNumber: string;
    fromCode: string;
    toCode: string;
    createdByName: string;
  },
) {
  if (flight.priceYen && flight.priceYen > 0) {
    await tx.expense.upsert({
      where: { flightId: flight.id },
      create: {
        tripId: flight.tripId,
        category: "TRANSPORT",
        label: expenseLabel(flight),
        yen: flight.priceYen,
        createdByName: flight.createdByName,
        flightId: flight.id,
      },
      update: { yen: flight.priceYen, label: expenseLabel(flight) },
    });
  } else {
    await tx.expense.deleteMany({ where: { flightId: flight.id } });
  }
}

function fields(input: FlightInput) {
  return {
    flightNumber: input.flightNumber.trim().toUpperCase(),
    airline: input.airline?.trim() ?? "",
    fromCode: input.fromCode?.trim().toUpperCase() ?? "",
    fromName: input.fromName?.trim() ?? "",
    toCode: input.toCode?.trim().toUpperCase() ?? "",
    toName: input.toName?.trim() ?? "",
    departure: toDate(input.departure),
    arrival: toDate(input.arrival),
    durationMin: input.durationMin ?? null,
    bookingRef: input.bookingRef?.trim() ?? "",
    priceYen: input.priceYen ?? null,
  };
}

export function createFlight(tripId: string, input: FlightInput, createdByName: string) {
  return db.$transaction(async (tx) => {
    const flight = await tx.flight.create({ data: { tripId, createdByName, ...fields(input) } });
    await syncExpense(tx, flight);
    return flight;
  });
}

export function updateFlightOwned(id: string, tripId: string, input: FlightInput) {
  return db.$transaction(async (tx) => {
    const existing = await tx.flight.findFirst({ where: { id, tripId }, select: { id: true } });
    if (!existing) return null;
    const flight = await tx.flight.update({ where: { id }, data: fields(input) });
    await syncExpense(tx, flight);
    return flight;
  });
}

export async function deleteFlightOwned(id: string, tripId: string) {
  // Cascade (Expense.flightId onDelete: Cascade) entfernt die verknüpfte Ausgabe mit.
  const res = await db.flight.deleteMany({ where: { id, tripId } });
  return res.count;
}
