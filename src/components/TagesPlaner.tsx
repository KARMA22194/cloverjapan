"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api/client";
import { useMembers } from "@/lib/useMembers";
import { todayParam } from "@/lib/time";
import {
  hasReminderPermission,
  requestReminderPermission,
  scheduleReminders,
} from "@/lib/reminders";
import { buttonClasses } from "@/components/ui/Button";
import { fieldClasses } from "@/components/ui/Field";
import { Chip } from "@/components/ui/Chip";
import { cn } from "@/lib/cn";

interface Task {
  id: string;
  time: string;
  text: string;
  done: boolean;
  by?: string;
  assignee?: string;
}

/**
 * Heutiger Tag in der **App-Zeitzone**.
 *
 * `toISOString()` liefert UTC: zwischen Mitternacht und 02:00 (Sommerzeit) zeigte
 * der Planer dadurch noch den Vortag, „Heute" schaltete auf nichts um, und
 * `scheduleReminders` verwarf alle Erinnerungen (dateISO !== todayISO).
 */
function todayISO(): string {
  return todayParam();
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
  const members = useMembers();

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
  }, []);

  function assign(id: string, name: string) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, assignee: name } : t)));
    api.patch(`/api/v1/planner-tasks/${id}`, { assigneeName: name }).catch(() => {});
  }

  // Erinnerungen (1 h vorher) neu planen, wenn sich Aufgaben/Datum/Freigabe ändern.
  // `scheduleReminders` ist async (dyn. Capacitor-Import) → das Cleanup muss SYNCHRON
  // greifen. Sonst ist beim Aufräumen `cleanup` fast immer noch undefined und alte
  // setTimeout-Timer bleiben liegen → dieselbe Erinnerung feuert n-fach (H5).
  useEffect(() => {
    const alive = { v: true };
    let cleanup: (() => void) | undefined;
    scheduleReminders(tasks, date).then((c) => {
      if (alive.v) cleanup = c;
      else c?.(); // Effekt schon aufgeräumt, bevor die Planung fertig war → sofort abräumen
    });
    return () => {
      alive.v = false;
      cleanup?.();
    };
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

  // `w-auto` hebt das `w-full` der Rezeptur auf — das Datumsfeld oben soll sich
  // nach seinem Inhalt richten. Die beiden Felder im Formular setzen `w-full`
  // wieder; dank tailwind-merge gewinnt dort die spätere Angabe.
  const inputClass = cn(fieldClasses, "w-auto");

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
          className={buttonClasses("secondary", "md", "px-3")}
        >
          Heute
        </button>
        {tasks.length > 0 && (
          <span className="text-sm text-ink-muted">
            {doneCount}/{tasks.length} erledigt
          </span>
        )}
        {remindersOn ? (
          <span className="text-xs text-ink-subtle">
            🔔 Erinnerung 1 h vorher aktiv
          </span>
        ) : (
          <button
            type="button"
            onClick={enableReminders}
            className={buttonClasses("secondary", "md", "px-3")}
          >
            🔔 Erinnerungen aktivieren
          </button>
        )}
      </div>

      <form
        onSubmit={add}
        className="mb-4 flex flex-wrap items-end gap-2 rounded-card border border-hairline bg-surface shadow-card p-3"
      >
        <div className="w-28">
          <label className="mb-1 block text-xs font-medium text-ink-muted">
            Uhrzeit
          </label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className={cn(inputClass, "w-full")}
          />
        </div>
        <div className="min-w-[160px] flex-1">
          <label className="mb-1 block text-xs font-medium text-ink-muted">
            Was steht an?
          </label>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="z. B. Meeting, Fuji besichtigen…"
            className={cn(inputClass, "w-full")}
          />
        </div>
        <button
          type="submit"
          disabled={!text.trim()}
          className={buttonClasses("primary", "md")}
        >
          Hinzufügen
        </button>
      </form>

      <div className="rounded-card border border-hairline bg-surface shadow-card">
        {sorted.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-subtle">
            Nichts geplant für diesen Tag.
          </p>
        ) : (
          sorted.map((t) => (
            <div
              key={t.id}
              // Wie in der Checkliste: umbruchfähige Zeile, damit Auswahl und
              // Knöpfe auf dem Handy umbrechen statt den Text zu zerquetschen.
              className="flex flex-wrap items-start gap-x-3 gap-y-2 border-b border-hairline px-4 py-2.5 last:border-b-0"
            >
              <input
                type="checkbox"
                checked={t.done}
                onChange={() => toggle(t.id, t.done)}
                aria-label={t.text}
                className="mt-1 h-4 w-4 shrink-0 accent-brand"
              />
              {t.time && (
                <span className="mt-0.5 w-12 shrink-0 tabular-nums text-sm text-ink-muted">
                  {t.time}
                </span>
              )}
              <div className="min-w-0 flex-1 basis-40">
                <span
                  className={`block break-words text-sm ${
                    t.done ? "text-ink-subtle line-through" : "text-ink"
                  }`}
                >
                  {t.text}
                </span>
                {(t.by || t.assignee) && (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {t.by && <span className="text-[11px] text-ink-subtle">· {t.by}</span>}
                    {t.assignee && <Chip tone="brand">👤 {t.assignee}</Chip>}
                  </div>
                )}
              </div>
              {members.length > 1 && (
                <select
                  value={t.assignee ?? ""}
                  onChange={(e) => assign(t.id, e.target.value)}
                  aria-label="Zuweisen"
                  // `w-auto` gegen das `w-full` der Rezeptur — sonst nimmt die
                  // Auswahl die ganze Zeile ein und kann wegen `shrink-0` nicht nachgeben.
                  className={cn(
                    fieldClasses,
                    "ml-auto w-auto max-w-40 shrink-0 px-1.5 py-1 text-xs text-ink-muted",
                  )}
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
              className="truncate border-b border-brand/10 px-4 py-2 text-sm text-ink-muted last:border-b-0"
              title={s.label}
            >
              {s.label.split(",").slice(0, 2).join(", ")}
            </p>
          ))}
        </div>
      )}

      <p className="mt-3 text-xs text-ink-subtle">
        Wird in deinem Konto gespeichert (pro Tag, gerätesynchron). Orte ordnest du im
        Reiseplaner einem Datum zu — sie erscheinen dann hier.
      </p>
    </div>
  );
}
