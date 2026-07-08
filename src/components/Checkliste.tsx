"use client";

import { useEffect, useState } from "react";

interface Item {
  id: string;
  text: string;
  done: boolean;
}

const STORAGE_KEY = "checkliste";

export function Checkliste() {
  const [items, setItems] = useState<Item[]>([]);
  const [text, setText] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw) as Item[]);
    } catch {
      /* ignore */
    }
  }, []);

  function persist(next: Item[]) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const next = [...items, { id: crypto.randomUUID(), text: text.trim(), done: false }];
    setItems(next);
    persist(next);
    setText("");
  }

  function toggle(id: string) {
    const next = items.map((it) => (it.id === id ? { ...it, done: !it.done } : it));
    setItems(next);
    persist(next);
  }

  function remove(id: string) {
    const next = items.filter((it) => it.id !== id);
    setItems(next);
    persist(next);
  }

  function clearDone() {
    const next = items.filter((it) => !it.done);
    setItems(next);
    persist(next);
  }

  const doneCount = items.filter((it) => it.done).length;

  return (
    <div className="max-w-xl">
      <form
        onSubmit={add}
        className="mb-4 flex gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Neuer Punkt… (z. B. Reisepass, Adapter, JR-Pass)"
          className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="shrink-0 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          Hinzufügen
        </button>
      </form>

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-4 py-2">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {items.length === 0 ? "Checkliste" : `${doneCount}/${items.length} erledigt`}
          </span>
          {doneCount > 0 && (
            <button
              type="button"
              onClick={clearDone}
              className="text-xs text-slate-500 transition hover:text-red-600 dark:text-slate-400"
            >
              Erledigte löschen
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
            Noch keine Punkte. Füge oben etwas hinzu.
          </p>
        ) : (
          items.map((it) => (
            <div
              key={it.id}
              className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 px-4 py-2.5 last:border-b-0"
            >
              <input
                type="checkbox"
                checked={it.done}
                onChange={() => toggle(it.id)}
                className="h-4 w-4 accent-[#009bc9]"
              />
              <span
                className={`min-w-0 flex-1 text-sm ${
                  it.done
                    ? "text-slate-400 line-through dark:text-slate-500"
                    : "text-slate-800 dark:text-slate-100"
                }`}
              >
                {it.text}
              </span>
              <button
                type="button"
                onClick={() => remove(it.id)}
                className="shrink-0 rounded px-1.5 py-1 text-xs text-red-600 transition hover:bg-red-500/10 dark:text-red-400"
                aria-label="Entfernen"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>

      <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
        Wird lokal in diesem Browser gespeichert.
      </p>
    </div>
  );
}
