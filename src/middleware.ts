import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Eigene NextAuth-Instanz nur für die Edge-Middleware (ohne Prisma/bcrypt).
export const { auth: middleware } = NextAuth(authConfig);

export default middleware;

export const config = {
  // Alles außer API-Routen, Next-internen Assets und statischen Dateien schützen.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.).*)"],
};
