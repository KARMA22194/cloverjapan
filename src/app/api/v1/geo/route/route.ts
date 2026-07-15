import type { NextRequest } from "next/server";

import { ApiError, badRequest, handle, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";

const USER_AGENT = "TimeTracker-Reiseplaner/1.0 (self-hosted dev)";

/**
 * GET /api/v1/geo/route?points=lat,lng;lat,lng;… — beste Route durch alle Orte.
 * Nutzt den OSRM-Trip-Service (löst die optimale Besuchsreihenfolge, offener Pfad
 * ab dem ersten Ort) und liefert Geometrie + Distanz/Dauer + optimale Reihenfolge.
 */
export function GET(req: NextRequest) {
  return handle(async () => {
    await requireUser();

    const raw = req.nextUrl.searchParams.get("points") ?? "";
    const points = raw
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((pair) => {
        const [lat, lng] = pair.split(",").map(Number);
        return { lat, lng };
      });

    if (points.length < 2) throw badRequest("Mindestens zwei Orte nötig.");
    if (points.some((p) => Number.isNaN(p.lat) || Number.isNaN(p.lng))) {
      throw badRequest("Ungültige Koordinaten.");
    }

    // OSRM erwartet lng,lat.
    const coordStr = points.map((p) => `${p.lng},${p.lat}`).join(";");
    const url =
      `https://router.project-osrm.org/trip/v1/driving/${coordStr}` +
      `?source=first&roundtrip=false&geometries=geojson&overview=full`;

    // Route für dieselben Punkte ist stabil → 1 h serverseitig cachen.
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new ApiError(502, "Routing-Dienst nicht erreichbar.");

    const data = (await res.json()) as {
      code: string;
      trips?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[];
      waypoints?: { waypoint_index: number }[];
    };
    if (data.code !== "Ok" || !data.trips?.[0] || !data.waypoints) {
      throw new ApiError(502, `Route nicht berechenbar (${data.code}).`);
    }

    const trip = data.trips[0];
    // GeoJSON ist [lng,lat] → für Leaflet nach [lat,lng] drehen.
    const geometry = trip.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
    // Optimale Reihenfolge: waypoint_index ist die Position im Trip.
    const order = data.waypoints
      .map((w, i) => ({ i, pos: w.waypoint_index }))
      .sort((a, b) => a.pos - b.pos)
      .map((x) => x.i);

    return ok({
      geometry,
      distanceKm: Math.round(trip.distance / 100) / 10,
      durationMin: Math.round(trip.duration / 60),
      order,
    });
  });
}
