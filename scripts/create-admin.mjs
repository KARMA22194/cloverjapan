// Legt EIN Admin-Konto an (oder aktualisiert dessen Passwort/Namen).
// Für die erste Anmeldung auf einer frischen Datenbank — ohne Demo-Seed.
//
// Aufruf (im Container), Werte über Env übergeben:
//   docker compose run --rm \
//     -e DATABASE_URL="<Neon-Pooled>" -e DIRECT_URL="<Neon-Direct>" \
//     -e ADMIN_EMAIL="du@example.com" \
//     -e ADMIN_PASSWORD="dein-passwort" \
//     -e ADMIN_NAME="Dein Name" \
//     app node scripts/create-admin.mjs
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? "";
const name = (process.env.ADMIN_NAME ?? "Admin").trim();

function fail(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

if (!email || !email.includes("@")) fail("ADMIN_EMAIL fehlt oder ist ungültig.");
if (password.length < 8) fail("ADMIN_PASSWORD muss mindestens 8 Zeichen haben.");

const prisma = new PrismaClient();

try {
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, name, role: Role.ADMIN, active: true, emailVerified: new Date() },
    create: { email, name, passwordHash, role: Role.ADMIN, active: true, emailVerified: new Date() },
  });
  console.log(`\n✅ Admin-Konto bereit: ${user.name} <${user.email}> (Rolle ADMIN).`);
  console.log("   Login jetzt unter deiner Vercel-URL möglich.\n");
} catch (err) {
  fail(`Anlegen fehlgeschlagen: ${err.message}`);
} finally {
  await prisma.$disconnect();
}
