import { db } from "@/lib/db";
import { forbidden } from "@/lib/api/http";
import { parseDateParam } from "@/lib/time";
import { getBookableProjects } from "./projects";

/**
 * Stellt sicher, dass der Nutzer auf dieses Projekt buchen darf (via Assignment
 * zugewiesen bzw. – ohne Assignments – ein aktives Projekt) und es nicht
 * archiviert ist. Sonst 403. Verhindert Umgehung der Buchungsberechtigung auf
 * dem Schreibpfad (nur die FK-Existenz reicht nicht).
 */
async function assertBookableProject(userId: string, projectId: string) {
  const projects = await getBookableProjects(userId);
  if (!projects.some((p) => p.id === projectId)) {
    throw forbidden("Für dieses Projekt besteht keine Buchungsberechtigung.");
  }
}

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

export async function createTimeEntry(input: {
  userId: string;
  projectId: string;
  dateParam: string;
  minutes: number;
  note?: string | null;
}) {
  await assertBookableProject(input.userId, input.projectId);
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
  await assertBookableProject(input.userId, input.projectId);
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
