import { generateAuthenticationOptions } from "@simplewebauthn/server";

import { handle, ok } from "@/lib/api/http";
import {
  assertWebauthnConfig,
  CHALLENGE_COOKIE_AUTH,
  challengeCookieOptions,
  rpID,
} from "@/lib/webauthn";
import { storeChallenge } from "@/lib/services/webauthnChallenge";

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

    // Serverseitig vormerken, damit die Challenge beim Login genau einmal
    // eingelöst werden kann (siehe services/webauthnChallenge.ts).
    await storeChallenge(options.challenge);

    const res = ok(options);
    res.cookies.set(CHALLENGE_COOKIE_AUTH, options.challenge, challengeCookieOptions);
    return res;
  });
}
