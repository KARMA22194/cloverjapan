import { handle, ok } from "@/lib/api/http";
import { requireTripUser } from "@/lib/api/session";
import { listActivity } from "@/lib/services/activityService";

/** GET /api/v1/activity — jüngste Aktivitäten der aktuellen Reise. */
export function GET() {
  return handle(async () => {
    const { tripId } = await requireTripUser();
    return ok(await listActivity(tripId, 15));
  });
}
