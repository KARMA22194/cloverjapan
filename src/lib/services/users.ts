import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";

export function listUsers() {
  return db.user.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      canAiScan: true,
      canReceiptPhoto: true,
      createdAt: true,
    },
  });
}

/**
 * Rechte eines Kontos setzen (nur ADMIN, über `PATCH /api/v1/users/{id}`).
 *
 * Nur die übergebenen Felder werden geschrieben — `undefined` lässt Prisma
 * unangetastet. Das ist hier wichtig, weil derselbe Endpunkt auch `active`
 * bedient: ein Aufruf, der nur ein Recht umlegt, darf nichts anderes berühren.
 */
/**
 * Ein Konto für die Admin-Antwort lesen.
 *
 * `findUniqueOrThrow`, damit eine unbekannte Id denselben Weg nimmt wie bei den
 * Schreib-Operationen: Prisma wirft P2025, `handle()` macht daraus 404. Mit
 * `findUnique` käme dagegen ein `null` bis in `toUserDto` und dort als 500 an.
 */
export function getUserById(id: string) {
  return db.user.findUniqueOrThrow({ where: { id } });
}

export function setUserPermissions(
  userId: string,
  perms: { canAiScan?: boolean; canReceiptPhoto?: boolean },
) {
  return db.user.update({ where: { id: userId }, data: perms });
}

export async function createUser(input: {
  name: string;
  email: string;
  password: string;
  role: Role;
}) {
  const passwordHash = await bcrypt.hash(input.password, 10);
  return db.user.create({
    data: {
      name: input.name,
      email: input.email.toLowerCase(),
      passwordHash,
      role: input.role,
      // Admin-angelegte Konten gelten als bestätigt (keine Selbst-Registrierung).
      emailVerified: new Date(),
    },
  });
}

/** Findet einen Nutzer per E-Mail (für den Passwort-Reset-Flow). */
export function findUserByEmail(email: string) {
  return db.user.findUnique({ where: { email: email.toLowerCase() } });
}

/** Markiert die E-Mail als bestätigt (Double-Opt-in abgeschlossen). */
export function markEmailVerified(userId: string) {
  return db.user.update({ where: { id: userId }, data: { emailVerified: new Date() } });
}

/**
 * Setzt ein neues Passwort (Passwort-Reset). Erhöht `sessionVersion` → alle zuvor
 * ausgestellten JWTs werden beim nächsten Request/SSR-Read abgewiesen (M2).
 */
export async function setUserPassword(userId: string, password: string) {
  const passwordHash = await bcrypt.hash(password, 10);
  return db.user.update({
    where: { id: userId },
    data: { passwordHash, sessionVersion: { increment: 1 } },
  });
}

export function setUserActive(id: string, active: boolean) {
  return db.user.update({ where: { id }, data: { active } });
}

export async function getUserImage(userId: string): Promise<string | null> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { image: true } });
  return u?.image ?? null;
}

export function setUserImage(userId: string, image: string | null) {
  return db.user.update({ where: { id: userId }, data: { image } });
}

/**
 * Bliebe nach dem Löschen dieses Kontos **kein aktiver ADMIN** übrig?
 *
 * Ohne diese Prüfung könnte sich die Installation aussperren: `/admin` und die
 * Nutzerverwaltung wären für niemanden mehr erreichbar, und es gibt keinen Weg,
 * per UI einen neuen Admin zu ernennen.
 */
export async function wouldLeaveNoAdmin(userId: string): Promise<boolean> {
  const others = await db.user.count({
    where: { role: "ADMIN", active: true, id: { not: userId } },
  });
  return others === 0;
}

/**
 * Konto endgültig löschen — inklusive der Reise, wenn sie dadurch leer wird.
 *
 * Ein reines `user.delete()` würde **nicht** genügen: `TripMember` hängt am User
 * mit `Cascade`, aber `Trip` selbst nicht (`Trip.ownerId` ist bewusst kein harter
 * FK). Zurück blieben also Reisen **ohne Mitglieder**, die weiterhin alle Stopps,
 * Ausgaben, Buchungen — und die öffentlich erreichbaren Kofferanhänger unter
 * `/k/[token]` — enthalten. Unerreichbar über die UI, aber vorhanden.
 *
 * Deshalb hier dreistufig:
 *  1. Konto löschen (cascadet TripMember, Credential, Token, PushSubscription,
 *     UserSectionIcon),
 *  2. bleibt die Reise **leer** → Reise löschen (cascadet alle Reisedaten),
 *  3. bleiben Mitglieder und war die Person **Owner** → Eigentum weitergeben,
 *     sonst könnte niemand mehr Mitglieder verwalten.
 *
 * Was **bleibt**: die Namens-Schnappschüsse in Ausgaben, Zuweisungen und im
 * Aktivitäts-Feed (`createdByName`, `assigneeName`, `Activity.userName` — alles
 * Strings, keine FKs). Das ist Absicht: die übrigen Mitglieder brauchen für die
 * Abrechnung weiterhin „wer hat was bezahlt". `Expense.paidById` wird durch
 * `SetNull` zu „Unbekannt".
 */
export async function deleteUserAccount(userId: string): Promise<{ tripDeleted: boolean }> {
  // Mitgliedschaft **vor** dem Löschen lesen — danach ist die Zeile weg.
  // `TripMember.userId` ist `@unique`: genau eine Reise pro Konto.
  const membership = await db.tripMember.findUnique({
    where: { userId },
    select: { tripId: true },
  });
  const tripId = membership?.tripId ?? null;

  return db.$transaction(async (tx) => {
    await tx.user.delete({ where: { id: userId } });
    if (!tripId) return { tripDeleted: false };

    const rest = await tx.tripMember.findMany({
      where: { tripId },
      select: { userId: true },
      // Verwalter zuerst, dann das dienstälteste Mitglied — so landet das Eigentum
      // bei jemandem, der die Reise ohnehin schon betreut.
      orderBy: [{ canManage: "desc" }, { joinedAt: "asc" }],
    });

    if (rest.length === 0) {
      await tx.trip.delete({ where: { id: tripId } });
      return { tripDeleted: true };
    }

    const trip = await tx.trip.findUnique({ where: { id: tripId }, select: { ownerId: true } });
    if (trip?.ownerId === userId) {
      await tx.trip.update({ where: { id: tripId }, data: { ownerId: rest[0].userId } });
    }
    return { tripDeleted: false };
  });
}
