import { generateRegistrationOptions } from "@simplewebauthn/server";
import { isoUint8Array } from "@simplewebauthn/server/helpers";

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
      // ⚠️ Ab SimpleWebAuthn 10 sind `userID` **Bytes** und die
      // `excludeCredentials`-Ids **base64url-Strings** — vorher war es genau
      // andersherum. Beides gibt der Compiler vor; falsch herum übersetzt
      // erzeugt es Passkeys, die sich später nicht zuordnen lassen.
      userID: isoUint8Array.fromUTF8String(user.id),
      userName: user.email,
      userDisplayName: user.name,
      attestationType: "none",
      // `c.id` liegt bereits als base64url in der DB.
      excludeCredentials: existing.map((c) => ({ id: c.id })),
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
