import { type NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/api/session";
import { consumeRateLimit } from "@/lib/rate";

const MAPS_SEARCH = "https://www.google.com/maps/search/?api=1";

/** Google-Maps-Deep-Link auf einen exakten POI (mit place_id) bzw. den Fallback-Text. */
function mapsUrl(query: string, placeId?: string): string {
  let url = `${MAPS_SEARCH}&query=${encodeURIComponent(query)}`;
  if (placeId) url += `&query_place_id=${encodeURIComponent(placeId)}`;
  return url;
}

/**
 * Places API (New) „Text Search" – aber nur die place_id anfordern (Feld-Maske
 * `places.id`) → SKU „Text Search Essentials (IDs Only)" = kostenlos.
 *
 * Entscheidend für den richtigen Treffer:
 *  - `rankPreference: DISTANCE` → Google liefert den zu den Koordinaten
 *    **nächstgelegenen** Laden, nicht den prominentesten (sonst käme z. B. immer
 *    der große Bahnhofs-Lawson statt der Filiale am Marker).
 *  - `includedType: convenience_store` → nur echte Konbini, keine Lawson-Bank-
 *    Geldautomaten o. Ä.
 * Beide Parameter beeinflussen die Abrechnung nicht (nur die Feld-Maske zählt).
 */
async function resolvePlaceId(
  textQuery: string,
  lat: number,
  lng: number,
  key: string,
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
        includedType: "convenience_store",
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
 * GET /api/v1/geo/place-link?lat=&lng=&q=&fallback=
 * Leitet auf Google Maps weiter. Mit GOOGLE_MAPS_API_KEY wird per (kostenloser)
 * ID-only Text Search die exakte Filiale aufgelöst; ohne Key bzw. bei jedem
 * Fehler geht es auf den keyfreien Fallback-Link (Text-/Koordinaten-Suche).
 * Bewusst kein `handle()`-Wrapper: dieser Endpunkt antwortet immer mit einem
 * Redirect und darf nie in einer JSON-Fehlerseite enden.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  const q = (params.get("q") ?? "").trim();
  const fallbackQuery =
    (params.get("fallback") ?? "").trim() ||
    q ||
    (Number.isFinite(lat) && Number.isFinite(lng) ? `${lat},${lng}` : "Japan");
  const fallback = mapsUrl(fallbackQuery);

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

  const placeId = await resolvePlaceId(q, lat, lng, key);
  return NextResponse.redirect(placeId ? mapsUrl(q, placeId) : fallback);
}
