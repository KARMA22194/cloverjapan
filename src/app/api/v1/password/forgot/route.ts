import type { NextRequest } from "next/server";
import { z } from "zod";

import { handle, ok, readJson } from "@/lib/api/http";
import { findUserByEmail } from "@/lib/services/users";
import { createToken } from "@/lib/services/tokens";
import { sendPasswordResetEmail } from "@/lib/mailer";
import { clientIp, enforceRateLimit } from "@/lib/rate";

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 Stunde

const forgotBody = z.object({ email: z.string().email("Ungültige E-Mail.") });

/**
 * POST /api/v1/password/forgot — Passwort-Reset anfordern.
 * Antwort ist immer generisch (kein Account-Enumeration): existiert das Konto,
 * wird ein Reset-Link per Mail verschickt; sonst passiert nichts.
 */
export function POST(req: NextRequest) {
  return handle(async () => {
    await enforceRateLimit(`forgot:${clientIp(req)}`, 5, 60 * 60 * 1000);
    const { email } = forgotBody.parse(await readJson(req));

    const user = await findUserByEmail(email);
    if (user && user.active) {
      const token = await createToken(user.id, "PASSWORD_RESET", PASSWORD_RESET_TTL_MS);
      const resetUrl = new URL(
        `/reset?token=${token}`,
        process.env.APP_URL || req.nextUrl.origin,
      ).toString();
      await sendPasswordResetEmail(user.email, resetUrl);
    }

    return ok({ ok: true });
  });
}
