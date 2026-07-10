import { db } from "@/lib/db";
import { ApiError } from "@/lib/api/http";

/**
 * Postgres-basiertes Fixed-Window-Rate-Limit (kein Redis nötig; überlebt auch den
 * serverlosen Vercel-Betrieb, da der Zähler in der DB liegt).
 *
 * Best-effort: der Increment ist nicht streng atomar (check-then-act), im Worst Case
 * rutschen bei exakt gleichzeitigen Requests ein paar zu viel durch — für
 * Missbrauchsschutz (Brute-Force, Mail-Spam) völlig ausreichend.
 *
 * @returns true, wenn der Request erlaubt ist; false, wenn das Limit erreicht ist.
 */
export async function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const now = new Date();
  const rec = await db.rateLimit.findUnique({ where: { key } });

  // Kein Eintrag oder Fenster abgelaufen → neues Fenster starten.
  if (!rec || rec.resetAt <= now) {
    const resetAt = new Date(now.getTime() + windowMs);
    await db.rateLimit.upsert({
      where: { key },
      create: { key, count: 1, resetAt },
      update: { count: 1, resetAt },
    });
    return true;
  }

  if (rec.count >= limit) return false;

  await db.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } });
  return true;
}

/** Wie {@link consumeRateLimit}, wirft aber bei Überschreitung eine 429-ApiError. */
export async function enforceRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<void> {
  const allowed = await consumeRateLimit(key, limit, windowMs);
  if (!allowed) {
    throw new ApiError(429, "Zu viele Versuche. Bitte versuche es später erneut.");
  }
}

/** Client-IP aus den (Proxy-)Headern; hinter Vercel steht sie in x-forwarded-for. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
