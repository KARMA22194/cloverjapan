import { generateAuthenticationOptions } from "@simplewebauthn/server";

import { handle, ok } from "@/lib/api/http";
import { CHALLENGE_COOKIE, rpID } from "@/lib/webauthn";

/** GET /api/v1/passkey/auth/options — Optionen für den Passkey-Login (öffentlich). */
export function GET() {
  return handle(async () => {
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "preferred",
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
