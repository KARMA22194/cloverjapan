import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ReiseUebersicht } from "@/components/ReiseUebersicht";

export const metadata: Metadata = { title: "Reiseübersicht – Clover Japan" };

export default async function UebersichtPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div>
      <h1 className="mb-4 text-xl text-slate-900 dark:text-slate-100">Reiseübersicht · Japan</h1>
      <ReiseUebersicht />
    </div>
  );
}
