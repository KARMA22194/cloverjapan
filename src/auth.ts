import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";

import { authConfig } from "@/auth.config";
import { db } from "@/lib/db";
import { clientIp, consumeRateLimit } from "@/lib/rate";
import { assertWebauthnConfig, CHALLENGE_COOKIE, origin, readCookie, rpID } from "@/lib/webauthn";

type AuthResponse = Parameters<typeof verifyAuthenticationResponse>[0]["response"];

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "E-Mail", type: "email" },
        password: { label: "Passwort", type: "password" },
      },
      async authorize(credentials, request) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        // Brute-Force-Schutz zweistufig:
        //  1) pro IP: fängt E-Mail-Spraying (viele Konten von einer Quelle) ab.
        //  2) pro E-Mail: gezieltes Passwort-Raten auf ein Konto.
        const ip = clientIp(request as unknown as Request);
        const ipAllowed = await consumeRateLimit(`login-ip:${ip}`, 30, 15 * 60 * 1000);
        if (!ipAllowed) return null;

        // Alle Schreibpfade speichern die E-Mail lowercase (registerSelf/createUser),
        // Postgres vergleicht aber case-sensitiv → hier ebenfalls normalisieren, sonst
        // ist z. B. „Max@Firma.de" faktisch ausgesperrt (M1).
        const normalizedEmail = email.toLowerCase();

        const allowed = await consumeRateLimit(`login:${normalizedEmail}`, 10, 15 * 60 * 1000);
        if (!allowed) return null;

        const user = await db.user.findUnique({ where: { email: normalizedEmail } });
        if (!user || !user.active) return null;
        // E-Mail-Bestätigung erforderlich (nur unbestätigte Selbst-Registrierungen betroffen).
        if (!user.emailVerified) return null;

        const passwordOk = await bcrypt.compare(password, user.passwordHash);
        if (!passwordOk) return null;

        // Nur unkritische Felder zurückgeben.
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
    // Passkey/WebAuthn-Login: verifiziert die Assertion gegen den gespeicherten
    // Public Key; Challenge kommt aus dem httpOnly-Cookie (request).
    Credentials({
      id: "passkey",
      name: "Passkey",
      credentials: { authResp: {} },
      async authorize(credentials, request) {
        assertWebauthnConfig();
        const raw = credentials?.authResp;
        if (typeof raw !== "string") return null;
        let response: AuthResponse;
        try {
          response = JSON.parse(raw) as AuthResponse;
        } catch {
          return null;
        }

        const expectedChallenge = readCookie(request.headers.get("cookie") ?? "", CHALLENGE_COOKIE);
        if (!expectedChallenge) return null;

        const cred = await db.credential.findUnique({ where: { id: response.id } });
        if (!cred) return null;
        const user = await db.user.findUnique({ where: { id: cred.userId } });
        if (!user || !user.active) return null;

        try {
          const verification = await verifyAuthenticationResponse({
            response,
            expectedChallenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
            // Alleiniger Login-Faktor → tatsächliche Nutzer-Verifikation erzwingen.
            requireUserVerification: true,
            authenticator: {
              credentialID: isoBase64URL.toBuffer(cred.id),
              credentialPublicKey: new Uint8Array(cred.publicKey),
              counter: cred.counter,
            },
          });
          if (!verification.verified) return null;
          await db.credential.update({
            where: { id: cred.id },
            data: { counter: verification.authenticationInfo.newCounter },
          });
        } catch {
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
});
