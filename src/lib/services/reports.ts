import { db } from "@/lib/db";
import { monthRange, yearRange, daysInMonth, toDateParam } from "@/lib/time";

export interface ProjectMeta {
  id: string;
  name: string;
  code: string;
  color: string;
}

export interface MonthReport {
  year: number;
  month: number; // 1-basiert
  projects: ProjectMeta[];
  days: number[]; // [1..n]
  /** minutes[day][projectId] */
  cell: Record<number, Record<string, number>>;
  perDay: Record<number, number>;
  perProject: Record<string, number>;
  total: number;
}

export interface YearReport {
  year: number;
  projects: ProjectMeta[];
  months: number[]; // [1..12]
  /** minutes[month][projectId] */
  cell: Record<number, Record<string, number>>;
  perMonth: Record<number, number>;
  perProject: Record<string, number>;
  total: number;
}

async function loadProjects(ids: string[]): Promise<ProjectMeta[]> {
  if (ids.length === 0) return [];
  const projects = await db.project.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, code: true, color: true },
    orderBy: { name: "asc" },
  });
  return projects;
}

/** Monatsbericht: aggregiert pro Tag × Projekt via Prisma groupBy. */
export async function getMonthReport(
  userId: string,
  year: number,
  month: number,
): Promise<MonthReport> {
  const { start, end } = monthRange(year, month);
  const rows = await db.timeEntry.groupBy({
    by: ["date", "projectId"],
    where: { userId, date: { gte: start, lt: end } },
    _sum: { minutes: true },
  });

  const days = Array.from({ length: daysInMonth(year, month) }, (_, i) => i + 1);
  const cell: Record<number, Record<string, number>> = {};
  const perDay: Record<number, number> = {};
  const perProject: Record<string, number> = {};
  let total = 0;
  const projectIds = new Set<string>();

  for (const row of rows) {
    const minutes = row._sum.minutes ?? 0;
    const day = row.date.getUTCDate();
    const pid = row.projectId;
    projectIds.add(pid);
    (cell[day] ??= {})[pid] = minutes;
    perDay[day] = (perDay[day] ?? 0) + minutes;
    perProject[pid] = (perProject[pid] ?? 0) + minutes;
    total += minutes;
  }

  const projects = await loadProjects([...projectIds]);
  return { year, month, projects, days, cell, perDay, perProject, total };
}

interface YearRow {
  month: number;
  projectId: string;
  minutes: number;
}

/** Jahresbericht: aggregiert pro Monat × Projekt via SQL date_trunc. */
export async function getYearReport(userId: string, year: number): Promise<YearReport> {
  const { start, end } = yearRange(year);
  const rows = await db.$queryRaw<YearRow[]>`
    SELECT
      EXTRACT(MONTH FROM "date")::int AS "month",
      "projectId",
      SUM("minutes")::int AS "minutes"
    FROM "TimeEntry"
    WHERE "userId" = ${userId}
      AND "date" >= ${start}
      AND "date" < ${end}
    GROUP BY 1, 2
  `;

  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const cell: Record<number, Record<string, number>> = {};
  const perMonth: Record<number, number> = {};
  const perProject: Record<string, number> = {};
  let total = 0;
  const projectIds = new Set<string>();

  for (const row of rows) {
    projectIds.add(row.projectId);
    (cell[row.month] ??= {})[row.projectId] = row.minutes;
    perMonth[row.month] = (perMonth[row.month] ?? 0) + row.minutes;
    perProject[row.projectId] = (perProject[row.projectId] ?? 0) + row.minutes;
    total += row.minutes;
  }

  const projects = await loadProjects([...projectIds]);
  return { year, projects, months, cell, perMonth, perProject, total };
}

/** Tagessumme (Minuten) eines Users – für Monatsnavigation/Badges. */
export async function getDayTotal(userId: string, dateParam: string): Promise<number> {
  const [y, m, d] = dateParam.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const res = await db.timeEntry.aggregate({
    where: { userId, date },
    _sum: { minutes: true },
  });
  return res._sum.minutes ?? 0;
}

export { toDateParam };
