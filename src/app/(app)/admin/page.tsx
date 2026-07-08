import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ProjectCreateForm, UserCreateForm } from "@/components/AdminForms";
import { ProjectArchiveButton, UserActiveButton } from "@/components/AdminToggles";
import { ProjectBadge } from "@/components/ProjectBadge";
import { listAllProjects } from "@/lib/services/projects";
import { listUsers } from "@/lib/services/users";

const roleLabel: Record<string, string> = {
  EMPLOYEE: "Employee",
  MANAGER: "Manager",
  ADMIN: "Admin",
};

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/");

  const [projects, users] = await Promise.all([listAllProjects(), listUsers()]);

  return (
    <div className="space-y-10">
      {/* ---------- Projekte ---------- */}
      <section>
        <h1 className="mb-3 text-xl font-semibold text-slate-900">Projekte</h1>
        <div className="mb-4">
          <ProjectCreateForm />
        </div>
        <div className="rounded-lg border border-slate-200 bg-white">
          {projects.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">
              Noch keine Projekte.
            </p>
          ) : (
            projects.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between border-b border-slate-100 px-4 py-3 last:border-b-0"
              >
                <div className="flex items-center gap-3">
                  <ProjectBadge name={p.name} code={p.code} color={p.color} />
                  {p.archived && (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                      archiviert
                    </span>
                  )}
                </div>
                <ProjectArchiveButton id={p.id} archived={p.archived} />
              </div>
            ))
          )}
        </div>
      </section>

      {/* ---------- Nutzer ---------- */}
      <section>
        <h1 className="mb-3 text-xl font-semibold text-slate-900">Mitarbeiter</h1>
        <div className="mb-4">
          <UserCreateForm />
        </div>
        <div className="rounded-lg border border-slate-200 bg-white">
          {users.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between border-b border-slate-100 px-4 py-3 last:border-b-0"
            >
              <div>
                <p className="text-sm font-medium text-slate-800">
                  {u.name}
                  {!u.active && (
                    <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                      inaktiv
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500">
                  {u.email} · {roleLabel[u.role]} · {u._count.timeEntries} Einträge
                </p>
              </div>
              {u.id === session.user.id ? (
                <span className="text-xs text-slate-400">du</span>
              ) : (
                <UserActiveButton id={u.id} active={u.active} />
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
