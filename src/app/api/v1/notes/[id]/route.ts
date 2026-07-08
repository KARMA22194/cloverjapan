import type { NextRequest } from "next/server";

import { handle, notFound, ok, readJson } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { noteUpdateBody } from "@/lib/api/schemas";
import { toNoteDto } from "@/lib/api/dto";
import { deleteNoteOwned, getOwnedNote, updateNoteOwned } from "@/lib/services/notes";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/v1/notes/{id} — eigene Notiz ändern (Inhalt und/oder Kategorie). */
export function PATCH(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = noteUpdateBody.parse(await readJson(req));

    const count = await updateNoteOwned({
      id,
      userId: user.id,
      content: body.content,
      category: body.category,
    });
    if (count === 0) throw notFound("Notiz nicht gefunden.");

    const note = await getOwnedNote(id, user.id);
    if (!note) throw notFound("Notiz nicht gefunden.");
    return ok(toNoteDto(note));
  });
}

/** DELETE /api/v1/notes/{id} — eigene Notiz löschen. */
export function DELETE(_req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const count = await deleteNoteOwned(id, user.id);
    if (count === 0) throw notFound("Notiz nicht gefunden.");
    return ok({ id, deleted: true });
  });
}
