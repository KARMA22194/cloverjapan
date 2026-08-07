import type { NextRequest } from "next/server";

import { badRequest, handle, ok, readJson } from "@/lib/api/http";
import { requireTripUser } from "@/lib/api/session";
import {
  createLuggageTag,
  isTripMemberEmail,
  listLuggageTags,
} from "@/lib/services/luggageService";
import { luggageBody, toLuggageDto } from "./schema";

/** GET /api/v1/luggage — Kofferanhänger der aktuellen Reise. */
export function GET() {
  return handle(async () => {
    const { tripId } = await requireTripUser();
    return ok((await listLuggageTags(tripId)).map(toLuggageDto));
  });
}

/** POST /api/v1/luggage — neuen Kofferanhänger (mit QR-Token) anlegen. */
export function POST(req: NextRequest) {
  return handle(async () => {
    const { user, tripId } = await requireTripUser();
    const body = luggageBody.parse(await readJson(req));

    // Benachrichtigungsziel darf nur eine Adresse aus der eigenen Reise sein: der
    // Versand wird über die **öffentliche** Fund-Seite ausgelöst, eine freie Adresse
    // machte die App zum Mail-Relay (Betreff/Inhalt kommen aus dem Label).
    const notifyEmail = body.notifyEmail?.trim() || user.email;
    if (
      notifyEmail.toLowerCase() !== user.email.toLowerCase() &&
      !(await isTripMemberEmail(tripId, notifyEmail))
    ) {
      throw badRequest("Benachrichtigung nur an Mitglieder dieser Reise möglich.");
    }

    const created = await createLuggageTag(tripId, { ...body, notifyEmail }, user.name);
    return ok(toLuggageDto(created), 201);
  });
}
