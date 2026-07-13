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
  departure?: { airport?: { iata?: string; name?: string }; scheduledTime?: { local?: string } };
  arrival?: { airport?: { iata?: string; name?: string }; scheduledTime?: { local?: string } };
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
    const flight = Array.isArray(data) ? data[0] : data;
    if (!flight?.departure && !flight?.arrival) {
      throw new ApiError(404, `Kein Flug ${number} am ${date} gefunden.`);
    }

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
    });
  });
}
