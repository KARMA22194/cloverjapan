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

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const message =
      (data && typeof data === "object" && data.error?.message) || `Fehler ${res.status}`;
    if (notify) toast(message);
    throw new ApiRequestError(res.status, message, data?.error?.details);
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
