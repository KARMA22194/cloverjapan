"use client";

import { useState, type ReactNode } from "react";

/**
 * Panel für die Tab-Bereiche (`/geld`, `/programm`, `/info`).
 *
 * Verhalten bewusst zweistufig, weil beide Extreme Nachteile haben:
 *  - `{active && <X/>}` unmountet beim Wegschalten → getippte Formulareingaben sind
 *    weg und alle Daten des Tabs werden beim Zurückkehren erneut geladen.
 *  - Alles sofort mounten → jeder Tab-Bereich feuert beim Seitenaufruf seine Requests,
 *    auch für Tabs, die niemand öffnet.
 *
 * Deshalb: **lazy mounten** (erst beim ersten Aktivieren) und danach **gemountet
 * lassen**, inaktiv nur per `hidden` ausblenden — dasselbe Muster, mit dem der
 * Reiseplaner seine Leaflet-Karte über den Tab-Wechsel rettet.
 */
export function TabPanel({
  active,
  id,
  children,
}: {
  active: boolean;
  id: string;
  children: ReactNode;
}) {
  // „State während des Renders anpassen" — von React für genau solche abgeleiteten
  // Zustände vorgesehen und günstiger als ein Effekt (kein zweiter Paint).
  const [everActive, setEverActive] = useState(active);
  if (active && !everActive) setEverActive(true);

  if (!everActive) return null;

  return (
    <div role="tabpanel" id={id} hidden={!active}>
      {children}
    </div>
  );
}
