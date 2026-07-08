import type { NextRequest } from "next/server";

import { ApiError, badRequest, handle, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";

/**
 * GET /api/v1/geo/transit?from=lat,lng&to=lat,lng&mode=direct|any
 * Beste Zugverbindung zwischen zwei Orten via Google Directions (Transit-Modus).
 * Braucht GOOGLE_MAPS_API_KEY in der Umgebung; ohne Key → 503 mit klarer Meldung.
 * mode=direct bevorzugt umstiegsfreie Verbindungen, sonst die schnellste.
 */
export function GET(req: NextRequest) {
  return handle(async () => {
    await requireUser();

    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) {
      throw new ApiError(
        503,
        "Zug-Anbieter nicht konfiguriert: GOOGLE_MAPS_API_KEY fehlt in .env.",
      );
    }

    const from = parsePoint(req.nextUrl.searchParams.get("from"));
    const to = parsePoint(req.nextUrl.searchParams.get("to"));
    if (!from || !to) throw badRequest("from und to als lat,lng nötig.");
    const preferDirect = req.nextUrl.searchParams.get("mode") === "direct";

    const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
    url.searchParams.set("origin", `${from.lat},${from.lng}`);
    url.searchParams.set("destination", `${to.lat},${to.lng}`);
    url.searchParams.set("mode", "transit");
    url.searchParams.set("transit_mode", "rail"); // Zug/Shinkansen (inkl. U-Bahn/Tram)
    url.searchParams.set("alternatives", "true");
    url.searchParams.set("language", "de");
    url.searchParams.set("departure_time", String(Math.floor(Date.now() / 1000)));
    url.searchParams.set("key", key);

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new ApiError(502, "Directions-Dienst nicht erreichbar.");

    const data = (await res.json()) as GoogleDirections;
    if (data.status !== "OK" || !data.routes?.length) {
      throw new ApiError(502, `Keine Zugverbindung gefunden (${data.status ?? "Fehler"}).`);
    }

    const connections = data.routes.map(toConnection);
    connections.sort((a, b) =>
      preferDirect
        ? a.transfers - b.transfers || a.durationMin - b.durationMin
        : a.durationMin - b.durationMin,
    );

    return ok({ best: connections[0], alternatives: connections.length });
  });
}

function parsePoint(s: string | null): { lat: number; lng: number } | null {
  if (!s) return null;
  const [lat, lng] = s.split(",").map(Number);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
}

interface GoogleDirections {
  status: string;
  routes?: GoogleRoute[];
}
interface GoogleRoute {
  fare?: { currency: string; value: number; text: string };
  legs: {
    duration: { value: number };
    departure_time?: { text: string };
    arrival_time?: { text: string };
    steps: {
      travel_mode: string;
      transit_details?: {
        line?: { name?: string; short_name?: string };
      };
    }[];
  }[];
}

function toConnection(route: GoogleRoute) {
  const leg = route.legs[0];
  const transitSteps = leg.steps.filter((s) => s.travel_mode === "TRANSIT");
  const lines = transitSteps
    .map((s) => s.transit_details?.line?.short_name || s.transit_details?.line?.name)
    .filter((v): v is string => Boolean(v));
  return {
    durationMin: Math.round(leg.duration.value / 60),
    transfers: Math.max(0, transitSteps.length - 1),
    lines,
    departure: leg.departure_time?.text ?? null,
    arrival: leg.arrival_time?.text ?? null,
    fare: route.fare ? { text: route.fare.text } : null,
  };
}
