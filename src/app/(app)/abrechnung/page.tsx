import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { Abrechnung } from "@/components/Abrechnung";

export const metadata: Metadata = { title: "Abrechnung – Clover Japan" };

export default async function AbrechnungPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div>
      <h1 className="mb-1 text-xl text-slate-900 dark:text-slate-100">Abrechnung · Japan</h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Wer hat was gezahlt – und wer schuldet wem wie viel.
      </p>
      <Abrechnung />
    </div>
  );
}
