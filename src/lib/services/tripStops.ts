import { db } from "@/lib/db";

/** Reiseplaner-Stopps eines Users, in Reihenfolge. */
export function getTripStops(tripId: string) {
  return db.tripStop.findMany({ where: { tripId }, orderBy: { position: "asc" } });
}

/** Ersetzt die komplette Stopp-Liste (client-ids bleiben stabil).
 *  Ersteller-Name bleibt für bestehende ids erhalten; neue bekommen den aktuellen Nutzer. */
export async function replaceTripStops(
  tripId: string,
  stops: { id: string; label: string; lat: number; lng: number }[],
  createdByName: string,
) {
  const existing = await db.tripStop.findMany({
    where: { tripId },
    select: { id: true, createdByName: true },
  });
  const prev = new Map(existing.map((e) => [e.id, e.createdByName]));
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
        createdByName: prev.get(s.id) || createdByName,
      })),
    }),
  ]);
  return getTripStops(tripId);
}
