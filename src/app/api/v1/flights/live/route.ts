import type { NextRequest } from "next/server";

import { ApiError, badRequest, handle, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { enforceRateLimit } from "@/lib/rate";

const RAPIDAPI_HOST = "aerodatabox.p.rapidapi.com";

interface AdbEndpoint {
  airport?: { iata?: string; name?: string };
  scheduledTime?: { local?: string; utc?: string };
  revisedTime?: { local?: string; utc?: string };
  predictedTime?: { local?: string; utc?: string };
  runwayTime?: { local?: string; utc?: string };
  terminal?: string;
  checkInDesk?: string;
  gate?: string;
  baggageBelt?: string;
}
interface AdbFlight {
  status?: string;
  departure?: AdbEndpoint;
  arrival?: AdbEndpoint;
}

const localTime = (t?: { local?: string }) => t?.local ?? null;

/**
 * GET /api/v1/flights/live?number=LH716&date=YYYY-MM-DD
 * Live-Status über AeroDataBox: Status/Verspätung, Terminal, Check-in-Schalter,
 * Gate (Abflug) sowie Terminal, Gate und Kofferband (Ankunft).
 * Gate/Schalter/Band werden vom Dienst i. d. R. erst wenige Stunden vor Abflug
 * belegt – vorher sind die Felder leer. Ohne API-Key → 422.
 */
export function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await enforceRateLimit(`flight-live:${user.id}`, 60, 60 * 60 * 1000);

    const number = (req.nextUrl.searchParams.get("number") ?? "").toUpperCase().replace(/\s+/g, "");
    const date = req.nextUrl.searchParams.get("date") ?? "";
    if (!/^[A-Z0-9]{3,10}$/.test(number)) throw badRequest("Ungültige Flugnummer (z. B. LH716).");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw badRequest("Ungültiges Datum (YYYY-MM-DD).");

    const apiKey = process.env.AERODATABOX_API_KEY;
    if (!apiKey) {
      throw new ApiError(422, "Live-Status ist nicht konfiguriert (kein API-Key).");
    }

    const url = `https://${RAPIDAPI_HOST}/flights/number/${encodeURIComponent(number)}/${date}?withAircraftImage=false&withLocation=false`;
    const res = await fetch(url, {
      headers: { "X-RapidAPI-Key": apiKey, "X-RapidAPI-Host": RAPIDAPI_HOST },
      // Kurz cachen: schont das Kontingent, hält den Status aber aktuell genug.
      next: { revalidate: 120 },
    });
    if (res.status === 404) throw new ApiError(404, `Kein Flug ${number} am ${date} gefunden.`);
    if (!res.ok) throw new ApiError(502, "Flugdaten-Dienst nicht erreichbar.");

    const data = (await res.json()) as AdbFlight[] | AdbFlight;
    const list = Array.isArray(data) ? data : [data];
    // Instanz mit passendem Abflugdatum wählen (AeroDataBox liefert oft zwei).
    const flight =
      list.find((f) => f.departure?.scheduledTime?.local?.slice(0, 10) === date) ??
      list.find((f) => f.departure) ??
      list[0];
    if (!flight?.departure && !flight?.arrival) {
      throw new ApiError(404, `Kein Flug ${number} am ${date} gefunden.`);
    }

    const d = flight.departure ?? {};
    const a = flight.arrival ?? {};
    return ok({
      found: true,
      flightNumber: number,
      status: flight.status ?? "Unknown",
      departure: {
        airportIata: d.airport?.iata ?? "",
        scheduled: localTime(d.scheduledTime),
        revised: localTime(d.revisedTime) ?? localTime(d.runwayTime),
        terminal: d.terminal ?? null,
        checkInDesk: d.checkInDesk ?? null,
        gate: d.gate ?? null,
      },
      arrival: {
        airportIata: a.airport?.iata ?? "",
        scheduled: localTime(a.scheduledTime),
        revised: localTime(a.revisedTime) ?? localTime(a.predictedTime) ?? localTime(a.runwayTime),
        terminal: a.terminal ?? null,
        gate: a.gate ?? null,
        baggageBelt: a.baggageBelt ?? null,
      },
    });
  });
}
