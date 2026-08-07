import { NextResponse } from "next/server";
import { ZodError } from "zod";

/**
 * Fehler mit HTTP-Status, den Route-Handler werfen dürfen.
 * Wird von `handle()` in eine einheitliche JSON-Antwort übersetzt.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const badRequest = (msg: string, details?: unknown) => new ApiError(400, msg, details);
export const unauthorized = (msg = "Nicht angemeldet.") => new ApiError(401, msg);
export const forbidden = (msg = "Keine Berechtigung.") => new ApiError(403, msg);
export const notFound = (msg = "Nicht gefunden.") => new ApiError(404, msg);
export const conflict = (msg: string) => new ApiError(409, msg);

/** JSON-Erfolgsantwort. */
export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

/** Einheitliche Fehlerhülle: `{ error: { message, details? } }`. */
function fail(status: number, message: string, details?: unknown): NextResponse {
  return NextResponse.json(
    { error: { message, ...(details !== undefined ? { details } : {}) } },
    { status },
  );
}

/** JSON-Body robust einlesen (leere/ungültige Bodies → 400 statt 500). */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw badRequest("Ungültiger oder leerer JSON-Body.");
  }
}

/** Prisma-Fehler ohne Prisma-Import erkennen (Route-Handler bleiben schlank). */
function prismaErrorCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

/**
 * Umhüllt die eigentliche Handler-Logik und übersetzt geworfene Fehler in
 * konsistente JSON-Antworten — so bleibt jeder Handler frei von try/catch.
 * Die exportierten GET/POST/… behalten dabei ihre native Next-Signatur.
 */
export async function handle(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError) return fail(err.status, err.message, err.details);
    if (err instanceof ZodError) {
      const message = err.issues[0]?.message ?? "Ungültige Eingabe.";
      return fail(400, message, err.flatten());
    }
    // Unique-Constraint (z. B. doppeltes Projekt-Kürzel / doppelte E-Mail).
    if (prismaErrorCode(err) === "P2002") {
      return fail(409, "Ein Datensatz mit diesen Werten existiert bereits.");
    }
    // Update/Delete auf nicht existierenden Datensatz.
    if (prismaErrorCode(err) === "P2025") {
      return fail(404, "Nicht gefunden.");
    }
    // Verletzter Fremdschlüssel (z. B. unbekannte User-Id als Zahler) — das ist eine
    // fehlerhafte Eingabe, kein Serverfehler; ohne diesen Zweig gäbe es dafür eine 500.
    if (prismaErrorCode(err) === "P2003") {
      return fail(400, "Verweis auf einen unbekannten Datensatz.");
    }
    console.error("Unhandled API error:", err);
    return fail(500, "Interner Serverfehler.");
  }
}
