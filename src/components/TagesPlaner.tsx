"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api/client";
import {
  hasReminderPermission,
  requestReminderPermission,
  scheduleReminders,
} from "@/lib/reminders";

interface Task {
  id: string;
  time: string;
  text: string;
  done: boolean;
  by?: string;
  assignee?: string;
}
interface Member {
  id: string;
  name: string;
  isMe: boolean;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TagesPlaner() {
  const [date, setDate] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [time, setTime] = useState("");
  const [text, setText] = useState("");
  const [remindersOn, setRemindersOn] = useState(false);
  // Status der Ort-Übernahme in den Reiseplaner, je Aufgabe.
  const [toTrip, setToTrip] = useState<Record<string, "pending" | "done" | "none">>({});
  // Reiseplaner-Stopps, die diesem Tag zugeordnet sind.
  const [dayStops, setDayStops] = useState<{ id: string; label: string }[]>([]);
  const [members, setMembers] = useState<Member[]>([]);

  function refreshDayStops(d: string) {
    if (!d) return;
    api
      .get<{ id: string; label: string }[]>(`/api/v1/trip-stops?date=${d}`)
      .then(setDayStops)
      .catch(() => setDayStops([]));
  }

  useEffect(() => {
    setDate(todayISO());
    hasReminderPermission().then(setRemindersOn);
    api
      .get<{ members: Member[] }>("/api/v1/trip/members")
      .then((r) => setMembers(r.members))
      .catch(() => {});
  }, []);

  function assign(id: string, name: string) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, assignee: name } : t)));
    api.patch(`/api/v1/planner-tasks/${id}`, { assigneeName: name }).catch(() => {});
  }

  // Erinnerungen (1 h vorher) neu planen, wenn sich Aufgaben/Datum/Freigabe ändern.
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    scheduleReminders(tasks, date).then((c) => {
      cleanup = c;
    });
    return () => cleanup?.();
  }, [tasks, date, remindersOn]);

  async function enableReminders() {
    setRemindersOn(await requestReminderPermission());
  }

  // Beim Datumswechsel aus dem Konto laden.
  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    api
      .get<Task[]>(`/api/v1/planner-tasks?date=${date}`)
      .then((t) => {
        if (!cancelled) setTasks(t);
      })
      .catch(() => {
        if (!cancelled) setTasks([]);
      });
    api
      .get<{ id: string; label: string }[]>(`/api/v1/trip-stops?date=${date}`)
      .then((s) => {
        if (!cancelled) setDayStops(s);
      })
      .catch(() => {
        if (!cancelled) setDayStops([]);
      });
    return () => {
      cancelled = true;
    };
  }, [date]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      const t = await api.post<Task>("/api/v1/planner-tasks", { date, time, text: text.trim() });
      setTasks((prev) => [...prev, t]);
      setTime("");
      setText("");
    } catch {
      /* ignore */
    }
  }

  function toggle(id: string, done: boolean) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !done } : t)));
    api.patch(`/api/v1/planner-tasks/${id}`, { done: !done }).catch(() => {});
  }

  function remove(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    api.delete(`/api/v1/planner-tasks/${id}`).catch(() => {});
  }

  // Aufgabentext als Ort erkennen (Geocoding) und in den Reiseplaner übernehmen.
  async function toReiseplaner(task: Task) {
    if (toTrip[task.id] === "pending" || toTrip[task.id] === "done") return;
    setToTrip((s) => ({ ...s, [task.id]: "pending" }));
    try {
      // Mit dem aktuellen Reisetag verknüpfen → erscheint gleich unter „Orte an diesem Tag".
      await api.post("/api/v1/trip-stops/from-text", { q: task.text, date });
      setToTrip((s) => ({ ...s, [task.id]: "done" }));
      refreshDayStops(date);
    } catch {
      setToTrip((s) => ({ ...s, [task.id]: "none" }));
    }
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
        {remindersOn ? (
          <span className="text-xs text-slate-400 dark:text-slate-500">
            🔔 Erinnerung 1 h vorher aktiv
          </span>
        ) : (
          <button
            type="button"
            onClick={enableReminders}
            className="rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 transition hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            🔔 Erinnerungen aktivieren
          </button>
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
                onChange={() => toggle(t.id, t.done)}
                className="h-4 w-4 accent-[#009bc9]"
              />
              {t.time && (
                <span className="w-12 shrink-0 tabular-nums text-sm text-slate-500 dark:text-slate-400">
                  {t.time}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <span
                  className={`text-sm ${
                    t.done
                      ? "text-slate-400 line-through dark:text-slate-500"
                      : "text-slate-800 dark:text-slate-100"
                  }`}
                >
                  {t.text}
                </span>
                {t.by && (
                  <span className="ml-2 text-[11px] text-slate-400 dark:text-slate-500">
                    · {t.by}
                  </span>
                )}
                {t.assignee && (
                  <span className="ml-2 rounded bg-brand-tint/60 px-1.5 py-0.5 text-[11px] text-brand-dark dark:bg-brand/20 dark:text-brand-tint">
                    👤 {t.assignee}
                  </span>
                )}
              </div>
              {members.length > 1 && (
                <select
                  value={t.assignee ?? ""}
                  onChange={(e) => assign(t.id, e.target.value)}
                  aria-label="Zuweisen"
                  className="shrink-0 rounded border border-slate-300 dark:border-slate-600 bg-transparent px-1 py-0.5 text-xs text-slate-500 dark:text-slate-400 outline-none focus:border-brand"
                >
                  <option value="">— niemand</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.name}>
                      {m.name}
                      {m.isMe ? " (ich)" : ""}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={() => toReiseplaner(t)}
                disabled={toTrip[t.id] === "pending" || toTrip[t.id] === "done"}
                title="Ort erkennen und in den Reiseplaner übernehmen"
                className={`shrink-0 rounded px-2 py-1 text-xs font-medium transition disabled:cursor-default ${
                  toTrip[t.id] === "done"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : toTrip[t.id] === "none"
                      ? "text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
                      : "text-brand hover:bg-brand/10"
                }`}
              >
                {toTrip[t.id] === "pending"
                  ? "…"
                  : toTrip[t.id] === "done"
                    ? "✓ Im Reiseplaner"
                    : toTrip[t.id] === "none"
                      ? "Kein Ort ✗"
                      : "📍 In Reiseplaner"}
              </button>
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

      {dayStops.length > 0 && (
        <div className="mt-4 rounded-lg border border-brand/30 bg-brand-tint/20 dark:bg-brand/5">
          <div className="border-b border-brand/20 px-4 py-2 text-sm font-medium text-brand-dark dark:text-brand-tint">
            📍 Orte an diesem Tag ({dayStops.length})
          </div>
          {dayStops.map((s) => (
            <p
              key={s.id}
              className="truncate border-b border-brand/10 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 last:border-b-0"
              title={s.label}
            >
              {s.label.split(",").slice(0, 2).join(", ")}
            </p>
          ))}
        </div>
      )}

      <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
        Wird in deinem Konto gespeichert (pro Tag, gerätesynchron). Orte ordnest du im
        Reiseplaner einem Datum zu — sie erscheinen dann hier.
      </p>
    </div>
  );
}
