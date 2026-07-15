import { db } from "@/lib/db";

/** Checklisten-Einträge eines Users, in Reihenfolge. */
export function getChecklist(tripId: string) {
  return db.checklistItem.findMany({ where: { tripId }, orderBy: { position: "asc" } });
}

/** Ersetzt die komplette Checkliste; Ersteller-Name bleibt je id erhalten. */
export async function replaceChecklist(
  tripId: string,
  items: { id: string; text: string; done: boolean; assigneeName?: string }[],
  createdByName: string,
) {
  const existing = await db.checklistItem.findMany({
    where: { tripId },
    select: { id: true, createdByName: true },
  });
  const prev = new Map(existing.map((e) => [e.id, e.createdByName]));
  await db.$transaction([
    db.checklistItem.deleteMany({ where: { tripId } }),
    db.checklistItem.createMany({
      data: items.map((it, i) => ({
        id: it.id,
        tripId,
        text: it.text.trim(),
        done: it.done,
        position: i,
        createdByName: prev.get(it.id) || createdByName,
        assigneeName: it.assigneeName ?? "",
      })),
    }),
  ]);
  return getChecklist(tripId);
}
