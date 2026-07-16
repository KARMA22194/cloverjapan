"use client";

import { useState } from "react";

import { ReiseUebersicht } from "@/components/ReiseUebersicht";
import { WeatherBoard } from "@/components/WeatherBoard";
import { NotfallInfo } from "@/components/NotfallInfo";

const TABS = [
  { key: "uebersicht", label: "Übersicht", emoji: "🧭" },
  { key: "wetter", label: "Wetter", emoji: "☀️" },
  { key: "notfall", label: "Notfall & Basics", emoji: "🆘" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function InfoTabs({ initial }: { initial?: string }) {
  const start = TABS.some((t) => t.key === initial) ? (initial as TabKey) : "uebersicht";
  const [active, setActive] = useState<TabKey>(start);

  function select(key: TabKey) {
    setActive(key);
    // URL ehrlich halten (teilbar), ohne echte Navigation.
    try {
      window.history.replaceState(null, "", `/info?tab=${key}`);
    } catch {
      /* ignore */
    }
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Info-Bereiche"
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

      {active === "uebersicht" && <ReiseUebersicht />}
      {active === "wetter" && <WeatherBoard />}
      {active === "notfall" && <NotfallInfo />}
    </div>
  );
}
