import { handle, ok } from "@/lib/api/http";
import { requireTripUser } from "@/lib/api/session";
import { listCollectedStamps } from "@/lib/services/stampsService";

/** GET /api/v1/stamps — gesammelte Eki-Stamps der aktuellen Reise. */
export function GET() {
  return handle(async () => {
    const { tripId } = await requireTripUser();
    return ok({ collected: await listCollectedStamps(tripId) });
  });
}
