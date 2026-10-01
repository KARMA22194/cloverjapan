import { ApiError } from "@/lib/api/http";
import { consumeRateLimit, monthlyQuotaKey, msUntilNextMonth } from "@/lib/rate";
import { endpointTimes, type AdbEndpointTimes } from "./flightSchedule";

/**
 * Live-Flugstatus von AeroDataBox — **ein** Abrufweg für Oberfläche und Cron.
 *
 * ⚠️ Hier liegt neben Cloud Vision die zweite Stelle, an der ein Fehler echtes
 * Geld kostet. AeroDataBox läuft über RapidAPI mit einem Kontingent pro
 * **Kalendermonat**; darüber wird abgerechnet oder gesperrt. Die Rate-Limits pro
 * Nutzer (60/h) bremsen Einzelne, nicht die Summe — und der Cron ist gar kein
 * Nutzer. Deshalb dasselbe Muster wie beim Beleg-Scan: ein **globaler**
 * Monatszähler, unmittelbar vor dem Aufruf.
 */

const RAPIDAPI_HOST = "aerodatabox.p.rapidapi.com";

/**
 * Obergrenze der AeroDataBox-Aufrufe pro Kalendermonat, über alle Wege.
 *
 * ⚠️ Der Standard ist bewusst niedrig. Der kostenlose RapidAPI-Tarif liegt je
 * nach Anbieter-Einstellung im Bereich einiger hundert Aufrufe im Monat; was
 * darüber liegt, kostet. Eine Reise mit Hin- und Rückflug braucht mit der
 * gestaffelten Prüfung unten rund 200. Wer mehr Spielraum hat, hebt
 * `FLIGHT_MONTHLY_LIMIT` an — wer das Kontingent nicht kennt, ist mit dem
 * Standard auf der sicheren Seite.
 */
export const FLIGHT_MONTHLY_LIMIT = Number(process.env.FLIGHT_MONTHLY_LIMIT ?? 400);

export interface FlightEndpointStatus {
  airportIata: string;
  scheduled: string | null;
  /** Gemeldete bzw. tatsächliche Zeit — verbindlich (s. `endpointTimes`). */
  revised: string | null;
  /** Vorhersage des Dienstes — unverbindlich, bewusst getrennt von `revised`. */
  predicted: string | null;
  terminal: string | null;
  checkInDesk?: string | null;
  gate: string | null;
  baggageBelt?: string | null;
}

export interface LiveStatus {
  found: true;
  flightNumber: string;
  status: string;
  departure: FlightEndpointStatus;
  arrival: FlightEndpointStatus;
  /** Echte UTC-Zeitpunkte, soweit der Dienst sie liefert (ISO). */
  departureUtc: string | null;
  arrivalUtc: string | null;
}

interface AdbEndpoint extends AdbEndpointTimes {
  airport?: { iata?: string; name?: string };
  scheduledTime?: { local?: string; utc?: string };
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

/** „2026-08-19 13:05+02:00" → ISO-UTC. Ungültiges/fehlendes → null. */
function utcIso(s: string | undefined | null): string | null {
  if (!s) return null;
  const ms = Date.parse(s.replace(" ", "T"));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** Ist AeroDataBox überhaupt eingerichtet? */
export function flightApiConfigured(): boolean {
  return Boolean(process.env.AERODATABOX_API_KEY);
}

/**
 * Status abrufen. Zählt **einen** Aufruf aufs Monatskontingent.
 *
 * ⚠️ Gezählt wird unmittelbar vor dem Netzaufruf, nicht am Anfang: eine
 * ungültige Flugnummer kostet nichts und darf das Kontingent nicht schmälern.
 */
export async function fetchLiveStatus(number: string, date: string): Promise<LiveStatus> {
  const apiKey = process.env.AERODATABOX_API_KEY;
  if (!apiKey) throw new ApiError(422, "Live-Status ist nicht konfiguriert (kein API-Key).");

  const now = new Date();
  const withinQuota = await consumeRateLimit(
    monthlyQuotaKey("flight-quota", now),
    FLIGHT_MONTHLY_LIMIT,
    msUntilNextMonth(now),
  );
  if (!withinQuota) {
    throw new ApiError(
      429,
      "Das Monatskontingent für Flugdaten ist aufgebraucht. Der Status ist bis zum Monatswechsel nicht abrufbar.",
    );
  }

  const url = `https://${RAPIDAPI_HOST}/flights/number/${encodeURIComponent(number)}/${date}?withAircraftImage=false&withLocation=false`;
  const res = await fetch(url, {
    headers: { "X-RapidAPI-Key": apiKey, "X-RapidAPI-Host": RAPIDAPI_HOST },
    // Kurz cachen: mehrere offene Geräte teilen sich denselben Abruf.
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
  return {
    found: true,
    flightNumber: number,
    status: flight.status ?? "Unknown",
    departure: {
      airportIata: d.airport?.iata ?? "",
      ...endpointTimes(d),
      terminal: d.terminal ?? null,
      checkInDesk: d.checkInDesk ?? null,
      gate: d.gate ?? null,
    },
    arrival: {
      airportIata: a.airport?.iata ?? "",
      ...endpointTimes(a),
      terminal: a.terminal ?? null,
      gate: a.gate ?? null,
      baggageBelt: a.baggageBelt ?? null,
    },
    departureUtc: utcIso(d.scheduledTime?.utc),
    arrivalUtc: utcIso(a.scheduledTime?.utc),
  };
}
