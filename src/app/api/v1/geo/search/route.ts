import type { NextRequest } from "next/server";

import { ApiError, badRequest, handle, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";

const USER_AGENT = "TimeTracker-Reiseplaner/1.0 (self-hosted dev)";

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

/**
 * GET /api/v1/geo/search?q=… — Ortsname → Koordinaten (Nominatim, auf Japan begrenzt).
 * Server-seitig: der Container erreicht Nominatim über den Proxy-CA und setzt
 * einen sauberen User-Agent (Nominatim-Policy); der Browser braucht kein CORS.
 */
export function GET(req: NextRequest) {
  return handle(async () => {
    await requireUser();
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
    if (q.length < 2) throw badRequest("Bitte mindestens 2 Zeichen eingeben.");

    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", q);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "5");
    url.searchParams.set("countrycodes", "jp"); // Reiseplaner für Japan
    url.searchParams.set("accept-language", "de,en,ja");

    // Geocoding ist für gleiche Suche stabil → 1 h serverseitig cachen.
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new ApiError(502, "Geocoding-Dienst nicht erreichbar.");

    const data = (await res.json()) as NominatimResult[];
    const results = data.map((d) => ({
      label: d.display_name,
      lat: Number(d.lat),
      lng: Number(d.lon),
    }));
    return ok(results);
  });
}
