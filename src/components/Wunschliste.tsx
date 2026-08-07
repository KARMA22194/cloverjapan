"use client";

import { useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api/client";
import { eurFmt, yenFmt } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";

interface Item {
  id: string;
  label: string;
  priceYen: number | null;
  bought: boolean;
  by?: string;
}


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
      <Card as="form" pad="sm" onSubmit={add} className="mb-4 flex gap-2">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="z. B. Gunpla, Kitkat, Kimono…"
          className="flex-1"
        />
        <Input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          inputMode="decimal"
          placeholder="¥"
          className="w-24 tabular-nums"
        />
        <Button type="submit" disabled={!label.trim()}>
          Hinzufügen
        </Button>
      </Card>

      <Card pad="none" className="overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-hairline bg-surface-2 px-4 py-2.5 text-sm">
          <span className="font-bold text-ink">Wunschliste ({items.length})</span>
          <span className="tabular-nums text-ink-muted">
            Summe {yenFmt.format(totals.all)}
            {eur(totals.all)}
          </span>
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-ink-subtle">
            Noch nichts auf der Liste. Was willst du in Japan kaufen?
          </p>
        ) : (
          <ul>
            {items.map((it) => (
              <li
                key={it.id}
                className="group/row flex items-center gap-3 border-b border-hairline px-4 py-2.5 transition last:border-b-0 hover:bg-surface-2"
              >
                <input
                  type="checkbox"
                  checked={it.bought}
                  onChange={() => toggleBought(it)}
                  className="h-4 w-4 accent-brand"
                  aria-label="Gekauft"
                />
                <span
                  className={`min-w-0 flex-1 truncate text-sm ${
                    it.bought ? "text-ink-subtle line-through" : "text-ink"
                  }`}
                >
                  {it.label}
                  {it.by && <span className="ml-2 text-[11px] text-ink-subtle">· {it.by}</span>}
                </span>
                {it.priceYen != null && (
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-ink-muted">
                    {yenFmt.format(it.priceYen)}
                  </span>
                )}
                {/* Löschen tritt erst beim Überfahren der Zeile hervor — auf
                    Touch-Geräten (kein Hover) bleibt es dauerhaft sichtbar. */}
                <button
                  type="button"
                  onClick={() => remove(it.id)}
                  aria-label="Entfernen"
                  className="shrink-0 rounded-[0.5rem] px-1.5 py-1 text-xs text-danger opacity-100 transition hover:bg-danger/10 md:opacity-0 md:group-hover/row:opacity-100 md:focus-visible:opacity-100"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="mt-3 text-xs text-ink-subtle">
        Tipp: Im Zollrechner kannst du die Summe als Warenwert übernehmen.
      </p>
    </div>
  );
}
