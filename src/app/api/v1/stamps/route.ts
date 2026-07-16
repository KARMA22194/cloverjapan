import { handle, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { getActiveTripId } from "@/lib/services/trip";
import { listCollectedStamps } from "@/lib/services/stampsService";

/** GET /api/v1/stamps — gesammelte Eki-Stamps der aktuellen Reise. */
export function GET() {
  return handle(async () => {
    const user = await requireUser();
    const tripId = await getActiveTripId(user.id);
    return ok({ collected: await listCollectedStamps(tripId) });
  });
}
