import type { NextRequest } from "next/server";
import { z } from "zod";

import { ApiError, conflict, handle, ok, readJson } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { getActiveTripId, getTripMembers, inviteToTrip } from "@/lib/services/trip";
import { sendTripInviteEmail } from "@/lib/mailer";

const inviteBody = z.object({ email: z.string().email("Ungültige E-Mail.") });

/** GET /api/v1/trip/members — Mitglieder der aktuellen Reise. */
export function GET() {
  return handle(async () => {
    const user = await requireUser();
    const tripId = await getActiveTripId(user.id);
    const members = await getTripMembers(tripId);
    return ok({
      members: members.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        image: m.user.image,
        isMe: m.user.id === user.id,
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

    const result = await inviteToTrip(tripId, email);
    if (!result.ok) {
      if (result.reason === "not_found") {
        throw new ApiError(
          404,
          "Kein Konto mit dieser E-Mail. Die Person muss zuerst ein Konto haben (vom Admin angelegt).",
        );
      }
      throw conflict("Nutzer ist bereits in dieser Reise.");
    }
    const emailSent = await sendTripInviteEmail(result.user.email, user.name);
    return ok({ member: { ...result.user, isMe: false }, emailSent }, 201);
  });
}
