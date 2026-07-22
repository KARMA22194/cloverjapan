"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api/client";

/** VAPID-Public-Key (base64url) → Uint8Array für pushManager.subscribe. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/**
 * Umschalter „Team-Benachrichtigungen" (Web-Push). Fragt die Browser-Erlaubnis,
 * abonniert per VAPID und meldet das Abo an den Server; Abschalten meldet es wieder ab.
 * Zeigt sich nur, wenn der Browser Push unterstützt UND ein Service-Worker aktiv ist
 * (in der Entwicklung ist der SW bewusst aus → Hinweis statt Umschalter).
 */
export function PushToggle() {
  const [supported, setSupported] = useState(false);
  const [hasSW, setHasSW] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSupported(ok);
    if (!ok) return;
    navigator.serviceWorker
      .getRegistration()
      .then(async (reg) => {
        if (!reg) {
          setHasSW(false);
          return;
        }
        const sub = await reg.pushManager.getSubscription();
        setEnabled(Boolean(sub));
      })
      .catch(() => {});
  }, []);

  async function enable() {
    setBusy(true);
    setMsg(null);
    try {
      const { key } = await api.get<{ key: string | null }>("/api/v1/push/key");
      if (!key) {
        setMsg("Benachrichtigungen sind auf diesem Server nicht eingerichtet.");
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setMsg("Du hast Benachrichtigungen nicht erlaubt.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh: string; auth: string } };
      await api.post("/api/v1/push", { endpoint: json.endpoint, keys: json.keys });
      setEnabled(true);
      setMsg("Benachrichtigungen aktiviert – du wirst bei Team-Aktivität informiert.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Konnte nicht aktivieren.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api.delete(`/api/v1/push?endpoint=${encodeURIComponent(sub.endpoint)}`);
        await sub.unsubscribe();
      }
      setEnabled(false);
      setMsg("Benachrichtigungen deaktiviert.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Konnte nicht deaktivieren.");
    } finally {
      setBusy(false);
    }
  }

  if (!supported) {
    return (
      <p className="text-xs text-slate-400 dark:text-slate-500">
        Dieser Browser unterstützt keine Push-Benachrichtigungen.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
            🔔 Team-Benachrichtigungen
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Push aufs Gerät, wenn jemand einen Stopp, eine Buchung o. Ä. hinzufügt.
          </p>
        </div>
        <button
          type="button"
          onClick={enabled ? disable : enable}
          disabled={busy || !hasSW}
          className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
            enabled
              ? "border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              : "bg-brand text-white hover:bg-brand-dark"
          }`}
        >
          {busy ? "…" : enabled ? "Deaktivieren" : "Aktivieren"}
        </button>
      </div>
      {!hasSW && (
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          Nur in der installierten bzw. veröffentlichten App verfügbar (im Dev-Modus aus).
        </p>
      )}
      {msg && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{msg}</p>}
    </div>
  );
}
