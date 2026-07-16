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

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body ?? {}),
  delete: <T>(path: string) => request<T>("DELETE", path),
};
