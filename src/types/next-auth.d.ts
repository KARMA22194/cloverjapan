import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

// Ergänzt Session/JWT um unsere Zusatzfelder (id, role).
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      // Session-Version zum Login-Zeitpunkt → Vergleich mit dem frischen DB-Wert
      // erlaubt echtes Session-Revoke (Passwort-Reset invalidiert alte Tokens).
      sessionVersion: number;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    sessionVersion: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    ver: number;
  }
}
