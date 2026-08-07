"use client";

import { useEffect, useState, type ReactNode } from "react";

import { api } from "@/lib/api/client";
import { buttonClasses } from "@/components/ui/Button";

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
  contactHeading: (name: string) => string;
  waContact: string;
  waMsgPlain: (label: string) => string;
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
    contactHeading: (n) => `Du möchtest deinen Standort nicht teilen? Erreiche ${n} direkt:`,
    waContact: "Per WhatsApp schreiben",
    waMsgPlain: (l) => `Hallo! Ich habe deinen Koffer „${l}" gefunden.`,
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
    contactHeading: (n) => `Prefer not to share your location? Reach ${n} directly:`,
    waContact: "Message on WhatsApp",
    waMsgPlain: (l) => `Hi! I found your suitcase “${l}”.`,
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
    contactHeading: (n) => `現在地を共有したくない場合は、${n} さんに直接ご連絡ください：`,
    waContact: "WhatsApp で連絡する",
    waMsgPlain: (l) => `こんにちは！あなたのスーツケース「${l}」を見つけました。`,
  },
};

/** Kontaktwert als passenden Link darstellen (E-Mail → mailto, Telefon → tel, sonst Text). */
function ContactValue({ value }: { value: string }) {
  const cls = "block break-words text-center text-sm font-medium text-brand hover:underline";
  if (value.includes("@") && !value.includes(" ")) {
    return <a href={`mailto:${value}`} className={cls}>{value}</a>;
  }
  if (/^\+?[\d\s()/-]{5,}$/.test(value)) {
    return <a href={`tel:${value.replace(/[^\d+]/g, "")}`} className={cls}>{value}</a>;
  }
  return <p className="text-center text-sm text-ink-muted">{value}</p>;
}

const LANG_LABEL: Record<Lang, string> = { de: "DE", en: "EN", ja: "日本語" };

export function LuggageFinder({
  token,
  label,
  ownerName,
  whatsapp,
  contact,
}: {
  token: string;
  label: string;
  ownerName: string;
  whatsapp: string;
  contact: string;
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
                : "text-ink-muted hover:bg-surface-2"
            }`}
          >
            {LANG_LABEL[l]}
          </button>
        ))}
      </div>

      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold text-ink">{t.thanks}</h1>
        <p className="text-ink-muted">{t.belongs(ownerName)}</p>
        <p className="text-sm text-ink-muted">{t.luggage(label)}</p>
        <p className="pt-2 text-sm text-ink-muted">{t.hint(ownerName)}</p>
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
        <div className="space-y-4">
          {/* Direktkontakt VOR dem Standort-Button (falls man nicht teilen möchte). */}
          {(whatsapp || contact) && (
            <div className="space-y-2 rounded-lg border border-hairline p-3">
              <p className="text-center text-xs text-ink-muted">
                {t.contactHeading(ownerName)}
              </p>
              {whatsapp && (
                <a
                  href={`https://wa.me/${whatsapp.replace(/[^\d]/g, "")}?text=${encodeURIComponent(t.waMsgPlain(label))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-md bg-[#25D366] px-3 py-2 text-center text-sm font-medium text-white transition hover:opacity-90"
                >
                  {t.waContact}
                </a>
              )}
              {contact && <ContactValue value={contact} />}
            </div>
          )}

          <div className="space-y-2">
            <button
              type="button"
              onClick={share}
              disabled={busy}
              className={buttonClasses("primary", "md", "h-11 px-4 w-full")}
            >
              📍 {busy ? t.sharing : t.share}
            </button>
            {error && <p className="text-center text-sm text-amber-600 dark:text-amber-400">{error}</p>}
            <p className="text-center text-xs text-ink-subtle">{t.only}</p>
          </div>
        </div>
      )}
    </div>
  );
}
