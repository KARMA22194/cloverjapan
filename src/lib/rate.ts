import { db } from "@/lib/db";
import { ApiError } from "@/lib/api/http";

/**
 * Postgres-basiertes Fixed-Window-Rate-Limit (kein Redis nötig; überlebt auch den
 * serverlosen Vercel-Betrieb, da der Zähler in der DB liegt).
 *
 * **Atomar** über ein einziges `INSERT … ON CONFLICT … RETURNING` — kein
 * check-then-act mehr. Damit greift die Schranke auch bei vielen exakt gleichzeitigen
 * Requests (Brute-Force), statt dass alle mit `count = 0` durchrutschen. Spart zugleich
 * einen Roundtrip.
 *
 * @returns true, wenn der Request erlaubt ist; false, wenn das Limit erreicht ist.
 */
export async function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const resetAt = new Date(Date.now() + windowMs);
  // Fenster abgelaufen → auf 1 zurücksetzen; sonst hochzählen. Alles in einem Statement.
  const rows = await db.$queryRaw<{ count: number | bigint }[]>`
    INSERT INTO "RateLimit" ("key", "count", "resetAt")
    VALUES (${key}, 1, ${resetAt})
    ON CONFLICT ("key") DO UPDATE SET
      "count"   = CASE WHEN "RateLimit"."resetAt" <= now() THEN 1 ELSE "RateLimit"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimit"."resetAt" <= now() THEN ${resetAt} ELSE "RateLimit"."resetAt" END
    RETURNING "count";
  `;
  const count = Number(rows[0]?.count ?? 1);
  return count <= limit;
}

/**
 * Nur **prüfen**, ohne den Zähler zu erhöhen.
 *
 * Für Fälle, in denen erst der Fehlversuch zählen soll — beim Login etwa wurde der
 * E-Mail-Zähler auch bei **korrektem** Passwort verbraucht, sodass ein Angreifer
 * ein fremdes Konto mit 10 Fehlversuchen pro 15 min gezielt aussperren konnte.
 */
export async function isRateLimited(key: string, limit: number): Promise<boolean> {
  const rec = await db.rateLimit.findUnique({ where: { key } });
  if (!rec || rec.resetAt <= new Date()) return false;
  return rec.count >= limit;
}

/** Zähler nach einem Fehlversuch erhöhen (Gegenstück zu {@link isRateLimited}). */
export async function countFailure(key: string, windowMs: number): Promise<void> {
  await consumeRateLimit(key, Number.MAX_SAFE_INTEGER, windowMs);
}

/** Zähler zurücksetzen (nach erfolgreicher Anmeldung). */
export async function resetRateLimit(key: string): Promise<void> {
  await db.rateLimit.deleteMany({ where: { key } });
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

/**
 * Client-IP aus einer **vertrauenswürdigen** Quelle — NICHT aus dem frei vom Client
 * setzbaren ersten `X-Forwarded-For`-Eintrag (der ließe alle IP-Limits per Header-
 * Spoofing umgehen).
 *
 *  - **Vercel:** `x-vercel-forwarded-for` (von Vercel gesetzt, Client-XFF ignoriert).
 *  - **Self-hosted hinter Cloudflare Tunnel** (siehe SELFHOST.md): `cf-connecting-ip`
 *    — Cloudflare überschreibt einen Client-Versuch; nicht fälschbar, solange der
 *    Origin nur über den Tunnel erreichbar ist.
 *  - **Sonstiger Reverse-Proxy:** der Client kann nur die vordersten (linken) XFF-
 *    Einträge fälschen → wir nehmen den Eintrag `TRUSTED_PROXY_HOPS` von rechts.
 */
export function clientIp(req: Request): string {
  const h = req.headers;

  if (process.env.VERCEL) {
    const v = h.get("x-vercel-forwarded-for");
    if (v) return v.split(",")[0]!.trim();
  } else {
    const cf = h.get("cf-connecting-ip");
    if (cf) return cf.trim();
    const xff = h.get("x-forwarded-for");
    if (xff) {
      const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
      if (parts.length) {
        const hops = Number(process.env.TRUSTED_PROXY_HOPS ?? "0");
        const back = Number.isFinite(hops) && hops > 0 ? Math.floor(hops) : 0;
        return parts[Math.max(0, parts.length - 1 - back)]!;
      }
    }
  }

  const real = h.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
