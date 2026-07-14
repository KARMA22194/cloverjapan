import { generateAuthenticationOptions } from "@simplewebauthn/server";

import { handle, ok } from "@/lib/api/http";
import { assertWebauthnConfig, CHALLENGE_COOKIE, rpID } from "@/lib/webauthn";

/** GET /api/v1/passkey/auth/options — Optionen für den Passkey-Login (öffentlich). */
export function GET() {
  return handle(async () => {
    assertWebauthnConfig();
    const options = await generateAuthenticationOptions({
      rpID,
      // Passkey ist alleiniger Login-Faktor → Nutzer-Verifikation (PIN/Biometrie) verpflichtend.
      userVerification: "required",
      allowCredentials: [],
    });

    const res = ok(options);
    res.cookies.set(CHALLENGE_COOKIE, options.challenge, {
      httpOnly: true,
      path: "/",
      maxAge: 300,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    return res;
  });
}
