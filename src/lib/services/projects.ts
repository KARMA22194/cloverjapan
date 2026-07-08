import { db } from "@/lib/db";

/** Aktive Projekte, die ein User buchen darf.
 *  Hat der User Assignments, gelten nur diese; sonst alle aktiven Projekte. */
export async function getBookableProjects(userId: string) {
  const assignments = await db.assignment.findMany({
    where: { userId },
    select: { projectId: true },
  });

  if (assignments.length > 0) {
    return db.project.findMany({
      where: { archived: false, id: { in: assignments.map((a) => a.projectId) } },
      orderBy: { name: "asc" },
    });
  }

  return db.project.findMany({
    where: { archived: false },
    orderBy: { name: "asc" },
  });
}

export function listAllProjects() {
  return db.project.findMany({ orderBy: [{ archived: "asc" }, { name: "asc" }] });
}

export function createProject(input: { name: string; code: string; color: string }) {
  return db.project.create({ data: input });
}

export function setProjectArchived(id: string, archived: boolean) {
  return db.project.update({ where: { id }, data: { archived } });
}
