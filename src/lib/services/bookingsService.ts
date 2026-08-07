import { Prisma, type BookingKind, type ExpenseCategory } from "@prisma/client";

import { db } from "@/lib/db";
import { parseDateParam } from "@/lib/time";

export interface BookingInput {
  title: string;
  kind?: BookingKind;
  date?: string | null;
  time?: string;
  ref?: string;
  url?: string;
  note?: string;
  priceYen?: number | null;
}

export function listBookings(tripId: string) {
  return db.booking.findMany({
    where: { tripId },
    orderBy: [{ date: "asc" }, { time: "asc" }, { createdAt: "asc" }],
  });
}

// Buchungsart → passende Ausgaben-Kategorie. Beide Seiten sind Prisma-Enums, das
// Mapping ist damit vollständig typgeprüft (ein Tippfehler im Wert bricht den Build).
function expenseCategory(kind: BookingKind): ExpenseCategory {
  switch (kind) {
    case "RESTAURANT":
      return "ESSEN";
    case "TRANSPORT":
      return "TRANSPORT";
    case "TICKET":
    case "AKTIVITAET":
      return "SIGHTSEEING";
    default:
      return "SONSTIGES";
  }
}

/** Hält die verknüpfte Ausgabe synchron: Preis gesetzt → Ausgabe; sonst entfernt. */
async function syncExpense(
  tx: Prisma.TransactionClient,
  booking: {
    id: string;
    tripId: string;
    title: string;
    kind: BookingKind;
    priceYen: number | null;
    createdByName: string;
  },
) {
  if (booking.priceYen && booking.priceYen > 0) {
    const label = `🎟 ${booking.title}`;
    await tx.expense.upsert({
      where: { bookingId: booking.id },
      create: {
        tripId: booking.tripId,
        category: expenseCategory(booking.kind),
        label,
        yen: booking.priceYen,
        createdByName: booking.createdByName,
        bookingId: booking.id,
      },
      update: { yen: booking.priceYen, label, category: expenseCategory(booking.kind) },
    });
  } else {
    await tx.expense.deleteMany({ where: { bookingId: booking.id } });
  }
}

function fields(input: BookingInput) {
  return {
    title: input.title.trim(),
    kind: input.kind ?? "TICKET",
    date: input.date ? parseDateParam(input.date) : null,
    time: input.time?.trim() ?? "",
    ref: input.ref?.trim() ?? "",
    url: input.url?.trim() ?? "",
    note: input.note?.trim() ?? "",
    priceYen: input.priceYen ?? null,
  };
}

export function createBooking(tripId: string, input: BookingInput, createdByName: string) {
  return db.$transaction(async (tx) => {
    const booking = await tx.booking.create({ data: { tripId, createdByName, ...fields(input) } });
    await syncExpense(tx, booking);
    return booking;
  });
}

export function updateBookingOwned(id: string, tripId: string, input: BookingInput) {
  return db.$transaction(async (tx) => {
    const existing = await tx.booking.findFirst({ where: { id, tripId }, select: { id: true } });
    if (!existing) return null;
    const booking = await tx.booking.update({ where: { id }, data: fields(input) });
    await syncExpense(tx, booking);
    return booking;
  });
}

export async function deleteBookingOwned(id: string, tripId: string) {
  // Cascade (Expense.bookingId onDelete: Cascade) entfernt die verknüpfte Ausgabe mit.
  const res = await db.booking.deleteMany({ where: { id, tripId } });
  return res.count;
}
