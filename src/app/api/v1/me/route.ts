import type { NextRequest } from "next/server";
import { z } from "zod";

import { handle, ok, readJson } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { getUserImage, setUserImage } from "@/lib/services/users";

/** GET /api/v1/me — aktueller Nutzer (id, name, email, role, image). */
export function GET() {
  return handle(async () => {
    const { id, name, email, role } = await requireUser();
    const image = await getUserImage(id);
    return ok({ id, name, email, role, image });
  });
}

const patchBody = z.object({
  image: z
    .string()
    .startsWith("data:image/", "Nur Bild-Data-URLs erlaubt.")
    // 60 KB genügen mit Reserve für das 128×128-JPEG (q0.85), das der Client
    // erzeugt — real sind es 5–15 KB. Das Feld wird bei **jedem** SSR-Request
    // mitgelesen (TopNav-Avatar), deshalb bleibt es bewusst in der User-Zeile;
    // ein weites Limit hätte hier direkt die Antwortgröße jeder Seite aufgebläht.
    .max(60_000, "Bild zu groß.")
    // SVG kann eingebettetes Script enthalten (XSS beim Anzeigen) → nur Rasterformate.
    .refine((s) => !/^data:image\/svg\+xml/i.test(s), "SVG-Bilder sind nicht erlaubt.")
    .nullable(),
});

/** PATCH /api/v1/me — eigenes Profilbild setzen/entfernen (null = entfernen). */
export function PATCH(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const { image } = patchBody.parse(await readJson(req));
    await setUserImage(user.id, image);
    return ok({ image });
  });
}
