import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { InfoTabs } from "@/components/InfoTabs";

export const metadata: Metadata = { title: "Info – Clover Japan" };

export default async function InfoPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { tab } = await searchParams;

  return (
    <div>
      <h1 className="mb-1 text-xl text-slate-900 dark:text-slate-100">Info · Japan</h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Reiseübersicht, Wetter, Eki-Stamp-Sammlung sowie Notfallnummern &amp; Basics für Japan.
      </p>
      <InfoTabs initial={tab} />
    </div>
  );
}
