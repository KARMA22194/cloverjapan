import { handle, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { touchPresence } from "@/lib/services/trip";

/**
 * POST /api/v1/presence — Lebenszeichen der offenen App (Heartbeat).
 * Setzt `lastSeenAt = jetzt` für den eingeloggten Nutzer, damit andere
 * Reise-Mitglieder ihn als „online" sehen. Der Client ruft das periodisch auf,
 * solange der Tab sichtbar und online ist.
 */
export function POST() {
  return handle(async () => {
    const user = await requireUser();
    await touchPresence(user.id);
    return ok({ ok: true });
  });
}
