"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api/client";
import { Card } from "@/components/ui/Card";
import { buttonClasses } from "@/components/ui/Button";

/** VAPID-Public-Key (base64url) → Uint8Array für pushManager.subscribe. */
/**
 * ⚠️ Rückgabetyp **`Uint8Array<ArrayBuffer>`**, nicht bloß `Uint8Array`.
 *
 * Seit TypeScript 5.7 ist `Uint8Array` generisch über seinen Puffer und heißt
 * ohne Angabe `Uint8Array<ArrayBufferLike>` — das schließt `SharedArrayBuffer`
 * mit ein und passt damit nicht mehr auf `BufferSource`, das
 * `PushManager.subscribe` für `applicationServerKey` verlangt. Der Puffer wird
 * deshalb explizit als `ArrayBuffer` angelegt; ein Cast wäre hier die schlechtere
 * Lösung, weil er die Aussage nur verdeckt, statt sie wahr zu machen.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
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
      <p className="text-xs text-ink-subtle">
        Dieser Browser unterstützt keine Push-Benachrichtigungen.
      </p>
    );
  }

  return (
    <Card pad="sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink">🔔 Team-Benachrichtigungen</p>
          <p className="text-xs text-ink-muted">
            Push aufs Gerät, wenn jemand einen Stopp, eine Buchung o. Ä. hinzufügt.
          </p>
        </div>
        <button
          type="button"
          onClick={enabled ? disable : enable}
          disabled={busy || !hasSW}
          className={buttonClasses(enabled ? "secondary" : "primary", "sm", "text-sm")}
        >
          {busy ? "…" : enabled ? "Deaktivieren" : "Aktivieren"}
        </button>
      </div>
      {!hasSW && (
        <p className="mt-2 text-xs text-ink-subtle">
          Nur in der installierten bzw. veröffentlichten App verfügbar (im Dev-Modus aus).
        </p>
      )}
      {msg && <p className="mt-2 text-xs text-ink-muted">{msg}</p>}
    </Card>
  );
}
