"use client";

import { useState } from "react";

import { api } from "@/lib/api/client";

/**
 * „Bestätigungsmail erneut senden" — Ausweg, wenn der Einmal-Token abgelaufen ist
 * oder ein Link-Scanner ihn verbraucht hat.
 *
 * Die Rückmeldung ist bewusst immer dieselbe (wie bei „Passwort vergessen"),
 * damit sich über dieses Formular keine vorhandenen Konten abfragen lassen.
 */
export function ResendVerification() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    try {
      await api.post("/api/v1/verify/resend", { email: email.trim() });
    } catch {
      /* generisch bleiben – der Toast des api-Clients meldet echte Fehler */
    } finally {
      setBusy(false);
      setSent(true);
    }
  }

  if (sent) {
    return (
      <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        Falls für diese Adresse ein unbestätigtes Konto existiert, ist eine neue
        Bestätigungsmail unterwegs.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <label
        htmlFor="resend-email"
        className="block text-sm text-slate-600 dark:text-slate-300"
      >
        Neuen Bestätigungslink anfordern
      </label>
      <input
        id="resend-email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="deine@email.de"
        className="w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-brand dark:border-slate-600"
      />
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        {busy ? "Wird gesendet…" : "Link erneut senden"}
      </button>
    </form>
  );
}
