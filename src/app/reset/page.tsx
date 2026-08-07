import Link from "next/link";

import { ResetForm } from "@/components/ResetForm";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ token?: string }> };

export default async function ResetPage({ searchParams }: Props) {
  const { token } = await searchParams;

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm rounded-card border border-hairline bg-surface p-8 shadow-card">
        <div className="mb-6">
          <Logo height={40} priority />
          <h1 className="mt-4 text-xl text-ink">Neues Passwort</h1>
        </div>
        {token ? (
          <ResetForm token={token} />
        ) : (
          <div className="space-y-4">
            <p className="rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              Kein gültiges Token. Fordere einen neuen Link an.
            </p>
            <Link href="/forgot" className="block text-center text-sm text-brand hover:underline">
              Link erneut anfordern
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
