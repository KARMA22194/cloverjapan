import { db } from "@/lib/db";

export interface ActivityInput {
  tripId: string;
  userId?: string;
  userName: string;
  action: string;
  summary: string;
}

/**
 * Ereignis in den Aktivitäts-Feed schreiben. Best-effort: ein Fehler hier darf
 * die eigentliche Mutation nie scheitern lassen.
 */
export async function logActivity(input: ActivityInput): Promise<void> {
  try {
    await db.activity.create({
      data: {
        tripId: input.tripId,
        userId: input.userId ?? null,
        userName: input.userName || "",
        action: input.action,
        summary: input.summary,
      },
    });
  } catch {
    /* Feed ist unkritisch – Haupt-Request nicht blockieren. */
  }
}

export interface ActivityEntry {
  id: string;
  userName: string;
  action: string;
  summary: string;
  createdAt: string;
}

/** Jüngste Aktivitäten der Reise (neueste zuerst). */
export async function listActivity(tripId: string, limit = 15): Promise<ActivityEntry[]> {
  const rows = await db.activity.findMany({
    where: { tripId },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 50),
  });
  return rows.map((a) => ({
    id: a.id,
    userName: a.userName,
    action: a.action,
    summary: a.summary,
    createdAt: a.createdAt.toISOString(),
  }));
}
