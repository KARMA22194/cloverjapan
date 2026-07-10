import Link from "next/link";

import { consumeToken } from "@/lib/services/tokens";
import { markEmailVerified } from "@/lib/services/users";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ token?: string }> };

export default async function VerifyPage({ searchParams }: Props) {
  const { token } = await searchParams;

  // E-Mail-Bestätigung ist ein einmaliger Klick aus der Mail (GET) → hier einlösen.
  let success = false;
  if (token) {
    const userId = await consumeToken(token, "EMAIL_VERIFY");
    if (userId) {
      await markEmailVerified(userId);
      success = true;
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
          <h1 className="mt-4 text-xl text-slate-900 dark:text-slate-100">E-Mail bestätigen</h1>
        </div>

        {success ? (
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
        ) : (
          <div className="space-y-4">
            <p className="rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              Dieser Bestätigungslink ist ungültig, abgelaufen oder wurde bereits verwendet.
            </p>
            <Link href="/login" className="block text-center text-sm text-brand hover:underline">
              Zur Anmeldung
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
