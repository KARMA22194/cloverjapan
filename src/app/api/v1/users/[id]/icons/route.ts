import { handle, ok } from "@/lib/api/http";
import { requireAdmin } from "@/lib/api/session";
import { getSectionIcons } from "@/lib/services/sectionIcons";

/** GET /api/v1/users/{id}/icons — Bereichs-Symbole eines Nutzers (nur ADMIN). */
export function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAdmin();
    const { id } = await ctx.params;
    // `true`: hier ist die Abfrage der eigentliche Zweck, das Spiegel-Flag würde
    // nur einen zusätzlichen Roundtrip kosten.
    return ok(await getSectionIcons(id, true));
  });
}
