import type { NextRequest } from "next/server";

import { ApiError, badRequest, handle, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { enforceRateLimit } from "@/lib/rate";
import { readTextLimited, safeFetch } from "@/lib/net";

const USER_AGENT = "TimeTracker-Reiseplaner/1.0 (self-hosted dev)";

interface Resolved {
  label: string;
  lat: number;
  lng: number;
  source: "maps" | "text" | "url";
  // true = aufgelöster Treffer ist ein Gebiet (Stadt/Stadtteil/Verwaltungsgrenze),
  // kein konkreter Ort/Betrieb. Genutzt, um z. B. „Tokyo" nicht als Hotel zuzulassen.
  area?: boolean;
  // true = Beherbergungsbetrieb (Hotel/Ryokan/Hostel …) — für die Hotel-Prüfung.
  lodging?: boolean;
  // true = klare Sehenswürdigkeit (Museum/Attraktion/Park/…), kein Beherbergungsort.
  attraction?: boolean;
}

// OSM-Klassen/-Typen, die ein Gebiet (keinen konkreten Punkt) bezeichnen.
function isAreaResult(cls?: string, addresstype?: string): boolean {
  if (cls === "place" || cls === "boundary") return true;
  const areaTypes = new Set([
    "city", "town", "village", "hamlet", "suburb", "state", "region",
    "province", "county", "municipality", "country", "postcode",
    "district", "quarter", "neighbourhood",
  ]);
  return !!addresstype && areaTypes.has(addresstype);
}

// OSM-Typen, die eine Unterkunft bezeichnen (class=tourism/building).
const LODGING_TYPES = new Set([
  "hotel", "motel", "guest_house", "hostel", "apartment", "apartments",
  "chalet", "alpine_hut", "wilderness_hut", "love_hotel", "resort", "ryokan",
]);
function isLodgingResult(cls?: string, type?: string): boolean {
  if (!type) return false;
  return (cls === "tourism" || cls === "building") && LODGING_TYPES.has(type);
}

// Klare Sehenswürdigkeit (Museum, Attraktion, Park, Denkmal …) — kein Hotel.
function isAttractionResult(cls?: string, type?: string): boolean {
  if (cls === "tourism") return !!type && !LODGING_TYPES.has(type);
  return cls === "leisure" || cls === "historic";
}

/**
 * GET /api/v1/geo/resolve?q=… — löst eingefügten Text/Link zu einem Ort auf.
 *  - Google-/Apple-Maps-Link (auch Kurzlink) → exakte Koordinaten.
 *  - Instagram-Link → klare Meldung (Standort nicht auslesbar).
 *  - sonst: Text/Caption geocoden (Nominatim, Japan).
 * Server-seitig (Proxy-CA, sauberer User-Agent, kein CORS im Browser).
 */
export function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
    if (q.length < 2) throw badRequest("Bitte einen Ortsnamen oder Link einfügen.");
    if (q.length > 2000) throw badRequest("Eingabe zu lang.");
    // URL-Eingaben lösen serverseitige Fetches beliebiger Ziele aus (SSRF-/Scanning-
    // Vektor) → strenger drosseln (30/min) als reines Text-Geocoding via Nominatim
    // (90/min, damit ein Listen-Import mit vielen Ortsnamen in einem Durchgang klappt).
    const hasUrl = /https?:\/\/[^\s]+/.test(q);
    await enforceRateLimit(
      hasUrl ? `resolve-url:${user.id}` : `resolve-text:${user.id}`,
      hasUrl ? 30 : 90,
      60 * 1000,
    );

    const urlMatch = q.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      const url = urlMatch[0];
      let host = "";
      try {
        host = new URL(url).hostname;
      } catch {
        /* ignore */
      }
      if (isMapsLink(url, host)) {
        try {
          return ok(await resolveMapsLink(url));
        } catch (err) {
          // Manche Maps-Links (z. B. Google-Takeout „maps/search?query_place_id=…")
          // enthalten keine Koordinaten → als Fallback den Begleittext geocoden.
          const geo = await geocode(q, "text");
          if (geo) return ok(geo);
          throw err;
        }
      }
      if (/instagram\.com/.test(host)) {
        throw new ApiError(
          422,
          "Instagram-Links enthalten keinen auslesbaren Standort. Bitte den Ortsnamen aus dem Video oder einen Google-Maps-Link einfügen.",
        );
      }
      // Andere Website: Best-Effort über og:title/description.
      const fromPage = await resolveGenericUrl(url);
      if (fromPage) return ok(fromPage);
      throw new ApiError(422, "Aus diesem Link konnte kein Ort ermittelt werden.");
    }

    const geo = await geocode(q, "text");
    if (!geo) throw new ApiError(422, `Kein Ort in Japan gefunden für „${q}".`);
    return ok(geo);
  });
}

/* ---------------- Maps-Link → Koordinaten ---------------- */

/** Kurzlink-Hosts, die direkt auf Maps zeigen (Pfad ist dort beliebig). */
const MAPS_SHORT_HOSTS = /^(?:maps\.app\.goo\.gl|goo\.gl|maps\.apple\.com)$/;
/** Google-Domains (google.com, google.de, google.co.jp …) — nur mit /maps-Pfad. */
const GOOGLE_HOSTS = /^(?:www\.)?google\.[a-z]{2,}(?:\.[a-z]{2,})?$/;

/**
 * Ist das ein echter Maps-Link? Geprüft wird der **Hostname**, nicht die ganze URL.
 *
 * Vorher lief das Muster gegen den kompletten String, sodass
 * `https://attacker.tld/x?ref=google.com/maps` als vertrauenswürdiger Maps-Link galt
 * und in den Body-Auswertungspfad geriet.
 */
function isMapsLink(url: string, host: string): boolean {
  if (!host) return false;
  if (MAPS_SHORT_HOSTS.test(host)) return true;
  if (!GOOGLE_HOSTS.test(host)) return false;
  try {
    return new URL(url).pathname.startsWith("/maps");
  } catch {
    return false;
  }
}

// Reihenfolge: Pin (!3d!4d) > q/ll/coordinate > Kartenzentrum (@).
const COORD_PATTERNS = [
  /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
  /[?&](?:q|ll|sll|coordinate)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/,
  /@(-?\d+\.\d+),(-?\d+\.\d+)/,
];

function findCoords(s: string): { lat: number; lng: number } | null {
  for (const p of COORD_PATTERNS) {
    const m = s.match(p);
    if (m) {
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) return { lat, lng };
    }
  }
  return null;
}

async function resolveMapsLink(url: string): Promise<Resolved> {
  let finalUrl = url;
  let coords = findCoords(url);

  // Nur wenn im (Kurz-)Link keine Koordinaten stehen: Redirect folgen + Body lesen.
  if (!coords) {
    const res = await safeFetch(url, { headers: { "User-Agent": USER_AGENT } });
    finalUrl = res.url || url;
    const body = await readTextLimited(res);
    coords = findCoords(finalUrl) ?? findCoords(body);
  }
  if (!coords) throw new ApiError(422, "Im Maps-Link wurden keine Koordinaten gefunden.");

  // Reverse-Geocoding: liefert Bezeichnung (Fallback) UND den Typ am Zielpunkt.
  // Hinweis: Reverse trifft den *nächstgelegenen* Punkt — als Typ-Signal nur
  // best-effort brauchbar (klare Sehenswürdigkeiten/Gebiete erkennen).
  const rev = await reverseGeocode(coords.lat, coords.lng);

  let label: string | null = null;
  const pm = `${finalUrl}\n${url}`.match(/\/place\/([^/@]+)/);
  if (pm) label = decodeURIComponent(pm[1].replace(/\+/g, " "));
  if (!label) label = rev?.label ?? null;

  return {
    label: label ?? `${coords.lat}, ${coords.lng}`,
    lat: coords.lat,
    lng: coords.lng,
    source: "maps",
    area: isAreaResult(rev?.cls, rev?.addresstype),
    attraction: isAttractionResult(rev?.cls, rev?.type),
  };
}

/* ---------------- Text/Caption → Geocoding ---------------- */

async function geocode(text: string, source: "text" | "url"): Promise<Resolved | null> {
  const clean = text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#@]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length < 2) return null;

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", clean);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "jp");
  url.searchParams.set("accept-language", "de,en,ja");

  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    display_name: string;
    lat: string;
    lon: string;
    class?: string;
    type?: string;
    addresstype?: string;
  }[];
  if (!data.length) return null;
  const hit = data[0];
  return {
    label: hit.display_name,
    lat: Number(hit.lat),
    lng: Number(hit.lon),
    source,
    area: isAreaResult(hit.class, hit.addresstype),
    lodging: isLodgingResult(hit.class, hit.type),
    attraction: isAttractionResult(hit.class, hit.type),
  };
}

async function resolveGenericUrl(url: string): Promise<Resolved | null> {
  try {
    const res = await safeFetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return null;
    const html = await readTextLimited(res);
    const og =
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ??
      "";
    if (!og) return null;
    return await geocode(og, "url");
  } catch {
    return null;
  }
}

interface ReverseHit {
  label: string | null;
  cls?: string;
  type?: string;
  addresstype?: string;
}

async function reverseGeocode(lat: number, lng: number): Promise<ReverseHit | null> {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("format", "json");
    url.searchParams.set("accept-language", "de,en,ja");
    url.searchParams.set("zoom", "18");
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      display_name?: string;
      class?: string;
      type?: string;
      addresstype?: string;
    };
    return {
      label: data.display_name ?? null,
      cls: data.class,
      type: data.type,
      addresstype: data.addresstype,
    };
  } catch {
    return null;
  }
}
