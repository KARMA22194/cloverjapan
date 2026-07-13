"use client";

import { useEffect } from "react";

/**
 * Registriert den Service-Worker (installierbar/offline) — aber NUR in Produktion.
 * In der Entwicklung wird ein evtl. vorhandener Service-Worker samt Caches aktiv
 * entfernt: sonst liefert ein alter Cache veraltetes JS/HTML aus (neue Seiten fehlen,
 * Buttons reagieren nicht, weil das alte Bundle nicht zu den neuen Routen passt).
 */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
      return;
    }

    // Entwicklung: bestehende Service-Worker abmelden und Caches leeren.
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => regs.forEach((r) => r.unregister()))
      .catch(() => {});
    if ("caches" in window) {
      caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
    }
  }, []);

  return null;
}
