import { db } from "@/lib/db";

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
  const position = await db.wishlistItem.count({ where: { tripId } });
  return db.wishlistItem.create({
    data: {
      tripId,
      label: input.label.trim(),
      priceYen: input.priceYen ?? null,
      position,
      createdByName,
    },
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
