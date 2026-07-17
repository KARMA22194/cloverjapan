"use client";

import { useEffect } from "react";

// Wie oft ein Lebenszeichen gesendet wird, solange der Tab sichtbar ist.
const HEARTBEAT_MS = 45_000;

/**
 * Meldet die offene App periodisch als „aktiv" (`POST /api/v1/presence`), damit
 * andere Reise-Mitglieder den Nutzer als „online" sehen. Sendet nur, wenn der Tab
 * sichtbar UND online ist (spart Requests im Hintergrund/offline). Bewusst ohne
 * den api-Client (der bei Fehlern einen Toast zeigt) — ein Heartbeat bleibt still.
 */
export function PresenceHeartbeat() {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const ping = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      fetch("/api/v1/presence", { method: "POST", cache: "no-store", keepalive: true }).catch(
        () => {},
      );
    };

    ping(); // sofort beim Laden
    timer = setInterval(ping, HEARTBEAT_MS);

    // Beim Zurückkehren in den Tab sofort ein frisches Lebenszeichen senden.
    const onVisible = () => {
      if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", ping);

    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", ping);
    };
  }, []);

  return null;
}
