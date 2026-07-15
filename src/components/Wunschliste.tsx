"use client";

import { useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api/client";

interface Item {
  id: string;
  label: string;
  priceYen: number | null;
  bought: boolean;
  by?: string;
}

const yenFmt = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});
const eurFmt = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

export function Wunschliste() {
  const [items, setItems] = useState<Item[]>([]);
  const [label, setLabel] = useState("");
  const [price, setPrice] = useState("");
  const [rate, setRate] = useState<number | null>(null);

  useEffect(() => {
    api
      .get<Item[]>("/api/v1/wishlist")
      .then(setItems)
      .catch(() => {});
    api
      .get<{ rate: number }>("/api/v1/fx/rate?from=JPY&to=EUR")
      .then((r) => setRate(r.rate))
      .catch(() => {});
  }, []);

  const totals = useMemo(() => {
    let all = 0;
    let open = 0;
    for (const it of items) {
      const p = it.priceYen ?? 0;
      all += p;
      if (!it.bought) open += p;
    }
    return { all, open };
  }, [items]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    const yen = Math.round(Number(price.replace(",", ".")) || 0);
    try {
      const created = await api.post<Item>("/api/v1/wishlist", {
        label: label.trim(),
        priceYen: yen > 0 ? yen : undefined,
      });
      setItems((prev) => [...prev, created]);
      setLabel("");
      setPrice("");
    } catch {
      /* ignore */
    }
  }

  function toggleBought(it: Item) {
    setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, bought: !x.bought } : x)));
    api.patch(`/api/v1/wishlist/${it.id}`, { bought: !it.bought }).catch(() => {});
  }

  function remove(id: string) {
    const snapshot = items;
    setItems((prev) => prev.filter((x) => x.id !== id));
    api.delete(`/api/v1/wishlist/${id}`).catch(() => setItems(snapshot));
  }

  const eur = (yen: number) => (rate ? ` · ${eurFmt.format(yen * rate)}` : "");

  return (
    <div className="max-w-xl">
      <form
        onSubmit={add}
        className="mb-4 flex gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3"
      >
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="z. B. Gunpla, Kitkat, Kimono…"
          className="flex-1 rounded-md border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          inputMode="decimal"
          placeholder="¥"
          className="w-24 rounded-md border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <button
          type="submit"
          disabled={!label.trim()}
          className="shrink-0 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          Hinzufügen
        </button>
      </form>

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-4 py-2 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-200">
            Wunschliste ({items.length})
          </span>
          <span className="text-slate-500 dark:text-slate-400">
            Summe {yenFmt.format(totals.all)}
            {eur(totals.all)}
          </span>
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
            Noch nichts auf der Liste. Was willst du in Japan kaufen?
          </p>
        ) : (
          <ul>
            {items.map((it) => (
              <li
                key={it.id}
                className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 px-4 py-2.5 last:border-b-0"
              >
                <input
                  type="checkbox"
                  checked={it.bought}
                  onChange={() => toggleBought(it)}
                  className="h-4 w-4 accent-[#009bc9]"
                  aria-label="Gekauft"
                />
                <span
                  className={`min-w-0 flex-1 truncate text-sm ${
                    it.bought
                      ? "text-slate-400 line-through dark:text-slate-500"
                      : "text-slate-800 dark:text-slate-100"
                  }`}
                >
                  {it.label}
                  {it.by && (
                    <span className="ml-2 text-[11px] text-slate-400 dark:text-slate-500">· {it.by}</span>
                  )}
                </span>
                {it.priceYen != null && (
                  <span className="shrink-0 text-sm tabular-nums text-slate-500 dark:text-slate-400">
                    {yenFmt.format(it.priceYen)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => remove(it.id)}
                  aria-label="Entfernen"
                  className="shrink-0 rounded px-1.5 py-1 text-xs text-red-600 transition hover:bg-red-500/10 dark:text-red-400"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
        Tipp: Im Zollrechner kannst du die Summe als Warenwert übernehmen.
      </p>
    </div>
  );
}
