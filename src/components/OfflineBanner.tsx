"use client";

import { useEffect, useState } from "react";

/** Dezenter Hinweis, wenn keine Verbindung besteht (Daten kommen dann aus dem Cache). */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="bg-accent px-4 py-1.5 text-center text-xs font-medium text-white print:hidden"
    >
      Offline – du siehst den zuletzt geladenen Stand.
    </div>
  );
}
