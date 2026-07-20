"use client";

import { useEffect, useRef, useState } from "react";

import { api } from "@/lib/api/client";

/**
 * Kompakte Wechselkurs-Pill für die TopNav: „1 € = X ¥" (Kurs keyfrei via
 * `fx/rate`). Klick öffnet einen kleinen bidirektionalen Umrechner (€ ↔ ¥) —
 * praktisch für schnelle Beträge an der Kasse. Schließt bei Klick außerhalb/Escape.
 */
export function FxPill() {
  const [rate, setRate] = useState<number | null>(null); // ¥ pro €
  const [open, setOpen] = useState(false);
  const [eur, setEur] = useState("");
  const [yen, setYen] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .get<{ rate: number }>("/api/v1/fx/rate?from=EUR&to=JPY")
      .then((d) => setRate(d.rate))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (rate === null) return null;

  const fmt = (n: number) =>
    n.toLocaleString("de-DE", { maximumFractionDigits: 2 });

  function onEur(v: string) {
    setEur(v);
    const n = parseFloat(v.replace(",", "."));
    setYen(Number.isFinite(n) && rate ? String(Math.round(n * rate)) : "");
  }
  function onYen(v: string) {
    setYen(v);
    const n = parseFloat(v.replace(",", "."));
    setEur(Number.isFinite(n) && rate ? fmt(n / rate) : "");
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Wechselkurs-Rechner öffnen"
        className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600 transition hover:border-brand hover:text-brand dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
      >
        <span aria-hidden>💶</span>
        <span className="tabular-nums">1&nbsp;€ = {Math.round(rate)}&nbsp;¥</span>
      </button>
      {open && (
        <div
          role="dialog"
          className="absolute right-0 top-full z-[1200] mt-1 w-56 rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            Schnellrechner · 1&nbsp;€ = {fmt(rate)}&nbsp;¥
          </p>
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <span className="w-4 text-sm text-slate-500 dark:text-slate-400">€</span>
              <input
                inputMode="decimal"
                value={eur}
                onChange={(e) => onEur(e.target.value)}
                placeholder="Euro"
                className="w-full rounded-md border border-slate-300 bg-transparent px-2 py-1 text-sm tabular-nums outline-none focus:border-brand dark:border-slate-600"
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="w-4 text-sm text-slate-500 dark:text-slate-400">¥</span>
              <input
                inputMode="decimal"
                value={yen}
                onChange={(e) => onYen(e.target.value)}
                placeholder="Yen"
                className="w-full rounded-md border border-slate-300 bg-transparent px-2 py-1 text-sm tabular-nums outline-none focus:border-brand dark:border-slate-600"
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
