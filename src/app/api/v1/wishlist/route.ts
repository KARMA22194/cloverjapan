import type { NextRequest } from "next/server";

import { handle, ok, readJson } from "@/lib/api/http";
import { requireTripUser } from "@/lib/api/session";
import { createWishlistItem, listWishlist } from "@/lib/services/wishlist";
import { logActivity } from "@/lib/services/activityService";
import { createBody, toWishlistDto } from "./schema";

/** GET /api/v1/wishlist — Einkaufs-/Souvenir-Wunschliste der Reise. */
export function GET() {
  return handle(async () => {
    const { tripId } = await requireTripUser();
    return ok((await listWishlist(tripId)).map(toWishlistDto));
  });
}

/** POST /api/v1/wishlist — Wunsch anlegen. */
export function POST(req: NextRequest) {
  return handle(async () => {
    const { user, tripId } = await requireTripUser();
    const body = createBody.parse(await readJson(req));
    const created = await createWishlistItem(tripId, body, user.name);
    logActivity({
      tripId,
      userId: user.id,
      userName: user.name,
      action: "wishlist.create",
      summary: created.label,
    });
    return ok(toWishlistDto(created), 201);
  });
}
