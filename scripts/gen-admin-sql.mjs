// Erzeugt OFFLINE (ohne DB) eine fertige SQL-INSERT-Zeile, um EIN Admin-Konto
// direkt im Neon-Web-Editor anzulegen. Umgeht die lokale DB-Verbindung
// (Firmen-Proxy blockiert die verschlüsselte Postgres-Verbindung).
//
// Aufruf (im Container):
//   docker compose run --rm \
//     -e ADMIN_EMAIL="du@example.com" \
//     -e ADMIN_PASSWORD="dein-passwort" \
//     -e ADMIN_NAME="Dein Name" \
//     app node scripts/gen-admin-sql.mjs
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? "";
const name = (process.env.ADMIN_NAME ?? "Admin").trim();

function fail(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}
if (!email || !email.includes("@")) fail("ADMIN_EMAIL fehlt oder ist ungültig.");
if (password.length < 8) fail("ADMIN_PASSWORD muss mindestens 8 Zeichen haben.");

// Prisma-kompatible String-ID (cuid-ähnlich; beliebige eindeutige Zeichenkette genügt).
const id = "c" + randomBytes(12).toString("hex");
const hash = await bcrypt.hash(password, 10);

// Einfache Escapes für SQL-Strings (nur einfache Anführungszeichen verdoppeln).
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";

const sql =
  `INSERT INTO "User" (id, email, name, "passwordHash", role, active) ` +
  `VALUES (${q(id)}, ${q(email)}, ${q(name)}, ${q(hash)}, 'ADMIN', true) ` +
  `ON CONFLICT (email) DO UPDATE SET ` +
  `name = EXCLUDED.name, "passwordHash" = EXCLUDED."passwordHash", role = 'ADMIN', active = true;`;

console.log("\n===== SQL zum Kopieren (in Neon → SQL Editor einfügen & Run) =====\n");
console.log(sql);
console.log("\n=================================================================\n");
