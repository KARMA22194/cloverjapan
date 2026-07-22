import type { NextRequest } from "next/server";
import { z } from "zod";

import { handle, ok, readJson } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { deletePushSubscription, savePushSubscription } from "@/lib/services/push";

const subSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) }),
});

/** POST /api/v1/push — Web-Push-Abo dieses Geräts speichern. */
export function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const sub = subSchema.parse(await readJson(req));
    await savePushSubscription(user.id, sub);
    return ok({ ok: true });
  });
}

/** DELETE /api/v1/push?endpoint=… — Abo dieses Geräts entfernen. */
export function DELETE(req: NextRequest) {
  return handle(async () => {
    await requireUser();
    const endpoint = (req.nextUrl.searchParams.get("endpoint") ?? "").slice(0, 1000);
    if (endpoint) await deletePushSubscription(endpoint);
    return ok({ ok: true });
  });
}
