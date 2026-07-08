"use client";

import { useActionState, useEffect, useRef } from "react";
import { createTimeEntryAction, type ActionState } from "@/app/actions/timeEntries";
import { SubmitButton } from "@/components/SubmitButton";

interface ProjectOption {
  id: string;
  name: string;
  code: string;
}

const initial: ActionState = { ok: false };

export function NewEntryForm({
  dateParam,
  projects,
}: {
  dateParam: string;
  projects: ProjectOption[];
}) {
  const [state, formAction] = useActionState(createTimeEntryAction, initial);
  const formRef = useRef<HTMLFormElement>(null);

  // Nach erfolgreichem Anlegen die Eingaben zurücksetzen.
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  if (projects.length === 0) {
    return (
      <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
        Keine buchbaren Projekte vorhanden. Bitte einen Admin um die Anlage bitten.
      </p>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4"
    >
      <input type="hidden" name="date" value={dateParam} />

      <div className="flex-1 min-w-[180px]">
        <label className="mb-1 block text-xs font-medium text-slate-600">Projekt</label>
        <select
          name="projectId"
          required
          defaultValue=""
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        >
          <option value="" disabled>
            Projekt wählen…
          </option>
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
          placeholder="z. B. 1,5"
          required
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
      </div>

      <div className="flex-1 min-w-[160px]">
        <label className="mb-1 block text-xs font-medium text-slate-600">Notiz (optional)</label>
        <input
          name="note"
          maxLength={500}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
      </div>

      <SubmitButton pendingLabel="Speichern…">Hinzufügen</SubmitButton>

      {state.error && (
        <p className="w-full text-sm text-red-600">{state.error}</p>
      )}
    </form>
  );
}
