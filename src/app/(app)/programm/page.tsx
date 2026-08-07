import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ProgrammTabs } from "@/components/ProgrammTabs";
import { AblaufTimeline } from "@/components/AblaufTimeline";
import { loadAblauf } from "@/app/actions/ablauf";

export const metadata: Metadata = { title: "Programm – Clover Japan" };

export default async function ProgrammPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { tab } = await searchParams;
  // Default-Tab ist „ablauf" (kein ?tab= → Timeline direkt mitliefern).
  const showAblauf = !tab || tab === "ablauf";

  return (
    <div>
      <h1 className="mb-1 text-xl text-ink">Programm · Japan</h1>
      <p className="mb-4 text-sm text-ink-muted">
        Reiseablauf, Tagesplaner, Buchungen und Checkliste an einem Ort.
      </p>
      {/* Die Timeline (vier Queries) nur rendern, wenn ihr Tab wirklich aktiv ist —
          sonst holt ProgrammTabs sie bei Bedarf per Server Action nach. */}
      <ProgrammTabs
        ablauf={showAblauf ? <AblaufTimeline /> : null}
        loadAblauf={loadAblauf}
        initial={tab}
      />
    </div>
  );
}
