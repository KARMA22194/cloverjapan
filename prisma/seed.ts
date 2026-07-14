import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Schutz: Der Seed legt Demo-Konten mit öffentlich dokumentiertem Passwort an.
  // In Produktion darf das nur mit explizitem Opt-in laufen (ALLOW_PROD_SEED=true).
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PROD_SEED !== "true") {
    throw new Error(
      "Seed in Produktion blockiert (Demo-Konten mit Trivial-Passwort). " +
        "Zum Erzwingen ALLOW_PROD_SEED=true setzen.",
    );
  }

  const passwordHash = await bcrypt.hash("password123", 10);

  // Demo-Konten (gelten als bestätigt → Login nicht durch E-Mail-Gate gesperrt).
  const usersData = [
    { email: "admin@clover.japan", name: "Admin", role: Role.ADMIN },
    { email: "manager@clover.japan", name: "Maria Manager", role: Role.MANAGER },
    { email: "employee@clover.japan", name: "Erik Employee", role: Role.EMPLOYEE },
    { email: "anna@clover.japan", name: "Anna Weber", role: Role.EMPLOYEE },
    { email: "ben@clover.japan", name: "Ben Fischer", role: Role.EMPLOYEE },
    { email: "clara@clover.japan", name: "Clara Schmidt", role: Role.EMPLOYEE },
  ];

  for (const u of usersData) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, emailVerified: new Date() },
      create: { email: u.email, name: u.name, passwordHash, role: u.role, emailVerified: new Date() },
    });
  }

  console.log("Seed abgeschlossen (Nutzer):");
  for (const u of usersData) {
    console.log(`  ${u.role.padEnd(8)} ${u.email.padEnd(22)} / password123`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
