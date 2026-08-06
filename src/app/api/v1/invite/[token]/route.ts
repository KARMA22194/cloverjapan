import type { NextRequest } from "next/server";
import { z } from "zod";

import { badRequest, conflict, handle, notFound, ok, readJson } from "@/lib/api/http";
import { clientIp, enforceRateLimit } from "@/lib/rate";
import { acceptInvitation, getValidInvitation } from "@/lib/services/trip";

type Ctx = { params: Promise<{ token: string }> };

// Bewusst OHNE requireUser: Diese Route ist öffentlich, damit sich Eingeladene
// ohne Konto selbst registrieren können (Middleware schützt /api nicht).

/** GET /api/v1/invite/{token} — Infos zur Einladung (E-Mail, Einladender). */
export function GET(_req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { token } = await ctx.params;
    const info = await getValidInvitation(token);
    if (!info) throw notFound("Einladung ungültig oder abgelaufen.");
    return ok(info);
  });
}

const acceptBody = z.object({
  name: z.string().trim().min(1, "Name ist erforderlich.").max(80),
  password: z.string().min(8, "Passwort muss mindestens 8 Zeichen haben."),
});

/** POST /api/v1/invite/{token} — Einladung einlösen: Konto anlegen + Reise beitreten. */
export function POST(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    // Öffentliche, kontoerzeugende Route → gegen Token-Erraten/Missbrauch drosseln.
    await enforceRateLimit(`invite-accept:${clientIp(req)}`, 10, 60 * 60 * 1000);
    const { token } = await ctx.params;
    const { name, password } = acceptBody.parse(await readJson(req));

    const result = await acceptInvitation(token, name, password);
    if (!result.ok) {
      if (result.reason === "exists") {
        throw conflict("Für diese E-Mail existiert bereits ein Konto. Bitte anmelden.");
      }
      throw badRequest("Einladung ungültig oder abgelaufen.");
    }
    return ok({ user: result.user }, 201);
  });
}
