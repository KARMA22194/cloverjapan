"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { signIn } from "next-auth/react";
import { startAuthentication } from "@simplewebauthn/browser";
import { loginAction, type LoginState } from "@/app/actions/auth";
import { api } from "@/lib/api/client";
import { SubmitButton } from "@/components/SubmitButton";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

const initial: LoginState = {};

export default function LoginPage() {
  const [state, formAction] = useActionState(loginAction, initial);
  const [pkError, setPkError] = useState<string | null>(null);
  const [pkPending, setPkPending] = useState(false);

  async function passkeyLogin() {
    setPkPending(true);
    setPkError(null);
    try {
      const options = await api.get<Parameters<typeof startAuthentication>[0]>(
        "/api/v1/passkey/auth/options",
      );
      const authResp = await startAuthentication(options);
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
      <div className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 shadow-sm">
        <div className="mb-6">
          <Logo height={40} priority />
          <h1 className="mt-4 text-xl text-slate-900 dark:text-slate-100">Clover Japan</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Bitte melde dich an.</p>
        </div>

        <form action={formAction} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
              E-Mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Passwort
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
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
              className="text-xs text-slate-500 hover:text-brand hover:underline dark:text-slate-400"
            >
              Passwort vergessen?
            </Link>
          </p>
        </form>

        <div className="my-4 flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
          <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
          oder
          <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        </div>

        <button
          type="button"
          onClick={passkeyLogin}
          disabled={pkPending}
          className="w-full rounded-md border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 transition hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60"
        >
          {pkPending ? "…" : "🔒 Mit Fingerabdruck anmelden"}
        </button>
        {pkError && (
          <p className="mt-2 text-center text-sm text-red-600 dark:text-red-400">{pkError}</p>
        )}

        <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-300">
          Noch kein Konto?{" "}
          <Link href="/register" className="font-medium text-brand hover:underline">
            Registrieren
          </Link>
        </p>
      </div>
    </div>
  );
}
