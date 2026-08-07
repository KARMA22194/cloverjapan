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
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-subtle"
      title={online ? "Online" : "Offline – du siehst den zuletzt geladenen Stand."}
    >
      {/* Weicher Halo statt nacktem Punkt — der Zustand ist so auch am Rand des
          Blickfelds erkennbar, ohne mehr Platz zu brauchen. */}
      <span
        aria-hidden
        className={`inline-block h-2 w-2 rounded-full ${
          online
            ? "bg-emerald-500 ring-2 ring-emerald-500/25"
            : "bg-ink-subtle ring-2 ring-ink-subtle/20"
        }`}
      />
      <span className="hidden sm:inline">{online ? "Online" : "Offline"}</span>
    </span>
  );
}
