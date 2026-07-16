"use client";

import { useEffect, useState, type ReactNode } from "react";

import { api } from "@/lib/api/client";

type Lang = "de" | "en" | "ja";

interface Strings {
  thanks: string;
  belongs: (name: string) => ReactNode;
  luggage: (label: string) => string;
  hint: (name: string) => string;
  share: string;
  sharing: string;
  only: string;
  success: (name: string) => string;
  wa: string;
  denied: string;
  unsupported: string;
  waMsg: (label: string, maps: string) => string;
}

const T: Record<Lang, Strings> = {
  de: {
    thanks: "Danke, dass du hilfst! 🙏",
    belongs: (n) => (
      <>
        Dieser Koffer gehört <strong>{n}</strong>.
      </>
    ),
    luggage: (l) => `🧳 „${l}"`,
    hint: (n) =>
      `Wenn du magst, teile kurz deinen Standort – ${n} bekommt ihn sofort und kann den Koffer zurückholen.`,
    share: "Meinen Standort teilen",
    sharing: "Standort wird geteilt…",
    only: "Es wird nur dein aktueller Standort übermittelt – keine weiteren Daten.",
    success: (n) => `Danke! ${n} wurde über deinen Standort informiert. 🙏`,
    wa: "Zusätzlich per WhatsApp melden",
    denied: "Standortfreigabe abgelehnt. Du kannst es erneut versuchen.",
    unsupported: "Standort wird von diesem Gerät nicht unterstützt.",
    waMsg: (l, maps) => `Hallo! Ich habe deinen Koffer „${l}" gefunden. Mein Standort: ${maps}`,
  },
  en: {
    thanks: "Thank you for helping! 🙏",
    belongs: (n) => (
      <>
        This suitcase belongs to <strong>{n}</strong>.
      </>
    ),
    luggage: (l) => `🧳 “${l}”`,
    hint: (n) =>
      `If you don't mind, please share your location — ${n} will receive it instantly and can recover the suitcase.`,
    share: "Share my location",
    sharing: "Sharing location…",
    only: "Only your current location is shared — no other data.",
    success: (n) => `Thank you! ${n} has been notified of your location. 🙏`,
    wa: "Also notify via WhatsApp",
    denied: "Location access was denied. You can try again.",
    unsupported: "Location is not supported on this device.",
    waMsg: (l, maps) => `Hi! I found your suitcase “${l}”. My location: ${maps}`,
  },
  ja: {
    thanks: "ご協力ありがとうございます！🙏",
    belongs: (n) => (
      <>
        このスーツケースは <strong>{n}</strong> さんのものです。
      </>
    ),
    luggage: (l) => `🧳「${l}」`,
    hint: (n) =>
      `よろしければ現在地を共有してください。${n} さんにすぐ届き、スーツケースを取り戻せます。`,
    share: "現在地を共有する",
    sharing: "共有中…",
    only: "共有されるのは現在地のみです。その他の情報は送信されません。",
    success: (n) => `ありがとうございます！位置情報を ${n} さんに通知しました。🙏`,
    wa: "WhatsApp でも知らせる",
    denied: "位置情報の許可が拒否されました。もう一度お試しください。",
    unsupported: "この端末では位置情報がサポートされていません。",
    waMsg: (l, maps) => `こんにちは！あなたのスーツケース「${l}」を見つけました。現在地: ${maps}`,
  },
};

const LANG_LABEL: Record<Lang, string> = { de: "DE", en: "EN", ja: "日本語" };

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
  const [lang, setLang] = useState<Lang>("en");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [waHref, setWaHref] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Startsprache aus der Browser-Sprache ableiten (Fallback: Englisch).
  useEffect(() => {
    const l = (navigator.language || "").toLowerCase();
    if (l.startsWith("de")) setLang("de");
    else if (l.startsWith("ja")) setLang("ja");
    else setLang("en");
  }, []);

  const t = T[lang];

  function share() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError(t.unsupported);
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
          /* best-effort */
        }
        if (whatsapp) {
          const maps = `https://www.google.com/maps?q=${lat},${lng}`;
          setWaHref(`https://wa.me/${whatsapp.replace(/[^\d]/g, "")}?text=${encodeURIComponent(t.waMsg(label, maps))}`);
        }
        setDone(true);
        setBusy(false);
      },
      () => {
        setBusy(false);
        setError(t.denied);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  }

  return (
    <div className="w-full space-y-5">
      {/* Sprachumschalter */}
      <div className="flex justify-center gap-1">
        {(Object.keys(LANG_LABEL) as Lang[]).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLang(l)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              l === lang
                ? "bg-brand text-white"
                : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            }`}
          >
            {LANG_LABEL[l]}
          </button>
        ))}
      </div>

      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{t.thanks}</h1>
        <p className="text-slate-700 dark:text-slate-200">{t.belongs(ownerName)}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">{t.luggage(label)}</p>
        <p className="pt-2 text-sm text-slate-500 dark:text-slate-400">{t.hint(ownerName)}</p>
      </div>

      {done ? (
        <div className="space-y-3">
          <p className="rounded-lg bg-emerald-500/10 px-4 py-3 text-center text-sm text-emerald-700 dark:text-emerald-300">
            {t.success(ownerName)}
          </p>
          {waHref && (
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full rounded-md bg-[#25D366] px-4 py-3 text-center text-sm font-medium text-white transition hover:opacity-90"
            >
              {t.wa}
            </a>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <button
            type="button"
            onClick={share}
            disabled={busy}
            className="w-full rounded-md bg-brand px-4 py-3 text-sm font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            📍 {busy ? t.sharing : t.share}
          </button>
          {error && <p className="text-center text-sm text-amber-600 dark:text-amber-400">{error}</p>}
          <p className="text-center text-xs text-slate-400 dark:text-slate-500">{t.only}</p>
        </div>
      )}
    </div>
  );
}
