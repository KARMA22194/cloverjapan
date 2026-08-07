import { generateRegistrationOptions } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";

import { handle, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { db } from "@/lib/db";
import {
  assertWebauthnConfig,
  CHALLENGE_COOKIE_REGISTER,
  challengeCookieOptions,
  rpID,
  rpName,
} from "@/lib/webauthn";
import { storeChallenge } from "@/lib/services/webauthnChallenge";

/** GET /api/v1/passkey/register/options — Optionen zum Einrichten eines Passkeys. */
export function GET() {
  return handle(async () => {
    assertWebauthnConfig();
    const user = await requireUser();
    const existing = await db.credential.findMany({
      where: { userId: user.id },
      select: { id: true },
    });

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: user.id,
      userName: user.email,
      userDisplayName: user.name,
      attestationType: "none",
      excludeCredentials: existing.map((c) => ({
        id: isoBase64URL.toBuffer(c.id),
        type: "public-key" as const,
      })),
      // Beides **required**, passend zum Login: der prüft mit
      // `userVerification: "required"` und `allowCredentials: []`, braucht also
      // ein Discoverable Credential mit echter Nutzer-Verifikation. Mit
      // "preferred" ließen sich Passkeys einrichten, die beim Anmelden
      // zwangsläufig abgelehnt werden — der Fehler zeigte sich erst dort.
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
    });

    await storeChallenge(options.challenge);

    const res = ok(options);
    res.cookies.set(CHALLENGE_COOKIE_REGISTER, options.challenge, challengeCookieOptions);
    return res;
  });
}
