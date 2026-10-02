import { defineConfig } from "prisma/config";

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
 *
 * ⚠️ **Bewusst `process.env` statt Prismas `env()`.** `env()` löst die Variable
 * beim **Laden** dieser Datei auf und wirft, wenn sie fehlt — und geladen wird
 * sie bei **jedem** Prisma-Befehl, auch bei `prisma generate`, das nur den
 * Client aus dem Schema erzeugt und keine Datenbank anfasst. Genau daran
 * scheiterte der Produktions-Docker-Build (`SELFHOST.md`): zur **Build**-Zeit
 * gibt es keine Laufzeit-Umgebung, `DIRECT_URL` ist dort weder vorhanden noch
 * nötig. Auf Vercel und im Dev-Container fiel das nie auf, weil die Variable
 * dort zufällig schon gesetzt ist — ein Fehler, den nur der dritte Weg zeigt.
 *
 * Fehlt die URL, wenn sie wirklich gebraucht wird (`migrate`, `db`), meldet das
 * weiterhin Prisma selbst beim Verbindungsaufbau.
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
  datasource: { url: process.env.DIRECT_URL ?? "" },
});
