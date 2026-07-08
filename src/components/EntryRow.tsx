"use client";

import { useActionState, useEffect, useState } from "react";
import {
  updateTimeEntryAction,
  deleteTimeEntryAction,
  type ActionState,
} from "@/app/actions/timeEntries";
import { SubmitButton } from "@/components/SubmitButton";
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

const initial: ActionState = { ok: false };

export function EntryRow({
  entry,
  dateParam,
  projects,
}: {
  entry: EntryData;
  dateParam: string;
  projects: ProjectOption[];
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState(updateTimeEntryAction, initial);

  // Nach erfolgreichem Speichern die Bearbeitung schließen.
  useEffect(() => {
    if (state.ok) setEditing(false);
  }, [state]);

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-3 last:border-b-0">
        <div className="min-w-0">
          <ProjectBadge {...entry.project} />
          {entry.note && <p className="mt-0.5 truncate text-sm text-slate-500">{entry.note}</p>}
        </div>
        <div className="flex items-center gap-3">
          <span className="tabular-nums text-sm font-medium text-slate-800">
            {entry.minutesLabel}
          </span>
          <button
            onClick={() => setEditing(true)}
            className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
          >
            Bearbeiten
          </button>
          <form action={deleteTimeEntryAction}>
            <input type="hidden" name="id" value={entry.id} />
            <input type="hidden" name="date" value={dateParam} />
            <button
              type="submit"
              className="rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50"
            >
              Löschen
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 last:border-b-0"
    >
      <input type="hidden" name="id" value={entry.id} />
      <input type="hidden" name="date" value={dateParam} />

      <div className="flex-1 min-w-[180px]">
        <label className="mb-1 block text-xs font-medium text-slate-600">Projekt</label>
        <select
          name="projectId"
          defaultValue={entry.projectId}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.code})
            </option>
          ))}
        </select>
      </div>

      <div className="w-24">
        <label className="mb-1 block text-xs font-medium text-slate-600">Stunden</label>
        <input
          name="hours"
          inputMode="decimal"
          defaultValue={String(entry.hours).replace(".", ",")}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
      </div>

      <div className="flex-1 min-w-[160px]">
        <label className="mb-1 block text-xs font-medium text-slate-600">Notiz</label>
        <input
          name="note"
          defaultValue={entry.note ?? ""}
          maxLength={500}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
      </div>

      <div className="flex items-center gap-2">
        <SubmitButton pendingLabel="…">Speichern</SubmitButton>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
        >
          Abbrechen
        </button>
      </div>

      {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
