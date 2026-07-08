import type { NoteCategory, Project, Role } from "@prisma/client";

import { minutesToHours, toDateParam } from "@/lib/time";

/* Prisma-Datensätze → schlanke, stabile Response-DTOs (siehe schemas.ts).
 * Wichtig: nie das Prisma-Objekt direkt zurückgeben (z. B. User.passwordHash!),
 * sondern immer explizit die erlaubten Felder abbilden. */

export function toProjectDto(p: Project) {
  return { id: p.id, name: p.name, code: p.code, color: p.color, archived: p.archived };
}

interface ProjectMetaInput {
  id: string;
  name: string;
  code: string;
  color: string;
}

export function toProjectMeta(p: ProjectMetaInput) {
  return { id: p.id, name: p.name, code: p.code, color: p.color };
}

interface TimeEntryInput {
  id: string;
  date: Date;
  projectId: string;
  minutes: number;
  note: string | null;
  project: ProjectMetaInput;
}

export function toTimeEntryDto(e: TimeEntryInput) {
  return {
    id: e.id,
    date: toDateParam(e.date),
    projectId: e.projectId,
    minutes: e.minutes,
    hours: minutesToHours(e.minutes),
    note: e.note,
    project: toProjectMeta(e.project),
  };
}

interface UserInput {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: Date;
  _count?: { timeEntries: number };
}

export function toUserDto(u: UserInput) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active,
    createdAt: u.createdAt.toISOString(),
    timeEntryCount: u._count?.timeEntries ?? 0,
  };
}

interface NoteInput {
  id: string;
  date: Date;
  content: string;
  category: NoteCategory;
  createdAt: Date;
}

export function toNoteDto(n: NoteInput) {
  return {
    id: n.id,
    date: toDateParam(n.date),
    content: n.content,
    category: n.category,
    createdAt: n.createdAt.toISOString(),
  };
}

export type NoteDto = ReturnType<typeof toNoteDto>;
