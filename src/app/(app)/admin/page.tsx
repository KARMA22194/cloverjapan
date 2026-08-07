import { redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth-session";
import { UserCreateForm } from "@/components/AdminForms";
import { UserActiveButton, UserDeleteButton } from "@/components/AdminToggles";
import { SectionIconSettings } from "@/components/SectionIconSettings";
import { Chip } from "@/components/ui/Chip";
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
            <div key={u.id} className="border-b border-hairline px-4 py-3 last:border-b-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink">
                    {u.name}
                    {!u.active && (
                      <Chip tone="neutral" className="ml-2">
                        inaktiv
                      </Chip>
                    )}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {u.email} · {roleLabel[u.role]}
                  </p>
                </div>
                {u.id === me.id ? (
                  <span className="text-xs text-ink-subtle">du</span>
                ) : (
                  <div className="flex flex-wrap items-start gap-2">
                    <UserActiveButton id={u.id} active={u.active} />
                    {/* Löschen ist unwiderruflich → eigene Bestätigung im Knopf. */}
                    <UserDeleteButton id={u.id} email={u.email} />
                  </div>
                )}
              </div>

              {/* Symbole erst beim Aufklappen laden — 24 Zeilen × N Nutzer wären
                  sonst bei jedem Aufruf der Admin-Seite im Bundle und im DOM. */}
              <details className="mt-2 group/icons">
                <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-brand transition hover:opacity-70">
                  <span
                    aria-hidden
                    className="transition-transform duration-200 group-open/icons:rotate-90"
                  >
                    ▸
                  </span>
                  Bereichs-Symbole
                </summary>
                <SectionIconSettings userId={u.id} />
              </details>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
