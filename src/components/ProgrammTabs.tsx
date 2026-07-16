"use client";

import { useState, type ReactNode } from "react";

import { TagesPlaner } from "@/components/TagesPlaner";
import { BookingPlanner } from "@/components/BookingPlanner";
import { Checkliste } from "@/components/Checkliste";

const TABS = [
  { key: "ablauf", label: "Reiseablauf", emoji: "🗓️" },
  { key: "tagesplaner", label: "Tagesplaner", emoji: "📝" },
  { key: "buchungen", label: "Buchungen", emoji: "🎟️" },
  { key: "checkliste", label: "Checkliste", emoji: "✅" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/**
 * Programm-Bereich mit Tabs. „Reiseablauf" ist eine Server-Komponente und wird
 * als vorgerenderter Node (`ablauf`) hereingereicht; die übrigen Tabs sind
 * Client-Komponenten.
 */
export function ProgrammTabs({ ablauf, initial }: { ablauf: ReactNode; initial?: string }) {
  const start = TABS.some((t) => t.key === initial) ? (initial as TabKey) : "ablauf";
  const [active, setActive] = useState<TabKey>(start);

  function select(key: TabKey) {
    setActive(key);
    // URL ehrlich halten (teilbar), ohne echte Navigation.
    try {
      window.history.replaceState(null, "", `/programm?tab=${key}`);
    } catch {
      /* ignore */
    }
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Programm-Bereiche"
        className="mb-4 flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-700"
      >
        {TABS.map((t) => {
          const on = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => select(t.key)}
              className={`-mb-px rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition ${
                on
                  ? "border-brand text-brand"
                  : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
              }`}
            >
              <span aria-hidden>{t.emoji}</span> {t.label}
            </button>
          );
        })}
      </div>

      {/* Ablauf ist ein Server-Node → immer im Baum, nur ein-/ausgeblendet. */}
      <div hidden={active !== "ablauf"}>{ablauf}</div>
      {active === "tagesplaner" && <TagesPlaner />}
      {active === "buchungen" && <BookingPlanner />}
      {active === "checkliste" && <Checkliste />}
    </div>
  );
}
