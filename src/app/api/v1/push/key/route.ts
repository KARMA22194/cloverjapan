import { handle, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";

/**
 * GET /api/v1/push/key — VAPID-Public-Key für das Abo im Browser.
 * `key: null`, wenn Web-Push serverseitig nicht konfiguriert ist (Feature aus).
 */
export function GET() {
  return handle(async () => {
    await requireUser();
    return ok({ key: process.env.VAPID_PUBLIC_KEY || null });
  });
}
