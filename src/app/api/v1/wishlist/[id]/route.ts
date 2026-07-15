import type { NextRequest } from "next/server";

import { handle, notFound, ok, readJson } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { getActiveTripId } from "@/lib/services/trip";
import { deleteWishlistItemOwned, updateWishlistItemOwned } from "@/lib/services/wishlist";
import { patchBody, toWishlistDto } from "../schema";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/v1/wishlist/{id} — Wunsch ändern (Text/Preis/gekauft). */
export function PATCH(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const tripId = await getActiveTripId(user.id);
    const { id } = await ctx.params;
    const body = patchBody.parse(await readJson(req));
    const item = await updateWishlistItemOwned(id, tripId, body);
    if (!item) throw notFound("Wunsch nicht gefunden.");
    return ok(toWishlistDto(item));
  });
}

/** DELETE /api/v1/wishlist/{id} — Wunsch löschen. */
export function DELETE(_req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const tripId = await getActiveTripId(user.id);
    const { id } = await ctx.params;
    const count = await deleteWishlistItemOwned(id, tripId);
    if (count === 0) throw notFound("Wunsch nicht gefunden.");
    return ok({ id, deleted: true });
  });
}
