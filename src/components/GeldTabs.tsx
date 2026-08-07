"use client";

import { useState } from "react";

import { ExpenseCalculator } from "@/components/ExpenseCalculator";
import { Abrechnung } from "@/components/Abrechnung";
import { CustomsCalculator } from "@/components/CustomsCalculator";
import { Wunschliste } from "@/components/Wunschliste";
import { TabPanel } from "@/components/TabPanel";
import { TabBar } from "@/components/ui/TabBar";

const TABS = [
  { key: "ausgaben", label: "Ausgaben", icon: "ausgaben" },
  { key: "abrechnung", label: "Abrechnung", icon: "abrechnung" },
  { key: "zoll", label: "Zoll", icon: "zoll" },
  { key: "wunschliste", label: "Wunschliste", icon: "wunschliste" },
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
      <TabBar
        items={TABS}
        active={active}
        onSelect={select}
        label="Geld-Bereiche"
        idPrefix="geld"
      />

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
