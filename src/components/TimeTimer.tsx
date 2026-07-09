"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api/client";

interface Running {
  projectId: string;
  startTs: number;
  dateParam: string;
}

const STORAGE_KEY = "timetracker-timer";

export function TimeTimer({
  projects,
  dateParam,
}: {
  projects: { id: string; name: string; code: string }[];
  dateParam: string;
}) {
  const router = useRouter();
  const [running, setRunning] = useState<Running | null>(null);
  const [projectId, setProjectId] = useState("");
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);

  // Laufenden Timer wiederherstellen (übersteht Reload/Navigation).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setRunning(JSON.parse(raw) as Running);
    } catch {
      /* ignore */
    }
  }, []);

  // Sekundentakt, solange der Timer läuft.
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  if (projects.length === 0) return null;

  function start() {
    const r: Running = { projectId: projectId || projects[0].id, startTs: Date.now(), dateParam };
    setRunning(r);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(r));
    } catch {
      /* ignore */
    }
  }

  function discard() {
    setRunning(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  async function stop() {
    if (!running) return;
    setBusy(true);
    const mins = Math.min(24 * 60, Math.max(1, Math.round((Date.now() - running.startTs) / 60000)));
    try {
      await api.post("/api/v1/time-entries", {
        date: running.dateParam,
        projectId: running.projectId,
        hours: mins / 60,
        note: "",
      });
      discard();
      router.refresh();
    } catch {
      setBusy(false);
    }
  }

  const elapsed = running ? Math.max(0, Math.floor((now - running.startTs) / 1000)) : 0;
  const hh = String(Math.floor(elapsed / 3600)).padStart(2, "0");
  const mm = String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  const runningProject = running ? projects.find((p) => p.id === running.projectId) : null;

  const btnPrimary =
    "rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
      {running ? (
        <>
          <span className="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" aria-hidden />
          <span className="text-sm text-slate-700 dark:text-slate-200">
            {runningProject ? runningProject.name : "Timer"}
          </span>
          <span className="tabular-nums text-lg font-semibold text-slate-900 dark:text-slate-100">
            {hh}:{mm}:{ss}
          </span>
          {running.dateParam !== dateParam && (
            <span className="text-xs text-slate-400 dark:text-slate-500">({running.dateParam})</span>
          )}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={stop} disabled={busy} className={btnPrimary}>
              {busy ? "…" : "■ Stop & buchen"}
            </button>
            <button
              type="button"
              onClick={discard}
              className="rounded-md border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 transition hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Verwerfen
            </button>
          </div>
        </>
      ) : (
        <>
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Timer</span>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="rounded-md border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-brand"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.code})
              </option>
            ))}
          </select>
          <button type="button" onClick={start} className={btnPrimary}>
            ▶ Start
          </button>
        </>
      )}
    </div>
  );
}
