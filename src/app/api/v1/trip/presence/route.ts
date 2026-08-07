import { handle, ok } from "@/lib/api/http";
import { requireTripUser } from "@/lib/api/session";
import { getTripPresence } from "@/lib/services/trip";

/**
 * GET /api/v1/trip/presence — schlanke Präsenz der Mitglieder ([{ id, lastSeenAt }]).
 * Für den 30-s-Poll gedacht: eine Query, KEINE Profilbilder, keine Einladungen — die
 * volle Mitgliederliste (`/api/v1/trip/members`) nur beim Mount und nach Mutationen.
 */
export function GET() {
  return handle(async () => {
    const { tripId } = await requireTripUser();
    return ok(await getTripPresence(tripId));
  });
}
