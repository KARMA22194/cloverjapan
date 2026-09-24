"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { count, flush, subscribe, SYNCED_EVENT } from "@/lib/offline/outbox";
import { toast } from "@/lib/toast";

/**
 * Statusleiste für Verbindung **und** Warteschlange.
 *
 * Zwei Zustände, die unabhängig voneinander auftreten:
 *  - **offline** — die Daten kommen aus dem Cache des Service-Workers.
 *  - **wartende Änderungen** — offline erfasste Mutationen liegen in der Outbox
 *    (`src/lib/offline/outbox.ts`). Das kann auch online der Fall sein, nämlich
 *    solange das Nachholen läuft oder gerade gescheitert ist.
 *
 * ⚠️ Der Hinweis ist kein Schmuck, sondern Teil der Zusage: der Nutzer sieht in
 * seiner Liste bereits Einträge, die auf dem Server noch nicht existieren. Ohne
 * die Leiste hielte er sie für gesichert — und schlösse die App.
 */
export function OfflineBanner() {
  const router = useRouter();
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(0);

  // Warteschlange abarbeiten und danach die Server-gerenderten Teile auffrischen.
  const sync = useCallback(async () => {
    if ((await count()) === 0) return;
    const { sent, dropped } = await flush();
    if (sent > 0) router.refresh();
    if (dropped > 0) {
      toast(
        dropped === 1
          ? "Eine offline erfasste Änderung wurde vom Server abgelehnt."
          : `${dropped} offline erfasste Änderungen wurden vom Server abgelehnt.`,
      );
    }
  }, [router]);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();

    const onOnline = () => {
      update();
      void sync();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", update);

    // Beim Start nachholen: die App kann beim letzten Mal offline geschlossen
    // worden sein — dann hat nie jemand das `online`-Ereignis gesehen.
    void sync();

    // ⚠️ `navigator.onLine` sagt nur, ob ein Netzwerk *vorhanden* ist, nicht ob
    // es trägt. Im Hotel-WLAN mit Anmeldeseite oder bei einer Funkzelle am Rand
    // bleibt es `true`, obwohl nichts durchgeht — dann käme nie ein
    // `online`-Ereignis. Deshalb zusätzlich ein ruhiger Takt, solange etwas
    // wartet.
    const timer = window.setInterval(() => {
      if (navigator.onLine) void sync();
    }, 30_000);

    const unsubscribe = subscribe(setPending);
    const onSynced = () => router.refresh();
    window.addEventListener(SYNCED_EVENT, onSynced);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", update);
      window.removeEventListener(SYNCED_EVENT, onSynced);
      window.clearInterval(timer);
      unsubscribe();
    };
  }, [router, sync]);

  if (!offline && pending === 0) return null;

  const text = offline
    ? pending > 0
      ? `Offline – ${pending} ${pending === 1 ? "Änderung wartet" : "Änderungen warten"} auf Verbindung.`
      : "Offline – du siehst den zuletzt geladenen Stand."
    : `${pending} ${pending === 1 ? "Änderung wird" : "Änderungen werden"} gesendet …`;

  return (
    <div
      role="status"
      data-testid="offline-banner"
      data-pending={pending}
      className="bg-accent px-4 py-1.5 text-center text-xs font-medium text-white print:hidden"
    >
      {text}
    </div>
  );
}
