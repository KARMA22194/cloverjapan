import type { NextRequest } from "next/server";
import { z } from "zod";

import { ApiError, handle, ok, readJson } from "@/lib/api/http";
import { registerSelf } from "@/lib/services/trip";
import { createToken } from "@/lib/services/tokens";
import { sendAccountExistsEmail, sendVerificationEmail } from "@/lib/mailer";
import { clientIp, enforceRateLimit } from "@/lib/rate";

const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 Stunden

// Bewusst OHNE requireUser: offene Selbst-Registrierung (Middleware schützt /api nicht).
const registerBody = z.object({
  name: z.string().trim().min(2, "Name muss mindestens 2 Zeichen haben.").max(80),
  email: z.email("Ungültige E-Mail."),
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

    const isDev = process.env.NODE_ENV !== "production";
    const appOrigin = process.env.APP_URL || req.nextUrl.origin;

    const result = await registerSelf(name, email, password);
    if (!result.ok) {
      // **Keine** 409-Antwort mehr: „existiert bereits" war ein direktes Orakel,
      // mit dem sich vorhandene Konten abfragen ließen (während /forgot bewusst
      // generisch antwortet). Stattdessen dieselbe Antwort wie bei einer echten
      // Neuanmeldung — und eine Mail an den tatsächlichen Inhaber der Adresse.
      await sendAccountExistsEmail(email, new URL("/login", appOrigin).toString());
      return ok(
        {
          pendingVerification: true,
          email,
          emailSent: true,
          // In der Entwicklung offenlegen, was wirklich passiert ist (ohne SMTP
          // wäre die generische Antwort sonst nicht nachvollziehbar).
          devNote: isDev ? "Konto existiert bereits — keine Registrierung ausgelöst." : undefined,
        },
        201,
      );
    }

    const token = await createToken(result.user.id, "EMAIL_VERIFY", EMAIL_VERIFY_TTL_MS);
    const verifyUrl = new URL(`/verify?token=${token}`, appOrigin).toString();
    const emailSent = await sendVerificationEmail(result.user.email, verifyUrl);

    // Sicherheit: Der Verify-Link ist eine Bearer-Credential (der Klick gilt als
    // Adressbesitz-Nachweis). Er darf NUR im Dev-Fallback in der Antwort landen —
    // sonst könnte man ein „bestätigtes" Konto auf fremder Adresse aktivieren.
    if (!emailSent && !isDev) {
      // In Produktion keinen Link ausgeben; der ungenutzte Token verfällt (24 h),
      // niemand hat ihn erhalten. Klartext-Fehler statt stiller 201.
      throw new ApiError(
        503,
        "Die Bestätigungs-E-Mail konnte nicht versendet werden. Bitte später erneut versuchen.",
      );
    }
    return ok(
      {
        pendingVerification: true,
        email: result.user.email,
        emailSent,
        // Lokaler Fallback ohne SMTP: Link nur in der Entwicklung mitgeben.
        verifyUrl: !emailSent && isDev ? verifyUrl : undefined,
      },
      201,
    );
  });
}
