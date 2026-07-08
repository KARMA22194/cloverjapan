"use client";

import { useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api/client";
import {
  EXPENSE_CATEGORIES,
  EXPENSES_STORAGE_KEY,
  expenseCategoryMeta,
  type ExpenseCategoryValue,
  type ExpenseItem as Item,
} from "@/lib/expenses";

const STORAGE_KEY = EXPENSES_STORAGE_KEY;
const FALLBACK_RATE = 0.0058; // grober JPY→EUR-Fallback, falls der Dienst ausfällt

const eurFmt = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const yenFmt = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

export function ExpenseCalculator() {
  const [rate, setRate] = useState<number | null>(null);
  const [rateDate, setRateDate] = useState<string | null>(null);
  const [rateEstimated, setRateEstimated] = useState(false);

  const [items, setItems] = useState<Item[]>([]);
  const [persist, setPersist] = useState(true);
  const [loaded, setLoaded] = useState(false);

  const [yenInput, setYenInput] = useState("");
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<ExpenseCategoryValue>("ESSEN");

  // Kurs laden (mit Fallback).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get<{ rate: number; date: string | null }>(
          "/api/v1/fx/rate?from=JPY&to=EUR",
        );
        if (!cancelled) {
          setRate(r.rate);
          setRateDate(r.date);
        }
      } catch {
        if (!cancelled) {
          setRate(FALLBACK_RATE);
          setRateEstimated(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persistierte Rechnung laden.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw) as { persist?: boolean; items?: Item[] };
        if (Array.isArray(s.items)) setItems(s.items);
        if (typeof s.persist === "boolean") setPersist(s.persist);
      }
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  // Speichern nur, wenn der Schalter an ist; sonst nichts Dauerhaftes ablegen.
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ persist, items: persist ? items : [] }),
      );
    } catch {
      /* ignore */
    }
  }, [items, persist, loaded]);

  const parsedYen = Number(yenInput.replace(",", "."));
  const validYen = Number.isFinite(parsedYen) && parsedYen > 0;
  const eur = (yen: number) => (rate ? yen * rate : 0);

  const totals = useMemo(() => {
    const perCat = new Map<string, number>();
    let yen = 0;
    for (const it of items) {
      perCat.set(it.category, (perCat.get(it.category) ?? 0) + it.yen);
      yen += it.yen;
    }
    return { perCat, yen };
  }, [items]);

  function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!validYen) return;
    setItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), category, label: label.trim(), yen: parsedYen },
    ]);
    setYenInput("");
    setLabel("");
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  const inputClass =
    "w-full rounded-md border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-brand";

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(300px,1fr)_1.2fr]">
      {/* Eingabe */}
      <div className="flex flex-col gap-3">
        {/* Kurs-Banner */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-600 dark:text-slate-300">
          {rate === null ? (
            "Wechselkurs wird geladen…"
          ) : (
            <>
              Kurs: <span className="font-semibold">1.000 ¥ ≈ {eurFmt.format(1000 * rate)}</span>
              <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">
                {rateEstimated ? "(geschätzt – Dienst nicht erreichbar)" : rateDate ? `Stand: ${rateDate}` : ""}
              </span>
            </>
          )}
        </div>

        <form
          onSubmit={addItem}
          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3"
        >
          <div className="flex gap-2">
            <div className="w-32">
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Betrag (¥)
              </label>
              <input
                value={yenInput}
                onChange={(e) => setYenInput(e.target.value)}
                inputMode="decimal"
                placeholder="z. B. 1200"
                className={inputClass}
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Bezeichnung (optional)
              </label>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="z. B. Ramen, Gunpla…"
                className={inputClass}
              />
            </div>
          </div>

          <div className="mt-2">
            <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Kategorie
            </span>
            <div className="flex flex-wrap gap-1.5">
              {EXPENSE_CATEGORIES.map((c) => {
                const selected = c.value === category;
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setCategory(c.value)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium text-slate-700 transition ${
                      selected ? "border-slate-700 ring-1 ring-slate-700" : "border-black/10 hover:border-slate-400"
                    }`}
                    style={{ backgroundColor: c.color }}
                    aria-pressed={selected}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-sm text-slate-500 dark:text-slate-400">
              ={" "}
              <span className="font-semibold text-slate-800 dark:text-slate-100">
                {validYen ? eurFmt.format(eur(parsedYen)) : "0,00 €"}
              </span>
            </span>
            <button
              type="submit"
              disabled={!validYen}
              className="inline-flex items-center justify-center rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              Zur Rechnung
            </button>
          </div>
        </form>

        {/* Speichern-Schalter */}
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            checked={persist}
            onChange={(e) => setPersist(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-brand,#009bc9)]"
          />
          Rechnung speichern
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {persist ? "(bleibt nach Neuladen erhalten)" : "(nur diese Sitzung)"}
          </span>
        </label>
      </div>

      {/* Rechnung */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-3 py-2">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Rechnung ({items.length})
          </span>
          {items.length > 0 && (
            <button
              type="button"
              onClick={() => setItems([])}
              className="text-xs text-slate-500 transition hover:text-red-600 dark:text-slate-400"
            >
              Alles löschen
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
            Noch nichts erfasst. Betrag eingeben und „Zur Rechnung".
          </p>
        ) : (
          <ul>
            {items.map((it) => {
              const meta = expenseCategoryMeta(it.category);
              return (
                <li
                  key={it.id}
                  className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 px-3 py-2 last:border-b-0"
                >
                  <span
                    className="shrink-0 rounded-full border border-black/10 px-2 py-0.5 text-[11px] font-medium text-slate-700"
                    style={{ backgroundColor: meta.color }}
                  >
                    {meta.label}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">
                    {it.label || "—"}
                  </span>
                  <span className="shrink-0 text-right text-sm tabular-nums text-slate-500 dark:text-slate-400">
                    {yenFmt.format(it.yen)}
                  </span>
                  <span className="w-20 shrink-0 text-right text-sm font-medium tabular-nums text-slate-800 dark:text-slate-100">
                    {eurFmt.format(eur(it.yen))}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeItem(it.id)}
                    className="shrink-0 rounded px-1.5 py-1 text-xs text-red-600 transition hover:bg-red-500/10 dark:text-red-400"
                    aria-label="Entfernen"
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* Summen */}
        {items.length > 0 && (
          <div className="border-t border-slate-200 dark:border-slate-700 px-3 py-2">
            <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1">
              {EXPENSE_CATEGORIES.filter((c) => totals.perCat.has(c.value)).map((c) => {
                const y = totals.perCat.get(c.value) ?? 0;
                return (
                  <span key={c.value} className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <span className="h-2.5 w-2.5 rounded-sm border border-black/10" style={{ backgroundColor: c.color }} />
                    {c.label}: {eurFmt.format(eur(y))}
                  </span>
                );
              })}
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <span>Gesamt</span>
              <span className="tabular-nums">
                {yenFmt.format(totals.yen)} · {eurFmt.format(eur(totals.yen))}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
