import type { NextRequest } from "next/server";
import { z } from "zod";

import { conflict, handle, ok, readJson } from "@/lib/api/http";
import { registerSelf } from "@/lib/services/trip";
import { createToken } from "@/lib/services/tokens";
import { sendVerificationEmail } from "@/lib/mailer";
import { clientIp, enforceRateLimit } from "@/lib/rate";

const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 Stunden

// Bewusst OHNE requireUser: offene Selbst-Registrierung (Middleware schützt /api nicht).
const registerBody = z.object({
  name: z.string().trim().min(2, "Name muss mindestens 2 Zeichen haben.").max(80),
  email: z.string().email("Ungültige E-Mail."),
  password: z.string().min(8, "Passwort muss mindestens 8 Zeichen haben.").max(200),
});

/**
 * POST /api/v1/register — neues Konto ohne Einladung anlegen (eigene Solo-Reise).
 * Das Konto ist zunächst **unbestätigt**; erst nach Klick auf den Verify-Link ist
 * der Login möglich (Double-Opt-in). Ohne konfiguriertes SMTP wird der Link in der
 * Antwort mitgegeben, damit die Registrierung auch lokal nutzbar bleibt.
 */
export function POST(req: NextRequest) {
  return handle(async () => {
    // Missbrauchsschutz: max. 5 Registrierungen pro IP und Stunde.
    await enforceRateLimit(`register:${clientIp(req)}`, 5, 60 * 60 * 1000);

    const { name, email, password } = registerBody.parse(await readJson(req));

    const result = await registerSelf(name, email, password);
    if (!result.ok) {
      throw conflict("Für diese E-Mail existiert bereits ein Konto. Bitte anmelden.");
    }

    const token = await createToken(result.user.id, "EMAIL_VERIFY", EMAIL_VERIFY_TTL_MS);
    const verifyUrl = new URL(
      `/verify?token=${token}`,
      process.env.APP_URL || req.nextUrl.origin,
    ).toString();
    const emailSent = await sendVerificationEmail(result.user.email, verifyUrl);

    // Token/Link nur zurückgeben, wenn keine Mail rausging (lokaler Fallback) —
    // sonst bleibt der Verify-Token nicht unnötig im Client hängen.
    return ok(
      {
        pendingVerification: true,
        email: result.user.email,
        emailSent,
        verifyUrl: emailSent ? undefined : verifyUrl,
      },
      201,
    );
  });
}
