import type { NoteCategory } from "@prisma/client";

import { db } from "@/lib/db";
import { monthRange, parseDateParam } from "@/lib/time";

/** Alle Notizen eines Users an einem Tag, chronologisch. */
export function getDayNotes(userId: string, dateParam: string) {
  const date = parseDateParam(dateParam);
  return db.note.findMany({
    where: { userId, date },
    orderBy: { createdAt: "asc" },
  });
}

/** Alle Notizen eines Users in einem Monat (für die Kalenderansicht). */
export function getMonthNotes(userId: string, year: number, month: number) {
  const { start, end } = monthRange(year, month);
  return db.note.findMany({
    where: { userId, date: { gte: start, lt: end } },
    orderBy: { createdAt: "asc" },
  });
}

/** Einzelne Notiz – nur wenn sie dem User gehört. */
export function getOwnedNote(id: string, userId: string) {
  return db.note.findFirst({ where: { id, userId } });
}

export function createNote(input: {
  userId: string;
  dateParam: string;
  content: string;
  category: NoteCategory;
}) {
  return db.note.create({
    data: {
      userId: input.userId,
      date: parseDateParam(input.dateParam),
      content: input.content.trim(),
      category: input.category,
    },
  });
}

/** Aktualisiert eine Notiz – nur wenn sie dem User gehört. Gibt geänderte Zeilen zurück. */
export async function updateNoteOwned(input: {
  id: string;
  userId: string;
  content?: string;
  category?: NoteCategory;
}) {
  const data: { content?: string; category?: NoteCategory } = {};
  if (input.content !== undefined) data.content = input.content.trim();
  if (input.category !== undefined) data.category = input.category;

  const result = await db.note.updateMany({
    where: { id: input.id, userId: input.userId },
    data,
  });
  return result.count;
}

/** Löscht eine Notiz – nur wenn sie dem User gehört. */
export async function deleteNoteOwned(id: string, userId: string) {
  const result = await db.note.deleteMany({ where: { id, userId } });
  return result.count;
}
