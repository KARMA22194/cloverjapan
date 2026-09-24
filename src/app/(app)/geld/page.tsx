import type { Metadata } from "next";

import { requireSessionUser } from "@/lib/auth-session";
import { GeldTabs } from "@/components/GeldTabs";

export const metadata: Metadata = { title: "Geld – Clover Japan" };

export default async function GeldPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  // `requireSessionUser` statt `auth()`: die Rechte müssen **frisch aus der DB**
  // kommen. Aus dem JWT gelesen hinge der Scan-Knopf noch bis zu 12 Stunden im
  // Bild, nachdem ein Admin das Recht entzogen hat.
  const me = await requireSessionUser();
  const { tab } = await searchParams;

  return (
    <div>
      <h1 className="mb-1 text-xl text-ink">Geld · Japan</h1>
      <p className="mb-4 text-sm text-ink-muted">
        Ausgaben, Abrechnung, Zollrechner und Einkaufs-Wunschliste an einem Ort.
      </p>
      <GeldTabs
        initial={tab}
        canAiScan={me.canAiScan}
        canReceiptPhoto={me.canReceiptPhoto}
      />
    </div>
  );
}
