import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { parseDateParam } from "@/lib/time";
import { withPositionLock } from "@/lib/services/position";

/** Reiseplaner-Stopps eines Users, in Reihenfolge. */
export function getTripStops(tripId: string) {
  return db.tripStop.findMany({ where: { tripId }, orderBy: { position: "asc" } });
}

/** Stopps, die einem bestimmten Reisetag zugeordnet sind (für den Tagesplaner). */
export function getTripStopsForDate(tripId: string, date: string) {
  return db.tripStop.findMany({
    where: { tripId, date: parseDateParam(date) },
    orderBy: { position: "asc" },
  });
}

/** Hängt einen einzelnen Stopp hinten an (z. B. Übernahme aus dem Tagesplaner). */
export async function addTripStop(
  tripId: string,
  stop: { label: string; lat: number; lng: number; date?: string | null },
  createdByName: string,
) {
  // Position aus dem aktuellen Maximum ableiten — in einer **serialisierbaren**
  // Transaktion, sonst vergeben gleichzeitige Aufrufe dieselbe Nummer (siehe
  // withPositionLock). `count()` davor war zusätzlich falsch, sobald einmal
  // gelöscht wurde: dann entstehen Lücken und die Zählung kollidiert erneut.
  return withPositionLock(async (tx) => {
    const last = await tx.tripStop.findFirst({
      where: { tripId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    return tx.tripStop.create({
      data: {
        // id: server-generiert (cuid). clientId ist die stabile Kennung für den Client.
        clientId: randomUUID(),
        tripId,
        label: stop.label,
        lat: stop.lat,
        lng: stop.lng,
        date: stop.date ? parseDateParam(stop.date) : null,
        position: (last?.position ?? -1) + 1,
        createdByName,
      },
    });
  });
}

/** Ersetzt die komplette Stopp-Liste (client-ids bleiben stabil).
 *  Ersteller-Name bleibt für bestehende ids erhalten; neue bekommen den aktuellen Nutzer. */
export async function replaceTripStops(
  tripId: string,
  stops: {
    id: string;
    label: string;
    lat: number;
    lng: number;
    active?: boolean;
    date?: string | null;
    note?: string;
  }[],
  createdByName: string,
) {
  // Lesen der Ersteller-Namen **innerhalb** der Transaktion: liefe es davor, könnte
  // ein paralleler PUT zwischen Read und Delete die Namen falsch zuordnen (der
  // zweite Aufruf sähe einen Zwischenstand). Spart nebenbei einen Roundtrip.
  await db.$transaction(async (tx) => {
    const existing = await tx.tripStop.findMany({
      where: { tripId },
      select: { clientId: true, createdByName: true },
    });
    const prev = new Map(existing.map((e) => [e.clientId, e.createdByName]));

    await tx.tripStop.deleteMany({ where: { tripId } });
    await tx.tripStop.createMany({
      // Kein `id` vom Client — der PK wird server-seitig vergeben (cuid); die
      // vom Client gelieferte `id` ist nur die stabile Kennung → clientId.
      data: stops.map((s, i) => ({
        clientId: s.id,
        tripId,
        label: s.label,
        lat: s.lat,
        lng: s.lng,
        active: s.active ?? true,
        date: s.date ? parseDateParam(s.date) : null,
        note: s.note ?? "",
        position: i,
        createdByName: prev.get(s.id) || createdByName,
      })),
    });
  });
  return getTripStops(tripId);
}
