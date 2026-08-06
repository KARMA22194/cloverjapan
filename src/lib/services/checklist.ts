import { db } from "@/lib/db";

/** Checklisten-Einträge eines Users, in Reihenfolge. */
export function getChecklist(tripId: string) {
  return db.checklistItem.findMany({ where: { tripId }, orderBy: { position: "asc" } });
}

/** Ersetzt die komplette Checkliste; Ersteller-Name bleibt je id erhalten. */
export async function replaceChecklist(
  tripId: string,
  items: {
    id: string;
    text: string;
    done: boolean;
    assigneeName?: string;
    completedByName?: string;
  }[],
  createdByName: string,
) {
  // Ersteller-Name je stabiler Client-Kennung (clientId) übernehmen.
  const existing = await db.checklistItem.findMany({
    where: { tripId },
    select: { clientId: true, createdByName: true },
  });
  const prev = new Map(existing.map((e) => [e.clientId, e.createdByName]));
  await db.$transaction([
    db.checklistItem.deleteMany({ where: { tripId } }),
    db.checklistItem.createMany({
      // Kein `id` vom Client — PK server-seitig (cuid); Client-`id` → clientId.
      data: items.map((it, i) => ({
        clientId: it.id,
        tripId,
        text: it.text.trim(),
        done: it.done,
        position: i,
        createdByName: prev.get(it.id) || createdByName,
        assigneeName: it.assigneeName ?? "",
        // Nur bei erledigten Punkten einen „erledigt von" behalten.
        completedByName: it.done ? (it.completedByName ?? "") : "",
      })),
    }),
  ]);
  return getChecklist(tripId);
}
