import type { NextRequest } from "next/server";

import { handle, notFound, ok, readJson } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { timeEntryUpdateBody } from "@/lib/api/schemas";
import { toTimeEntryDto } from "@/lib/api/dto";
import {
  deleteTimeEntryOwned,
  getOwnedEntry,
  updateTimeEntryOwned,
} from "@/lib/services/timeEntries";
import { hoursToMinutes } from "@/lib/time";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/v1/time-entries/{id} — eigenen Eintrag ändern. */
export function PATCH(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = timeEntryUpdateBody.parse(await readJson(req));

    const count = await updateTimeEntryOwned({
      id,
      userId: user.id,
      projectId: body.projectId,
      minutes: hoursToMinutes(body.hours),
      note: body.note ?? null,
    });
    if (count === 0) throw notFound("Eintrag nicht gefunden.");

    const entry = await getOwnedEntry(id, user.id);
    if (!entry) throw notFound("Eintrag nicht gefunden.");
    return ok(toTimeEntryDto(entry));
  });
}

/** DELETE /api/v1/time-entries/{id} — eigenen Eintrag löschen. */
export function DELETE(_req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const count = await deleteTimeEntryOwned(id, user.id);
    if (count === 0) throw notFound("Eintrag nicht gefunden.");
    return ok({ id, deleted: true });
  });
}
