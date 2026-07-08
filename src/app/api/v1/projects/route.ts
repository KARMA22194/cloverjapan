import type { NextRequest } from "next/server";
import { z } from "zod";

import { conflict, handle, ok, readJson } from "@/lib/api/http";
import { requireAdmin, requireUser } from "@/lib/api/session";
import { projectCreateBody } from "@/lib/api/schemas";
import { toProjectDto } from "@/lib/api/dto";
import {
  createProject,
  getBookableProjects,
  listAllProjects,
} from "@/lib/services/projects";

const scopeSchema = z.enum(["bookable", "all"]).default("bookable");

/**
 * GET /api/v1/projects?scope=bookable|all
 *  - bookable (Default): Projekte, die der aktuelle Nutzer buchen darf.
 *  - all: alle Projekte inkl. archivierter (nur ADMIN).
 */
export function GET(req: NextRequest) {
  return handle(async () => {
    const scope = scopeSchema.parse(req.nextUrl.searchParams.get("scope") ?? undefined);
    if (scope === "all") {
      await requireAdmin();
      const projects = await listAllProjects();
      return ok(projects.map(toProjectDto));
    }
    const user = await requireUser();
    const projects = await getBookableProjects(user.id);
    return ok(projects.map(toProjectDto));
  });
}

/** POST /api/v1/projects — Projekt anlegen (nur ADMIN). */
export function POST(req: NextRequest) {
  return handle(async () => {
    await requireAdmin();
    const body = projectCreateBody.parse(await readJson(req));
    try {
      const project = await createProject(body);
      return ok(toProjectDto(project), 201);
    } catch (err) {
      if (err && typeof err === "object" && (err as { code?: string }).code === "P2002") {
        throw conflict("Projekt-Kürzel bereits vergeben.");
      }
      throw err;
    }
  });
}
