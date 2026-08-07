import { handle, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { getSectionIcons } from "@/lib/services/sectionIcons";

/**
 * GET /api/v1/me/icons — eigene Bereichs-Symbole (Bereich → Data-URL).
 *
 * Nur die selbst hinterlegten; alles Übrige rendert der Client aus
 * `SECTION_ICONS` (Standard-Emoji).
 */
export function GET() {
  return handle(async () => {
    const user = await requireUser();
    // `requireUser` liest die User-Zeile ohnehin frisch — `customIcons` ist dort
    // aber nicht enthalten, deshalb hier bewusst `true`: der Endpunkt wird nur von
    // der Profil-Seite aufgerufen, wo die Abfrage sowieso nötig ist.
    return ok(await getSectionIcons(user.id, true));
  });
}
