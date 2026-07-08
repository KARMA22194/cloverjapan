"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api/client";

const inputClass =
  "w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm outline-none focus:border-brand";

const submitClass =
  "inline-flex items-center justify-center rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60";

export function ProjectCreateForm() {
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
      await api.post("/api/v1/projects", {
        name: String(fd.get("name") ?? ""),
        code: String(fd.get("code") ?? ""),
        color: String(fd.get("color") ?? "#3b82f6"),
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
      className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4"
    >
      <div className="flex-1 min-w-[160px]">
        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Name</label>
        <input name="name" required className={inputClass} />
      </div>
      <div className="w-32">
        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Kürzel</label>
        <input name="code" required placeholder="z. B. WEB" className={inputClass} />
      </div>
      <div className="w-20">
        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Farbe</label>
        <input
          name="color"
          type="color"
          defaultValue="#3b82f6"
          className="h-[38px] w-full rounded-md border border-slate-300 dark:border-slate-600"
        />
      </div>
      <button type="submit" disabled={pending} className={submitClass}>
        {pending ? "…" : "Projekt anlegen"}
      </button>
      {error && <p className="w-full text-sm text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}

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
        role: String(fd.get("role") ?? "EMPLOYEE"),
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
      className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4"
    >
      <div className="flex-1 min-w-[140px]">
        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Name</label>
        <input name="name" required className={inputClass} />
      </div>
      <div className="flex-1 min-w-[160px]">
        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">E-Mail</label>
        <input name="email" type="email" required className={inputClass} />
      </div>
      <div className="w-36">
        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Passwort</label>
        <input name="password" type="text" required className={inputClass} />
      </div>
      <div className="w-32">
        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Rolle</label>
        <select name="role" defaultValue="EMPLOYEE" className={inputClass}>
          <option value="EMPLOYEE">Employee</option>
          <option value="MANAGER">Manager</option>
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
