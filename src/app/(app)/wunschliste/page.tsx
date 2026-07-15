import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { Wunschliste } from "@/components/Wunschliste";

export const metadata: Metadata = { title: "Wunschliste – Clover Japan" };

export default async function WunschlistePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div>
      <h1 className="mb-1 text-xl text-slate-900 dark:text-slate-100">Einkaufs-Wunschliste · Japan</h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Was du in Japan kaufen willst. Die Summe lässt sich im Zollrechner als Warenwert übernehmen.
      </p>
      <Wunschliste />
    </div>
  );
}
