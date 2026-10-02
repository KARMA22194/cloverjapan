import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { TripPlanner } from "@/components/TripPlanner";

export const metadata: Metadata = {
  title: "Reiseplaner Japan – Time Tracker",
};

export default async function ReiseplanerPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div>
      <h1 className="mb-1 text-xl text-ink">Reiseplaner · Japan</h1>
      <p className="mb-4 text-sm text-ink-muted">
        Orte eingeben, auf der Karte markieren lassen und die beste Route berechnen.
      </p>
      {/* ⚠️ Der Schlüssel kommt zur LAUFZEIT aus der Server-Komponente, nicht
          über `NEXT_PUBLIC_*`. Letzteres würde ihn beim Build einbacken — und
          der Produktions-Docker-Build läuft ohne die Laufzeit-Umgebung, der
          Wert wäre dort leer. Dieselbe Falle hatte das Self-Hosting schon
          zweimal blockiert (s. CLAUDE.md zu `prisma.config.ts` und `db.ts`). */}
      <TripPlanner cartoApiKey={process.env.CARTO_API_KEY ?? null} />
    </div>
  );
}
