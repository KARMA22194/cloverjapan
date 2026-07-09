import { db } from "@/lib/db";

/** Reiseplaner-Stopps eines Users, in Reihenfolge. */
export function getTripStops(tripId: string) {
  return db.tripStop.findMany({ where: { tripId }, orderBy: { position: "asc" } });
}

/** Ersetzt die komplette Stopp-Liste (client-ids bleiben stabil). */
export async function replaceTripStops(
  tripId: string,
  stops: { id: string; label: string; lat: number; lng: number }[],
) {
  await db.$transaction([
    db.tripStop.deleteMany({ where: { tripId } }),
    db.tripStop.createMany({
      data: stops.map((s, i) => ({
        id: s.id,
        tripId,
        label: s.label,
        lat: s.lat,
        lng: s.lng,
        position: i,
      })),
    }),
  ]);
  return getTripStops(tripId);
}
