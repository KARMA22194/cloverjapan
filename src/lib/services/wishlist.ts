import { db } from "@/lib/db";
import { withPositionLock } from "@/lib/services/position";

export function listWishlist(tripId: string) {
  return db.wishlistItem.findMany({
    where: { tripId },
    orderBy: [{ position: "asc" }, { id: "asc" }],
  });
}

export async function createWishlistItem(
  tripId: string,
  input: { label: string; priceYen?: number | null },
  createdByName: string,
) {
  // Position aus dem aktuellen Maximum ableiten — in einer **serialisierbaren**
  // Transaktion, sonst vergeben gleichzeitige Aufrufe dieselbe Nummer (siehe
  // withPositionLock). `count()` davor war zusätzlich falsch, sobald einmal
  // gelöscht wurde: dann entstehen Lücken und die Zählung kollidiert erneut.
  return withPositionLock(async (tx) => {
    const last = await tx.wishlistItem.findFirst({
      where: { tripId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    return tx.wishlistItem.create({
      data: {
        tripId,
        label: input.label.trim(),
        priceYen: input.priceYen ?? null,
        position: (last?.position ?? -1) + 1,
        createdByName,
      },
    });
  });
}

export async function updateWishlistItemOwned(
  id: string,
  tripId: string,
  data: { label?: string; priceYen?: number | null; bought?: boolean },
) {
  const res = await db.wishlistItem.updateMany({ where: { id, tripId }, data });
  if (res.count === 0) return null;
  return db.wishlistItem.findUnique({ where: { id } });
}

export async function deleteWishlistItemOwned(id: string, tripId: string) {
  const res = await db.wishlistItem.deleteMany({ where: { id, tripId } });
  return res.count;
}
