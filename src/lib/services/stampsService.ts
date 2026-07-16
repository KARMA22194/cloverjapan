import { db } from "@/lib/db";

export interface CollectedStampDto {
  stampKey: string;
  by: string;
  at: string;
}

export async function listCollectedStamps(tripId: string): Promise<CollectedStampDto[]> {
  const rows = await db.collectedStamp.findMany({
    where: { tripId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({ stampKey: r.stampKey, by: r.createdByName, at: r.createdAt.toISOString() }));
}

/** Stempel sammeln (idempotent – doppeltes Sammeln ändert nichts). */
export async function collectStamp(tripId: string, stampKey: string, byName: string) {
  return db.collectedStamp.upsert({
    where: { tripId_stampKey: { tripId, stampKey } },
    create: { tripId, stampKey, createdByName: byName },
    update: {},
  });
}
