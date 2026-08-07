"use client";

import { useState } from "react";

import { ReiseUebersicht } from "@/components/ReiseUebersicht";
import { WeatherBoard } from "@/components/WeatherBoard";
import { NotfallInfo } from "@/components/NotfallInfo";
import { EkiStampAlbum } from "@/components/EkiStampAlbum";
import { KofferManager } from "@/components/KofferManager";
import { TabPanel } from "@/components/TabPanel";
import { TabBar } from "@/components/ui/TabBar";

const TABS = [
  { key: "uebersicht", label: "Übersicht", emoji: "🧭" },
  { key: "wetter", label: "Wetter", emoji: "☀️" },
  { key: "stempel", label: "Stempel", emoji: "⛩️" },
  { key: "koffer", label: "Koffer", emoji: "🧳" },
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
      <TabBar
        items={TABS}
        active={active}
        onSelect={select}
        label="Info-Bereiche"
        idPrefix="info"
      />

      {/* Einmal geöffnete Tabs bleiben gemountet (siehe TabPanel). */}
      <TabPanel id="info-uebersicht" active={active === "uebersicht"}>
        <ReiseUebersicht />
      </TabPanel>
      <TabPanel id="info-wetter" active={active === "wetter"}>
        <WeatherBoard />
      </TabPanel>
      <TabPanel id="info-stempel" active={active === "stempel"}>
        <EkiStampAlbum />
      </TabPanel>
      <TabPanel id="info-koffer" active={active === "koffer"}>
        <KofferManager />
      </TabPanel>
      <TabPanel id="info-notfall" active={active === "notfall"}>
        <NotfallInfo />
      </TabPanel>
    </div>
  );
}
