"use client";

import { useState } from "react";
import Link from "next/link";

import { api } from "@/lib/api/client";

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await api.post("/api/v1/password/forgot", { email: email.trim() });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Anfrage fehlgeschlagen.");
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4">
        <p className="rounded-md bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          Falls ein Konto mit dieser E-Mail existiert, haben wir einen Link zum Zurücksetzen
          geschickt (1 Stunde gültig). Prüfe dein Postfach.
        </p>
        <Link href="/login" className="block text-center text-sm text-brand hover:underline">
          Zur Anmeldung
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Gib deine E-Mail ein — wir schicken dir einen Link zum Zurücksetzen.
      </p>
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
          E-Mail
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
      </div>
      {error && (
        <p className="rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || !email.trim()}
        className="inline-flex w-full items-center justify-center rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Wird gesendet…" : "Link anfordern"}
      </button>
      <Link href="/login" className="block text-center text-sm text-brand hover:underline">
        Zurück zur Anmeldung
      </Link>
    </form>
  );
}
