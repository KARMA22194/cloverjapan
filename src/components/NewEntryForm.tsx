"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api/client";

interface ProjectOption {
  id: string;
  name: string;
  code: string;
}

export function NewEntryForm({
  dateParam,
  projects,
}: {
  dateParam: string;
  projects: ProjectOption[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (projects.length === 0) {
    return (
      <p className="rounded-md bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
        Keine buchbaren Projekte vorhanden. Bitte einen Admin um die Anlage bitten.
      </p>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setPending(true);
    setError(null);
    try {
      await api.post("/api/v1/time-entries", {
        date: dateParam,
        projectId: String(fd.get("projectId") ?? ""),
        hours: String(fd.get("hours") ?? ""),
        note: String(fd.get("note") ?? ""),
      });
      form.reset();
      router.refresh(); // SSR-Seite mit frischen Daten neu rendern
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4"
    >
      <div className="flex-1 min-w-[180px]">
        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Projekt</label>
        <select
          name="projectId"
          required
          defaultValue=""
          className="w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm outline-none focus:border-brand"
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
        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Stunden</label>
        <input
          name="hours"
          inputMode="decimal"
          placeholder="z. B. 1,5"
          required
          className="w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </div>

      <div className="flex-1 min-w-[160px]">
        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Notiz (optional)</label>
        <input
          name="note"
          maxLength={500}
          className="w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Speichern…" : "Hinzufügen"}
      </button>

      {error && <p className="w-full text-sm text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}
