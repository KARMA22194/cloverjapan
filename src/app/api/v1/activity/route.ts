import { handle, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { getActiveTripId } from "@/lib/services/trip";
import { listActivity } from "@/lib/services/activityService";

/** GET /api/v1/activity — jüngste Aktivitäten der aktuellen Reise. */
export function GET() {
  return handle(async () => {
    const user = await requireUser();
    const tripId = await getActiveTripId(user.id);
    return ok(await listActivity(tripId, 15));
  });
}
