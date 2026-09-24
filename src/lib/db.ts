import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * Prisma-Client als Singleton — verhindert im Dev-Modus (HMR) zu viele Verbindungen.
 *
 * ⚠️ **Ab Prisma 7 ist ein Treiber-Adapter Pflicht.** `new PrismaClient()` ohne
 * Argumente wirft sofort („A driver adapter is required to connect to your
 * database"); die eingebaute Rust-Engine gibt es nicht mehr. Damit wandert auch
 * die Verbindungs-URL aus dem Schema hierher — im Schema steht nur noch der
 * Provider, die URL für Migrationen in `prisma.config.ts`.
 *
 * ⚠️ **`@prisma/adapter-pg`, nicht `@prisma/adapter-neon`.** Der Neon-Adapter
 * spricht WebSockets und funktioniert nicht gegen das lokale Docker-Postgres —
 * es gäbe zwei verschiedene Datenpfade für Entwicklung und Produktion, und
 * genau die Unterschiede fallen dann erst im Deploy auf. Der pg-Adapter spricht
 * beides über normales TCP; gegen Neon läuft er über die **gepoolte** URL.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL fehlt.");

  const adapter = new PrismaPg({
    connectionString,
    // ⚠️ Klein halten. Jede Serverless-Instanz baut ihren **eigenen** Pool auf;
    // mit dem pg-Default (10) hätten schon ein paar gleichzeitige Instanzen
    // Neons Verbindungsgrenze erreicht. Eine Instanz bearbeitet ohnehin eine
    // Anfrage zur Zeit, mehr als eine Verbindung bringt ihr nichts.
    max: process.env.VERCEL ? 1 : 5,
  });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
