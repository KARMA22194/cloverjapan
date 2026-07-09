"use client";

import { useEffect } from "react";

/** Registriert den Service-Worker (macht die App installierbar / offline-fähig). */
export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
