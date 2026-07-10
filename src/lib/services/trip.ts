import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

import { db } from "@/lib/db";

// Gültigkeitsdauer eines Einladungs-Links.
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Aktive Reise des Nutzers; legt beim ersten Zugriff eine eigene Reise an. */
export async function getActiveTripId(userId: string): Promise<string> {
  const member = await db.tripMember.findUnique({ where: { userId } });
  if (member) return member.tripId;
  const trip = await db.trip.create({ data: { members: { create: { userId } } } });
  return trip.id;
}

export async function getTripMembers(tripId: string) {
  return db.tripMember.findMany({
    where: { tripId },
    orderBy: { joinedAt: "asc" },
    select: {
      joinedAt: true,
      user: { select: { id: true, name: true, email: true, image: true } },
    },
  });
}

type InviteResult =
  | { ok: true; kind: "member"; user: { id: string; name: string; email: string } }
  | { ok: true; kind: "invitation"; email: string; token: string }
  | { ok: false; reason: "already" };

/**
 * Lädt jemanden per E-Mail in die Reise ein.
 * - Bestehendes Konto → wird direkt Mitglied (in diese Reise verschoben).
 * - Kein Konto → es wird eine Einladung mit Token-Link angelegt (kind: "invitation"),
 *   über den sich die Person selbst registriert und dann automatisch beitritt.
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

    await db.tripMember.upsert({
      where: { userId: user.id },
      create: { tripId, userId: user.id },
      update: { tripId },
    });
    return { ok: true, kind: "member", user: { id: user.id, name: user.name, email: user.email } };
  }

  const token = await createInvitation(tripId, normalized, invitedBy);
  return { ok: true, kind: "invitation", email: normalized, token };
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
  // Offene (noch nicht eingelöste) Einladungen für diese E-Mail/Reise entfernen,
  // damit stets genau ein gültiger Link existiert.
  await db.tripInvitation.deleteMany({
    where: { tripId, email: normalized, acceptedAt: null },
  });

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  await db.tripInvitation.create({
    data: { tripId, email: normalized, token, invitedBy, expiresAt },
  });
  return token;
}

type InvitationInfo = {
  email: string;
  invitedBy: string;
  tripName: string;
};

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
  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { name, email: inv.email, passwordHash },
    });
    // Bestehende Mitgliedschaft ist ausgeschlossen (Konto ist neu) → create genügt.
    await tx.tripMember.create({ data: { tripId: inv.tripId, userId: created.id } });
    await tx.tripInvitation.update({
      where: { id: inv.id },
      data: { acceptedAt: new Date() },
    });
    return created;
  });

  return { ok: true, user: { id: user.id, name: user.name, email: user.email } };
}

/** Entfernt ein Mitglied aus der Reise → verschiebt es in eine eigene neue Reise. */
export async function removeFromTrip(tripId: string, userId: string): Promise<boolean> {
  const member = await db.tripMember.findUnique({ where: { userId } });
  if (!member || member.tripId !== tripId) return false;
  const fresh = await db.trip.create({ data: {} });
  await db.tripMember.update({ where: { userId }, data: { tripId: fresh.id } });
  return true;
}
