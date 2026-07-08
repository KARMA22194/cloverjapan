import type { NextRequest } from "next/server";

import { forbidden, handle, ok, readJson } from "@/lib/api/http";
import { requireAdmin } from "@/lib/api/session";
import { userUpdateBody } from "@/lib/api/schemas";
import { toUserDto } from "@/lib/api/dto";
import { setUserActive } from "@/lib/services/users";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/v1/users/{id} — Nutzer aktivieren/deaktivieren (nur ADMIN). */
export function PATCH(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const { active } = userUpdateBody.parse(await readJson(req));

    // Sich selbst kann ein Admin nicht deaktivieren (sperrt sich sonst aus).
    if (id === admin.id) {
      throw forbidden("Das eigene Konto kann nicht geändert werden.");
    }

    // P2025 (nicht gefunden) wird von handle() → 404 gemappt.
    const user = await setUserActive(id, active);
    return ok(toUserDto(user));
  });
}
