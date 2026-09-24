import type { NextRequest } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";

import { ApiError, badRequest, handle, ok, readJson } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { db } from "@/lib/db";
import {
  assertWebauthnConfig,
  CHALLENGE_COOKIE_REGISTER,
  origin,
  rpID,
} from "@/lib/webauthn";
import { consumeChallenge } from "@/lib/services/webauthnChallenge";

type RegResponse = Parameters<typeof verifyRegistrationResponse>[0]["response"];

/** POST /api/v1/passkey/register/verify — Passkey-Registrierung abschließen. */
export function POST(req: NextRequest) {
  return handle(async () => {
    assertWebauthnConfig();
    const user = await requireUser();
    const body = (await readJson(req)) as RegResponse;
    const expectedChallenge = req.cookies.get(CHALLENGE_COOKIE_REGISTER)?.value;
    if (!expectedChallenge) throw badRequest("Challenge fehlt oder abgelaufen.");

    // Einmal-Verwendung: die Challenge wird hier serverseitig entwertet, bevor
    // sie geprüft wird. Ein zweiter Versuch mit derselben Challenge läuft ins Leere.
    if (!(await consumeChallenge(expectedChallenge))) {
      throw badRequest("Challenge ist abgelaufen oder wurde bereits verwendet.");
    }

    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      // Wie beim Login: echte Nutzer-Verifikation (PIN/Biometrie) verlangen.
      requireUserVerification: true,
    });
    if (!verification.verified || !verification.registrationInfo) {
      throw badRequest("Passkey-Registrierung fehlgeschlagen.");
    }

    // ⚠️ Ab SimpleWebAuthn 11 stecken die Werte in `registrationInfo.credential`
    // statt einzeln daneben — und `credential.id` ist bereits ein
    // base64url-String, muss also nicht mehr umgewandelt werden.
    const { id, publicKey, counter } = verification.registrationInfo.credential;
    const transports = Array.isArray((body as { response?: { transports?: string[] } }).response?.transports)
      ? (body as { response: { transports: string[] } }).response.transports.join(",")
      : "";

    // Besitz prüfen, statt blind zu upserten: gehörte die Credential-ID einem
    // anderen Konto, hätte das frühere `update: { counter }` dessen Zähler
    // überschrieben (schwächt den Klon-Schutz) und dem Aufrufer fälschlich
    // „registriert" gemeldet, obwohl der Passkey auf ein fremdes Konto zeigt.
    const existing = await db.credential.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (existing && existing.userId !== user.id) {
      throw new ApiError(409, "Dieser Passkey ist bereits einem anderen Konto zugeordnet.");
    }

    await db.credential.upsert({
      where: { id },
      create: {
        id,
        userId: user.id,
        publicKey: Buffer.from(publicKey),
        counter,
        transports,
      },
      update: { counter, publicKey: Buffer.from(publicKey), transports },
    });

    const res = ok({ verified: true });
    res.cookies.delete(CHALLENGE_COOKIE_REGISTER);
    return res;
  });
}
