"use client";

import { useEffect, useState } from "react";

interface Task {
  id: string;
  time: string; // "HH:MM" oder ""
  text: string;
  done: boolean;
}

const keyFor = (date: string) => `tagesplaner:${date}`;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TagesPlaner() {
  const [date, setDate] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [time, setTime] = useState("");
  const [text, setText] = useState("");

  // Auf heute initialisieren (clientseitig).
  useEffect(() => {
    setDate(todayISO());
  }, []);

  // Beim Datumswechsel laden.
  useEffect(() => {
    if (!date) return;
    try {
      const raw = localStorage.getItem(keyFor(date));
      setTasks(raw ? (JSON.parse(raw) as Task[]) : []);
    } catch {
      setTasks([]);
    }
  }, [date]);

  // Persistenz direkt in den Handlern (vermeidet Race beim Datumswechsel).
  function persist(next: Task[]) {
    try {
      localStorage.setItem(keyFor(date), JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const next = [...tasks, { id: crypto.randomUUID(), time, text: text.trim(), done: false }];
    setTasks(next);
    persist(next);
    setTime("");
    setText("");
  }

  function toggle(id: string) {
    const next = tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
    setTasks(next);
    persist(next);
  }

  function remove(id: string) {
    const next = tasks.filter((t) => t.id !== id);
    setTasks(next);
    persist(next);
  }

  const sorted = [...tasks].sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
  const doneCount = tasks.filter((t) => t.done).length;

  const inputClass =
    "rounded-md border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-brand";

  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={inputClass}
        />
        <button
          type="button"
          onClick={() => setDate(todayISO())}
          className="rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 transition hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          Heute
        </button>
        {tasks.length > 0 && (
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {doneCount}/{tasks.length} erledigt
          </span>
        )}
      </div>

      <form
        onSubmit={add}
        className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3"
      >
        <div className="w-28">
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
            Uhrzeit
          </label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className={`w-full ${inputClass}`}
          />
        </div>
        <div className="min-w-[160px] flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
            Was steht an?
          </label>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="z. B. Meeting, Fuji besichtigen…"
            className={`w-full ${inputClass}`}
          />
        </div>
        <button
          type="submit"
          disabled={!text.trim()}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          Hinzufügen
        </button>
      </form>

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        {sorted.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
            Nichts geplant für diesen Tag.
          </p>
        ) : (
          sorted.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 px-4 py-2.5 last:border-b-0"
            >
              <input
                type="checkbox"
                checked={t.done}
                onChange={() => toggle(t.id)}
                className="h-4 w-4 accent-[#009bc9]"
              />
              {t.time && (
                <span className="w-12 shrink-0 tabular-nums text-sm text-slate-500 dark:text-slate-400">
                  {t.time}
                </span>
              )}
              <span
                className={`min-w-0 flex-1 text-sm ${
                  t.done
                    ? "text-slate-400 line-through dark:text-slate-500"
                    : "text-slate-800 dark:text-slate-100"
                }`}
              >
                {t.text}
              </span>
              <button
                type="button"
                onClick={() => remove(t.id)}
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
        Wird lokal in diesem Browser gespeichert (pro Tag).
      </p>
    </div>
  );
}
