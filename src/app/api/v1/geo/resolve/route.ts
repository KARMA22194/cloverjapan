import type { NextRequest } from "next/server";

import { ApiError, badRequest, handle, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { safeFetch } from "@/lib/net";

const USER_AGENT = "TimeTracker-Reiseplaner/1.0 (self-hosted dev)";

interface Resolved {
  label: string;
  lat: number;
  lng: number;
  source: "maps" | "text" | "url";
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
    await requireUser();
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
    if (q.length < 2) throw badRequest("Bitte einen Ortsnamen oder Link einfügen.");
    if (q.length > 2000) throw badRequest("Eingabe zu lang.");

    const urlMatch = q.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      const url = urlMatch[0];
      let host = "";
      try {
        host = new URL(url).hostname;
      } catch {
        /* ignore */
      }
      if (/(?:google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|maps\.apple\.com)/.test(url)) {
        return ok(await resolveMapsLink(url));
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
    const body = (await res.text()).slice(0, 200000);
    coords = findCoords(finalUrl) ?? findCoords(body);
  }
  if (!coords) throw new ApiError(422, "Im Maps-Link wurden keine Koordinaten gefunden.");

  // Bezeichnung: aus /place/<Name>/ oder per Reverse-Geocoding.
  let label: string | null = null;
  const pm = `${finalUrl}\n${url}`.match(/\/place\/([^/@]+)/);
  if (pm) label = decodeURIComponent(pm[1].replace(/\+/g, " "));
  if (!label) label = await reverseGeocode(coords.lat, coords.lng);

  return { label: label ?? `${coords.lat}, ${coords.lng}`, lat: coords.lat, lng: coords.lng, source: "maps" };
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
  const data = (await res.json()) as { display_name: string; lat: string; lon: string }[];
  if (!data.length) return null;
  return { label: data[0].display_name, lat: Number(data[0].lat), lng: Number(data[0].lon), source };
}

async function resolveGenericUrl(url: string): Promise<Resolved | null> {
  try {
    const res = await safeFetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 200000);
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

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("format", "json");
    url.searchParams.set("accept-language", "de,en,ja");
    url.searchParams.set("zoom", "16");
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return null;
    const data = (await res.json()) as { display_name?: string };
    return data.display_name ?? null;
  } catch {
    return null;
  }
}
