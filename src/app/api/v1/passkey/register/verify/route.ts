import type { NextRequest } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";

import { badRequest, handle, ok, readJson } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { db } from "@/lib/db";
import { CHALLENGE_COOKIE, origin, rpID } from "@/lib/webauthn";

type RegResponse = Parameters<typeof verifyRegistrationResponse>[0]["response"];

/** POST /api/v1/passkey/register/verify — Passkey-Registrierung abschließen. */
export function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const body = (await readJson(req)) as RegResponse;
    const expectedChallenge = req.cookies.get(CHALLENGE_COOKIE)?.value;
    if (!expectedChallenge) throw badRequest("Challenge fehlt oder abgelaufen.");

    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });
    if (!verification.verified || !verification.registrationInfo) {
      throw badRequest("Passkey-Registrierung fehlgeschlagen.");
    }

    const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;
    const id = isoBase64URL.fromBuffer(credentialID);
    const transports = Array.isArray((body as { response?: { transports?: string[] } }).response?.transports)
      ? (body as { response: { transports: string[] } }).response.transports.join(",")
      : "";

    await db.credential.upsert({
      where: { id },
      create: {
        id,
        userId: user.id,
        publicKey: Buffer.from(credentialPublicKey),
        counter,
        transports,
      },
      update: { counter },
    });

    const res = ok({ verified: true });
    res.cookies.delete(CHALLENGE_COOKIE);
    return res;
  });
}
