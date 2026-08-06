import type { Role } from "@prisma/client";

import { auth } from "@/auth";
import { db } from "@/lib/db";
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
  const { id, name, email, sessionVersion } = session.user;

  // Session-Revocation: JWT trägt Rolle/ID/Version vom Login-Zeitpunkt. Deaktiviert
  // ein Admin den Nutzer (oder ändert Rolle/E-Mail-Status), oder wird das Passwort
  // zurückgesetzt (sessionVersion++), muss das sofort greifen — daher bei jeder
  // Anfrage frisch aus der DB lesen (statt aus dem Token).
  const fresh = await db.user.findUnique({
    where: { id },
    select: { active: true, role: true, emailVerified: true, sessionVersion: true },
  });
  if (!fresh || !fresh.active) throw unauthorized("Konto deaktiviert oder nicht vorhanden.");
  if (!fresh.emailVerified) throw unauthorized("E-Mail-Adresse nicht bestätigt.");
  // Passwort-Reset entwertet alte Sessions (M2).
  if (fresh.sessionVersion !== sessionVersion) throw unauthorized("Sitzung abgelaufen.");

  return { id, name: name ?? "", email: email ?? "", role: fresh.role };
}

/** Wie {@link requireUser}, zusätzlich ADMIN-Pflicht (sonst 403). */
export async function requireAdmin(): Promise<ApiUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw forbidden();
  return user;
}
