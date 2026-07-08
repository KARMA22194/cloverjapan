import type { NextRequest } from "next/server";

import { conflict, handle, ok, readJson } from "@/lib/api/http";
import { requireAdmin } from "@/lib/api/session";
import { userCreateBody } from "@/lib/api/schemas";
import { toUserDto } from "@/lib/api/dto";
import { createUser, listUsers } from "@/lib/services/users";

/** GET /api/v1/users — alle Nutzer (nur ADMIN). */
export function GET() {
  return handle(async () => {
    await requireAdmin();
    const users = await listUsers();
    return ok(users.map(toUserDto));
  });
}

/** POST /api/v1/users — Nutzer anlegen (nur ADMIN). */
export function POST(req: NextRequest) {
  return handle(async () => {
    await requireAdmin();
    const body = userCreateBody.parse(await readJson(req));
    try {
      const user = await createUser(body);
      return ok(toUserDto(user), 201);
    } catch (err) {
      if (err && typeof err === "object" && (err as { code?: string }).code === "P2002") {
        throw conflict("E-Mail-Adresse bereits vergeben.");
      }
      throw err;
    }
  });
}
