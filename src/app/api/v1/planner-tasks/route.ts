import type { NextRequest } from "next/server";
import { z } from "zod";

import { handle, ok, readJson } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { getActiveTripId } from "@/lib/services/trip";
import { dateParamSchema } from "@/lib/api/schemas";
import { createPlannerTask, getPlannerTasks } from "@/lib/services/plannerTasks";
import { toDateParam } from "@/lib/time";

const createBody = z.object({
  date: dateParamSchema,
  time: z.string().max(5).optional().default(""),
  text: z.string().min(1).max(300),
  assigneeName: z.string().max(100).optional().default(""),
});

const toDto = (t: {
  id: string;
  date: Date;
  time: string;
  text: string;
  done: boolean;
  createdByName: string;
  assigneeName: string;
}) => ({
  id: t.id,
  date: toDateParam(t.date),
  time: t.time,
  text: t.text,
  done: t.done,
  by: t.createdByName,
  assignee: t.assigneeName,
});

/** GET /api/v1/planner-tasks?date=YYYY-MM-DD — Aufgaben eines Tages. */
export function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const tripId = await getActiveTripId(user.id);
    const date = dateParamSchema.parse(req.nextUrl.searchParams.get("date") ?? undefined);
    return ok((await getPlannerTasks(tripId, date)).map(toDto));
  });
}

/** POST /api/v1/planner-tasks — Aufgabe anlegen. */
export function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const tripId = await getActiveTripId(user.id);
    const body = createBody.parse(await readJson(req));
    return ok(
      toDto(
        await createPlannerTask(
          tripId,
          { dateParam: body.date, time: body.time, text: body.text, assigneeName: body.assigneeName },
          user.name,
        ),
      ),
      201,
    );
  });
}
