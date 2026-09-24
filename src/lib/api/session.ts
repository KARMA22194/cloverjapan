import type { Role } from "@prisma/client";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getActiveTripId } from "@/lib/services/trip";
import { forbidden, unauthorized } from "./http";

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Darf den KI-Beleg-Scan auslösen (Cloud Vision). */
  canAiScan: boolean;
  /** Darf Belegfotos anhängen (ohne Scan). */
  canReceiptPhoto: boolean;
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
    select: {
      active: true,
      role: true,
      emailVerified: true,
      sessionVersion: true,
      canAiScan: true,
      canReceiptPhoto: true,
    },
  });
  if (!fresh || !fresh.active) throw unauthorized("Konto deaktiviert oder nicht vorhanden.");
  if (!fresh.emailVerified) throw unauthorized("E-Mail-Adresse nicht bestätigt.");
  // Passwort-Reset entwertet alte Sessions (M2).
  if (fresh.sessionVersion !== sessionVersion) throw unauthorized("Sitzung abgelaufen.");

  return {
    id,
    name: name ?? "",
    email: email ?? "",
    role: fresh.role,
    canAiScan: fresh.canAiScan,
    canReceiptPhoto: fresh.canReceiptPhoto,
  };
}

/** Wie {@link requireUser}, zusätzlich ADMIN-Pflicht (sonst 403). */
export async function requireAdmin(): Promise<ApiUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw forbidden();
  return user;
}

/**
 * Nutzer **und** aktive Reise in einem Rutsch — der Einstieg fast jedes
 * Trip-Endpunkts.
 *
 * Zuvor lief das in 26 Route-Dateien als
 * `const user = await requireUser(); const tripId = await getActiveTripId(user.id);`
 * — zwei **sequenzielle** Neon-Roundtrips, obwohl beide Abfragen nur die User-Id
 * aus dem JWT brauchen und damit unabhängig sind. Parallel halbiert das die
 * Latenz vor der eigentlichen Arbeit; serverlos mit ~12 Client-Requests pro
 * Seitenaufruf summiert sich das spürbar.
 */
export async function requireTripUser(): Promise<{ user: ApiUser; tripId: string }> {
  const session = await auth();
  if (!session?.user) throw unauthorized();
  const { id, name, email, sessionVersion } = session.user;

  const [fresh, member] = await Promise.all([
    db.user.findUnique({
      where: { id },
      select: {
      active: true,
      role: true,
      emailVerified: true,
      sessionVersion: true,
      canAiScan: true,
      canReceiptPhoto: true,
    },
    }),
    db.tripMember.findUnique({ where: { userId: id }, select: { tripId: true } }),
  ]);

  if (!fresh || !fresh.active) throw unauthorized("Konto deaktiviert oder nicht vorhanden.");
  if (!fresh.emailVerified) throw unauthorized("E-Mail-Adresse nicht bestätigt.");
  if (fresh.sessionVersion !== sessionVersion) throw unauthorized("Sitzung abgelaufen.");

  const user: ApiUser = {
    id,
    name: name ?? "",
    email: email ?? "",
    role: fresh.role,
    canAiScan: fresh.canAiScan,
    canReceiptPhoto: fresh.canReceiptPhoto,
  };
  // Erster Zugriff eines neuen Kontos: Solo-Reise anlegen (inkl. P2002-Race-Schutz).
  const tripId = member?.tripId ?? (await getActiveTripId(id));
  return { user, tripId };
}

/**
 * Wirft 403, wenn dem Konto das Recht fehlt.
 *
 * ⚠️ Das ist die Prüfung, die zählt. Die Knöpfe in der Oberfläche werden
 * zusätzlich ausgeblendet, aber das ist nur Bequemlichkeit — die REST-API ist
 * same-origin erreichbar, ein direkter Aufruf umginge sie mühelos.
 */
export function requirePermission(
  user: ApiUser,
  permission: "canAiScan" | "canReceiptPhoto",
): void {
  if (user[permission]) return;
  throw forbidden(
    permission === "canAiScan"
      ? "Für den Beleg-Scan nicht freigeschaltet. Bitte Betrag von Hand eintragen."
      : "Für Belegfotos nicht freigeschaltet.",
  );
}
