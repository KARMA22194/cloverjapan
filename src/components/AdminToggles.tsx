"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api/client";

const buttonClass =
  "rounded-md border border-slate-300 dark:border-slate-600 px-3 py-1 text-xs text-slate-600 dark:text-slate-300 transition hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50";

/** Projekt archivieren/reaktivieren (PATCH /api/v1/projects/{id}). */
export function ProjectArchiveButton({ id, archived }: { id: string; archived: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function toggle() {
    setPending(true);
    try {
      await api.patch(`/api/v1/projects/${id}`, { archived: !archived });
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Aktion fehlgeschlagen.");
      setPending(false);
    }
  }

  return (
    <button type="button" onClick={toggle} disabled={pending} className={buttonClass}>
      {archived ? "Reaktivieren" : "Archivieren"}
    </button>
  );
}

/** Nutzer aktivieren/deaktivieren (PATCH /api/v1/users/{id}). */
export function UserActiveButton({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function toggle() {
    setPending(true);
    try {
      await api.patch(`/api/v1/users/${id}`, { active: !active });
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Aktion fehlgeschlagen.");
      setPending(false);
    }
  }

  return (
    <button type="button" onClick={toggle} disabled={pending} className={buttonClass}>
      {active ? "Deaktivieren" : "Aktivieren"}
    </button>
  );
}
