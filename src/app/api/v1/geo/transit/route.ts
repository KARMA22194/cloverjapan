import type { NextRequest } from "next/server";

import { ApiError, badRequest, handle, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";

/**
 * GET /api/v1/geo/transit?from=lat,lng&to=lat,lng&mode=direct|any
 * Beste Zugverbindung zwischen zwei Orten.
 *  - Mit GOOGLE_MAPS_API_KEY: echte Verbindung via Google Directions (Transit).
 *  - Ohne Key (oder wenn Google scheitert): distanzbasierte Schätzung (estimated=true).
 * mode=direct bevorzugt umstiegsfreie Verbindungen.
 */
export function GET(req: NextRequest) {
  return handle(async () => {
    await requireUser();

    const from = parsePoint(req.nextUrl.searchParams.get("from"));
    const to = parsePoint(req.nextUrl.searchParams.get("to"));
    if (!from || !to) throw badRequest("from und to als lat,lng nötig.");
    const preferDirect = req.nextUrl.searchParams.get("mode") === "direct";

    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (key) {
      try {
        const best = await googleTransit(from, to, preferDirect, key);
        return ok({ best, alternatives: best.alternatives, estimated: false });
      } catch {
        // Google nicht verfügbar → auf Schätzung zurückfallen.
      }
    }

    return ok({ best: estimateTransit(from, to, preferDirect), alternatives: 1, estimated: true });
  });
}

interface Point {
  lat: number;
  lng: number;
}

function parsePoint(s: string | null): Point | null {
  if (!s) return null;
  const [lat, lng] = s.split(",").map(Number);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
}

/* ---------------- Echte Verbindung (Google Directions) ---------------- */

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
      transit_details?: { line?: { name?: string; short_name?: string } };
    }[];
  }[];
}

async function googleTransit(from: Point, to: Point, preferDirect: boolean, key: string) {
  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", `${from.lat},${from.lng}`);
  url.searchParams.set("destination", `${to.lat},${to.lng}`);
  url.searchParams.set("mode", "transit");
  url.searchParams.set("transit_mode", "rail");
  url.searchParams.set("alternatives", "true");
  url.searchParams.set("language", "de");
  url.searchParams.set("departure_time", String(Math.floor(Date.now() / 1000)));
  url.searchParams.set("key", key);

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new ApiError(502, "Directions-Dienst nicht erreichbar.");
  const data = (await res.json()) as GoogleDirections;
  if (data.status !== "OK" || !data.routes?.length) {
    throw new ApiError(502, `Keine Zugverbindung (${data.status ?? "Fehler"}).`);
  }

  const conns = data.routes.map((route) => {
    const leg = route.legs[0];
    const transit = leg.steps.filter((s) => s.travel_mode === "TRANSIT");
    return {
      durationMin: Math.round(leg.duration.value / 60),
      transfers: Math.max(0, transit.length - 1),
      lines: transit
        .map((s) => s.transit_details?.line?.short_name || s.transit_details?.line?.name)
        .filter((v): v is string => Boolean(v)),
      departure: leg.departure_time?.text ?? null,
      arrival: leg.arrival_time?.text ?? null,
      fare: route.fare ? { text: route.fare.text } : null,
      fareYen:
        route.fare && route.fare.currency === "JPY" ? Math.round(route.fare.value) : null,
      estimated: false as const,
    };
  });
  conns.sort((a, b) =>
    preferDirect
      ? a.transfers - b.transfers || a.durationMin - b.durationMin
      : a.durationMin - b.durationMin,
  );
  return { ...conns[0], alternatives: conns.length };
}

/* ---------------- Schätzung (keyfrei) ---------------- */

function haversineKm(a: Point, b: Point): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const yenFmt = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });

function estimateTransit(from: Point, to: Point, preferDirect: boolean) {
  // Schienenweg grob 20 % länger als Luftlinie.
  const km = haversineKm(from, to) * 1.2;
  // Direkt = Shinkansen (schnell, teurer); mit Umstieg = Regional/Express (langsamer, günstiger).
  const speed = preferDirect ? 200 : 90; // km/h
  const overhead = preferDirect ? 20 : 40; // min
  const yenPerKm = preferDirect ? 22 : 14;
  const durationMin = Math.round((km / speed) * 60 + overhead);
  const fareYen = Math.round((km * yenPerKm) / 100) * 100;
  return {
    durationMin,
    transfers: preferDirect ? 0 : 1,
    lines: [preferDirect ? "Shinkansen (Schätzung)" : "Regional/Express (Schätzung)"],
    departure: null,
    arrival: null,
    fare: { text: `≈ ${yenFmt.format(fareYen)} ¥` },
    fareYen,
    estimated: true as const,
    alternatives: 1,
  };
}
