import { db } from "@/lib/db";

/** Verbuchte Ausgleichszahlungen einer Reise, chronologisch. */
export function listSettlements(tripId: string) {
  return db.settlement.findMany({ where: { tripId }, orderBy: { createdAt: "asc" } });
}

export function createSettlement(
  tripId: string,
  input: { id?: string; fromId: string; toId: string; fromName: string; toName: string; yen: number },
  createdByName: string,
) {
  return db.settlement.create({
    data: {
      ...(input.id ? { id: input.id } : {}),
      tripId,
      fromId: input.fromId,
      toId: input.toId,
      fromName: input.fromName,
      toName: input.toName,
      yen: input.yen,
      createdByName,
    },
  });
}

/** Löscht eine Zahlung der eigenen Reise (Undo); gibt Anzahl gelöschter Zeilen zurück. */
export async function deleteSettlementOwned(id: string, tripId: string) {
  const res = await db.settlement.deleteMany({ where: { id, tripId } });
  return res.count;
}
