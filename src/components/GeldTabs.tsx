"use client";

import { useState } from "react";

import { ExpenseCalculator } from "@/components/ExpenseCalculator";
import { Abrechnung } from "@/components/Abrechnung";
import { CustomsCalculator } from "@/components/CustomsCalculator";
import { Wunschliste } from "@/components/Wunschliste";
import { TabPanel } from "@/components/TabPanel";

const TABS = [
  { key: "ausgaben", label: "Ausgaben", emoji: "💴" },
  { key: "abrechnung", label: "Abrechnung", emoji: "🧮" },
  { key: "zoll", label: "Zoll", emoji: "🛃" },
  { key: "wunschliste", label: "Wunschliste", emoji: "🛍️" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function GeldTabs({ initial }: { initial?: string }) {
  const start = TABS.some((t) => t.key === initial) ? (initial as TabKey) : "ausgaben";
  const [active, setActive] = useState<TabKey>(start);

  function select(key: TabKey) {
    setActive(key);
    // URL ehrlich halten (teilbar), ohne echte Navigation.
    try {
      window.history.replaceState(null, "", `/geld?tab=${key}`);
    } catch {
      /* ignore */
    }
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Geld-Bereiche"
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

      {/* Einmal geöffnete Tabs bleiben gemountet: sonst gehen Eingaben beim
          Umschalten verloren und alle Daten werden erneut geladen. */}
      <TabPanel id="geld-ausgaben" active={active === "ausgaben"}>
        <ExpenseCalculator />
      </TabPanel>
      <TabPanel id="geld-abrechnung" active={active === "abrechnung"}>
        <Abrechnung />
      </TabPanel>
      <TabPanel id="geld-zoll" active={active === "zoll"}>
        <CustomsCalculator />
      </TabPanel>
      <TabPanel id="geld-wunschliste" active={active === "wunschliste"}>
        <Wunschliste />
      </TabPanel>
    </div>
  );
}
