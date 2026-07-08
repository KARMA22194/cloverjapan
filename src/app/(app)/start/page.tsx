import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { todayParam } from "@/lib/time";

export const metadata: Metadata = { title: "Übersicht – Time Tracker" };

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

  const today = todayParam();
  const [y, m] = today.split("-");
  const year = Number(y);
  const month = Number(m);

  const groups: { title: string; hint: string; tiles: Tile[] }[] = [
    {
      title: "Zeiterfassung",
      hint: "Arbeitszeiten erfassen und auswerten",
      tiles: [
        { href: `/day/${today}`, label: "Tag", desc: "Zeiten erfassen, bearbeiten, Notizen", emoji: "🗓️" },
        { href: `/month/${year}/${month}`, label: "Monat", desc: "Matrix Tag × Projekt", emoji: "📊" },
        { href: `/year/${year}`, label: "Jahr", desc: "Jahresübersicht Monat × Projekt", emoji: "📈" },
        { href: `/calendar/${year}/${month}`, label: "Kalender", desc: "Monatskalender mit Notizen", emoji: "📅" },
      ],
    },
    {
      title: "Reiseplaner",
      hint: "Japan-Trip planen und Ausgaben tracken",
      tiles: [
        { href: "/reiseplaner", label: "Reiseplaner", desc: "Orte & beste Route auf der Karte", emoji: "🗾" },
        { href: "/ausgaben", label: "Ausgaben", desc: "Yen → Euro, nach Kategorien", emoji: "💴" },
      ],
    },
    {
      title: "Mehr",
      hint: "Verwaltung & Schnittstellen",
      tiles: [
        ...(isAdmin
          ? [{ href: "/admin", label: "Admin", desc: "Projekte & Mitarbeiter", emoji: "⚙️" }]
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

      {groups.map((group) => (
        <section key={group.title}>
          <div className="mb-3">
            <h2 className="text-lg text-slate-900 dark:text-slate-100">{group.title}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{group.hint}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.tiles.map((tile) => (
              <Link
                key={tile.href}
                href={tile.href}
                className="group flex items-start gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 transition hover:border-brand hover:shadow-sm"
              >
                <span className="text-2xl" aria-hidden>
                  {tile.emoji}
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-slate-800 dark:text-slate-100 group-hover:text-brand">
                    {tile.label}
                  </span>
                  <span className="block text-sm text-slate-500 dark:text-slate-400">
                    {tile.desc}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
