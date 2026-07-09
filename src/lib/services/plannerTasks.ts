import { db } from "@/lib/db";
import { parseDateParam } from "@/lib/time";

export function getPlannerTasks(tripId: string, dateParam: string) {
  return db.plannerTask.findMany({
    where: { tripId, date: parseDateParam(dateParam) },
    orderBy: { createdAt: "asc" },
  });
}

export function createPlannerTask(
  tripId: string,
  input: { dateParam: string; time: string; text: string },
) {
  return db.plannerTask.create({
    data: {
      tripId,
      date: parseDateParam(input.dateParam),
      time: input.time,
      text: input.text.trim(),
    },
  });
}

export function getOwnedPlannerTask(id: string, tripId: string) {
  return db.plannerTask.findFirst({ where: { id, tripId } });
}

export async function updatePlannerTaskOwned(
  id: string,
  tripId: string,
  data: { done?: boolean; text?: string; time?: string },
) {
  const res = await db.plannerTask.updateMany({ where: { id, tripId }, data });
  return res.count;
}

export async function deletePlannerTaskOwned(id: string, tripId: string) {
  const res = await db.plannerTask.deleteMany({ where: { id, tripId } });
  return res.count;
}
