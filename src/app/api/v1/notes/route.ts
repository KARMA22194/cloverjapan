import type { NextRequest } from "next/server";

import { handle, ok, readJson } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { dateParamSchema, noteCreateBody } from "@/lib/api/schemas";
import { toNoteDto } from "@/lib/api/dto";
import { createNote, getDayNotes } from "@/lib/services/notes";

/** GET /api/v1/notes?date=YYYY-MM-DD — Notizen des aktuellen Nutzers an einem Tag. */
export function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const date = dateParamSchema.parse(req.nextUrl.searchParams.get("date") ?? undefined);
    const notes = await getDayNotes(user.id, date);
    return ok(notes.map(toNoteDto));
  });
}

/** POST /api/v1/notes — neue Notiz für den aktuellen Nutzer anlegen. */
export function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const body = noteCreateBody.parse(await readJson(req));
    const note = await createNote({
      userId: user.id,
      dateParam: body.date,
      content: body.content,
      category: body.category,
    });
    return ok(toNoteDto(note), 201);
  });
}
