import type { NextRequest } from "next/server";
import { z } from "zod";

import { conflict, handle, ok, readJson } from "@/lib/api/http";
import { registerSelf } from "@/lib/services/trip";

// Bewusst OHNE requireUser: offene Selbst-Registrierung (Middleware schützt /api nicht).
const registerBody = z.object({
  name: z.string().trim().min(2, "Name muss mindestens 2 Zeichen haben.").max(80),
  email: z.string().email("Ungültige E-Mail."),
  password: z.string().min(8, "Passwort muss mindestens 8 Zeichen haben.").max(200),
});

/** POST /api/v1/register — neues Konto ohne Einladung anlegen (eigene Solo-Reise). */
export function POST(req: NextRequest) {
  return handle(async () => {
    const { name, email, password } = registerBody.parse(await readJson(req));

    const result = await registerSelf(name, email, password);
    if (!result.ok) {
      throw conflict("Für diese E-Mail existiert bereits ein Konto. Bitte anmelden.");
    }
    return ok({ user: result.user }, 201);
  });
}
