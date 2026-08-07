import type { NextRequest } from "next/server";

import { handle, ok, unauthorized } from "@/lib/api/http";
import { db } from "@/lib/db";
import { purgeExpiredChallenges } from "@/lib/services/webauthnChallenge";

/**
 * GET /api/v1/cron/cleanup — räumt abgelaufene Hilfsdatensätze auf.
 *
 * Betroffen sind Tabellen, die nur wachsen und nie schrumpfen:
 *  - `RateLimit`: ein Eintrag pro Schlüssel, also u. a. pro IP (`login-ip:*`,
 *    `register:*`) — mit jedem Bot-Besuch mehr.
 *  - `Token`: verbrauchte und abgelaufene Verify-/Reset-/Invite-Token.
 *  - `WebauthnChallenge`: nicht eingelöste Challenges (TTL 5 min).
 *
 * Aufruf über den Vercel-Cron (siehe `vercel.json`). Vercel sendet dabei
 * `Authorization: Bearer $CRON_SECRET`; ohne gesetztes Secret ist der Endpunkt
 * gesperrt, damit ihn niemand von außen auslösen kann.
 */
export function GET(req: NextRequest) {
  return handle(async () => {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
      throw unauthorized("Cron-Aufruf nicht autorisiert.");
    }

    const now = new Date();
    const [rateLimits, tokens, challenges] = await Promise.all([
      db.rateLimit.deleteMany({ where: { resetAt: { lt: now } } }),
      db.token.deleteMany({
        // Verbraucht ODER abgelaufen — beides wird nie wieder gebraucht.
        where: { OR: [{ usedAt: { not: null } }, { expiresAt: { lt: now } }] },
      }),
      purgeExpiredChallenges(),
    ]);

    return ok({
      rateLimits: rateLimits.count,
      tokens: tokens.count,
      challenges,
    });
  });
}
