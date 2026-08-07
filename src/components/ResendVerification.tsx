"use client";

import { useState } from "react";

import { api } from "@/lib/api/client";
import { fieldClasses } from "@/components/ui/Field";
import { buttonClasses } from "@/components/ui/Button";

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
      <p className="rounded-md bg-surface-2 px-3 py-2 text-sm text-ink-muted">
        Falls für diese Adresse ein unbestätigtes Konto existiert, ist eine neue
        Bestätigungsmail unterwegs.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <label
        htmlFor="resend-email"
        className="block text-sm text-ink-muted"
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
        className={fieldClasses}
      />
      <button
        type="submit"
        disabled={busy}
        className={buttonClasses("secondary", "md", "w-full")}
      >
        {busy ? "Wird gesendet…" : "Link erneut senden"}
      </button>
    </form>
  );
}
