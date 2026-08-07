"use client";

import { useEffect, useState, type ReactNode } from "react";

import { TagesPlaner } from "@/components/TagesPlaner";
import { BookingPlanner } from "@/components/BookingPlanner";
import { Checkliste } from "@/components/Checkliste";
import { TabPanel } from "@/components/TabPanel";

const TABS = [
  { key: "ablauf", label: "Reiseablauf", emoji: "🗓️" },
  { key: "tagesplaner", label: "Tagesplaner", emoji: "📝" },
  { key: "buchungen", label: "Buchungen", emoji: "🎟️" },
  { key: "checkliste", label: "Checkliste", emoji: "✅" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/**
 * Programm-Bereich mit Tabs. „Reiseablauf" ist eine Server-Komponente.
 *
 * Sie wird nur dann schon vom Server mitgeliefert (`ablauf`), wenn dieser Tab beim
 * Aufruf aktiv ist. Steigt jemand auf einem anderen Tab ein, bleiben die vier
 * Timeline-Queries aus; wechselt er später hierher, holt `loadAblauf` den
 * Server-Knoten nach — der Zustand der anderen Tabs bleibt dabei erhalten.
 */
export function ProgrammTabs({
  ablauf,
  loadAblauf,
  initial,
}: {
  ablauf: ReactNode;
  loadAblauf: () => Promise<ReactNode>;
  initial?: string;
}) {
  const start = TABS.some((t) => t.key === initial) ? (initial as TabKey) : "ablauf";
  const [active, setActive] = useState<TabKey>(start);
  const [ablaufNode, setAblaufNode] = useState<ReactNode>(ablauf);
  const [ablaufLoading, setAblaufLoading] = useState(false);

  // Beim ersten Wechsel auf „Reiseablauf" den Server-Knoten nachladen.
  useEffect(() => {
    if (active !== "ablauf" || ablaufNode || ablaufLoading) return;
    setAblaufLoading(true);
    loadAblauf()
      .then(setAblaufNode)
      .catch(() => {})
      .finally(() => setAblaufLoading(false));
  }, [active, ablaufNode, ablaufLoading, loadAblauf]);

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

      {/* Ablauf ist ein Server-Node: einmal geladen bleibt er im Baum. */}
      <div hidden={active !== "ablauf"}>
        {ablaufNode ??
          (ablaufLoading ? (
            <p className="px-3 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
              Reiseablauf wird geladen…
            </p>
          ) : null)}
      </div>
      {/* Client-Tabs: einmal geöffnet bleiben sie gemountet (siehe TabPanel). */}
      <TabPanel id="programm-tagesplaner" active={active === "tagesplaner"}>
        <TagesPlaner />
      </TabPanel>
      <TabPanel id="programm-buchungen" active={active === "buchungen"}>
        <BookingPlanner />
      </TabPanel>
      <TabPanel id="programm-checkliste" active={active === "checkliste"}>
        <Checkliste />
      </TabPanel>
    </div>
  );
}
