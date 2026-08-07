"use client";

import { useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api/client";
import { deDate, yenFmt } from "@/lib/format";

interface Booking {
  id: string;
  title: string;
  kind: string;
  date?: string | null;
  time: string;
  ref: string;
  url: string;
  note: string;
  priceYen: number | null;
  by?: string;
}

const KINDS: { value: string; label: string; emoji: string }[] = [
  { value: "TICKET", label: "Ticket", emoji: "🎟️" },
  { value: "RESTAURANT", label: "Restaurant", emoji: "🍜" },
  { value: "AKTIVITAET", label: "Aktivität", emoji: "🎪" },
  { value: "TRANSPORT", label: "Transport", emoji: "🚄" },
  { value: "SONSTIGES", label: "Sonstiges", emoji: "📌" },
];
const kindMeta = (v: string) => KINDS.find((k) => k.value === v) ?? KINDS[KINDS.length - 1];


const inputClass =
  "w-full rounded-md border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-brand";

export function BookingPlanner() {
  const [items, setItems] = useState<Booking[]>([]);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("TICKET");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [ref, setRef] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Booking[]>("/api/v1/bookings")
      .then(setItems)
      .catch(() => {});
  }, []);

  // Zeitkonflikte: Buchungen mit Datum+Uhrzeit, die am selben Tag < 60 min auseinander liegen.
  const conflicts = useMemo(() => {
    const toMin = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
    };
    const byDay = new Map<string, { id: string; min: number }[]>();
    for (const b of items) {
      if (!b.date || !b.time) continue;
      const min = toMin(b.time);
      if (min === null) continue;
      const list = byDay.get(b.date) ?? [];
      list.push({ id: b.id, min });
      byDay.set(b.date, list);
    }
    const set = new Set<string>();
    for (const list of byDay.values()) {
      list.sort((a, b) => a.min - b.min);
      for (let i = 1; i < list.length; i++) {
        if (list[i].min - list[i - 1].min < 60) {
          set.add(list[i].id);
          set.add(list[i - 1].id);
        }
      }
    }
    return set;
  }, [items]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const yen = Math.round(Number(price.replace(",", ".")) || 0);
      const created = await api.post<Booking>("/api/v1/bookings", {
        title: title.trim(),
        kind,
        date: date || null,
        time: time || "",
        ref: ref.trim(),
        url: url.trim(),
        note: note.trim(),
        priceYen: yen > 0 ? yen : undefined,
      });
      setItems((prev) => [...prev, created]);
      setTitle("");
      setDate("");
      setTime("");
      setRef("");
      setUrl("");
      setNote("");
      setPrice("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Konnte nicht speichern.");
    } finally {
      setSaving(false);
    }
  }

  function remove(id: string) {
    const snapshot = items;
    setItems((prev) => prev.filter((b) => b.id !== id));
    api.delete(`/api/v1/bookings/${id}`).catch(() => setItems(snapshot));
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(280px,1fr)_1.4fr]">
      {/* Formular */}
      <form
        onSubmit={add}
        className="space-y-2 self-start rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3"
      >
        <div>
          <label htmlFor="buchung-titel" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
            Titel
          </label>
          <input id="buchung-titel"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="z. B. teamLab Planets"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="buchung-art" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
            Art
          </label>
          <select id="buchung-art" value={kind} onChange={(e) => setKind(e.target.value)} className={inputClass}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.emoji} {k.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <label htmlFor="buchung-datum" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Datum
            </label>
            <input id="buchung-datum" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </div>
          <div className="w-28">
            <label htmlFor="buchung-uhrzeit" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Uhrzeit
            </label>
            <input id="buchung-uhrzeit" type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
          </div>
        </div>

        <div>
          <label htmlFor="buchung-bestaetigungsnummer" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
            Bestätigungsnummer
          </label>
          <input id="buchung-bestaetigungsnummer"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder="z. B. ABC-123456"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="buchung-link" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
            Link (optional)
          </label>
          <input id="buchung-link"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="buchung-preis-fliesst-in-die-ausgaben" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
            Preis (¥, optional) — fließt in die Ausgaben
          </label>
          <input id="buchung-preis-fliesst-in-die-ausgaben"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            placeholder="z. B. 3900"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="buchung-notiz" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
            Notiz (optional)
          </label>
          <textarea id="buchung-notiz"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-md border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={saving || !title.trim()}
          className="w-full rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "…" : "Buchung hinzufügen"}
        </button>
      </form>

      {/* Liste */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="border-b border-slate-100 dark:border-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200">
          Buchungen ({items.length})
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
            Noch keine Buchungen. Erfasse links deine Tickets & Reservierungen.
          </p>
        ) : (
          <ul>
            {items.map((b) => {
              const meta = kindMeta(b.kind);
              return (
                <li
                  key={b.id}
                  className="border-b border-slate-100 dark:border-slate-800 px-4 py-3 last:border-b-0"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                        {meta.emoji} {b.title}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {meta.label}
                        {b.date && ` · ${deDate(b.date)}`}
                        {b.time && ` · ${b.time}`}
                        {b.priceYen ? ` · ${yenFmt.format(b.priceYen)}` : ""}
                      </p>
                      {conflicts.has(b.id) && (
                        <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
                          ⚠ Zeitlich knapp zu einer anderen Buchung am selben Tag
                        </p>
                      )}
                      {b.ref && (
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          Nr.: <span className="font-mono">{b.ref}</span>
                        </p>
                      )}
                      {b.url && (
                        <a
                          href={b.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-0.5 inline-block text-xs text-brand hover:underline"
                        >
                          Buchung öffnen →
                        </a>
                      )}
                      {b.note && (
                        <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{b.note}</p>
                      )}
                      {b.by && (
                        <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">von {b.by}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(b.id)}
                      aria-label={`Buchung „${b.title}" entfernen`}
                      className="shrink-0 rounded px-2 py-1 text-xs text-red-600 transition hover:bg-red-500/10 dark:text-red-400"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
