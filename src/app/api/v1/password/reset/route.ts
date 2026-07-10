import type { NextRequest } from "next/server";
import { z } from "zod";

import { badRequest, handle, ok, readJson } from "@/lib/api/http";
import { consumeToken } from "@/lib/services/tokens";
import { setUserPassword } from "@/lib/services/users";

const resetBody = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Passwort muss mindestens 8 Zeichen haben.").max(200),
});

/** POST /api/v1/password/reset — neues Passwort per gültigem Reset-Token setzen. */
export function POST(req: NextRequest) {
  return handle(async () => {
    const { token, password } = resetBody.parse(await readJson(req));

    const userId = await consumeToken(token, "PASSWORD_RESET");
    if (!userId) throw badRequest("Link ungültig, abgelaufen oder bereits verwendet.");

    await setUserPassword(userId, password);
    return ok({ ok: true });
  });
}
