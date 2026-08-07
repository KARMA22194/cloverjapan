import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { GeldTabs } from "@/components/GeldTabs";

export const metadata: Metadata = { title: "Geld – Clover Japan" };

export default async function GeldPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { tab } = await searchParams;

  return (
    <div>
      <h1 className="mb-1 text-xl text-ink">Geld · Japan</h1>
      <p className="mb-4 text-sm text-ink-muted">
        Ausgaben, Abrechnung, Zollrechner und Einkaufs-Wunschliste an einem Ort.
      </p>
      <GeldTabs initial={tab} />
    </div>
  );
}
