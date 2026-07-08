import type { Role } from "@prisma/client";

import { auth } from "@/auth";
import { forbidden, unauthorized } from "./http";

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

/**
 * Aktueller Nutzer aus dem NextAuth-Session-Cookie — oder 401.
 * Grundlage der Auth für alle REST-Endpunkte (same-origin, JWT-Session).
 */
export async function requireUser(): Promise<ApiUser> {
  const session = await auth();
  if (!session?.user) throw unauthorized();
  const { id, name, email, role } = session.user;
  return { id, name: name ?? "", email: email ?? "", role };
}

/** Wie {@link requireUser}, zusätzlich ADMIN-Pflicht (sonst 403). */
export async function requireAdmin(): Promise<ApiUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw forbidden();
  return user;
}
