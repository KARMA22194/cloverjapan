import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Deterministischer PRNG (mulberry32) → reproduzierbarer Seed über alle Läufe.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260101);

// Datum ohne Uhrzeit (UTC-Mitternacht) – passend zu @db.Date.
function dateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// n eindeutige Elemente deterministisch ziehen (Fisher-Yates mit rng).
function pickN<T>(arr: T[], n: number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

const NOTES = [
  "Feature-Entwicklung",
  "Code-Review",
  "Team-Meeting",
  "Bugfix",
  "Support-Ticket",
  "Sprint-Planung",
  "Dokumentation",
  "Refactoring",
  "Abstimmung mit Kunde",
  "Konzeption",
];

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  // --- Projekte ---
  const projectsData = [
    { name: "Website Relaunch", code: "WEB", color: "#3b82f6" },
    { name: "Interne Tools", code: "TOOLS", color: "#10b981" },
    { name: "Kundensupport", code: "SUPPORT", color: "#f59e0b" },
    { name: "Mobile App", code: "MOBILE", color: "#8b5cf6" },
    { name: "Design System", code: "DESIGN", color: "#ec4899" },
  ];

  const projectByCode = new Map<string, { id: string }>();
  for (const p of projectsData) {
    const project = await prisma.project.upsert({
      where: { code: p.code },
      update: { name: p.name, color: p.color, archived: false },
      create: p,
    });
    projectByCode.set(p.code, project);
  }

  // --- Nutzer ---
  // Admin bucht nicht (verwaltet nur). Alle übrigen buchen auf ihre Projekte.
  const usersData = [
    { email: "admin@clover.japan", name: "Admin", role: Role.ADMIN, projects: [] as string[] },
    {
      email: "manager@clover.japan",
      name: "Maria Manager",
      role: Role.MANAGER,
      projects: ["WEB", "MOBILE", "DESIGN"],
    },
    {
      email: "employee@clover.japan",
      name: "Erik Employee",
      role: Role.EMPLOYEE,
      projects: ["WEB", "TOOLS", "SUPPORT"],
    },
    {
      email: "anna@clover.japan",
      name: "Anna Weber",
      role: Role.EMPLOYEE,
      projects: ["WEB", "MOBILE"],
    },
    {
      email: "ben@clover.japan",
      name: "Ben Fischer",
      role: Role.EMPLOYEE,
      projects: ["SUPPORT", "TOOLS"],
    },
    {
      email: "clara@clover.japan",
      name: "Clara Schmidt",
      role: Role.EMPLOYEE,
      projects: ["DESIGN", "MOBILE", "WEB"],
    },
  ];

  const bookers: { id: string; projectIds: string[] }[] = [];
  for (const u of usersData) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, emailVerified: new Date() },
      // Demo-Konten gelten als bestätigt (sonst Login durch E-Mail-Gate gesperrt).
      create: { email: u.email, name: u.name, passwordHash, role: u.role, emailVerified: new Date() },
    });

    // Assignments (steuern buchbare Projekte).
    const projectIds = u.projects.map((code) => projectByCode.get(code)!.id);
    for (const projectId of projectIds) {
      await prisma.assignment.upsert({
        where: { userId_projectId: { userId: user.id, projectId } },
        update: {},
        create: { userId: user.id, projectId },
      });
    }

    if (projectIds.length > 0) {
      bookers.push({ id: user.id, projectIds });
    }
  }

  // --- Beispiel-Zeiteinträge: laufendes Jahr bis heute, nur Werktage ---
  const bookerIds = bookers.map((b) => b.id);
  await prisma.timeEntry.deleteMany({ where: { userId: { in: bookerIds } } });

  const now = new Date();
  const year = now.getUTCFullYear();
  const start = new Date(Date.UTC(year, 0, 1));
  const today = dateOnly(now);

  const entries: {
    userId: string;
    projectId: string;
    date: Date;
    minutes: number;
    note: string;
  }[] = [];

  // Reihenfolge fix (Nutzer außen, Tage innen) → deterministisch.
  for (const booker of bookers) {
    for (let d = new Date(start); d <= today; d.setUTCDate(d.getUTCDate() + 1)) {
      const weekday = d.getUTCDay();
      if (weekday === 0 || weekday === 6) continue; // Wochenende
      if (rng() < 0.12) continue; // ~12 % frei (Urlaub/krank)

      const date = dateOnly(d);
      const total = (6 + Math.floor(rng() * 6)) * 60 - (rng() < 0.5 ? 30 : 0); // ~5,5–8,5 h
      const maxSplit = Math.min(3, booker.projectIds.length);
      const n = 1 + Math.floor(rng() * maxSplit);
      const chosen = pickN(booker.projectIds, n);

      // total gleichmäßig auf n Projekte verteilen (Vielfache von 30 min).
      const base = Math.floor(total / n / 30) * 30;
      chosen.forEach((projectId, i) => {
        const minutes = i === 0 ? total - base * (n - 1) : base;
        if (minutes <= 0) return;
        entries.push({
          userId: booker.id,
          projectId,
          date,
          minutes,
          note: NOTES[Math.floor(rng() * NOTES.length)],
        });
      });
    }
  }

  // In Batches einfügen (schonender bei vielen Zeilen).
  for (let i = 0; i < entries.length; i += 500) {
    await prisma.timeEntry.createMany({ data: entries.slice(i, i + 500) });
  }

  // Kurze Zusammenfassung.
  const perUser = new Map<string, number>();
  for (const e of entries) perUser.set(e.userId, (perUser.get(e.userId) ?? 0) + 1);

  console.log("Seed abgeschlossen:");
  for (const u of usersData) {
    const user = await prisma.user.findUnique({ where: { email: u.email } });
    const count = user ? (perUser.get(user.id) ?? 0) : 0;
    console.log(`  ${u.role.padEnd(8)} ${u.email.padEnd(22)} / password123  (${count} Einträge)`);
  }
  console.log(`  Projekte: ${projectsData.map((p) => p.code).join(", ")}`);
  console.log(`  Zeitraum: ${start.toISOString().slice(0, 10)} – ${today.toISOString().slice(0, 10)} (nur Werktage)`);
  console.log(`  Gesamt Zeiteinträge: ${entries.length}`);
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
