import type { NextRequest } from "next/server";

import { ApiError, badRequest, handle, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { enforceRateLimit } from "@/lib/rate";

/**
 * GET /api/v1/geo/transit?from=lat,lng&to=lat,lng&mode=direct|any
 * Beste Zugverbindung zwischen zwei Orten.
 *  - Mit GOOGLE_MAPS_API_KEY: echte Verbindung via Google Directions (Transit).
 *  - Ohne Key (oder wenn Google scheitert): distanzbasierte Schätzung (estimated=true).
 * mode=direct bevorzugt umstiegsfreie Verbindungen.
 */
export function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    // Einziger *wirklich* abgerechneter Google-Call (Directions) → drosseln wie die
    // anderen Kostenrouten (60/h/Nutzer), sonst Kosten-DoS per Schleife.
    await enforceRateLimit(`transit:${user.id}`, 60, 60 * 60 * 1000);

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
  // departure_time auf 5-min-Raster runden → identische Route teilt sich denselben
  // Fetch-Cache-Eintrag (sonst wäre jede URL wegen der Sekunde einzigartig).
  url.searchParams.set("departure_time", String(Math.floor(Date.now() / 1000 / 300) * 300));
  url.searchParams.set("key", key);

  // 5 min serverseitig cachen: dieselbe Verbindung wird nicht erneut abgerechnet.
  const res = await fetch(url, { next: { revalidate: 300 } });
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

  // Verkehrsmittel nach Distanz wählen: der Shinkansen fährt nur echte
  // Fernstrecken (Tokio↔Kyoto), nicht innerstädtisch. Kurze Wege laufen über
  // U-Bahn/Hochbahn (z. B. Yurikamome) bzw. Regionalzüge.
  const profile =
    km < 40
      ? { label: "Nahverkehr (U-Bahn/Regional)", speed: 35, overhead: 12, base: 150, perKm: 14, transfers: 1 }
      : km < 120
        ? { label: "Regional/Express", speed: 85, overhead: 18, base: 200, perKm: 16, transfers: 1 }
        : { label: "Shinkansen", speed: 200, overhead: 25, base: 2500, perKm: 22, transfers: 0 };

  const durationMin = Math.round((km / profile.speed) * 60 + profile.overhead);
  // Auf 10 ¥ gerundet (japanische Nahverkehrstarife liegen in dieser Größenordnung).
  const fareYen = Math.max(profile.base, Math.round((profile.base + km * profile.perKm) / 10) * 10);
  // „Direkt" bevorzugt: reduziert – wo möglich – einen Umstieg (ändert aber nicht das Verkehrsmittel).
  const transfers = preferDirect ? Math.max(0, profile.transfers - 1) : profile.transfers;

  return {
    durationMin,
    transfers,
    lines: [`${profile.label} (Schätzung)`],
    departure: null,
    arrival: null,
    fare: { text: `≈ ${yenFmt.format(fareYen)} ¥` },
    fareYen,
    estimated: true as const,
    alternatives: 1,
  };
}
