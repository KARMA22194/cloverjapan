import { randomBytes } from "node:crypto";
import type { TokenType } from "@prisma/client";

import { db } from "@/lib/db";

/**
 * Einmal-Token für E-Mail-Bestätigung / Passwort-Reset.
 * 256-Bit-Entropie (randomBytes(32)); ältere offene Token desselben Typs für den
 * Nutzer werden verworfen, sodass stets nur ein gültiger Link existiert.
 */
export async function createToken(
  userId: string,
  type: TokenType,
  ttlMs: number,
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlMs);
  await db.$transaction([
    db.token.deleteMany({ where: { userId, type, usedAt: null } }),
    db.token.create({ data: { userId, type, token, expiresAt } }),
  ]);
  return token;
}

/**
 * Löst ein Token ein: prüft Typ/Ablauf/Verbrauch und entwertet es atomar.
 * @returns userId bei Erfolg, sonst null (ungültig/abgelaufen/bereits benutzt).
 */
export async function consumeToken(token: string, type: TokenType): Promise<string | null> {
  const rec = await db.token.findUnique({ where: { token } });
  if (!rec || rec.type !== type || rec.usedAt || rec.expiresAt < new Date()) return null;

  // Konditional entwerten (nur solange usedAt null) → schützt vor Doppel-Einlösung.
  const consumed = await db.token.updateMany({
    where: { id: rec.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (consumed.count === 0) return null;
  return rec.userId;
}
