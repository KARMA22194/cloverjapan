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

let cached: PrismaClient | undefined;

function client(): PrismaClient {
  cached ??= globalForPrisma.prisma ?? createClient();
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = cached;
  return cached;
}

/**
 * Der Client — aber **erst beim ersten Zugriff** erzeugt.
 *
 * ⚠️ Vorher stand hier `export const db = … createClient()`, also eine
 * Verbindung, die schon beim **Import** des Moduls entstand. Next.js importiert
 * beim Build jedes Route-Modul („Collecting page data"), um dessen Exporte zu
 * lesen — und damit lief `createClient()` zur **Build**-Zeit. Dort gibt es keine
 * Laufzeit-Umgebung, also brach der Produktions-Docker-Build ab:
 *
 *     Failed to collect configuration for /api/v1/cron/cleanup
 *     [cause]: Error: DATABASE_URL fehlt.
 *
 * Auf Vercel fiel das nie auf, weil `DATABASE_URL` dort auch beim Build gesetzt
 * ist. Ein Modulimport darf aber grundsätzlich keine Datenbankverbindung
 * aufbauen: Was passiert, soll davon abhängen, was aufgerufen wird, nicht davon,
 * was zufällig importiert wurde.
 *
 * ⚠️ Der Proxy ist Absicht und kein Selbstzweck — er hält die Aufrufform
 * `db.user.findMany()` an **allen** Stellen unverändert. Ein `getDb()` hätte
 * dieselbe Wirkung gehabt, aber jede einzelne Fundstelle angefasst und damit
 * eine echte Änderung hinter hundert kosmetischen versteckt.
 *
 * ⚠️ Methoden werden an den echten Client **gebunden**. Ohne das bekäme etwa
 * `db.$transaction(…)` den Proxy als `this` — und Prismas Interna arbeiten mit
 * privaten Feldern, die es dort nicht gibt.
 */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const c = client();
    const value = Reflect.get(c, prop, c);
    return typeof value === "function" ? value.bind(c) : value;
  },
  has(_target, prop) {
    return Reflect.has(client(), prop);
  },
});
