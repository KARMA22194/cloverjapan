"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { api } from "@/lib/api/client";
import { JP_CITIES, type Weather } from "@/lib/cities";
import { Card, CardLabel } from "@/components/ui/Card";

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
      // Einzelne Städte können null sein (Ausfall bei genau dieser Position).
      .get<(Weather | null)[]>(`/api/v1/geo/weather?points=${encodeURIComponent(points)}`)
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
    <Card pad="lg">
      <CardLabel className="mb-3">Wetter · Japan</CardLabel>

      {error ? (
        <p className="text-sm text-ink-subtle">Wetter nicht verfügbar.</p>
      ) : (
        <>
          <ul className="-mx-1.5 space-y-0.5">
            {JP_CITIES.map((c) => {
              const w = data[c.key];
              return (
                <li
                  key={c.key}
                  className="flex items-center justify-between gap-2 rounded-[0.5rem] px-1.5 py-1 text-sm transition hover:bg-surface-2"
                >
                  <span className="text-ink-muted">{c.name}</span>
                  <span className="font-bold tabular-nums text-ink">
                    {w ? `${w.emoji} ${w.tempC}°` : "…"}
                  </span>
                </li>
              );
            })}
          </ul>

          {primary && primary.daily.length > 1 && (
            <div className="mt-4 border-t border-hairline pt-3">
              <div className="mb-2 text-[11px] font-semibold text-ink-subtle">
                {JP_CITIES[0].name} · nächste Tage
              </div>
              <div className="flex justify-between gap-1">
                {primary.daily.slice(1).map((d) => (
                  <div
                    key={d.date}
                    className="flex flex-1 flex-col items-center gap-0.5 rounded-[0.5rem] py-1 transition hover:bg-surface-2"
                    title={d.text}
                  >
                    <span className="text-[11px] text-ink-subtle">{weekday(d.date)}</span>
                    <span aria-hidden>{d.emoji}</span>
                    <span className="text-[11px] font-bold tabular-nums text-ink">{d.max}°</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Link
            href="/info?tab=wetter"
            className="mt-4 inline-block text-xs font-bold text-brand transition hover:opacity-70"
          >
            Alle Vorhersagen →
          </Link>
        </>
      )}
    </Card>
  );
}
