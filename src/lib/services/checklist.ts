import { db } from "@/lib/db";

/** Checklisten-Einträge eines Users, in Reihenfolge. */
export function getChecklist(tripId: string) {
  return db.checklistItem.findMany({ where: { tripId }, orderBy: { position: "asc" } });
}

/** Ersetzt die komplette Checkliste (client-ids bleiben stabil). */
export async function replaceChecklist(
  tripId: string,
  items: { id: string; text: string; done: boolean }[],
) {
  await db.$transaction([
    db.checklistItem.deleteMany({ where: { tripId } }),
    db.checklistItem.createMany({
      data: items.map((it, i) => ({
        id: it.id,
        tripId,
        text: it.text.trim(),
        done: it.done,
        position: i,
      })),
    }),
  ]);
  return getChecklist(tripId);
}
