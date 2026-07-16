import type { NextAuthConfig } from "next-auth";
import type { Role } from "@prisma/client";

// Edge-sichere Auth-Konfiguration (keine Prisma-/bcrypt-Importe!).
// Wird sowohl von der Middleware (Edge-Runtime) als auch von auth.ts genutzt.
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    // Kürzer als der NextAuth-Default (30 Tage) — begrenzt das Zeitfenster, in dem
    // eine ausgestellte Session gültig bleibt. Der active-Status wird zusätzlich bei
    // jeder API-Anfrage frisch geprüft (requireUser).
    maxAge: 12 * 60 * 60, // 12 Stunden
  },
  providers: [], // Credentials-Provider wird erst in auth.ts (Node-Runtime) ergänzt.
  callbacks: {
    // Route-Schutz auf Middleware-Ebene.
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnLogin = nextUrl.pathname.startsWith("/login");
      // Registrierung, E-Mail-Bestätigung, Passwort-Reset und die öffentliche
      // Kofferfinder-Seite (/k/<token>) sind bewusst öffentlich.
      const isPublic = ["/register", "/verify", "/forgot", "/reset", "/k/"].some((p) =>
        nextUrl.pathname.startsWith(p),
      );

      if (isOnLogin) {
        // Eingeloggte Nutzer weg von der Login-Seite.
        if (isLoggedIn) return Response.redirect(new URL("/", nextUrl));
        return true;
      }

      if (isPublic) return true;

      // Alle übrigen (geschützten) Routen erfordern Login.
      if (!isLoggedIn) return false;

      // Admin-Bereich nur für Rolle ADMIN.
      if (nextUrl.pathname.startsWith("/admin") && auth.user.role !== "ADMIN") {
        return Response.redirect(new URL("/", nextUrl));
      }

      return true;
    },
    // Rolle/ID beim Login in das JWT schreiben.
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
      }
      return token;
    },
    // JWT-Felder in die Session spiegeln.
    // Cast nötig, da der Callback-Token den (nicht augmentierten) @auth/core/jwt-Typ nutzt.
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
