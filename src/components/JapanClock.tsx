"use client";

import { useEffect, useState } from "react";

const JP_TZ = "Asia/Tokyo";
const HOME_TZ = "Europe/Berlin"; // APP_TIMEZONE

const timeFmt = (tz: string, withSeconds = false) =>
  new Intl.DateTimeFormat("de-DE", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
  });

const dateFmt = new Intl.DateTimeFormat("de-DE", {
  timeZone: JP_TZ,
  weekday: "long",
  day: "2-digit",
  month: "long",
});

/** Ganzzahlige Stundendifferenz Japan − Zuhause (DST-sicher, da aus echten Zonen berechnet). */
function diffHours(now: Date): number {
  const jp = new Date(now.toLocaleString("en-US", { timeZone: JP_TZ }));
  const home = new Date(now.toLocaleString("en-US", { timeZone: HOME_TZ }));
  return Math.round((jp.getTime() - home.getTime()) / 3_600_000);
}

/**
 * Live-Uhr für Japan (Asia/Tokyo). `compact` = schlanke Variante für die TopNav,
 * sonst volle Karte mit Datum, Zuhause-Zeit und Zeitdifferenz.
 */
export function JapanClock({ compact = false }: { compact?: boolean }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) {
    // Kein Server/Client-Mismatch: erst nach Mount rendern.
    return compact ? null : (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Uhrzeit in Japan
        </p>
        <p className="mt-1 text-2xl font-bold text-slate-300 dark:text-slate-600">–:–</p>
      </div>
    );
  }

  const jpTime = timeFmt(JP_TZ).format(now);
  const diff = diffHours(now);
  const diffLabel = diff === 0 ? "gleiche Zeit" : `${diff > 0 ? "+" : ""}${diff} Std`;

  if (compact) {
    return (
      <span
        className="hidden items-center gap-1.5 rounded-md px-2 py-1 text-sm text-slate-600 dark:text-slate-300 md:inline-flex"
        title={`Japan (Tokio) · ${diffLabel} zu Zuhause`}
        aria-label={`Uhrzeit in Japan: ${jpTime}`}
      >
        <span aria-hidden>🗾</span>
        <span className="tabular-nums font-medium">{jpTime}</span>
      </span>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
        Uhrzeit in Japan
      </p>
      <p className="mt-1 text-3xl font-bold tabular-nums text-brand">
        {timeFmt(JP_TZ, true).format(now)}
      </p>
      <p className="text-xs text-slate-400 dark:text-slate-500">{dateFmt.format(now)}</p>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Zuhause <span className="tabular-nums">{timeFmt(HOME_TZ).format(now)}</span>
        <span className="text-slate-400 dark:text-slate-500"> · {diffLabel}</span>
      </p>
    </div>
  );
}
