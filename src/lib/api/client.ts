/**
 * Schlanker Browser-seitiger REST-Client. Das Frontend spricht ausschließlich
 * über diese Helfer mit der API (`/api/v1/*`) — keine direkten Prisma-/Service-
 * Aufrufe und keine Server Actions mehr für Daten-Mutationen.
 */

import { toast } from "@/lib/toast";

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

/** Verständliche Meldung für Fehler ohne JSON-Body (z. B. Serverless-Timeout/Absturz). */
function friendlyStatus(status: number): string {
  if (status === 408 || status === 504) return "Zeitüberschreitung – bitte kurz später erneut versuchen.";
  if (status === 502 || status === 503) return "Server derzeit nicht erreichbar – bitte später erneut versuchen.";
  if (status >= 500) return "Serverfehler – bitte später erneut versuchen.";
  return `Fehler ${status}`;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  // Fehlgeschlagene Mutationen immer sichtbar melden – auch dort, wo der Aufrufer
  // den Fehler nur still abfängt (optimistisches Update zurückrollt). GET bleibt
  // stumm (Leerzustände/Offline-Banner decken das ab).
  const notify = method !== "GET";
  const hasBody = body !== undefined;

  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: hasBody ? { "Content-Type": "application/json" } : undefined,
      body: hasBody ? JSON.stringify(body) : undefined,
    });
  } catch {
    if (notify) toast("Keine Verbindung – bitte später erneut versuchen.");
    throw new ApiRequestError(0, "Keine Verbindung");
  }

  // Antwort robust lesen: nicht jede Antwort ist JSON (z. B. Vercel-Fehlerseite
  // „An error occurred…" bei Function-Timeout) → niemals blind JSON.parse.
  const raw = await res.text();
  let data: unknown = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = null; // Nicht-JSON-Body (Fehlerseite o. Ä.)
    }
  }

  if (!res.ok) {
    const apiMsg =
      data && typeof data === "object"
        ? (data as { error?: { message?: string } }).error?.message
        : undefined;
    const message = apiMsg || friendlyStatus(res.status);
    if (notify) toast(message);
    throw new ApiRequestError(res.status, message, (data as { error?: { details?: unknown } })?.error?.details);
  }

  return data as T;
}

/**
 * Kurzlebige Zusammenfassung gleichzeitiger GETs auf dieselbe URL.
 *
 * Auf `/start` holen `FlightDayStatus` und `TripDashboard` unabhängig voneinander
 * `/api/v1/flights` — zwei Function-Invocations und vier DB-Queries für dieselbe
 * Antwort. Statt die Komponenten zu koppeln, teilen sich parallele Anfragen hier
 * ein Promise.
 *
 * Bewusst **nur** solange die Anfrage läuft — kein Zeit-Cache: sonst bekäme eine
 * Komponente, die direkt nach einem Write neu lädt, noch die alte Antwort.
 * Gleichzeitig gestartete Anfragen (derselbe Render-Durchgang) werden zusammengefasst,
 * alles danach geht wieder frisch ans Netz.
 */
const inFlight = new Map<string, Promise<unknown>>();

function dedupedGet<T>(path: string): Promise<T> {
  const running = inFlight.get(path);
  if (running) return running as Promise<T>;

  const p = request<T>("GET", path).finally(() => {
    inFlight.delete(path);
  });
  inFlight.set(path, p);
  return p;
}

export const api = {
  get: <T>(path: string) => dedupedGet<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body ?? {}),
  // DELETE **mit** Body: die Konto-Löschung verlangt das Passwort zur Bestätigung.
  // Ein Body ist bei DELETE erlaubt; ohne ihn bräuchte es einen eigenen
  // POST-„Aktions"-Endpunkt und der Vertrag wäre weniger geradlinig.
  delete: <T>(path: string, body?: unknown) => request<T>("DELETE", path, body),
};
