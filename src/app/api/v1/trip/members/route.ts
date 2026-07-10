import type { NextRequest } from "next/server";
import { z } from "zod";

import { conflict, handle, ok, readJson } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import {
  getActiveTripId,
  getPendingInvitations,
  getTripMembers,
  inviteToTrip,
} from "@/lib/services/trip";
import { sendRegistrationInviteEmail, sendTripInviteEmail } from "@/lib/mailer";

const inviteBody = z.object({ email: z.string().email("Ungültige E-Mail.") });

function inviteUrl(token: string, req: NextRequest): string {
  return new URL(`/register?token=${token}`, process.env.APP_URL || req.nextUrl.origin).toString();
}

/** GET /api/v1/trip/members — Mitglieder + offene (pending) Einladungen der aktuellen Reise. */
export function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const tripId = await getActiveTripId(user.id);
    const [members, invitations] = await Promise.all([
      getTripMembers(tripId),
      getPendingInvitations(tripId),
    ]);
    return ok({
      members: members.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        image: m.user.image,
        isMe: m.user.id === user.id,
      })),
      invitations: invitations.map((inv) => ({
        id: inv.id,
        email: inv.email,
        invitedBy: inv.invitedBy,
        createdAt: inv.createdAt,
        expiresAt: inv.expiresAt,
        expired: inv.expired,
        inviteUrl: inviteUrl(inv.token, req),
      })),
    });
  });
}

/** POST /api/v1/trip/members — Nutzer per E-Mail in die Reise einladen. */
export function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const tripId = await getActiveTripId(user.id);
    const { email } = inviteBody.parse(await readJson(req));

    const result = await inviteToTrip(tripId, email, user.name);
    if (!result.ok) {
      throw conflict("Nutzer ist bereits in dieser Reise.");
    }

    // Bestehendes Konto → direkt Mitglied.
    if (result.kind === "member") {
      const emailSent = await sendTripInviteEmail(result.user.email, user.name);
      return ok({ member: { ...result.user, isMe: false }, emailSent }, 201);
    }

    // Kein Konto → Registrierungs-Link erzeugen und (falls SMTP) versenden.
    const url = inviteUrl(result.token, req);
    const emailSent = await sendRegistrationInviteEmail(result.email, user.name, url);
    return ok({ invited: true, email: result.email, inviteUrl: url, emailSent }, 201);
  });
}
