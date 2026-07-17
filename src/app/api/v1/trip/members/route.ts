import type { NextRequest } from "next/server";
import { z } from "zod";

import { conflict, handle, ok, readJson } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { enforceRateLimit } from "@/lib/rate";
import {
  getActiveTripId,
  getIncomingInvitations,
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
    const [members, invitations, incoming] = await Promise.all([
      getTripMembers(tripId),
      getPendingInvitations(tripId),
      getIncomingInvitations(user.email, tripId),
    ]);
    return ok({
      members: members.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        image: m.user.image,
        isMe: m.user.id === user.id,
        // Für den Präsenz-Status; eigener Eintrag gilt immer als „jetzt online".
        lastSeenAt: m.user.id === user.id ? new Date().toISOString() : m.user.lastSeenAt?.toISOString() ?? null,
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
      incoming,
    });
  });
}

/** POST /api/v1/trip/members — Nutzer per E-Mail in die Reise einladen. */
export function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    // Mail-Spam-/Relay-Schutz: max. 20 Einladungen pro Nutzer und Stunde.
    await enforceRateLimit(`invite:${user.id}`, 20, 60 * 60 * 1000);
    const tripId = await getActiveTripId(user.id);
    const { email } = inviteBody.parse(await readJson(req));

    const result = await inviteToTrip(tripId, email, user.name);
    if (!result.ok) {
      throw conflict("Nutzer ist bereits in dieser Reise.");
    }

    const url = inviteUrl(result.token, req);
    // Bestehendes Konto → Hinweis zum Anmelden & Annehmen; sonst Registrierungs-Link.
    const emailSent = result.hasAccount
      ? await sendTripInviteEmail(result.email, user.name)
      : await sendRegistrationInviteEmail(result.email, user.name, url);
    return ok(
      { invited: true, email: result.email, inviteUrl: url, emailSent, hasAccount: result.hasAccount },
      201,
    );
  });
}
