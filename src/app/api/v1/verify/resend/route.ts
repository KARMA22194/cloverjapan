import type { NextRequest } from "next/server";
import { z } from "zod";

import { handle, ok, readJson } from "@/lib/api/http";
import { db } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/mailer";
import { clientIp, enforceRateLimit } from "@/lib/rate";
import { createToken } from "@/lib/services/tokens";

const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 Stunden

const body = z.object({ email: z.string().email("Ungültige E-Mail.") });

/**
 * POST /api/v1/verify/resend — Bestätigungsmail erneut anfordern (öffentlich).
 *
 * Nötig, weil der Einmal-Token verfallen oder von einem Link-Scanner verbraucht
 * worden sein kann; ohne diesen Weg bliebe das Konto dauerhaft gesperrt.
 *
 * Antwortet wie `/forgot` **immer generisch** — ob die Adresse existiert oder
 * bereits bestätigt ist, verrät die Antwort nicht.
 */
export function POST(req: NextRequest) {
  return handle(async () => {
    await enforceRateLimit(`verify-resend:${clientIp(req)}`, 5, 60 * 60 * 1000);
    const { email } = body.parse(await readJson(req));
    const normalized = email.toLowerCase();
    await enforceRateLimit(`verify-resend-mail:${normalized}`, 3, 60 * 60 * 1000);

    const user = await db.user.findUnique({
      where: { email: normalized },
      select: { id: true, email: true, emailVerified: true },
    });

    // Nur für existierende, noch unbestätigte Konten wirklich versenden.
    if (user && !user.emailVerified) {
      const token = await createToken(user.id, "EMAIL_VERIFY", EMAIL_VERIFY_TTL_MS);
      const verifyUrl = new URL(
        `/verify?token=${token}`,
        process.env.APP_URL || req.nextUrl.origin,
      ).toString();
      await sendVerificationEmail(user.email, verifyUrl);
    }

    return ok({ sent: true });
  });
}
