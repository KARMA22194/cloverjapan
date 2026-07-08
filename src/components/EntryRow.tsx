"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api/client";
import { ProjectBadge } from "@/components/ProjectBadge";

interface ProjectOption {
  id: string;
  name: string;
  code: string;
  color: string;
}

export interface EntryData {
  id: string;
  projectId: string;
  hours: number;
  hoursLabel: string;
  minutesLabel: string;
  note: string | null;
  project: ProjectOption;
}

export function EntryRow({
  entry,
  dateParam,
  projects,
}: {
  entry: EntryData;
  dateParam: string;
  projects: ProjectOption[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      await api.patch(`/api/v1/time-entries/${entry.id}`, {
        projectId: String(fd.get("projectId") ?? ""),
        hours: String(fd.get("hours") ?? ""),
        note: String(fd.get("note") ?? ""),
      });
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern.");
    } finally {
      setPending(false);
    }
  }

  async function onDelete() {
    setPending(true);
    setError(null);
    try {
      await api.delete(`/api/v1/time-entries/${entry.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Löschen.");
      setPending(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 px-4 py-3 last:border-b-0">
        <div className="min-w-0">
          <ProjectBadge {...entry.project} />
          {entry.note && <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">{entry.note}</p>}
          {error && <p className="mt-0.5 text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
        <div className="flex items-center gap-3">
          <span className="tabular-nums text-sm font-medium text-slate-800 dark:text-slate-100">
            {entry.minutesLabel}
          </span>
          <button
            onClick={() => setEditing(true)}
            className="rounded-md px-2 py-1 text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Bearbeiten
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            className="rounded-md px-2 py-1 text-xs text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50"
          >
            Löschen
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={onUpdate}
      className="flex flex-wrap items-end gap-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-4 py-3 last:border-b-0"
    >
      <input type="hidden" name="date" value={dateParam} />

      <div className="flex-1 min-w-[180px]">
        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Projekt</label>
        <select
          name="projectId"
          defaultValue={entry.projectId}
          className="w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm outline-none focus:border-brand"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.code})
            </option>
          ))}
        </select>
      </div>

      <div className="w-24">
        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Stunden</label>
        <input
          name="hours"
          inputMode="decimal"
          defaultValue={String(entry.hours).replace(".", ",")}
          className="w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </div>

      <div className="flex-1 min-w-[160px]">
        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Notiz</label>
        <input
          name="note"
          defaultValue={entry.note ?? ""}
          maxLength={500}
          className="w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "…" : "Speichern"}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setError(null);
          }}
          className="rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          Abbrechen
        </button>
      </div>

      {error && <p className="w-full text-sm text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}
