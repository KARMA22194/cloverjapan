"use client";

import { useEffect, useRef, useState } from "react";

import { api } from "@/lib/api/client";
import { Input } from "@/components/ui/Field";

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
    // ⚠️ Bewusst **JPY→EUR**, obwohl hier „¥ pro €" angezeigt wird: derselbe
    // Aufruf, den alle anderen Ansichten machen (Ausgaben, Abrechnung, Zoll,
    // Wunschliste, Flüge). Vorher fragte diese Pille die Gegenrichtung ab — zwei
    // verschiedene URLs für denselben Kurs, also zwei Antworten im Browser-Cache
    // und auf jeder Geld-Seite zwei Function-Aufrufe statt einem. Der Kehrwert
    // kostet eine Division.
    api
      .get<{ rate: number }>("/api/v1/fx/rate?from=JPY&to=EUR")
      .then((d) => setRate(d.rate > 0 ? 1 / d.rate : null))
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
        className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink-muted ring-1 ring-hairline transition hover:text-brand hover:ring-brand/40"
      >
        <span aria-hidden>💶</span>
        <span className="tabular-nums">1&nbsp;€ = {Math.round(rate)}&nbsp;¥</span>
      </button>
      {open && (
        <div
          role="dialog"
          className="absolute right-0 top-full z-[1200] mt-2 w-60 rounded-card bg-surface p-3 ring-1 ring-hairline shadow-pop"
        >
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.09em] text-ink-subtle">
            Schnellrechner · 1&nbsp;€ = {fmt(rate)}&nbsp;¥
          </p>
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <span className="w-4 text-sm text-ink-subtle">€</span>
              <Input
                inputMode="decimal"
                value={eur}
                onChange={(e) => onEur(e.target.value)}
                placeholder="Euro"
                className="py-1.5 tabular-nums"
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="w-4 text-sm text-ink-subtle">¥</span>
              <Input
                inputMode="decimal"
                value={yen}
                onChange={(e) => onYen(e.target.value)}
                placeholder="Yen"
                className="py-1.5 tabular-nums"
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
