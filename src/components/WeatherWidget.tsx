"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { api } from "@/lib/api/client";
import { JP_CITIES, type Weather } from "@/lib/cities";

const wdFmt = new Intl.DateTimeFormat("de-DE", { weekday: "short", timeZone: "UTC" });
const weekday = (iso: string) => wdFmt.format(new Date(`${iso}T00:00:00Z`));

/** Kompaktes Tokio+Städte-Wetter für die Desktop-Seitenleiste. */
export function WeatherWidget() {
  const [data, setData] = useState<Record<string, Weather>>({});
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Ein Sammelabruf statt fünf Einzelrequests (fünf Function-Invocations je
    // Seitenaufruf, für Werte, die 15 Minuten stabil sind).
    const points = JP_CITIES.map((c) => `${c.lat},${c.lng}`).join(";");
    api
      .get<Weather[]>(`/api/v1/geo/weather?points=${encodeURIComponent(points)}`)
      .then((list) => {
        if (cancelled) return;
        setData(Object.fromEntries(JP_CITIES.map((c, i) => [c.key, list[i]]).filter(([, w]) => w)));
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const primary = data[JP_CITIES[0].key];

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
        Wetter · Japan
      </div>

      {error ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">Wetter nicht verfügbar.</p>
      ) : (
        <>
          <ul className="space-y-1.5">
            {JP_CITIES.map((c) => {
              const w = data[c.key];
              return (
                <li key={c.key} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-slate-600 dark:text-slate-300">{c.name}</span>
                  <span className="tabular-nums text-slate-800 dark:text-slate-100">
                    {w ? `${w.emoji} ${w.tempC}°` : "…"}
                  </span>
                </li>
              );
            })}
          </ul>

          {primary && primary.daily.length > 1 && (
            <div className="mt-3 border-t border-slate-100 dark:border-slate-800 pt-3">
              <div className="mb-1.5 text-[11px] font-medium text-slate-400 dark:text-slate-500">
                {JP_CITIES[0].name} · nächste Tage
              </div>
              <div className="flex justify-between gap-1">
                {primary.daily.slice(1).map((d) => (
                  <div key={d.date} className="flex flex-col items-center gap-0.5" title={d.text}>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                      {weekday(d.date)}
                    </span>
                    <span aria-hidden>{d.emoji}</span>
                    <span className="text-[11px] tabular-nums text-slate-700 dark:text-slate-200">
                      {d.max}°
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Link
            href="/info?tab=wetter"
            className="mt-3 block text-xs font-medium text-brand hover:underline"
          >
            Alle Vorhersagen →
          </Link>
        </>
      )}
    </div>
  );
}
