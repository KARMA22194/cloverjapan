import { handle, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";

/** GET /api/v1/me — aktueller Nutzer (id, name, email, role) aus der Session. */
export function GET() {
  return handle(async () => {
    const { id, name, email, role } = await requireUser();
    return ok({ id, name, email, role });
  });
}
