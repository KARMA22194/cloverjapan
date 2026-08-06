import { after } from "next/server";

import { db } from "@/lib/db";
import { pushConfigured, sendPushToTrip } from "@/lib/services/push";

export interface ActivityInput {
  tripId: string;
  userId?: string;
  userName: string;
  action: string;
  summary: string;
}

// Maschinen-Key → lesbarer Titel für die Push-Benachrichtigung.
const ACTION_LABELS: Record<string, string> = {
  "booking.create": "Neue Buchung",
  "expense.create": "Neue Ausgabe",
  "flight.create": "Neuer Flug",
  "stamp.collect": "Eki-Stempel gesammelt",
  "task.create": "Neue Aufgabe",
  "wishlist.create": "Neuer Wunsch",
};

/**
 * Ereignis in den Aktivitäts-Feed schreiben + Web-Push an die übrigen Mitglieder.
 *
 * Beides ist **best-effort** und läuft über `after()` **nach** der HTTP-Antwort — die
 * eigentliche Mutation (Ausgabe/Flug/Buchung anlegen) wartet also nicht mehr auf den
 * Activity-Insert und die N HTTPS-Calls an FCM/Mozilla (vorher +0,5–1 s pro Mutation).
 */
export function logActivity(input: ActivityInput): void {
  after(async () => {
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
      /* Feed ist unkritisch. */
    }

    if (!pushConfigured()) return;
    try {
      await sendPushToTrip(input.tripId, input.userId ?? null, {
        title: ACTION_LABELS[input.action] ?? "Neue Aktivität",
        body: input.userName ? `${input.userName}: ${input.summary}` : input.summary,
        url: "/start",
      });
    } catch {
      /* Push ist unkritisch. */
    }
  });
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
