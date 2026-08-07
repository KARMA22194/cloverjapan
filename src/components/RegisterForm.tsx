"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

import { api } from "@/lib/api/client";
import { buttonClasses } from "@/components/ui/Button";
import { fieldClasses } from "@/components/ui/Field";

interface Props {
  /** Bei Einladung gesetzt → Invite-Modus (E-Mail fix, Beitritt zur fremden Reise). */
  token?: string;
  /** Bei Einladung vorbelegte, nicht änderbare E-Mail. Im Selbst-Modus leer. */
  email?: string;
  invitedBy?: string;
  tripName?: string;
}

export function RegisterForm({ token, email: invitedEmail, invitedBy, tripName }: Props) {
  const isInvite = Boolean(token);
  const [email, setEmail] = useState(invitedEmail ?? "");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Nach Selbst-Registrierung: Bestätigungs-Hinweis (kein Auto-Login, da unbestätigt).
  const [done, setDone] = useState<{ email: string; emailSent: boolean; verifyUrl?: string } | null>(
    null,
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }
    if (password.length < 8) {
      setError("Passwort muss mindestens 8 Zeichen haben.");
      return;
    }

    setPending(true);
    try {
      if (isInvite) {
        // Invite-Modus: Einladung einlösen (Konto ist sofort bestätigt) → direkt anmelden.
        await api.post(`/api/v1/invite/${token}`, { name: name.trim(), password });
        const res = await signIn("credentials", { email: email.trim(), password, redirect: false });
        window.location.href = res?.ok && !res.error ? "/reiseplaner" : "/login";
      } else {
        // Selbst-Registrierung: Konto unbestätigt → Bestätigungs-Hinweis zeigen.
        const r = await api.post<{ email: string; emailSent: boolean; verifyUrl?: string }>(
          "/api/v1/register",
          { name: name.trim(), email: email.trim(), password },
        );
        setDone(r);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registrierung fehlgeschlagen.");
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4">
        <p className="rounded-md bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          {done.emailSent
            ? `Fast geschafft! Wir haben einen Bestätigungslink an ${done.email} geschickt. Bitte bestätige deine E-Mail und melde dich dann an.`
            : `Konto angelegt. Bitte bestätige deine E-Mail über den folgenden Link, dann kannst du dich anmelden:`}
        </p>
        {!done.emailSent && done.verifyUrl && (
          <a
            href={done.verifyUrl}
            className="block break-all rounded-md border border-brand/40 bg-brand-tint/30 dark:bg-brand/10 px-3 py-2 text-xs text-brand hover:underline"
          >
            {done.verifyUrl}
          </a>
        )}
        <a href="/login" className="block text-center text-sm text-brand hover:underline">
          Zur Anmeldung
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {isInvite && (
        <p className="rounded-md bg-brand-tint/40 dark:bg-brand/10 px-3 py-2 text-sm text-ink-muted">
          <strong>{invitedBy}</strong> hat dich zu <strong>{tripName}</strong> eingeladen. Lege ein
          Konto an, um gemeinsam zu planen.
        </p>
      )}

      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-ink-muted">
          E-Mail
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          readOnly={isInvite}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={
            isInvite
              ? "w-full cursor-not-allowed rounded-md border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink-muted outline-none"
              : fieldClasses
          }
        />
      </div>
      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium text-ink-muted">
          Name
        </label>
        <input
          id="name"
          type="text"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={fieldClasses}
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-ink-muted">
          Passwort
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={fieldClasses}
        />
      </div>
      <div>
        <label htmlFor="confirm" className="mb-1 block text-sm font-medium text-ink-muted">
          Passwort bestätigen
        </label>
        <input
          id="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={fieldClasses}
        />
      </div>

      {error && (
        <p className="rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className={buttonClasses("primary", "md", "w-full")}
      >
        {pending
          ? "Konto wird angelegt…"
          : isInvite
            ? "Konto erstellen & beitreten"
            : "Konto erstellen"}
      </button>
    </form>
  );
}
