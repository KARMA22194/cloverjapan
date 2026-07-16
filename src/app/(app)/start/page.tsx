import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { TripDashboard } from "@/components/TripDashboard";
import { JapanClock } from "@/components/JapanClock";
import { ActivityFeed } from "@/components/ActivityFeed";
import { FlightDayStatus } from "@/components/FlightDayStatus";

export const metadata: Metadata = { title: "Übersicht – Clover Japan" };

interface Tile {
  href: string;
  label: string;
  desc: string;
  emoji: string;
}

export default async function StartPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const isAdmin = session.user.role === "ADMIN";

  const groups: { title: string; hint: string; tiles: Tile[] }[] = [
    {
      title: "Japan",
      hint: "Alles für den Japan-Trip",
      tiles: [
        { href: "/reiseplaner", label: "Reiseplaner", desc: "Orte, beste Route & Zugverbindungen", emoji: "🗾" },
        { href: "/fluege", label: "Flüge", desc: "Per Flugnummer erfassen, Preis in Ausgaben", emoji: "✈️" },
        { href: "/programm", label: "Programm", desc: "Reiseablauf, Tagesplaner, Buchungen & Checkliste", emoji: "🗓️" },
        { href: "/geld", label: "Geld", desc: "Ausgaben, Abrechnung, Zoll & Wunschliste", emoji: "💴" },
        { href: "/info", label: "Info", desc: "Übersicht, Wetter & Notfallnummern", emoji: "🧭" },
        { href: "/mitglieder", label: "Mitglieder", desc: "Leute einladen & gemeinsam bearbeiten", emoji: "👥" },
      ],
    },
    {
      title: "Mehr",
      hint: "Konto & Schnittstellen",
      tiles: [
        { href: "/profil", label: "Profil", desc: "Profilbild festlegen", emoji: "🙂" },
        ...(isAdmin
          ? [{ href: "/admin", label: "Admin", desc: "Nutzerverwaltung", emoji: "⚙️" }]
          : []),
        { href: "/api-docs", label: "API-Dokumentation", desc: "Interaktive Swagger UI", emoji: "🧩" },
      ],
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl text-slate-900 dark:text-slate-100">
          Hallo {session.user.name ?? "👋"}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Wähle einen Bereich.
        </p>
      </div>

      <FlightDayStatus />

      <div className="sm:max-w-xs md:hidden">
        <JapanClock />
      </div>

      <TripDashboard />

      <ActivityFeed />

      {groups.map((group) => (
        <details key={group.title} open className="group/section">
          <summary className="mb-3 flex cursor-pointer list-none items-center gap-2 rounded-md py-1 transition hover:opacity-90">
            <span className="text-brand transition-transform duration-200 group-open/section:rotate-90" aria-hidden>
              ▸
            </span>
            <span>
              <span className="block text-lg leading-tight text-slate-900 dark:text-slate-100">
                {group.title}
              </span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">{group.hint}</span>
            </span>
          </summary>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.tiles.map((tile) => (
              <Link
                key={tile.href}
                href={tile.href}
                className="group/tile flex items-start gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 transition hover:border-brand hover:shadow-sm"
              >
                <span className="text-2xl" aria-hidden>
                  {tile.emoji}
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-slate-800 dark:text-slate-100 group-hover/tile:text-brand">
                    {tile.label}
                  </span>
                  <span className="block text-sm text-slate-500 dark:text-slate-400">
                    {tile.desc}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
