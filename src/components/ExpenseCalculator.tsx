"use client";

import { useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api/client";
import { eurFmt, yenFmt } from "@/lib/format";
import { resizeImage } from "@/lib/image";
import { useMembers } from "@/lib/useMembers";
import {
  EXPENSE_CATEGORIES,
  expenseCategoryMeta,
  type ExpenseCategoryValue,
  type ExpenseItem as Item,
} from "@/lib/expenses";

const FALLBACK_RATE = 0.0058; // grober JPY→EUR-Fallback, falls der Dienst ausfällt

/** Beleg-Bild client-seitig verkleinern → JPEG-Data-URL (max. 1000 px lange Kante). */
const resizeReceipt = (file: File) => resizeImage(file, { max: 1000, quality: 0.6 });


/** Donut aus Anteilen; 2px-Lücke zwischen Segmenten (Track scheint durch). */
function Donut({ segments }: { segments: { color: string; frac: number }[] }) {
  const size = 132;
  const stroke = 20;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Ausgaben nach Kategorie"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        className="stroke-slate-100 dark:stroke-slate-800"
      />
      {segments.map((s, i) => {
        const dash = Math.max(s.frac * c - 2, 0.001);
        const seg = (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${c - dash}`}
            strokeDashoffset={-acc * c}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        );
        acc += s.frac;
        return seg;
      })}
    </svg>
  );
}

/**
 * Horizontale Balken (eine Serie → eine Markenfarbe, keine Legende nötig). Wert
 * direkt an der Zeile beschriftet; recessiver Track. `frac` = Anteil am Maximum.
 */
function BarList({
  rows,
}: {
  rows: { label: string; value: string; frac: number; title?: string }[];
}) {
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} title={r.title}>
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate text-slate-600 dark:text-slate-300">{r.label}</span>
            <span className="shrink-0 tabular-nums font-medium text-slate-700 dark:text-slate-200">
              {r.value}
            </span>
          </div>
          <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-brand"
              style={{ width: `${Math.max(r.frac * 100, 2)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ExpenseCalculator() {
  const [rate, setRate] = useState<number | null>(null);
  const [rateDate, setRateDate] = useState<string | null>(null);
  const [rateEstimated, setRateEstimated] = useState(false);

  const [items, setItems] = useState<Item[]>([]);

  const [yenInput, setYenInput] = useState("");
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<ExpenseCategoryValue>("ESSEN");
  const [budget, setBudget] = useState("");
  const [catBudgets, setCatBudgets] = useState<Record<string, string>>({});
  const [receiptView, setReceiptView] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [pendingReceipt, setPendingReceipt] = useState<string | null>(null);

  const members = useMembers();
  const [paidById, setPaidById] = useState("");
  const [shared, setShared] = useState(true);

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

  // Ausgaben aus der (geteilten) Reise laden.
  useEffect(() => {
    api
      .get<Item[]>("/api/v1/expenses")
      .then(setItems)
      .catch(() => {});
  }, []);

  // Standard-Zahler = ich selbst, sobald die Mitglieder geladen sind.
  useEffect(() => {
    if (!paidById && members.length > 0) {
      const me = members.find((m) => m.isMe);
      if (me) setPaidById(me.id);
    }
  }, [members, paidById]);

  // Budget bleibt lokal (einzelner Wert). Laden beim Start; Speichern im onChange.
  useEffect(() => {
    try {
      const b = localStorage.getItem("japan-budget");
      if (b) setBudget(b);
      const cb = localStorage.getItem("japan-cat-budgets");
      if (cb) setCatBudgets(JSON.parse(cb));
    } catch {
      /* ignore */
    }
  }, []);

  function setCatBudget(cat: string, val: string) {
    setCatBudgets((prev) => {
      const next = { ...prev, [cat]: val };
      try {
        localStorage.setItem("japan-cat-budgets", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

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

  const budgetYen = Math.max(0, Math.round(Number(budget.replace(",", ".")) || 0));
  const pct = budgetYen > 0 ? Math.round((totals.yen / budgetYen) * 100) : 0;
  const over = budgetYen > 0 && totals.yen > budgetYen;
  const catBreakdown = EXPENSE_CATEGORIES.filter((c) => totals.perCat.has(c.value)).map((c) => {
    const yen = totals.perCat.get(c.value) ?? 0;
    return { ...c, yen, eur: eur(yen), frac: totals.yen > 0 ? yen / totals.yen : 0 };
  });

  // Wer hat wie viel bezahlt (nach paidById; Name über die Mitgliederliste).
  const perPerson = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) m.set(it.paidById ?? "?", (m.get(it.paidById ?? "?") ?? 0) + it.yen);
    const rows = [...m.entries()].map(([id, yen]) => ({
      name: members.find((x) => x.id === id)?.name ?? "Unbekannt",
      yen,
    }));
    return rows.sort((a, b) => b.yen - a.yen);
  }, [items, members]);

  // Ausgaben je Tag (aus createdAt), chronologisch — Verlauf über die Reise.
  const perDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) {
      const day = it.createdAt?.slice(0, 10);
      if (day) m.set(day, (m.get(day) ?? 0) + it.yen);
    }
    return [...m.entries()]
      .map(([day, yen]) => ({ day, yen }))
      .sort((a, b) => a.day.localeCompare(b.day));
  }, [items]);
  const maxPerson = Math.max(1, ...perPerson.map((p) => p.yen));
  const maxDay = Math.max(1, ...perDay.map((d) => d.yen));

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!validYen) return;
    try {
      const created = await api.post<Item>("/api/v1/expenses", {
        category,
        label: label.trim(),
        yen: Math.round(parsedYen),
        paidById: paidById || undefined,
        shared,
      });
      // Gescanntes Beleg-Foto automatisch an die neue Ausgabe hängen.
      let item = created;
      if (pendingReceipt) {
        await api.patch(`/api/v1/expenses/${created.id}`, { receipt: pendingReceipt }).catch(() => {});
        item = { ...created, hasReceipt: true };
        setPendingReceipt(null);
      }
      setItems((prev) => [...prev, item]);
      setYenInput("");
      setLabel("");
    } catch {
      /* ignore */
    }
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
    api.delete(`/api/v1/expenses/${id}`).catch(() => {});
  }

  async function scanReceipt(file: File) {
    setScanning(true);
    try {
      const dataUrl = await resizeReceipt(file);
      const r = await api.post<{ yen: number; category: ExpenseCategoryValue; label: string }>(
        "/api/v1/expenses/scan",
        { image: dataUrl },
      );
      if (r.yen > 0) setYenInput(String(r.yen));
      setCategory(r.category);
      if (r.label) setLabel(r.label);
      setPendingReceipt(dataUrl); // wird beim Speichern automatisch angehängt
    } catch {
      /* Fehlermeldung (z. B. kein API-Key) erscheint als Toast */
    } finally {
      setScanning(false);
    }
  }

  async function attachReceipt(id: string, file: File) {
    try {
      const dataUrl = await resizeReceipt(file);
      await api.patch(`/api/v1/expenses/${id}`, { receipt: dataUrl });
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, hasReceipt: true } : it)));
    } catch {
      /* ignore */
    }
  }

  async function viewReceipt(id: string) {
    try {
      const r = await api.get<{ receipt: string | null }>(`/api/v1/expenses/${id}`);
      if (r.receipt) setReceiptView(r.receipt);
    } catch {
      /* ignore */
    }
  }

  function clearAll() {
    setItems([]);
    api.delete("/api/v1/expenses").catch(() => {});
  }

  const inputClass =
    "w-full rounded-md border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-brand";

  return (
    <div className="space-y-6">
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
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-brand/50 bg-brand/10 px-3 py-2 text-sm font-medium text-brand transition hover:bg-brand/20">
              📸 {scanning ? "Beleg wird gelesen…" : "Beleg scannen"}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                disabled={scanning}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) scanReceipt(f);
                  e.target.value = "";
                }}
              />
            </label>
            {pendingReceipt && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400">
                Foto wird angehängt ✓
              </span>
            )}
          </div>

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

          {members.length > 1 && (
            <div className="mt-2 flex items-end gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Bezahlt von
                </label>
                <select
                  value={paidById}
                  onChange={(e) => setPaidById(e.target.value)}
                  className={inputClass}
                >
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {m.isMe ? " (ich)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <label
                className="flex shrink-0 cursor-pointer items-center gap-1.5 py-2 text-xs text-slate-600 dark:text-slate-300"
                title="Aus: persönliche Ausgabe, wird nicht in die Abrechnung aufgeteilt"
              >
                <input
                  type="checkbox"
                  checked={shared}
                  onChange={(e) => setShared(e.target.checked)}
                  className="h-4 w-4 accent-brand"
                />
                Auf alle aufteilen
              </label>
            </div>
          )}

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

        <p className="text-xs text-slate-400 dark:text-slate-500">
          Wird in der Reise gespeichert und mit eingeladenen Mitgliedern geteilt.
        </p>
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
              onClick={clearAll}
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
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-700 dark:text-slate-200">
                      {it.label || "—"}
                    </p>
                    {it.by && (
                      <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">
                        von {it.by}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-right text-sm tabular-nums text-slate-500 dark:text-slate-400">
                    {yenFmt.format(it.yen)}
                  </span>
                  <span className="w-20 shrink-0 text-right text-sm font-medium tabular-nums text-slate-800 dark:text-slate-100">
                    {eurFmt.format(eur(it.yen))}
                  </span>
                  {it.hasReceipt ? (
                    <button
                      type="button"
                      onClick={() => viewReceipt(it.id)}
                      title="Beleg ansehen"
                      aria-label="Beleg ansehen"
                      className="shrink-0 rounded px-1.5 py-1 text-xs text-brand transition hover:bg-brand/10"
                    >
                      📎
                    </button>
                  ) : (
                    <label
                      title="Beleg anhängen"
                      className="shrink-0 cursor-pointer rounded px-1.5 py-1 text-xs text-slate-400 transition hover:text-brand dark:text-slate-500"
                    >
                      📷
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) attachReceipt(it.id, f);
                        }}
                      />
                    </label>
                  )}
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

      {items.length > 0 && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <h2 className="mb-3 text-lg text-slate-900 dark:text-slate-100">Auswertung</h2>

          {/* Budget */}
          <div className="mb-4">
            <div className="mb-1.5 flex items-center gap-2">
              <label htmlFor="budget" className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Budget (¥)
              </label>
              <input
                id="budget"
                value={budget}
                onChange={(e) => {
                  setBudget(e.target.value);
                  try {
                    localStorage.setItem("japan-budget", e.target.value);
                  } catch {
                    /* ignore */
                  }
                }}
                inputMode="decimal"
                placeholder="z. B. 200000"
                className="w-32 rounded-md border border-slate-300 dark:border-slate-600 bg-transparent px-2 py-1 text-sm outline-none focus:border-brand"
              />
            </div>
            {budgetYen > 0 && (
              <>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(pct, 100)}%`,
                      backgroundColor: over ? "#e2001a" : "#009bc9",
                    }}
                  />
                </div>
                <p
                  className={`mt-1 text-xs ${
                    over ? "text-red-600 dark:text-red-400" : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {yenFmt.format(totals.yen)} von {yenFmt.format(budgetYen)} ({pct}%)
                  {over ? " — Budget überschritten!" : ` · ${yenFmt.format(budgetYen - totals.yen)} übrig`}
                </p>
              </>
            )}
          </div>

          {/* Donut + Legende */}
          <div className="flex flex-wrap items-center gap-6">
            <div className="relative">
              <Donut segments={catBreakdown.map((c) => ({ color: c.color, frac: c.frac }))} />
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[11px] text-slate-400 dark:text-slate-500">Gesamt</span>
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {eurFmt.format(eur(totals.yen))}
                </span>
              </div>
            </div>
            <ul className="min-w-[240px] flex-1 space-y-2">
              {catBreakdown.map((c) => {
                const cBudget = Math.max(
                  0,
                  Math.round(Number((catBudgets[c.value] ?? "").replace(",", ".")) || 0),
                );
                const cPct = cBudget > 0 ? Math.round((c.yen / cBudget) * 100) : 0;
                const cOver = cBudget > 0 && c.yen > cBudget;
                return (
                  <li key={c.value} className="text-sm">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 shrink-0 rounded-sm border border-black/10"
                        style={{ backgroundColor: c.color }}
                      />
                      <span className="text-slate-700 dark:text-slate-200">{c.label}</span>
                      <span className="ml-auto tabular-nums text-slate-500 dark:text-slate-400">
                        {eurFmt.format(c.eur)} · {Math.round(c.frac * 100)}%
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 pl-5">
                      <input
                        value={catBudgets[c.value] ?? ""}
                        onChange={(e) => setCatBudget(c.value, e.target.value)}
                        inputMode="decimal"
                        placeholder="Budget ¥"
                        aria-label={`Budget für ${c.label} (¥)`}
                        className="w-24 rounded border border-slate-300 dark:border-slate-600 bg-transparent px-1.5 py-0.5 text-xs outline-none focus:border-brand"
                      />
                      {cBudget > 0 && (
                        <div className="flex flex-1 items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <div
                              className={`h-full rounded-full ${cOver ? "bg-danger" : "bg-brand"}`}
                              style={{ width: `${Math.min(cPct, 100)}%` }}
                            />
                          </div>
                          <span
                            className={`shrink-0 text-[11px] tabular-nums ${
                              cOver
                                ? "text-red-600 dark:text-red-400"
                                : "text-slate-400 dark:text-slate-500"
                            }`}
                          >
                            {cPct}%
                          </span>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Wer hat bezahlt (nur sinnvoll ab 2 Zahlern) */}
          {perPerson.length > 1 && (
            <div className="mt-5">
              <p className="mb-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                Wer hat bezahlt
              </p>
              <BarList
                rows={perPerson.map((p) => ({
                  label: p.name,
                  value: `${yenFmt.format(p.yen)} · ${eurFmt.format(eur(p.yen))}`,
                  frac: p.yen / maxPerson,
                  title: `${p.name}: ${yenFmt.format(p.yen)}`,
                }))}
              />
            </div>
          )}

          {/* Verlauf: Ausgaben je Tag (ab 2 Tagen) */}
          {perDay.length > 1 && (
            <div className="mt-5">
              <p className="mb-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                Ausgaben je Tag
              </p>
              <BarList
                rows={perDay.map((d) => ({
                  label: new Date(`${d.day}T00:00:00Z`).toLocaleDateString("de-DE", {
                    weekday: "short",
                    day: "2-digit",
                    month: "2-digit",
                    timeZone: "UTC",
                  }),
                  value: `${yenFmt.format(d.yen)} · ${eurFmt.format(eur(d.yen))}`,
                  frac: d.yen / maxDay,
                  title: `${d.day}: ${yenFmt.format(d.yen)}`,
                }))}
              />
            </div>
          )}
        </div>
      )}

      {receiptView && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setReceiptView(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Beleg"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={receiptView}
            alt="Beleg"
            className="max-h-[90vh] max-w-full rounded-lg shadow-xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setReceiptView(null)}
            aria-label="Schließen"
            className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1 text-sm font-medium text-slate-800 shadow"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
