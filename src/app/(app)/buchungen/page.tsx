import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { BookingPlanner } from "@/components/BookingPlanner";

export const metadata: Metadata = { title: "Buchungen – Clover Japan" };

export default async function BuchungenPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div>
      <h1 className="mb-1 text-xl text-slate-900 dark:text-slate-100">Buchungen & Tickets · Japan</h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Reservierungen mit Termin und Bestätigungsnummer. Mit Preis fließt es in die Ausgaben; mit
        Datum erscheint es im Reiseablauf.
      </p>
      <BookingPlanner />
    </div>
  );
}
