"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api/client";
import { JP_CITIES, type Weather } from "@/lib/cities";
import { Card } from "@/components/ui/Card";

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
          <Card key={c.key} pad="lg">
            <h2 className="text-base text-ink">{c.name}</h2>

            {w === "error" ? (
              <p className="mt-2 text-sm text-ink-subtle">
                Wetter nicht verfügbar.
              </p>
            ) : !w ? (
              <p className="mt-2 text-sm text-ink-subtle">Lädt…</p>
            ) : (
              <>
                <div className="mt-1 flex items-center gap-3">
                  <span className="text-5xl leading-none" aria-hidden>
                    {w.emoji}
                  </span>
                  <div>
                    <div className="text-4xl font-semibold tabular-nums text-ink">
                      {w.tempC}°
                    </div>
                    <div className="text-sm text-ink-muted">{w.text}</div>
                  </div>
                </div>

                <div className="mt-4 flex justify-between gap-1 border-t border-hairline pt-3">
                  {w.daily.map((d, i) => (
                    <div
                      key={d.date}
                      className="flex flex-1 flex-col items-center gap-1 rounded-[0.5rem] py-1 transition hover:bg-surface-2"
                      title={d.text}
                    >
                      <span className="text-[11px] font-semibold text-ink-subtle">
                        {i === 0 ? "Heute" : weekday(d.date)}
                      </span>
                      <span className="text-lg" aria-hidden>
                        {d.emoji}
                      </span>
                      <span className="text-xs font-bold tabular-nums text-ink">{d.max}°</span>
                      <span className="text-[11px] tabular-nums text-ink-subtle">{d.min}°</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        );
      })}
    </div>
  );
}
