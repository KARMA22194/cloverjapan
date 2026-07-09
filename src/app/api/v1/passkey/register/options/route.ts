import { generateRegistrationOptions } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";

import { handle, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { db } from "@/lib/db";
import { CHALLENGE_COOKIE, rpID, rpName } from "@/lib/webauthn";

/** GET /api/v1/passkey/register/options — Optionen zum Einrichten eines Passkeys. */
export function GET() {
  return handle(async () => {
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
      authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
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
