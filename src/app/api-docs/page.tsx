import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth-session";
import { SwaggerView } from "@/components/SwaggerView";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = {
  title: "API-Dokumentation – Time Tracker",
  description: "Interaktive REST-API-Referenz (OpenAPI 3.1)",
};

export default async function ApiDocsPage() {
  // API-Doku ist ADMIN-only (die Seite liegt außerhalb des (app)-Layouts und
  // wird von der Middleware nicht erfasst → hier selbst absichern). Frische DB-Rolle,
  // damit ein degradierter Ex-Admin die Spec nicht weiter sieht.
  const me = await requireSessionUser();
  if (me.role !== "ADMIN") redirect("/start");

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <header className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <Logo height={30} priority />
            <div className="border-l border-slate-200 dark:border-slate-700 pl-3">
              <h1 className="text-lg text-slate-900 dark:text-slate-100">Zeiterfassung — API</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Interaktive REST-Referenz · das Frontend spricht ausschließlich über diese API
              </p>
            </div>
          </div>
          <Link
            href="/"
            className="rounded-md border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200 transition hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            ← Zur App
          </Link>
        </div>
      </header>
      <SwaggerView specUrl="/api/v1/openapi" />
    </div>
  );
}
