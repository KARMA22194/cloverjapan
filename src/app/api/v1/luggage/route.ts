import type { NextRequest } from "next/server";

import { handle, ok, readJson } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { getActiveTripId } from "@/lib/services/trip";
import { createLuggageTag, listLuggageTags } from "@/lib/services/luggageService";
import { luggageBody, toLuggageDto } from "./schema";

/** GET /api/v1/luggage — Kofferanhänger der aktuellen Reise. */
export function GET() {
  return handle(async () => {
    const user = await requireUser();
    const tripId = await getActiveTripId(user.id);
    return ok((await listLuggageTags(tripId)).map(toLuggageDto));
  });
}

/** POST /api/v1/luggage — neuen Kofferanhänger (mit QR-Token) anlegen. */
export function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const tripId = await getActiveTripId(user.id);
    const body = luggageBody.parse(await readJson(req));
    const created = await createLuggageTag(
      tripId,
      { ...body, notifyEmail: body.notifyEmail || user.email },
      user.name,
    );
    return ok(toLuggageDto(created), 201);
  });
}
