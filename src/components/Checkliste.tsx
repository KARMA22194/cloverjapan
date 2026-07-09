"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api/client";

interface Item {
  id: string;
  text: string;
  done: boolean;
  by?: string;
}

export function Checkliste() {
  const [items, setItems] = useState<Item[]>([]);
  const [text, setText] = useState("");

  useEffect(() => {
    api
      .get<Item[]>("/api/v1/checklist")
      .then(setItems)
      .catch(() => {});
  }, []);

  // Optimistisch aktualisieren + komplette Liste speichern (PUT-Replace).
  function save(next: Item[]) {
    setItems(next);
    // Antwort enthält den Ersteller-Namen (by) → State damit auffrischen.
    api
      .put<Item[]>("/api/v1/checklist", { items: next })
      .then(setItems)
      .catch(() => {});
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    save([...items, { id: crypto.randomUUID(), text: text.trim(), done: false }]);
    setText("");
  }

  const toggle = (id: string) =>
    save(items.map((it) => (it.id === id ? { ...it, done: !it.done } : it)));
  const remove = (id: string) => save(items.filter((it) => it.id !== id));
  const clearDone = () => save(items.filter((it) => !it.done));

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
              <div className="min-w-0 flex-1">
                <span
                  className={`text-sm ${
                    it.done
                      ? "text-slate-400 line-through dark:text-slate-500"
                      : "text-slate-800 dark:text-slate-100"
                  }`}
                >
                  {it.text}
                </span>
                {it.by && (
                  <span className="ml-2 text-[11px] text-slate-400 dark:text-slate-500">
                    · {it.by}
                  </span>
                )}
              </div>
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
        Wird in deinem Konto gespeichert (gerätesynchron).
      </p>
    </div>
  );
}
