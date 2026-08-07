import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { FlightPlanner } from "@/components/FlightPlanner";

export const metadata: Metadata = { title: "Flüge – Clover Japan" };

export default async function FluegePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div>
      <h1 className="mb-1 text-xl text-ink">Flüge · Japan</h1>
      <p className="mb-4 text-sm text-ink-muted">
        Flug per Flugnummer abrufen oder manuell erfassen. Der Preis fließt automatisch in den
        Ausgabenrechner.
      </p>
      <FlightPlanner />
    </div>
  );
}
