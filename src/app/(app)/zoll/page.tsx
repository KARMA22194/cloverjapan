import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { CustomsCalculator } from "@/components/CustomsCalculator";

export const metadata: Metadata = { title: "Zollrechner – Clover Japan" };

export default async function ZollPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div>
      <h1 className="mb-1 text-xl text-slate-900 dark:text-slate-100">Zollrechner · Japan</h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Schätzt die Einfuhrabgaben für Waren aus Japan bei der Einreise nach Deutschland.
      </p>
      <CustomsCalculator />
    </div>
  );
}
