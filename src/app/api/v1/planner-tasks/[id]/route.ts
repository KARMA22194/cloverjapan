import type { NextRequest } from "next/server";
import { z } from "zod";

import { handle, notFound, ok, readJson } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { getActiveTripId } from "@/lib/services/trip";
import {
  deletePlannerTaskOwned,
  getOwnedPlannerTask,
  updatePlannerTaskOwned,
} from "@/lib/services/plannerTasks";
import { toDateParam } from "@/lib/time";

type Ctx = { params: Promise<{ id: string }> };

const patchBody = z
  .object({
    done: z.boolean().optional(),
    text: z.string().min(1).max(300).optional(),
    time: z.string().max(5).optional(),
  })
  .refine((d) => d.done !== undefined || d.text !== undefined || d.time !== undefined, {
    message: "Nichts zu ändern.",
  });

/** PATCH /api/v1/planner-tasks/{id} — Aufgabe ändern (done/text/time). */
export function PATCH(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const tripId = await getActiveTripId(user.id);
    const { id } = await ctx.params;
    const body = patchBody.parse(await readJson(req));
    const count = await updatePlannerTaskOwned(id, tripId, body);
    if (count === 0) throw notFound("Aufgabe nicht gefunden.");
    const t = await getOwnedPlannerTask(id, tripId);
    if (!t) throw notFound("Aufgabe nicht gefunden.");
    return ok({
      id: t.id,
      date: toDateParam(t.date),
      time: t.time,
      text: t.text,
      done: t.done,
      by: t.createdByName,
    });
  });
}

/** DELETE /api/v1/planner-tasks/{id} — Aufgabe löschen. */
export function DELETE(_req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const tripId = await getActiveTripId(user.id);
    const { id } = await ctx.params;
    const count = await deletePlannerTaskOwned(id, tripId);
    if (count === 0) throw notFound("Aufgabe nicht gefunden.");
    return ok({ id, deleted: true });
  });
}
