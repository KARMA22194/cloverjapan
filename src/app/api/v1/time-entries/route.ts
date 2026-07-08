import type { NextRequest } from "next/server";

import { handle, ok, readJson } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { dateParamSchema, timeEntryCreateBody } from "@/lib/api/schemas";
import { toTimeEntryDto } from "@/lib/api/dto";
import { createTimeEntry, getDayEntries } from "@/lib/services/timeEntries";
import { hoursToMinutes } from "@/lib/time";

/** GET /api/v1/time-entries?date=YYYY-MM-DD — Einträge des aktuellen Nutzers an einem Tag. */
export function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const date = dateParamSchema.parse(req.nextUrl.searchParams.get("date") ?? undefined);
    const entries = await getDayEntries(user.id, date);
    return ok(entries.map(toTimeEntryDto));
  });
}

/** POST /api/v1/time-entries — neuen Eintrag für den aktuellen Nutzer anlegen. */
export function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const body = timeEntryCreateBody.parse(await readJson(req));
    const entry = await createTimeEntry({
      userId: user.id,
      projectId: body.projectId,
      dateParam: body.date,
      minutes: hoursToMinutes(body.hours),
      note: body.note ?? null,
    });
    return ok(toTimeEntryDto(entry), 201);
  });
}
