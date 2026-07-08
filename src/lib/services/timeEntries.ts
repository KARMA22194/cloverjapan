import { db } from "@/lib/db";
import { parseDateParam } from "@/lib/time";

/** Alle Einträge eines Users an einem Tag (inkl. Projekt), sortiert. */
export function getDayEntries(userId: string, dateParam: string) {
  const date = parseDateParam(dateParam);
  return db.timeEntry.findMany({
    where: { userId, date },
    include: { project: true },
    orderBy: { createdAt: "asc" },
  });
}

/** Einzelner Eintrag – nur wenn er dem User gehört (inkl. Projekt). */
export function getOwnedEntry(id: string, userId: string) {
  return db.timeEntry.findFirst({
    where: { id, userId },
    include: { project: true },
  });
}

export function createTimeEntry(input: {
  userId: string;
  projectId: string;
  dateParam: string;
  minutes: number;
  note?: string | null;
}) {
  return db.timeEntry.create({
    data: {
      userId: input.userId,
      projectId: input.projectId,
      date: parseDateParam(input.dateParam),
      minutes: input.minutes,
      note: input.note?.trim() || null,
    },
    include: { project: true },
  });
}

/** Aktualisiert einen Eintrag – nur wenn er dem User gehört. Gibt die Anzahl geänderter Zeilen zurück. */
export async function updateTimeEntryOwned(input: {
  id: string;
  userId: string;
  projectId: string;
  minutes: number;
  note?: string | null;
}) {
  const result = await db.timeEntry.updateMany({
    where: { id: input.id, userId: input.userId },
    data: {
      projectId: input.projectId,
      minutes: input.minutes,
      note: input.note?.trim() || null,
    },
  });
  return result.count;
}

/** Löscht einen Eintrag – nur wenn er dem User gehört. */
export async function deleteTimeEntryOwned(id: string, userId: string) {
  const result = await db.timeEntry.deleteMany({ where: { id, userId } });
  return result.count;
}
