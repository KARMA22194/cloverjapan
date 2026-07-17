import { type NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/api/session";
import { consumeRateLimit } from "@/lib/rate";

const MAPS_SEARCH = "https://www.google.com/maps/search/?api=1";

// Erlaubte Google-Place-Typen für den `type`-Filter (schränkt den Treffer ein:
// Konbini bzw. Hotel). Unbekannte Werte → kein Filter (z. B. allgemeine Stopps).
const ALLOWED_TYPES = new Set(["convenience_store", "lodging"]);

/** Deep-Link auf einen exakten POI (mit place_id). */
function poiUrl(query: string, placeId: string): string {
  return `${MAPS_SEARCH}&query=${encodeURIComponent(query)}&query_place_id=${encodeURIComponent(placeId)}`;
}

/**
 * Keyfreier Fallback-Link. Wenn Koordinaten vorliegen, das koordinaten-zentrierte
 * `/maps/search/<q>/@lat,lng`-Format nutzen → landet auch bei mehrdeutigen Namen an
 * der richtigen Stelle (statt einer reinen, ortslosen Namenssuche).
 */
function fallbackUrl(query: string, lat: number, lng: number): string {
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${lat},${lng},16z`;
  }
  return `${MAPS_SEARCH}&query=${encodeURIComponent(query)}`;
}

/**
 * Places API (New) „Text Search" – aber nur die place_id anfordern (Feld-Maske
 * `places.id`) → SKU „Text Search Essentials (IDs Only)" = kostenlos.
 *
 * Entscheidend für den richtigen Treffer:
 *  - `rankPreference: DISTANCE` → Google liefert den zu den Koordinaten
 *    **nächstgelegenen** Ort, nicht den prominentesten (sonst käme z. B. immer
 *    der große Bahnhofs-Lawson statt der Filiale am Marker). Wir kennen die
 *    Koordinaten exakt, also ist der nächste Treffer der gemeinte.
 *  - optionaler `includedType` (`convenience_store`/`lodging`) → grenzt auf
 *    Konbini bzw. Hotel ein (keine gleichnamigen ATMs/Restaurants).
 * Beide Parameter beeinflussen die Abrechnung nicht (nur die Feld-Maske zählt).
 */
async function resolvePlaceId(
  textQuery: string,
  lat: number,
  lng: number,
  key: string,
  includedType?: string,
): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        // Nur die ID → kostenlose Essentials-SKU (keine Pro-/Atmosphere-Felder).
        "X-Goog-FieldMask": "places.id",
      },
      body: JSON.stringify({
        textQuery,
        maxResultCount: 1,
        rankPreference: "DISTANCE",
        ...(includedType ? { includedType } : {}),
        locationBias: {
          circle: { center: { latitude: lat, longitude: lng }, radius: 100 },
        },
      }),
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { places?: { id?: string }[] };
    return data.places?.[0]?.id ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET /api/v1/geo/place-link?lat=&lng=&q=&fallback=&type=
 * Leitet auf Google Maps weiter. Mit GOOGLE_MAPS_API_KEY wird per (kostenloser)
 * ID-only Text Search der exakte Ort aufgelöst (Konbini, Hotel, Stopp); ohne Key
 * bzw. bei jedem Fehler geht es auf den keyfreien Fallback-Link. `type` grenzt
 * optional auf `convenience_store`/`lodging` ein. Bewusst kein `handle()`-Wrapper:
 * dieser Endpunkt antwortet immer mit einem Redirect, nie mit einer JSON-Fehlerseite.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  const q = (params.get("q") ?? "").trim();
  const type = params.get("type") ?? "";
  const includedType = ALLOWED_TYPES.has(type) ? type : undefined;
  const fallbackQuery =
    (params.get("fallback") ?? "").trim() ||
    q ||
    (Number.isFinite(lat) && Number.isFinite(lng) ? `${lat},${lng}` : "Japan");
  const fallback = fallbackUrl(fallbackQuery, lat, lng);

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || !q || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.redirect(fallback);
  }

  // Auth + sparsames Rate-Limit; scheitert das, still auf den Fallback gehen
  // (der Link darf nie ins Leere laufen).
  try {
    const user = await requireUser();
    const allowed = await consumeRateLimit(`placelink:${user.id}`, 120, 60 * 60 * 1000);
    if (!allowed) return NextResponse.redirect(fallback);
  } catch {
    return NextResponse.redirect(fallback);
  }

  const placeId = await resolvePlaceId(q, lat, lng, key, includedType);
  return NextResponse.redirect(placeId ? poiUrl(q, placeId) : fallback);
}
