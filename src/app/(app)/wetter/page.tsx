import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { WeatherWidget } from "@/components/WeatherWidget";

export const metadata: Metadata = { title: "Wetter – Clover Japan" };

export default async function WetterPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div>
      <h1 className="mb-1 text-xl text-slate-900 dark:text-slate-100">Wetter · Japan</h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Aktuelles Wetter in Tokio.
      </p>
      <div className="max-w-sm">
        <WeatherWidget big />
      </div>
    </div>
  );
}
