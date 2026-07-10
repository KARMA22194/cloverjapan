import type { NextRequest } from "next/server";

import { z } from "zod";

import { ApiError, handle, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";

// ISO-4217-Code: genau 3 Großbuchstaben. Verhindert Pfad-Manipulation im externen
// URL-Pfad (…/v6/latest/${from}), z. B. from="JPY/..".
const currencySchema = z.string().regex(/^[A-Z]{3}$/, "Ungültiger Währungscode.");

/**
 * GET /api/v1/fx/rate?from=JPY&to=EUR — aktueller Wechselkurs (keyfrei, ECB-nah).
 * Server-seitig via open.er-api.com; Container erreicht den Dienst über den Proxy-CA.
 */
export function GET(req: NextRequest) {
  return handle(async () => {
    await requireUser();
    const from = currencySchema.parse((req.nextUrl.searchParams.get("from") ?? "JPY").toUpperCase());
    const to = currencySchema.parse((req.nextUrl.searchParams.get("to") ?? "EUR").toUpperCase());

    const res = await fetch(`https://open.er-api.com/v6/latest/${from}`, {
      headers: { "User-Agent": "TimeTracker/1.0" },
      cache: "no-store",
    });
    if (!res.ok) throw new ApiError(502, "Wechselkurs-Dienst nicht erreichbar.");

    const data = (await res.json()) as {
      result: string;
      rates?: Record<string, number>;
      time_last_update_utc?: string;
    };
    const rate = data.rates?.[to];
    if (data.result !== "success" || typeof rate !== "number") {
      throw new ApiError(502, "Wechselkurs nicht verfügbar.");
    }

    return ok({ from, to, rate, date: data.time_last_update_utc ?? null });
  });
}
