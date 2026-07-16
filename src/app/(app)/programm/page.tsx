import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ProgrammTabs } from "@/components/ProgrammTabs";
import { AblaufTimeline } from "@/components/AblaufTimeline";

export const metadata: Metadata = { title: "Programm – Clover Japan" };

export default async function ProgrammPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { tab } = await searchParams;

  return (
    <div>
      <h1 className="mb-1 text-xl text-slate-900 dark:text-slate-100">Programm · Japan</h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Reiseablauf, Tagesplaner, Buchungen und Checkliste an einem Ort.
      </p>
      <ProgrammTabs ablauf={<AblaufTimeline />} initial={tab} />
    </div>
  );
}
