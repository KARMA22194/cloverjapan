import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { Checkliste } from "@/components/Checkliste";

export const metadata: Metadata = { title: "Checkliste – Time Tracker" };

export default async function ChecklistePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div>
      <h1 className="mb-1 text-xl text-slate-900 dark:text-slate-100">Checkliste</h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Eigene Punkte hinzufügen und abhaken.
      </p>
      <Checkliste />
    </div>
  );
}
