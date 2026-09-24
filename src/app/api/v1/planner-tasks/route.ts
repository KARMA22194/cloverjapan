import type { NextRequest } from "next/server";
import { z } from "zod";

import { handle, ok, readJson } from "@/lib/api/http";
import { requireTripUser } from "@/lib/api/session";
import { clientIdSchema, dateParamSchema } from "@/lib/api/schemas";
import { createPlannerTask, getPlannerTasks } from "@/lib/services/plannerTasks";
import { logActivity } from "@/lib/services/activityService";
import { toDateParam } from "@/lib/time";

const createBody = z.object({
  id: clientIdSchema,
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
    const { tripId } = await requireTripUser();
    const date = dateParamSchema.parse(req.nextUrl.searchParams.get("date") ?? undefined);
    return ok((await getPlannerTasks(tripId, date)).map(toDto));
  });
}

/** POST /api/v1/planner-tasks — Aufgabe anlegen. */
export function POST(req: NextRequest) {
  return handle(async () => {
    const { user, tripId } = await requireTripUser();
    const body = createBody.parse(await readJson(req));
    const created = await createPlannerTask(
      tripId,
      {
        id: body.id,
        dateParam: body.date,
        time: body.time,
        text: body.text,
        assigneeName: body.assigneeName,
      },
      user.name,
    );
    logActivity({
      tripId,
      userId: user.id,
      userName: user.name,
      action: "task.create",
      summary: created.text,
    });
    return ok(toDto(created), 201);
  });
}
