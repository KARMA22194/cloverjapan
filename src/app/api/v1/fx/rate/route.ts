import type { NextRequest } from "next/server";

import { z } from "zod";

import { ApiError, handle, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { getFxRate } from "@/lib/services/fxService";

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

    const fx = await getFxRate(from, to);
    if (!fx) throw new ApiError(502, "Wechselkurs nicht verfügbar.");

    // Auch dem **Browser** eine Cachedauer mitgeben: der externe Call ist zwar
    // serverseitig gecacht, die Function lief bisher aber trotzdem bei jedem
    // Seitenaufruf (Kurs-Pill in der TopNav + Ausgaben-/Zoll-Ansicht).
    const res2 = ok({ from, to, rate: fx.rate, date: fx.date });
    res2.headers.set("Cache-Control", "private, max-age=3600");
    return res2;
  });
}
