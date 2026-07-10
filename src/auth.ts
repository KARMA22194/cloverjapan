import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";

import { authConfig } from "@/auth.config";
import { db } from "@/lib/db";
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
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await db.user.findUnique({ where: { email } });
        if (!user || !user.active) return null;

        const passwordOk = await bcrypt.compare(password, user.passwordHash);
        if (!passwordOk) return null;

        // Nur unkritische Felder zurückgeben.
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
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

        return { id: user.id, name: user.name, email: user.email, role: user.role };
      },
    }),
  ],
});
