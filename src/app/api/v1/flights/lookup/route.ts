import type { NextRequest } from "next/server";

import { ApiError, badRequest, handle, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { enforceRateLimit } from "@/lib/rate";

const RAPIDAPI_HOST = "aerodatabox.p.rapidapi.com";

/** "2026-09-14 17:20+02:00" → "2026-09-14T17:20:00Z" (lokale Wall-Clock als UTC-naiv). */
function localToNaiveIso(s: string | undefined | null): string | null {
  if (!s || s.length < 16) return null;
  return `${s.slice(0, 16).replace(" ", "T")}:00Z`;
}

interface AdbFlight {
  number?: string;
  airline?: { name?: string };
  departure?: {
    airport?: { iata?: string; name?: string };
    scheduledTime?: { local?: string; utc?: string };
  };
  arrival?: {
    airport?: { iata?: string; name?: string };
    scheduledTime?: { local?: string; utc?: string };
  };
}

/** UTC-String von AeroDataBox ("2026-12-21 13:00Z") → ms, sonst null. */
function utcMs(s: string | undefined | null): number | null {
  if (!s) return null;
  const t = Date.parse(s.replace(" ", "T"));
  return Number.isNaN(t) ? null : t;
}

/**
 * GET /api/v1/flights/lookup?number=LH716&date=YYYY-MM-DD
 * Holt Airline/Flughäfen/Zeiten per Flugnummer über AeroDataBox (server-seitig).
 * Ohne konfigurierten API-Key → 422 (dann manuell eingeben).
 */
export function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    // Externe API mit Kontingent: max. 30 Abrufe pro Nutzer und Stunde.
    await enforceRateLimit(`flight-lookup:${user.id}`, 30, 60 * 60 * 1000);

    const number = (req.nextUrl.searchParams.get("number") ?? "").toUpperCase().replace(/\s+/g, "");
    const date = req.nextUrl.searchParams.get("date") ?? "";
    if (!/^[A-Z0-9]{3,10}$/.test(number)) throw badRequest("Ungültige Flugnummer (z. B. LH716).");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw badRequest("Ungültiges Datum (YYYY-MM-DD).");

    const apiKey = process.env.AERODATABOX_API_KEY;
    if (!apiKey) {
      throw new ApiError(
        422,
        "Automatischer Abruf ist nicht konfiguriert (kein API-Key). Bitte die Flugdaten manuell eingeben.",
      );
    }

    const url = `https://${RAPIDAPI_HOST}/flights/number/${encodeURIComponent(number)}/${date}`;
    const res = await fetch(url, {
      headers: { "X-RapidAPI-Key": apiKey, "X-RapidAPI-Host": RAPIDAPI_HOST },
      cache: "no-store",
    });
    if (res.status === 404) throw new ApiError(404, `Kein Flug ${number} am ${date} gefunden.`);
    if (!res.ok) throw new ApiError(502, "Flugdaten-Dienst nicht erreichbar.");

    const data = (await res.json()) as AdbFlight[] | AdbFlight;
    const list = Array.isArray(data) ? data : [data];
    // AeroDataBox liefert für ein Datum oft ZWEI Instanzen zurück: die an dem Tag
    // abfliegt UND die an dem Tag ankommt (Vortags-Abflug). Wir wollen die, deren
    // *Abflugdatum* dem angefragten Datum entspricht.
    const flight =
      list.find((f) => f.departure?.scheduledTime?.local?.slice(0, 10) === date) ??
      list.find((f) => f.departure) ??
      list[0];
    if (!flight?.departure && !flight?.arrival) {
      throw new ApiError(404, `Kein Flug ${number} am ${date} gefunden.`);
    }

    // Echte Flugdauer aus den UTC-Zeiten (lokale Wall-Clock wäre wegen Zeitzonen falsch).
    const depUtc = utcMs(flight.departure?.scheduledTime?.utc);
    const arrUtc = utcMs(flight.arrival?.scheduledTime?.utc);
    const durationMin =
      depUtc !== null && arrUtc !== null && arrUtc > depUtc
        ? Math.round((arrUtc - depUtc) / 60000)
        : null;

    return ok({
      found: true,
      flightNumber: number,
      airline: flight.airline?.name ?? "",
      fromCode: flight.departure?.airport?.iata ?? "",
      fromName: flight.departure?.airport?.name ?? "",
      toCode: flight.arrival?.airport?.iata ?? "",
      toName: flight.arrival?.airport?.name ?? "",
      departure: localToNaiveIso(flight.departure?.scheduledTime?.local),
      arrival: localToNaiveIso(flight.arrival?.scheduledTime?.local),
      durationMin,
    });
  });
}
