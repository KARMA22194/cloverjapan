import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

/**
 * Führt `fn` in einer **serialisierbaren** Transaktion aus und wiederholt sie bei
 * einem Serialisierungskonflikt.
 *
 * Hintergrund: „nächste Position = MAX(position) + 1" ist unter Postgres'
 * Standard-Isolation (READ COMMITTED) **kein** atomarer Vorgang — gleichzeitige
 * Transaktionen lesen alle denselben Ausgangswert und vergeben dieselbe Position.
 * Eine gewöhnliche `$transaction` ändert daran nichts; erst `Serializable` lässt
 * Postgres den Konflikt erkennen und eine der Transaktionen abbrechen (P2034),
 * die dann hier erneut läuft.
 *
 * Nur für die wenigen Stellen gedacht, die eine fortlaufende Position vergeben —
 * nicht als allgemeiner Transaktions-Wrapper.
 */
export async function withPositionLock<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  retries = 3,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await db.$transaction(fn, { isolationLevel: "Serializable" });
    } catch (err) {
      // P2034 = write conflict / deadlock; 40001 = serialization_failure.
      const code = (err as { code?: string })?.code;
      if (code !== "P2034" && code !== "40001") throw err;
      lastError = err;
    }
  }
  throw lastError;
}
