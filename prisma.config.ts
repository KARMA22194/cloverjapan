import { defineConfig, env } from "prisma/config";

/**
 * Prisma-Konfiguration (ab Prisma 7 Pflicht für alles, was früher als
 * `datasource`-Block im Schema stand).
 *
 * ⚠️ Die URL hier ist die **direkte** Verbindung (`DIRECT_URL`), nicht die
 * gepoolte. Sie gilt für `migrate`/`db`-Befehle, und die vertragen keinen
 * Pooler: Neons PgBouncer kann die Sitzungs-Sperren nicht halten, die eine
 * Migration braucht. Die **Laufzeit** der App benutzt weiterhin `DATABASE_URL`
 * (bei Neon die gepoolte URL) — die liest der Client selbst aus der Umgebung.
 *
 * Lokal sind beide identisch (Docker-Postgres, kein Pooler); auf Vercel setzt
 * sie die Projekt-Umgebung. Ein `dotenv`-Import ist nicht nötig, weil beide
 * Wege die Variablen schon in `process.env` haben (Compose `env_file` bzw.
 * Vercels Build-Umgebung).
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // ⚠️ Prisma 7 liest den Seed-Befehl **hier**, nicht mehr aus dem
    // `prisma.seed`-Feld der package.json. Der alte Eintrag wurde stillschweigend
    // ignoriert: `prisma db seed` meldete „No seed command configured", und weil
    // seit der Umstellung niemand neu aufsetzen musste, fiel das erst beim
    // Wechsel auf Postgres 18 auf.
    seed: "tsx prisma/seed.ts",
  },
  datasource: { url: env("DIRECT_URL") },
});
