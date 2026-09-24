import type { NextRequest } from "next/server";

import { forbidden, handle, ok, readJson } from "@/lib/api/http";
import { requireAdmin } from "@/lib/api/session";
import { userUpdateBody } from "@/lib/api/schemas";
import { toUserDto } from "@/lib/api/dto";
import {
  deleteUserAccount,
  getUserById,
  setUserActive,
  setUserPermissions,
  wouldLeaveNoAdmin,
} from "@/lib/services/users";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/v1/users/{id} — Konto aktivieren/deaktivieren **und** Rechte
 * vergeben (nur ADMIN).
 *
 * Die Rechte (`canAiScan`, `canReceiptPhoto`) sind bewusst **keine** Rolle: sie
 * stehen quer zur Rangfolge USER/ADMIN. Ein USER darf womöglich scannen, ein
 * ADMIN soll es vielleicht gerade nicht — als Rollen ausgedrückt bräuchte jede
 * Kombination eine eigene.
 */
export function PATCH(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const body = userUpdateBody.parse(await readJson(req));

    // Sich selbst deaktivieren sperrt aus — die eigenen **Rechte** darf ein
    // Admin dagegen umlegen (etwa das Scan-Recht abgeben, um Kosten zu sparen);
    // rückgängig machen kann er es selbst.
    if (id === admin.id && body.active !== undefined) {
      throw forbidden("Das eigene Konto kann nicht deaktiviert werden.");
    }

    // P2025 (nicht gefunden) wird von handle() → 404 gemappt.
    if (body.canAiScan !== undefined || body.canReceiptPhoto !== undefined) {
      await setUserPermissions(id, {
        canAiScan: body.canAiScan,
        canReceiptPhoto: body.canReceiptPhoto,
      });
    }
    // Zuletzt, damit die Antwort in jedem Fall den Endstand trägt.
    const user =
      body.active !== undefined
        ? await setUserActive(id, body.active)
        : await getUserById(id);
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
