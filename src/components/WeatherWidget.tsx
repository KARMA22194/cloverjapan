"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api/client";

// Tokio (Präfektur-Zentrum) — festes Reiseziel.
const TOKYO = { lat: 35.6762, lng: 139.6503 };

interface Weather {
  tempC: number;
  precipitation: number;
  text: string;
  emoji: string;
}

/** Aktuelles Wetter in Tokio (Open-Meteo). `big` für die eigene Wetter-Seite. */
export function WeatherWidget({ big = false }: { big?: boolean }) {
  const [w, setW] = useState<Weather | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<Weather>(`/api/v1/geo/weather?lat=${TOKYO.lat}&lng=${TOKYO.lng}`)
      .then((d) => !cancelled && setW(d))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
        Wetter · Tokio
      </div>
      {error ? (
        <p className="mt-2 text-sm text-slate-400 dark:text-slate-500">Wetter nicht verfügbar.</p>
      ) : !w ? (
        <p className="mt-2 text-sm text-slate-400 dark:text-slate-500">Lädt…</p>
      ) : (
        <>
          <div className="mt-1 flex items-center gap-3">
            <span className={big ? "text-6xl leading-none" : "text-4xl leading-none"} aria-hidden>
              {w.emoji}
            </span>
            <span
              className={`font-semibold tabular-nums text-slate-900 dark:text-slate-100 ${
                big ? "text-5xl" : "text-3xl"
              }`}
            >
              {w.tempC}°
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{w.text}</p>
          {w.precipitation > 0 && (
            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
              Niederschlag {w.precipitation} mm
            </p>
          )}
        </>
      )}
    </div>
  );
}
