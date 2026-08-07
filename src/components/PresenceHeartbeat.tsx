"use client";

import { useEffect } from "react";

/**
 * Wie oft ein Lebenszeichen gesendet wird, solange der Tab sichtbar ist.
 *
 * Bewusst 2 Minuten statt 45 Sekunden: Neon suspendiert die Compute nach 5 Minuten
 * Leerlauf — ein 45-s-Takt hielt sie rund um die Uhr wach und verbrauchte damit
 * allein durch den Heartbeat das Stundenkontingent. Für die Anzeige „online /
 * zuletzt vor X" ist Minutengenauigkeit völlig ausreichend (die Online-Schwelle in
 * `TripMembers` liegt entsprechend höher).
 */
const HEARTBEAT_MS = 120_000;

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
