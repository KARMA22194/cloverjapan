import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

import { db } from "@/lib/db";

// Gültigkeitsdauer eines Einladungs-Links.
const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** Prüft, ob ein Fehler ein Prisma-Unique-Constraint-Verstoß (P2002) ist. */
function isUniqueViolation(err: unknown): boolean {
  return !!err && typeof err === "object" && "code" in err && (err as { code: unknown }).code === "P2002";
}

/** Aktive Reise des Nutzers; legt beim ersten Zugriff eine eigene Reise an. */
export async function getActiveTripId(userId: string): Promise<string> {
  const member = await db.tripMember.findUnique({ where: { userId } });
  if (member) return member.tripId;
  try {
    const trip = await db.trip.create({
      data: { ownerId: userId, members: { create: { userId } } },
    });
    return trip.id;
  } catch (err) {
    // Race: paralleler erster Zugriff (SSR + PWA) hat die Mitgliedschaft schon
    // angelegt → TripMember.userId @unique wirft P2002. Dann einfach neu lesen,
    // statt mit 500 zu scheitern.
    if (isUniqueViolation(err)) {
      const again = await db.tripMember.findUnique({ where: { userId } });
      if (again) return again.tripId;
    }
    throw err;
  }
}

export async function getTripMembers(tripId: string) {
  return db.tripMember.findMany({
    where: { tripId },
    orderBy: { joinedAt: "asc" },
    select: {
      joinedAt: true,
      canManage: true,
      user: { select: { id: true, name: true, email: true, image: true, lastSeenAt: true } },
    },
  });
}

/** Owner-User-Id der Reise (Ersteller) — null bei verwaisten (leeren) Reisen. */
export async function getTripOwnerId(tripId: string): Promise<string | null> {
  const trip = await db.trip.findUnique({ where: { id: tripId }, select: { ownerId: true } });
  return trip?.ownerId ?? null;
}

/** Darf `userId` in dieser Reise Mitglieder verwalten (= Owner oder Verwalter)? */
export async function canManageMembers(tripId: string, userId: string): Promise<boolean> {
  const ownerId = await getTripOwnerId(tripId);
  if (ownerId === userId) return true;
  const member = await db.tripMember.findUnique({
    where: { userId },
    select: { tripId: true, canManage: true },
  });
  return Boolean(member && member.tripId === tripId && member.canManage);
}

/**
 * Presence-Heartbeat: markiert den Nutzer als „gerade aktiv" (lastSeenAt = jetzt).
 * Best-effort — wird häufig aus der offenen App aufgerufen; ein Fehler darf die
 * App nicht stören (der Aufrufer ignoriert Fehler).
 */
export async function touchPresence(userId: string): Promise<void> {
  await db.user.update({ where: { id: userId }, data: { lastSeenAt: new Date() } });
}

/**
 * Schlanke Präsenz der Reise-Mitglieder (nur id + lastSeenAt) — für den 30-s-Poll,
 * ohne die (bis 300 KB großen) Profilbilder und ohne die Einladungs-Queries.
 */
export async function getTripPresence(
  tripId: string,
): Promise<{ id: string; lastSeenAt: string | null }[]> {
  const rows = await db.tripMember.findMany({
    where: { tripId },
    select: { user: { select: { id: true, lastSeenAt: true } } },
  });
  return rows.map((r) => ({
    id: r.user.id,
    lastSeenAt: r.user.lastSeenAt ? r.user.lastSeenAt.toISOString() : null,
  }));
}

type InviteResult =
  | { ok: true; email: string; token: string; hasAccount: boolean }
  | { ok: false; reason: "already" };

/**
 * Lädt jemanden per E-Mail in die Reise ein — immer als **ausstehende Einladung**,
 * die die eingeladene Person selbst bestätigt (keine erzwungene Umhängung mehr).
 * - Bestehendes Konto (`hasAccount: true`) → meldet sich an und nimmt die Einladung
 *   unter „Mitglieder → Einladungen an dich" an.
 * - Kein Konto (`hasAccount: false`) → registriert sich über den Token-Link und
 *   tritt dabei automatisch bei.
 */
export async function inviteToTrip(
  tripId: string,
  email: string,
  invitedBy: string,
): Promise<InviteResult> {
  const normalized = email.toLowerCase();
  const user = await db.user.findUnique({ where: { email: normalized } });

  if (user) {
    const existing = await db.tripMember.findUnique({ where: { userId: user.id } });
    if (existing?.tripId === tripId) return { ok: false, reason: "already" };
  }

  const token = await createInvitation(tripId, normalized, invitedBy);
  return { ok: true, email: normalized, token, hasAccount: Boolean(user) };
}

type IncomingInvitation = {
  id: string;
  tripName: string;
  invitedBy: string;
  expiresAt: string;
};

/**
 * Offene Einladungen, die an die E-Mail des Nutzers gerichtet sind (nicht an seine
 * aktuelle Reise) — für den Zustimmungs-Schritt „Einladungen an dich".
 */
export async function getIncomingInvitations(
  email: string,
  currentTripId: string,
): Promise<IncomingInvitation[]> {
  const now = new Date();
  const invs = await db.tripInvitation.findMany({
    where: {
      email: email.toLowerCase(),
      acceptedAt: null,
      expiresAt: { gt: now },
      tripId: { not: currentTripId },
    },
    orderBy: { createdAt: "desc" },
    include: { trip: { select: { name: true } } },
  });
  return invs.map((inv) => ({
    id: inv.id,
    tripName: inv.trip.name,
    invitedBy: inv.invitedBy,
    expiresAt: inv.expiresAt.toISOString(),
  }));
}

/**
 * Nimmt eine an den Nutzer gerichtete Einladung an: hängt seine Mitgliedschaft in die
 * eingeladene Reise um (verlässt die bisherige) und entwertet die Einladung — atomar.
 */
export async function acceptIncomingInvitation(
  userId: string,
  email: string,
  invitationId: string,
): Promise<boolean> {
  const inv = await db.tripInvitation.findUnique({ where: { id: invitationId } });
  if (
    !inv ||
    inv.email !== email.toLowerCase() ||
    inv.acceptedAt ||
    inv.expiresAt < new Date()
  ) {
    return false;
  }

  try {
    await db.$transaction(async (tx) => {
      const consumed = await tx.tripInvitation.updateMany({
        where: { id: inv.id, acceptedAt: null },
        data: { acceptedAt: new Date() },
      });
      if (consumed.count === 0) throw new Error("ALREADY_ACCEPTED");
      await tx.tripMember.update({ where: { userId }, data: { tripId: inv.tripId } });
    });
    return true;
  } catch (err) {
    if (err instanceof Error && err.message === "ALREADY_ACCEPTED") return false;
    throw err;
  }
}

/** Lehnt eine an den Nutzer gerichtete Einladung ab (löscht sie). */
export async function declineIncomingInvitation(email: string, invitationId: string): Promise<boolean> {
  const result = await db.tripInvitation.deleteMany({
    where: { id: invitationId, email: email.toLowerCase(), acceptedAt: null },
  });
  return result.count > 0;
}

/**
 * Legt eine Einladung an (oder erneuert eine offene für dieselbe E-Mail/Reise)
 * und gibt den Token zurück. Bereits eingelöste Einladungen bleiben unangetastet.
 */
export async function createInvitation(
  tripId: string,
  email: string,
  invitedBy: string,
): Promise<string> {
  const normalized = email.toLowerCase();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  // Offene Einladungen entwerten + neue anlegen atomar, damit bei parallelen
  // Aufrufen nicht mehrere gültige Links für dieselbe E-Mail/Reise entstehen.
  await db.$transaction([
    db.tripInvitation.deleteMany({ where: { tripId, email: normalized, acceptedAt: null } }),
    db.tripInvitation.create({ data: { tripId, email: normalized, token, invitedBy, expiresAt } }),
  ]);
  return token;
}

type InvitationInfo = {
  email: string;
  invitedBy: string;
  tripName: string;
};

/**
 * Offene (noch nicht eingelöste) Einladungen einer Reise — für die Pending-Ansicht.
 * Enthält Ablaufdatum + abgeleiteten Status, damit die UI „läuft in X Tagen ab" bzw.
 * „abgelaufen" anzeigen kann.
 */
export async function getPendingInvitations(tripId: string) {
  const invs = await db.tripInvitation.findMany({
    where: { tripId, acceptedAt: null },
    orderBy: { createdAt: "desc" },
  });
  const now = new Date();
  return invs.map((inv) => ({
    id: inv.id,
    email: inv.email,
    invitedBy: inv.invitedBy,
    token: inv.token,
    createdAt: inv.createdAt.toISOString(),
    expiresAt: inv.expiresAt.toISOString(),
    expired: inv.expiresAt < now,
  }));
}

/** Widerruft eine offene Einladung (nur innerhalb der eigenen Reise). */
export async function revokeInvitation(tripId: string, id: string): Promise<boolean> {
  const result = await db.tripInvitation.deleteMany({
    where: { id, tripId, acceptedAt: null },
  });
  return result.count > 0;
}

/**
 * Offene Selbst-Registrierung (ohne Einladung): legt ein Konto an und startet mit
 * einer eigenen Solo-Reise. E-Mail-Kollision → { ok:false, reason:"exists" }.
 */
export async function registerSelf(
  name: string,
  email: string,
  password: string,
): Promise<AcceptResult> {
  const normalized = email.toLowerCase();
  const existing = await db.user.findUnique({ where: { email: normalized } });
  if (existing) return { ok: false, reason: "exists" };

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { name, email: normalized, passwordHash },
      });
      // Eigene Reise, damit die Japan-Tools sofort nutzbar sind.
      await tx.trip.create({
        data: { ownerId: created.id, members: { create: { userId: created.id } } },
      });
      return created;
    });
    return { ok: true, user: { id: user.id, name: user.name, email: user.email } };
  } catch (err) {
    // Race: parallele Registrierung derselben E-Mail → User.email @unique (P2002).
    if (isUniqueViolation(err)) return { ok: false, reason: "exists" };
    throw err;
  }
}

/** Liefert die Einladung zu einem Token, wenn sie gültig (offen + nicht abgelaufen) ist. */
export async function getValidInvitation(token: string): Promise<InvitationInfo | null> {
  const inv = await db.tripInvitation.findUnique({
    where: { token },
    include: { trip: { select: { name: true } } },
  });
  if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) return null;
  return { email: inv.email, invitedBy: inv.invitedBy, tripName: inv.trip.name };
}

type AcceptResult =
  | { ok: true; user: { id: string; name: string; email: string } }
  | { ok: false; reason: "invalid" | "exists" };

/**
 * Löst eine Einladung ein: legt das Konto an, macht es zum Mitglied der Reise
 * und markiert die Einladung als verbraucht — atomar in einer Transaktion.
 */
export async function acceptInvitation(
  token: string,
  name: string,
  password: string,
): Promise<AcceptResult> {
  const inv = await db.tripInvitation.findUnique({ where: { token } });
  if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) {
    return { ok: false, reason: "invalid" };
  }

  const existing = await db.user.findUnique({ where: { email: inv.email } });
  if (existing) return { ok: false, reason: "exists" };

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const user = await db.$transaction(async (tx) => {
      // Einladung *innerhalb* der Transaktion konditional entwerten: nur solange
      // acceptedAt noch null ist. Bei paralleler Zweiteinlösung desselben Tokens
      // trifft count===0 → sauberer Abbruch statt P2002-500 an user.create.
      const consumed = await tx.tripInvitation.updateMany({
        where: { id: inv.id, acceptedAt: null },
        data: { acceptedAt: new Date() },
      });
      if (consumed.count === 0) throw new Error("ALREADY_ACCEPTED");

      const created = await tx.user.create({
        // Einladung per Mail-Link beweist E-Mail-Besitz → direkt als bestätigt anlegen.
        data: { name, email: inv.email, passwordHash, emailVerified: new Date() },
      });
      // Bestehende Mitgliedschaft ist ausgeschlossen (Konto ist neu) → create genügt.
      await tx.tripMember.create({ data: { tripId: inv.tripId, userId: created.id } });
      return created;
    });
    return { ok: true, user: { id: user.id, name: user.name, email: user.email } };
  } catch (err) {
    if (err instanceof Error && err.message === "ALREADY_ACCEPTED") {
      return { ok: false, reason: "invalid" };
    }
    if (isUniqueViolation(err)) return { ok: false, reason: "exists" };
    throw err;
  }
}

export type RemoveResult =
  | "ok"
  | "not_found" // Ziel ist nicht (mehr) Mitglied dieser Reise
  | "forbidden" // Aufrufer darf dieses Ziel nicht entfernen
  | "owner_protected" // der Owner kann nicht entfernt werden
  | "owner_cannot_leave"; // der Owner kann die Reise nicht selbst verlassen

/**
 * Entfernt ein Mitglied aus der Reise → verschiebt es in eine eigene neue Reise.
 * Berechtigung:
 *  - sich selbst entfernen (verlassen) darf jeder — außer dem Owner (müsste erst
 *    übertragen werden);
 *  - andere entfernen darf nur der Owner oder ein Verwalter (canManage);
 *  - ein Verwalter darf den Owner und andere Verwalter NICHT entfernen (nur der Owner);
 *  - der Owner ist grundsätzlich nicht entfernbar.
 */
export async function removeFromTrip(
  tripId: string,
  actingUserId: string,
  targetUserId: string,
): Promise<RemoveResult> {
  const target = await db.tripMember.findUnique({
    where: { userId: targetUserId },
    select: { tripId: true, canManage: true },
  });
  if (!target || target.tripId !== tripId) return "not_found";

  const ownerId = await getTripOwnerId(tripId);
  const isSelf = actingUserId === targetUserId;

  if (isSelf) {
    if (ownerId === targetUserId) return "owner_cannot_leave";
  } else {
    if (ownerId === targetUserId) return "owner_protected"; // Owner unantastbar
    const actingIsOwner = ownerId === actingUserId;
    if (!actingIsOwner) {
      // Kein Owner → nur Verwalter, und nur gegen einfache Mitglieder.
      const acting = await db.tripMember.findUnique({
        where: { userId: actingUserId },
        select: { tripId: true, canManage: true },
      });
      const actingCanManage = Boolean(acting && acting.tripId === tripId && acting.canManage);
      if (!actingCanManage || target.canManage) return "forbidden";
    }
  }

  // Neue Solo-Reise anlegen + Mitgliedschaft umhängen atomar — sonst kann eine
  // leere Reise ohne Mitglied zurückbleiben, wenn der zweite Write scheitert.
  await db.$transaction(async (tx) => {
    const fresh = await tx.trip.create({ data: { ownerId: targetUserId } });
    await tx.tripMember.update({
      where: { userId: targetUserId },
      data: { tripId: fresh.id, canManage: false },
    });
  });
  return "ok";
}

/**
 * Verwalter-Recht eines Mitglieds setzen/entziehen — nur der Owner darf das.
 * Der Owner selbst braucht kein Flag (Recht ergibt sich aus Trip.ownerId).
 */
export async function setMemberManage(
  tripId: string,
  actingUserId: string,
  targetUserId: string,
  canManage: boolean,
): Promise<"ok" | "forbidden" | "not_found" | "owner_self"> {
  const ownerId = await getTripOwnerId(tripId);
  if (ownerId !== actingUserId) return "forbidden"; // nur der Owner
  if (targetUserId === ownerId) return "owner_self"; // Owner hat das Recht ohnehin
  const target = await db.tripMember.findUnique({
    where: { userId: targetUserId },
    select: { tripId: true },
  });
  if (!target || target.tripId !== tripId) return "not_found";
  await db.tripMember.update({ where: { userId: targetUserId }, data: { canManage } });
  return "ok";
}
