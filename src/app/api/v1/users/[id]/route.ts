import type { NextRequest } from "next/server";

import { forbidden, handle, ok, readJson } from "@/lib/api/http";
import { requireAdmin } from "@/lib/api/session";
import { userUpdateBody } from "@/lib/api/schemas";
import { toUserDto } from "@/lib/api/dto";
import { deleteUserAccount, setUserActive, wouldLeaveNoAdmin } from "@/lib/services/users";

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

/**
 * DELETE /api/v1/users/{id} — Konto endgültig löschen (nur ADMIN).
 *
 * Unwiderruflich. Wer nur den Zugang sperren will, nutzt `PATCH … {active:false}` —
 * das lässt die Daten unberührt.
 */
export function DELETE(_req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;

    // Das eigene Konto geht nur über `DELETE /api/v1/me` — dort mit
    // Passwort-Bestätigung, weil der Schritt nicht rückholbar ist.
    if (id === admin.id) {
      throw forbidden("Das eigene Konto löschst du im Profil (mit Passwort-Bestätigung).");
    }
    if (await wouldLeaveNoAdmin(id)) {
      throw forbidden("Das ist der letzte aktive Admin — sonst sperrt sich die App aus.");
    }

    const { tripDeleted } = await deleteUserAccount(id);
    return ok({ id, tripDeleted });
  });
}
