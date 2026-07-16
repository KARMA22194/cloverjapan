import type { NextRequest } from "next/server";

import { ApiError, badRequest, handle, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { enforceRateLimit } from "@/lib/rate";

const USER_AGENT = "CloverJapan-Reiseplaner/1.0 (self-hosted)";
const OVERPASS = "https://overpass-api.de/api/interpreter";

type Brand = "7-Eleven" | "Lawson" | "FamilyMart" | "Ministop" | "Konbini";

/** OSM-Tags → bekannte Kette (inkl. japanischer Schreibweisen). */
function detectBrand(tags: Record<string, string> | undefined): Brand {
  const s = `${tags?.brand ?? ""} ${tags?.["brand:en"] ?? ""} ${tags?.name ?? ""} ${tags?.["name:en"] ?? ""} ${tags?.operator ?? ""}`.toLowerCase();
  if (/(7-eleven|7 eleven|seven|セブン)/.test(s)) return "7-Eleven";
  if (/(lawson|ローソン)/.test(s)) return "Lawson";
  if (/(familymart|family mart|ファミリーマート|ファミマ)/.test(s)) return "FamilyMart";
  if (/(ministop|ミニストップ)/.test(s)) return "Ministop";
  return "Konbini";
}

/**
 * GET /api/v1/geo/konbini?points=lat,lng;lat,lng;…&radius=120
 * Convenience-Stores (7-Eleven, Lawson, FamilyMart …) entlang der Route.
 * Keyfrei über Overpass/OpenStreetMap (shop=convenience). Server-seitig gecacht.
 */
export function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    // Overpass ist eine geteilte, kostenlose Ressource → sparsam abfragen.
    await enforceRateLimit(`konbini:${user.id}`, 20, 60 * 60 * 1000);

    const raw = req.nextUrl.searchParams.get("points") ?? "";
    let points = raw
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((pair) => {
        const [lat, lng] = pair.split(",").map(Number);
        return { lat, lng };
      });
    if (points.length < 1) throw badRequest("Mindestens ein Punkt (points=lat,lng;…) nötig.");
    if (points.some((p) => Number.isNaN(p.lat) || Number.isNaN(p.lng))) {
      throw badRequest("Ungültige Koordinaten.");
    }
    // Overpass-Anfrage klein halten: höchstens 50 Stützpunkte der Polylinie.
    if (points.length > 50) {
      const step = Math.ceil(points.length / 50);
      points = points.filter((_, i) => i % step === 0 || i === points.length - 1);
    }

    const radiusRaw = Number(req.nextUrl.searchParams.get("radius") ?? "120");
    const radius = Math.min(400, Math.max(30, Number.isFinite(radiusRaw) ? radiusRaw : 120));

    // around:<radius>,lat1,lng1,lat2,lng2,… filtert Knoten entlang der Linie.
    const coords = points.map((p) => `${p.lat},${p.lng}`).join(",");
    const query = `[out:json][timeout:25];node[shop=convenience](around:${radius},${coords});out body 200;`;
    const url = `${OVERPASS}?data=${encodeURIComponent(query)}`;

    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      // Route ist stabil → 1 h serverseitig cachen (schont Overpass).
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new ApiError(502, "Konbini-Dienst (Overpass) nicht erreichbar.");

    const data = (await res.json()) as {
      elements?: { type: string; lat?: number; lon?: number; tags?: Record<string, string> }[];
    };
    const stores = (data.elements ?? [])
      .filter((e) => e.type === "node" && typeof e.lat === "number" && typeof e.lon === "number")
      .map((e) => ({
        lat: e.lat!,
        lng: e.lon!,
        brand: detectBrand(e.tags),
        name: e.tags?.["name:en"] || e.tags?.name || e.tags?.brand || "Konbini",
      }));

    return ok({ stores, count: stores.length });
  });
}
