"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api/client";

const buttonClass =
  "rounded-md border border-hairline px-3 py-1 text-xs text-ink-muted transition hover:bg-surface-2 disabled:opacity-50";

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
