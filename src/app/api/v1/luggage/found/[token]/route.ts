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
    // Missbrauchsschutz zweistufig:
    //  - pro Token & IP: normaler Finder-Fall (5/10 min).
    //  - pro Token **ohne** IP-Anteil: sonst ließe sich das Limit durch wechselnde
    //    Quell-IPs beliebig oft neu ziehen und der Owner zumüllen.
    await enforceRateLimit(`luggage-found:${token}:${clientIp(req)}`, 5, 10 * 60 * 1000);
    await enforceRateLimit(`luggage-found-token:${token}`, 20, 60 * 60 * 1000);

    const { lat, lng } = body.parse(await readJson(req));
    const tag = await getLuggageByToken(token);
    if (!tag) throw notFound("Unbekannter Kofferanhänger.");

    await notifyLuggageFound(tag, lat, lng);
    // Konstante Antwort: ob der Owner überhaupt eine Benachrichtigung hinterlegt hat
    // (und ob der Versand klappte) geht den anonymen Finder nichts an.
    return ok({ ok: true });
  });
}
