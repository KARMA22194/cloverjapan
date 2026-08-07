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

// Die Zeitdifferenz ändert sich nur bei DST-Wechseln — sie pro Tag einmal zu
// berechnen spart zwei `toLocaleString`-Parses bei jedem Tick.
let diffCache: { day: string; label: string } | null = null;

function diffLabelOf(now: Date): string {
  const day = now.toISOString().slice(0, 10);
  if (diffCache?.day === day) return diffCache.label;
  const diff = diffHours(now);
  const label = diff === 0 ? "gleiche Zeit" : `${diff > 0 ? "+" : ""}${diff} Std`;
  diffCache = { day, label };
  return label;
}

/**
 * Live-Uhr für Japan (Asia/Tokyo). `compact` = schlanke Variante für die TopNav,
 * sonst volle Karte mit Datum, Zuhause-Zeit und Zeitdifferenz.
 */
export function JapanClock({ compact = false }: { compact?: boolean }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // Der Takt richtet sich nach dem, was sichtbar ist: die kompakte Variante zeigt
    // nur HH:MM und braucht keinen Sekundentakt. Im Hintergrund-Tab pausiert die Uhr
    // ganz — auf dem Handy ist die Desktop-Instanz zusätzlich nur per CSS versteckt
    // und tickte dort bislang unsichtbar mit.
    const tickMs = compact ? 15_000 : 1000;
    let id: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
      if (id) clearInterval(id);
      id = null;
    };
    const start = () => {
      if (id || document.visibilityState !== "visible") return;
      setNow(new Date());
      id = setInterval(() => setNow(new Date()), tickMs);
    };

    setNow(new Date());
    start();

    const onVisibility = () => (document.visibilityState === "visible" ? start() : stop());
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [compact]);

  if (!now) {
    // Kein Server/Client-Mismatch: erst nach Mount rendern.
    return compact ? null : (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Uhrzeit
        </p>
        <p className="mt-1 text-2xl font-bold text-slate-300 dark:text-slate-600">🇯🇵 –:–</p>
      </div>
    );
  }

  const jpTime = timeFmt(JP_TZ).format(now);
  const homeTime = timeFmt(HOME_TZ).format(now);
  const diffLabel = diffLabelOf(now);

  if (compact) {
    return (
      <span
        className="hidden items-center gap-1.5 rounded-md px-2 py-1 text-sm text-slate-600 dark:text-slate-300 md:inline-flex"
        title={`Japan (Tokio) · Zuhause ${diffLabel}`}
        aria-label={`Uhrzeit Japan ${jpTime}, Deutschland ${homeTime}`}
      >
        <span aria-hidden>🇯🇵</span>
        <span className="tabular-nums font-medium">{jpTime}</span>
        <span className="text-slate-300 dark:text-slate-600">·</span>
        <span aria-hidden>🇩🇪</span>
        <span className="tabular-nums">{homeTime}</span>
      </span>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
        Uhrzeit
      </p>
      {/* Japan: mit Flagge hinterlegt, groß */}
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl leading-none" aria-hidden>🇯🇵</span>
        <span className="text-3xl font-bold tabular-nums text-brand">
          {timeFmt(JP_TZ, true).format(now)}
        </span>
      </div>
      <p className="ml-9 text-xs text-slate-400 dark:text-slate-500">{dateFmt.format(now)}</p>
      {/* Deutschland darunter */}
      <div className="mt-2 flex items-baseline gap-2 border-t border-slate-100 pt-2 dark:border-slate-800">
        <span className="text-xl leading-none" aria-hidden>🇩🇪</span>
        <span className="text-lg font-semibold tabular-nums text-slate-700 dark:text-slate-200">
          {homeTime}
        </span>
        <span className="text-xs text-slate-400 dark:text-slate-500">Zuhause · {diffLabel}</span>
      </div>
    </div>
  );
}
