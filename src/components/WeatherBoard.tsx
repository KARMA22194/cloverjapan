"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api/client";
import { JP_CITIES, type Weather } from "@/lib/cities";

const wdFmt = new Intl.DateTimeFormat("de-DE", { weekday: "short", timeZone: "UTC" });
const weekday = (iso: string) => wdFmt.format(new Date(`${iso}T00:00:00Z`));

/** Wetter-Board: eine Karte je Stadt mit aktuellem Wetter + 5-Tage-Vorhersage. */
export function WeatherBoard() {
  const [data, setData] = useState<Record<string, Weather | "error" | undefined>>({});

  useEffect(() => {
    let cancelled = false;
    // Ein Sammelabruf statt einem Request je Stadt.
    const points = JP_CITIES.map((c) => `${c.lat},${c.lng}`).join(";");
    api
      // Einzelne Städte können null sein (Ausfall bei genau dieser Position).
      .get<(Weather | null)[]>(`/api/v1/geo/weather?points=${encodeURIComponent(points)}`)
      .then((list) => {
        if (cancelled) return;
        setData(Object.fromEntries(JP_CITIES.map((c, i) => [c.key, list[i] ?? "error"])));
      })
      .catch(() => {
        if (cancelled) return;
        setData(Object.fromEntries(JP_CITIES.map((c) => [c.key, "error" as const])));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {JP_CITIES.map((c) => {
        const w = data[c.key];
        return (
          <div
            key={c.key}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm"
          >
            <h2 className="text-base font-medium text-slate-900 dark:text-slate-100">{c.name}</h2>

            {w === "error" ? (
              <p className="mt-2 text-sm text-slate-400 dark:text-slate-500">
                Wetter nicht verfügbar.
              </p>
            ) : !w ? (
              <p className="mt-2 text-sm text-slate-400 dark:text-slate-500">Lädt…</p>
            ) : (
              <>
                <div className="mt-1 flex items-center gap-3">
                  <span className="text-5xl leading-none" aria-hidden>
                    {w.emoji}
                  </span>
                  <div>
                    <div className="text-4xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {w.tempC}°
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-300">{w.text}</div>
                  </div>
                </div>

                <div className="mt-4 flex justify-between gap-1 border-t border-slate-100 dark:border-slate-800 pt-3">
                  {w.daily.map((d, i) => (
                    <div key={d.date} className="flex flex-col items-center gap-1" title={d.text}>
                      <span className="text-[11px] text-slate-400 dark:text-slate-500">
                        {i === 0 ? "Heute" : weekday(d.date)}
                      </span>
                      <span className="text-lg" aria-hidden>
                        {d.emoji}
                      </span>
                      <span className="text-xs tabular-nums text-slate-800 dark:text-slate-100">
                        {d.max}°
                      </span>
                      <span className="text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
                        {d.min}°
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
