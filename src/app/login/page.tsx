"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { signIn } from "next-auth/react";
import { startAuthentication } from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { loginAction, type LoginState } from "@/app/actions/auth";
import { api } from "@/lib/api/client";
import { SubmitButton } from "@/components/SubmitButton";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { fieldClasses } from "@/components/ui/Field";
import { buttonClasses } from "@/components/ui/Button";

const initial: LoginState = {};

export default function LoginPage() {
  const [state, formAction] = useActionState(loginAction, initial);
  const [pkError, setPkError] = useState<string | null>(null);
  const [pkPending, setPkPending] = useState(false);

  async function passkeyLogin() {
    setPkPending(true);
    setPkError(null);
    try {
      // ⚠️ Siehe ProfileForm: ab SimpleWebAuthn 11 ist es ein Umschlag
      // `{ optionsJSON }`, und der von der Funktion abgeleitete Typ hätte den
      // Fehler verdeckt.
      const options = await api.get<PublicKeyCredentialRequestOptionsJSON>(
        "/api/v1/passkey/auth/options",
      );
      const authResp = await startAuthentication({ optionsJSON: options });
      const res = await signIn("passkey", {
        authResp: JSON.stringify(authResp),
        redirect: false,
      });
      if (res?.ok && !res.error) window.location.href = "/";
      else setPkError("Fingerabdruck-Anmeldung fehlgeschlagen.");
    } catch {
      setPkError("Kein Passkey verfügbar oder abgebrochen.");
    } finally {
      setPkPending(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm rounded-card border border-hairline bg-surface p-8 shadow-card">
        <div className="mb-6">
          <Logo height={40} priority />
          <h1 className="mt-4 text-xl text-ink">Clover Japan</h1>
          <p className="text-sm text-ink-muted">Bitte melde dich an.</p>
        </div>

        <form action={formAction} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-ink-muted">
              E-Mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className={fieldClasses}
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-ink-muted">
              Passwort
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className={fieldClasses}
            />
          </div>

          {state.error && (
            <p className="rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">{state.error}</p>
          )}

          <SubmitButton className="w-full" pendingLabel="Anmelden…">
            Anmelden
          </SubmitButton>

          <p className="text-center">
            <Link
              href="/forgot"
              className="text-xs text-ink-muted hover:text-brand hover:underline"
            >
              Passwort vergessen?
            </Link>
          </p>
        </form>

        <div className="my-4 flex items-center gap-3 text-xs text-ink-subtle">
          <span className="h-px flex-1 bg-hairline" />
          oder
          <span className="h-px flex-1 bg-hairline" />
        </div>

        <button
          type="button"
          onClick={passkeyLogin}
          disabled={pkPending}
          className={buttonClasses("secondary", "md", "w-full")}
        >
          {pkPending ? "…" : "🔒 Mit Fingerabdruck anmelden"}
        </button>
        {pkError && (
          <p className="mt-2 text-center text-sm text-red-600 dark:text-red-400">{pkError}</p>
        )}

        <p className="mt-6 text-center text-sm text-ink-muted">
          Noch kein Konto?{" "}
          <Link href="/register" className="font-medium text-brand hover:underline">
            Registrieren
          </Link>
        </p>
      </div>
    </div>
  );
}
