import { badRequest } from "@/lib/api/http";
import { db } from "@/lib/db";
import { withPositionLock } from "@/lib/services/position";

/** Hotels/Unterkünfte einer Reise, in Reihenfolge der Aufnahme (id als Tie-Breaker). */
export function getTripHotels(tripId: string) {
  return db.tripHotel.findMany({
    where: { tripId },
    orderBy: [{ position: "asc" }, { id: "asc" }],
  });
}

/** Hängt eine Unterkunft hinten an (id via @default(cuid()) aus Prisma). */
export async function addTripHotel(
  tripId: string,
  hotel: { label: string; lat: number; lng: number; checkIn?: string | null; checkOut?: string | null },
  createdByName: string,
) {
  // Position aus dem aktuellen Maximum ableiten — in einer **serialisierbaren**
  // Transaktion, sonst vergeben gleichzeitige Aufrufe dieselbe Nummer (siehe
  // withPositionLock). `count()` davor war zusätzlich falsch, sobald einmal
  // gelöscht wurde: dann entstehen Lücken und die Zählung kollidiert erneut.
  return withPositionLock(async (tx) => {
    const last = await tx.tripHotel.findFirst({
      where: { tripId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    return tx.tripHotel.create({
      data: {
        tripId,
        label: hotel.label,
        lat: hotel.lat,
        lng: hotel.lng,
        checkIn: hotel.checkIn ?? null,
        checkOut: hotel.checkOut ?? null,
        position: (last?.position ?? -1) + 1,
        createdByName,
      },
    });
  });
}

/** Ändert Check-in/Check-out einer Unterkunft der eigenen Reise (ownership über tripId).
 *  Prüft, dass das (zusammengeführte) Check-out nicht vor dem Check-in liegt. */
export async function updateTripHotelOwned(
  id: string,
  tripId: string,
  patch: { checkIn?: string | null; checkOut?: string | null },
) {
  const existing = await db.tripHotel.findFirst({ where: { id, tripId } });
  if (!existing) return null;

  const checkIn = patch.checkIn !== undefined ? patch.checkIn : existing.checkIn;
  const checkOut = patch.checkOut !== undefined ? patch.checkOut : existing.checkOut;
  // YYYY-MM-DD ist lexikografisch = chronologisch sortierbar.
  if (checkIn && checkOut && checkOut < checkIn) {
    throw badRequest("Check-out darf nicht vor dem Check-in liegen.");
  }

  return db.tripHotel.update({ where: { id }, data: patch });
}

/** Löscht eine Unterkunft der eigenen Reise; gibt die Anzahl gelöschter Zeilen zurück. */
export async function deleteTripHotelOwned(id: string, tripId: string) {
  const res = await db.tripHotel.deleteMany({ where: { id, tripId } });
  return res.count;
}
