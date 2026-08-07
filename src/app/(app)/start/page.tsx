import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { TripDashboard } from "@/components/TripDashboard";
import { JapanClock } from "@/components/JapanClock";
import { ActivityFeed } from "@/components/ActivityFeed";
import { FlightDayStatus } from "@/components/FlightDayStatus";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";
import { CardLink } from "@/components/ui/Card";

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
      hint: "Konto & Verwaltung",
      tiles: [
        { href: "/profil", label: "Profil", desc: "Profilbild festlegen", emoji: "🙂" },
        ...(isAdmin
          ? [{ href: "/admin", label: "Admin", desc: "Nutzerverwaltung", emoji: "⚙️" }]
          : []),
      ],
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl sm:text-4xl">
          Hallo{" "}
          <span className="bg-gradient-to-r from-brand-lift to-brand bg-clip-text text-transparent">
            {session.user.name ?? "👋"}
          </span>
        </h1>
        <p className="mt-1 text-sm text-ink-muted">Wähle einen Bereich.</p>
      </div>

      <PwaInstallPrompt />

      <FlightDayStatus />

      <div className="sm:max-w-xs md:hidden">
        <JapanClock />
      </div>

      <TripDashboard />

      <ActivityFeed />

      {groups.map((group) => (
        <details key={group.title} open className="group/section">
          <summary className="mb-4 flex cursor-pointer list-none items-center gap-2.5 rounded-field py-1 transition hover:opacity-90">
            <span
              className="text-brand transition-transform duration-200 group-open/section:rotate-90"
              aria-hidden
            >
              ▸
            </span>
            <span>
              <span className="block text-xl leading-tight">{group.title}</span>
              <span className="block text-xs text-ink-subtle">{group.hint}</span>
            </span>
          </summary>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.tiles.map((tile) => (
              <CardLink key={tile.href} href={tile.href} pad="lg" className="group/tile">
                <span className="flex items-start gap-3.5">
                  {/* Emoji auf eigener Tint-Fläche: gibt der Kachel einen Anker
                      links und trennt Symbol von Text. */}
                  <span
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-field bg-brand/10 text-xl ring-1 ring-brand/15 transition group-hover/tile:bg-brand/15"
                    aria-hidden
                  >
                    {tile.emoji}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-bold text-ink transition group-hover/tile:text-brand">
                      {tile.label}
                    </span>
                    <span className="mt-0.5 block text-sm text-ink-muted">{tile.desc}</span>
                  </span>
                </span>
              </CardLink>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
