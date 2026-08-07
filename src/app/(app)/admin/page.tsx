import { redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth-session";
import { UserCreateForm } from "@/components/AdminForms";
import { UserActiveButton } from "@/components/AdminToggles";
import { listUsers } from "@/lib/services/users";

const roleLabel: Record<string, string> = {
  EMPLOYEE: "Employee",
  MANAGER: "Manager",
  ADMIN: "Admin",
};

export default async function AdminPage() {
  // Frische DB-Rolle: ein soeben degradierter Ex-Admin verliert /admin sofort.
  const me = await requireSessionUser();
  if (me.role !== "ADMIN") redirect("/");

  const users = await listUsers();

  return (
    <div className="space-y-6">
      <section>
        <h1 className="mb-3 text-xl font-semibold text-ink">Nutzer</h1>
        <div className="mb-4">
          <UserCreateForm />
        </div>
        <div className="rounded-card border border-hairline bg-surface shadow-card">
          {users.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between border-b border-hairline px-4 py-3 last:border-b-0"
            >
              <div>
                <p className="text-sm font-medium text-ink">
                  {u.name}
                  {!u.active && (
                    <span className="ml-2 rounded bg-surface-2 px-2 py-0.5 text-xs text-ink-muted">
                      inaktiv
                    </span>
                  )}
                </p>
                <p className="text-xs text-ink-muted">
                  {u.email} · {roleLabel[u.role]}
                </p>
              </div>
              {u.id === me.id ? (
                <span className="text-xs text-ink-subtle">du</span>
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
