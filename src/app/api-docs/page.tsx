import Link from "next/link";
import type { Metadata } from "next";

import { SwaggerView } from "@/components/SwaggerView";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = {
  title: "API-Dokumentation – Time Tracker",
  description: "Interaktive REST-API-Referenz (OpenAPI 3.1)",
};

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <Logo height={30} priority />
            <div className="border-l border-slate-200 pl-3">
              <h1 className="text-lg text-slate-900">Zeiterfassung — API</h1>
              <p className="text-xs text-slate-500">
                Interaktive REST-Referenz · das Frontend spricht ausschließlich über diese API
              </p>
            </div>
          </div>
          <Link
            href="/"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100"
          >
            ← Zur App
          </Link>
        </div>
      </header>
      <SwaggerView specUrl="/api/v1/openapi" />
    </div>
  );
}
