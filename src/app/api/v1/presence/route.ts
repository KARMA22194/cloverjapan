import { auth } from "@/auth";
import { handle, ok, unauthorized } from "@/lib/api/http";
import { touchPresence } from "@/lib/services/trip";

/**
 * POST /api/v1/presence — Lebenszeichen der offenen App (Heartbeat).
 * Setzt `lastSeenAt = jetzt` für den eingeloggten Nutzer, damit andere
 * Reise-Mitglieder ihn als „online" sehen. Der Client ruft das periodisch auf,
 * solange der Tab sichtbar und online ist.
 *
 * Bewusst **ohne** `requireUser()`: das wäre ein zusätzlicher SELECT pro Ping.
 * Stattdessen wandern dessen Bedingungen (aktiv, bestätigt, Session-Version) in
 * das `where` des Updates — eine einzige Query je Heartbeat.
 */
export function POST() {
  return handle(async () => {
    const session = await auth();
    if (!session?.user?.id) throw unauthorized();
    await touchPresence(session.user.id, session.user.sessionVersion);
    return ok({ ok: true });
  });
}
