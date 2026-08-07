import type { NextRequest } from "next/server";
import { z } from "zod";

import { badRequest, handle, ok, readJson } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { deleteSectionIcon, setSectionIcon } from "@/lib/services/sectionIcons";
import { ICON_MAX_BYTES, isSectionId } from "@/lib/sectionIcons";

const putBody = z.object({
  data: z
    .string()
    .startsWith("data:image/", "Nur Bild-Data-URLs erlaubt.")
    .max(ICON_MAX_BYTES, "Bild zu groß.")
    // SVG kann Script enthalten (XSS beim Anzeigen) → nur Rasterformate, wie beim
    // Profilbild in `PATCH /api/v1/me`.
    .refine((s) => !/^data:image\/svg\+xml/i.test(s), "SVG-Bilder sind nicht erlaubt."),
});

/** Bereichs-Schlüssel gegen die Liste im Code prüfen (kein Prisma-Enum, s. Schema). */
function section(raw: string) {
  if (!isSectionId(raw)) throw badRequest("Unbekannter Bereich.");
  return raw;
}

/** PUT /api/v1/me/icons/[section] — eigenes Symbol für diesen Bereich setzen. */
export function PUT(req: NextRequest, ctx: { params: Promise<{ section: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const key = section((await ctx.params).section);
    const { data } = putBody.parse(await readJson(req));
    await setSectionIcon(user.id, key, data);
    return ok({ section: key, data });
  });
}

/** DELETE /api/v1/me/icons/[section] — zurück auf das Standard-Emoji. */
export function DELETE(_req: NextRequest, ctx: { params: Promise<{ section: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const key = section((await ctx.params).section);
    await deleteSectionIcon(user.id, key);
    return ok({ section: key, data: null });
  });
}
