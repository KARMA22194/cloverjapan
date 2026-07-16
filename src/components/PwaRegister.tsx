"use client";

import { useEffect } from "react";

/**
 * Registriert den Service-Worker (installierbar/offline) — aber NUR in Produktion.
 * In der Entwicklung wird ein evtl. vorhandener Service-Worker samt Caches aktiv
 * entfernt: sonst liefert ein alter Cache veraltetes JS/HTML aus (neue Seiten fehlen,
 * Buttons reagieren nicht, weil das alte Bundle nicht zu den neuen Routen passt).
 *
 * Zusätzlich wird dem SW die aktuelle Session gemeldet, damit der (personenbezogene)
 * Offline-Daten-Cache an genau diesen Nutzer gebunden bleibt (Cross-User-Schutz).
 */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      // Entwicklung: bestehende Service-Worker abmelden und Caches leeren.
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => {});
      if ("caches" in window) {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
      }
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {});

    // Aktuelle Session dem SW mitteilen (bindet den Offline-Daten-Cache an den Nutzer).
    navigator.serviceWorker.ready
      .then(async (reg) => {
        try {
          const res = await fetch("/api/v1/me");
          if (!res.ok) return;
          const me = await res.json();
          const target = navigator.serviceWorker.controller ?? reg.active;
          target?.postMessage({ type: "session", userId: me?.id ?? "" });
        } catch {
          /* offline oder nicht eingeloggt – dann kein Session-Update nötig */
        }
      })
      .catch(() => {});
  }, []);

  return null;
}
