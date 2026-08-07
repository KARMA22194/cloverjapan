import type { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { forbidden, handle, ok, readJson } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { db } from "@/lib/db";
import {
  deleteUserAccount,
  getUserImage,
  setUserImage,
  wouldLeaveNoAdmin,
} from "@/lib/services/users";

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

const deleteBody = z.object({
  password: z.string().min(1, "Passwort fehlt."),
});

/**
 * DELETE /api/v1/me — eigenes Konto endgültig löschen.
 *
 * Verlangt das **Passwort** im Body: der Schritt ist nicht rückholbar, und ohne
 * erneute Bestätigung genügte ein einziger untergeschobener Request (XSS, offener
 * Fremd-Tab), um ein Konto samt Reisedaten zu vernichten. Ein Cookie allein ist
 * dafür zu wenig — dasselbe Muster wie bei „sensiblen Aktionen" nach dem Login.
 */
export function DELETE(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const { password } = deleteBody.parse(await readJson(req));

    const row = await db.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    if (!row || !(await bcrypt.compare(password, row.passwordHash))) {
      throw forbidden("Passwort stimmt nicht.");
    }
    // Auch beim Selbst-Löschen: die Installation darf nicht ohne Admin dastehen.
    if (await wouldLeaveNoAdmin(user.id)) {
      throw forbidden(
        "Du bist der letzte aktive Admin. Ernenne zuerst jemand anderen, sonst ist die Nutzerverwaltung für niemanden mehr erreichbar.",
      );
    }

    const { tripDeleted } = await deleteUserAccount(user.id);
    return ok({ deleted: true, tripDeleted });
  });
}
