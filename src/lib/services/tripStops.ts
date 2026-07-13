import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";

/** Reiseplaner-Stopps eines Users, in Reihenfolge. */
export function getTripStops(tripId: string) {
  return db.tripStop.findMany({ where: { tripId }, orderBy: { position: "asc" } });
}

/** Stopps, die einem bestimmten Reisetag zugeordnet sind (für den Tagesplaner). */
export function getTripStopsForDate(tripId: string, date: string) {
  return db.tripStop.findMany({ where: { tripId, date }, orderBy: { position: "asc" } });
}

/** Hängt einen einzelnen Stopp hinten an (z. B. Übernahme aus dem Tagesplaner). */
export async function addTripStop(
  tripId: string,
  stop: { label: string; lat: number; lng: number; date?: string | null },
  createdByName: string,
) {
  const position = await db.tripStop.count({ where: { tripId } });
  return db.tripStop.create({
    data: {
      id: randomUUID(),
      tripId,
      label: stop.label,
      lat: stop.lat,
      lng: stop.lng,
      date: stop.date ?? null,
      position,
      createdByName,
    },
  });
}

/** Ersetzt die komplette Stopp-Liste (client-ids bleiben stabil).
 *  Ersteller-Name bleibt für bestehende ids erhalten; neue bekommen den aktuellen Nutzer. */
export async function replaceTripStops(
  tripId: string,
  stops: { id: string; label: string; lat: number; lng: number; date?: string | null }[],
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
        date: s.date ?? null,
        position: i,
        createdByName: prev.get(s.id) || createdByName,
      })),
    }),
  ]);
  return getTripStops(tripId);
}
