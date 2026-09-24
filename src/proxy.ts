import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/auth.config";
import { NONCE_HEADER, buildCsp } from "@/lib/csp";

// Eigene NextAuth-Instanz nur für diese Datei (ohne Prisma/bcrypt — Edge-Runtime).
const { auth } = NextAuth(authConfig);

/**
 * Route-Schutz (NextAuth `authorized`-Callback) **plus** die Content-Security-Policy.
 *
 * ⚠️ Diese Datei hieß bis Next 15 `src/middleware.ts`. Ab **Next 16** ist die
 * Middleware-Konvention abgekündigt und heißt **`proxy.ts`** — der Dev-Server
 * sagt es bei jedem Start. Inhaltlich ändert sich nichts: gleicher Default-Export,
 * gleiches `config.matcher`.
 *
 * Die CSP entsteht hier statt in `next.config.ts`, weil sie einen Nonce pro Request
 * enthält (siehe `src/lib/csp.ts`). Der Nonce geht auf zwei Wegen weiter:
 *  - im **Request**-Header: daran erkennt Next.js, dass es seine eigenen
 *    Inline-Scripts mit `nonce` ausliefern soll,
 *  - in `x-nonce`: das Root-Layout liest ihn für das Theme-Script.
 *
 * Der `auth()`-Wrapper führt weiterhin `authorized` aus; liefert der eine Redirect
 * oder ein `false`, kommt dessen Response zurück und unser Callback läuft nicht —
 * der Schutz bleibt also unverändert.
 */
export default auth(function proxy(req) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce, process.env.NODE_ENV !== "production");

  const headers = new Headers(req.headers);
  headers.set(NONCE_HEADER, nonce);
  headers.set("content-security-policy", csp);

  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
});

export const config = {
  // Alles außer API-Routen, Next-internen Assets und statischen Dateien.
  //
  // Der Schrägstrich in `api/` ist Absicht: ohne ihn greift der Ausschluss auf
  // **jeden** Pfad, der mit „api" beginnt — eine künftige Seite `/api…` bekäme
  // dann keine CSP, weil die hier entsteht. Die eigentlichen `/api/v1/*`-Routen
  // bleiben ausgenommen und authentifizieren wie gehabt pro Handler.
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|.*\\.).*)"],
};
