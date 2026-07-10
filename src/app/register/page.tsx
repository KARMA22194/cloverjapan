import Link from "next/link";

import { getValidInvitation } from "@/lib/services/trip";
import { RegisterForm } from "@/components/RegisterForm";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ token?: string }> };

export default async function RegisterPage({ searchParams }: Props) {
  const { token } = await searchParams;
  const invitation = token ? await getValidInvitation(token) : null;

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 shadow-sm">
        <div className="mb-6">
          <Logo height={40} priority />
          <h1 className="mt-4 text-xl text-slate-900 dark:text-slate-100">Registrieren</h1>
        </div>

        {invitation && token ? (
          <RegisterForm
            token={token}
            email={invitation.email}
            invitedBy={invitation.invitedBy}
            tripName={invitation.tripName}
          />
        ) : (
          <div className="space-y-4">
            <p className="rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              Diese Einladung ist ungültig oder abgelaufen. Bitte die einladende Person um einen
              neuen Link.
            </p>
            <Link
              href="/login"
              className="block text-center text-sm text-brand hover:underline"
            >
              Zur Anmeldung
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
