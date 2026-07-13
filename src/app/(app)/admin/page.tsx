import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { UserCreateForm } from "@/components/AdminForms";
import { UserActiveButton } from "@/components/AdminToggles";
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

  const users = await listUsers();

  return (
    <div className="space-y-6">
      <section>
        <h1 className="mb-3 text-xl font-semibold text-slate-900 dark:text-slate-100">Nutzer</h1>
        <div className="mb-4">
          <UserCreateForm />
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          {users.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-4 py-3 last:border-b-0"
            >
              <div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  {u.name}
                  {!u.active && (
                    <span className="ml-2 rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs text-slate-500 dark:text-slate-400">
                      inaktiv
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {u.email} · {roleLabel[u.role]}
                </p>
              </div>
              {u.id === session.user.id ? (
                <span className="text-xs text-slate-400 dark:text-slate-500">du</span>
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
