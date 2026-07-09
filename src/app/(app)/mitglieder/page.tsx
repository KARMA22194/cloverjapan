import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { TripMembers } from "@/components/TripMembers";

export const metadata: Metadata = { title: "Reise-Mitglieder – Time Tracker" };

export default async function MitgliederPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div>
      <h1 className="mb-1 text-xl text-slate-900 dark:text-slate-100">Mitglieder · Japan-Reise</h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Lade Leute ein, um Reiseplaner, Ausgaben, Tagesplaner und Checkliste gemeinsam zu bearbeiten.
      </p>
      <TripMembers />
    </div>
  );
}
