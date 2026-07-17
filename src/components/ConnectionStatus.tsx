"use client";

import { useEffect, useState } from "react";

/**
 * Kompakter Verbindungs-Indikator für die TopNav: grüner Punkt = online,
 * grauer Punkt = offline (Daten kommen dann aus dem Cache). Rein clientseitig
 * über `navigator.onLine` + die online/offline-Events. Ergänzt das prominentere
 * {@link OfflineBanner} um einen immer sichtbaren Status.
 */
export function ConnectionStatus() {
  // Start als „online" annehmen (SSR/erstes Paint) und im Effect korrigieren —
  // vermeidet ein kurzes falsches „offline" beim Hydrieren.
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"
      title={online ? "Online" : "Offline – du siehst den zuletzt geladenen Stand."}
    >
      <span
        aria-hidden
        className={`inline-block h-2 w-2 rounded-full ${
          online ? "bg-emerald-500" : "bg-slate-400 dark:bg-slate-500"
        }`}
      />
      <span className="hidden sm:inline">{online ? "Online" : "Offline"}</span>
    </span>
  );
}
