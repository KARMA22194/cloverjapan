import type { NextRequest } from "next/server";

import { handle, ok, readJson } from "@/lib/api/http";
import { requireAdmin } from "@/lib/api/session";
import { projectUpdateBody } from "@/lib/api/schemas";
import { toProjectDto } from "@/lib/api/dto";
import { setProjectArchived } from "@/lib/services/projects";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/v1/projects/{id} — Projekt archivieren/reaktivieren (nur ADMIN). */
export function PATCH(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    await requireAdmin();
    const { id } = await ctx.params;
    const { archived } = projectUpdateBody.parse(await readJson(req));
    // P2025 (nicht gefunden) wird von handle() → 404 gemappt.
    const project = await setProjectArchived(id, archived);
    return ok(toProjectDto(project));
  });
}
