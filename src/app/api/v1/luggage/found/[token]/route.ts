import type { NextRequest } from "next/server";
import { z } from "zod";

import { handle, notFound, ok, readJson } from "@/lib/api/http";
import { enforceRateLimit, clientIp } from "@/lib/rate";
import { getLuggageByToken, notifyLuggageFound } from "@/lib/services/luggageService";

type Ctx = { params: Promise<{ token: string }> };

const body = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/**
 * POST /api/v1/luggage/found/{token} { lat, lng } — ÖFFENTLICH (kein Auth).
 * Ein Finder scannt den QR-Code und teilt seinen Standort → Owner wird
 * per E-Mail/Discord benachrichtigt. Ratenlimitiert gegen Missbrauch.
 */
export function POST(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { token } = await ctx.params;
    // Missbrauchsschutz: max. 5 Fund-Meldungen pro Token & IP in 10 Minuten.
    await enforceRateLimit(`luggage-found:${token}:${clientIp(req)}`, 5, 10 * 60 * 1000);

    const { lat, lng } = body.parse(await readJson(req));
    const tag = await getLuggageByToken(token);
    if (!tag) throw notFound("Unbekannter Kofferanhänger.");

    const sent = await notifyLuggageFound(tag, lat, lng);
    // Dem Finder gegenüber generisch bleiben (keine internen Details leaken).
    return ok({ ok: true, notified: sent.email || sent.discord });
  });
}
