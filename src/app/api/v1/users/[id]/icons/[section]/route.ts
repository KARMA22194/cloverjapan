import type { NextRequest } from "next/server";
import { z } from "zod";

import { badRequest, handle, notFound, ok, readJson } from "@/lib/api/http";
import { requireAdmin } from "@/lib/api/session";
import { db } from "@/lib/db";
import { deleteSectionIcon, setSectionIcon } from "@/lib/services/sectionIcons";
import { ICON_MAX_BYTES, isSectionId } from "@/lib/sectionIcons";

type Ctx = { params: Promise<{ id: string; section: string }> };

const putBody = z.object({
  data: z
    .string()
    .startsWith("data:image/", "Nur Bild-Data-URLs erlaubt.")
    .max(ICON_MAX_BYTES, "Bild zu groß.")
    .refine((s) => !/^data:image\/svg\+xml/i.test(s), "SVG-Bilder sind nicht erlaubt."),
});

/**
 * Ziel-Nutzer und Bereich prüfen.
 *
 * Die Existenzprüfung ist nötig, weil `setSectionIcon` sonst am Fremdschlüssel
 * scheitern würde (P2003 → 500 statt einer verständlichen 404).
 */
async function resolve(ctx: Ctx) {
  const { id, section } = await ctx.params;
  if (!isSectionId(section)) throw badRequest("Unbekannter Bereich.");
  const exists = await db.user.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw notFound("Nutzer nicht gefunden.");
  return { id, section };
}

/** PUT /api/v1/users/{id}/icons/{section} — Symbol für einen Nutzer setzen (nur ADMIN). */
export function PUT(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    await requireAdmin();
    const { id, section } = await resolve(ctx);
    const { data } = putBody.parse(await readJson(req));
    await setSectionIcon(id, section, data);
    return ok({ section, data });
  });
}

/** DELETE /api/v1/users/{id}/icons/{section} — zurück auf das Standard-Emoji. */
export function DELETE(_req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    await requireAdmin();
    const { id, section } = await resolve(ctx);
    await deleteSectionIcon(id, section);
    return ok({ section, data: null });
  });
}
