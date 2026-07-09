import { db } from "@/lib/db";

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
  | { ok: true; user: { id: string; name: string; email: string } }
  | { ok: false; reason: "not_found" | "already" };

/** Lädt einen Nutzer per E-Mail in die Reise ein (verschiebt ihn in diese Reise). */
export async function inviteToTrip(tripId: string, email: string): Promise<InviteResult> {
  const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) return { ok: false, reason: "not_found" };

  const existing = await db.tripMember.findUnique({ where: { userId: user.id } });
  if (existing?.tripId === tripId) return { ok: false, reason: "already" };

  await db.tripMember.upsert({
    where: { userId: user.id },
    create: { tripId, userId: user.id },
    update: { tripId },
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
