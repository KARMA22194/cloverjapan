"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api/client";
import { fieldClasses } from "@/components/ui/Field";
import { buttonClasses } from "@/components/ui/Button";

const inputClass = fieldClasses;
const submitClass = buttonClasses("primary", "md");

export function UserCreateForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setPending(true);
    setError(null);
    try {
      await api.post("/api/v1/users", {
        name: String(fd.get("name") ?? ""),
        email: String(fd.get("email") ?? ""),
        password: String(fd.get("password") ?? ""),
        role: String(fd.get("role") ?? "USER"),
      });
      form.reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Anlegen.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-wrap items-end gap-3 rounded-card border border-hairline bg-surface shadow-card p-4"
    >
      <div className="flex-1 min-w-[140px]">
        <label className="mb-1 block text-xs font-medium text-ink-muted">Name</label>
        <input name="name" required className={inputClass} />
      </div>
      <div className="flex-1 min-w-[160px]">
        <label className="mb-1 block text-xs font-medium text-ink-muted">E-Mail</label>
        <input name="email" type="email" required className={inputClass} />
      </div>
      <div className="w-36">
        <label className="mb-1 block text-xs font-medium text-ink-muted">Passwort</label>
        <input name="password" type="text" required className={inputClass} />
      </div>
      <div className="w-32">
        <label className="mb-1 block text-xs font-medium text-ink-muted">Rolle</label>
        <select name="role" defaultValue="USER" className={inputClass}>
          <option value="USER">Nutzer</option>
          <option value="ADMIN">Admin</option>
        </select>
      </div>
      <button type="submit" disabled={pending} className={submitClass}>
        {pending ? "…" : "Nutzer anlegen"}
      </button>
      {error && <p className="w-full text-sm text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}
