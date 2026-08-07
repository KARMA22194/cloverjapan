import { db } from "@/lib/db";

/**
 * Serverseitige Verwaltung der WebAuthn-Challenges.
 *
 * Die Challenge liegt weiterhin im httpOnly-Cookie (so kommt sie zum
 * `verify`-Aufruf zurück), ist aber zusätzlich hier hinterlegt und wird beim
 * Einlösen **atomar entwertet**. Ohne das galt sie schlicht 300 Sekunden lang:
 * eine mitgelesene Assertion ließe sich in diesem Fenster erneut einreichen, und
 * der Signaturzähler hilft nicht — Plattform-Passkeys (Apple/Google) lassen ihn
 * auf 0, sodass `verifyAuthenticationResponse` keine Regression erkennen kann.
 */

/** Gültigkeitsdauer einer ausgestellten Challenge (wie das Cookie). */
export const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/** Ausgestellte Challenge vormerken. */
export async function storeChallenge(challenge: string): Promise<void> {
  await db.webauthnChallenge.create({
    data: { challenge, expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) },
  });
}

/**
 * Challenge einlösen: gibt nur beim **ersten** Mal `true` zurück.
 * `deleteMany` mit Ablaufprüfung ist die atomare Operation — ein zweiter
 * gleichzeitiger Versuch trifft keine Zeile mehr (`count === 0`).
 */
export async function consumeChallenge(challenge: string): Promise<boolean> {
  const res = await db.webauthnChallenge.deleteMany({
    where: { challenge, expiresAt: { gt: new Date() } },
  });
  return res.count === 1;
}

/** Abgelaufene Challenges entfernen (Aufräum-Job). */
export async function purgeExpiredChallenges(): Promise<number> {
  const res = await db.webauthnChallenge.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return res.count;
}
