import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ExpenseCalculator } from "@/components/ExpenseCalculator";

export const metadata: Metadata = {
  title: "Ausgaben (Yen→Euro) – Time Tracker",
};

export default async function AusgabenPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div>
      <h1 className="mb-1 text-xl text-slate-900 dark:text-slate-100">Ausgaben · Japan</h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Beträge in Yen erfassen, live nach Euro umrechnen und nach Kategorien aufteilen.
      </p>
      <ExpenseCalculator />
    </div>
  );
}
