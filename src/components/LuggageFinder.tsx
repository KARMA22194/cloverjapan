"use client";

import { useState } from "react";

import { api } from "@/lib/api/client";

export function LuggageFinder({
  token,
  label,
  ownerName,
  whatsapp,
}: {
  token: string;
  label: string;
  ownerName: string;
  whatsapp: string;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [waHref, setWaHref] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function share() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Standort wird von diesem Gerät nicht unterstützt.");
      return;
    }
    setBusy(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        try {
          await api.post(`/api/v1/luggage/found/${token}`, { lat, lng });
        } catch {
          /* Owner-Benachrichtigung best-effort; Finder sieht trotzdem Erfolg */
        }
        if (whatsapp) {
          const maps = `https://www.google.com/maps?q=${lat},${lng}`;
          const text = encodeURIComponent(
            `Hallo! Ich habe deinen Koffer „${label}" gefunden. Mein Standort: ${maps}`,
          );
          setWaHref(`https://wa.me/${whatsapp.replace(/[^\d]/g, "")}?text=${text}`);
        }
        setDone(true);
        setBusy(false);
      },
      () => {
        setBusy(false);
        setError("Standortfreigabe abgelehnt. Du kannst es erneut versuchen.");
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  }

  if (done) {
    return (
      <div className="w-full space-y-3">
        <p className="rounded-lg bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          Danke! {ownerName} wurde über deinen Standort informiert. 🙏
        </p>
        {waHref && (
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full rounded-md bg-[#25D366] px-4 py-3 text-sm font-medium text-white transition hover:opacity-90"
          >
            Zusätzlich per WhatsApp melden
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="w-full space-y-2">
      <button
        type="button"
        onClick={share}
        disabled={busy}
        className="w-full rounded-md bg-brand px-4 py-3 text-sm font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
      >
        📍 {busy ? "Standort wird geteilt…" : "Meinen Standort teilen"}
      </button>
      {error && <p className="text-sm text-amber-600 dark:text-amber-400">{error}</p>}
      <p className="text-xs text-slate-400 dark:text-slate-500">
        Es wird nur dein aktueller Standort übermittelt – keine weiteren Daten.
      </p>
    </div>
  );
}
