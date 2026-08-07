import Link from "next/link";

import { verifyEmailAction } from "@/app/actions/verify";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ResendVerification } from "@/components/ResendVerification";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ token?: string; status?: string }> };

/**
 * E-Mail-Bestätigung.
 *
 * Der Aufruf der Seite löst den Token **nicht** ein — das passiert erst beim Klick
 * auf den Button (Server Action, POST). Sonst verbrauchen Link-Scanner in
 * Mail-Gateways den Einmal-Token, bevor der Mensch ihn anklickt.
 */
export default async function VerifyPage({ searchParams }: Props) {
  const { token, status } = await searchParams;

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 shadow-sm">
        <div className="mb-6">
          <Logo height={40} priority />
          <h1 className="mt-4 text-xl text-slate-900 dark:text-slate-100">E-Mail bestätigen</h1>
        </div>

        {status === "ok" ? (
          <div className="space-y-4">
            <p className="rounded-md bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
              Deine E-Mail wurde bestätigt. Du kannst dich jetzt anmelden.
            </p>
            <Link
              href="/login"
              className="block rounded-md bg-brand px-4 py-2 text-center text-sm font-medium text-white transition hover:bg-brand-dark"
            >
              Zur Anmeldung
            </Link>
          </div>
        ) : status === "fail" || !token ? (
          <div className="space-y-4">
            <p className="rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              Dieser Bestätigungslink ist ungültig, abgelaufen oder wurde bereits verwendet.
            </p>
            <ResendVerification />
            <Link href="/login" className="block text-center text-sm text-brand hover:underline">
              Zur Anmeldung
            </Link>
          </div>
        ) : (
          <form action={verifyEmailAction} className="space-y-4">
            <input type="hidden" name="token" value={token} />
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Klicke auf den Knopf, um deine E-Mail-Adresse zu bestätigen.
            </p>
            <button
              type="submit"
              className="block w-full rounded-md bg-brand px-4 py-2 text-center text-sm font-medium text-white transition hover:bg-brand-dark"
            >
              E-Mail bestätigen
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
