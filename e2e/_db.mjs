// Gemeinsamer Prisma-Client für die Testskripte.
//
// ⚠️ Ab Prisma 7 ist ein Treiber-Adapter Pflicht — `new PrismaClient()` ohne
// Argumente wirft sofort. Statt die drei Zeilen in fünfzehn Skripte zu kopieren
// (und beim nächsten Prisma-Sprung fünfzehnmal zu ändern), stehen sie hier.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

export function testDb() {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 3 }),
  });
}
