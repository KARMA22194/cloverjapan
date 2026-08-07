"use client";

import { useEffect, useState, type ReactNode } from "react";

import { TagesPlaner } from "@/components/TagesPlaner";
import { BookingPlanner } from "@/components/BookingPlanner";
import { Checkliste } from "@/components/Checkliste";
import { TabPanel } from "@/components/TabPanel";
import { TabBar } from "@/components/ui/TabBar";

const TABS = [
  { key: "ablauf", label: "Reiseablauf", icon: "ablauf" },
  { key: "tagesplaner", label: "Tagesplaner", icon: "tagesplaner" },
  { key: "buchungen", label: "Buchungen", icon: "buchungen" },
  { key: "checkliste", label: "Checkliste", icon: "checkliste" },
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
      <TabBar
        items={TABS}
        active={active}
        onSelect={select}
        label="Programm-Bereiche"
        idPrefix="programm"
      />

      {/* Ablauf ist ein Server-Node: einmal geladen bleibt er im Baum. Die
          `id` gehört zum `aria-controls` der TabBar — dieses Panel ist kein
          `TabPanel`, weil sein Inhalt vom Server kommt. */}
      <div role="tabpanel" id="programm-ablauf" hidden={active !== "ablauf"}>
        {ablaufNode ??
          (ablaufLoading ? (
            <p className="px-3 py-8 text-center text-sm text-ink-subtle">
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
