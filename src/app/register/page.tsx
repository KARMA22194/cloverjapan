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
      <div className="w-full max-w-sm rounded-card border border-hairline bg-surface p-8 shadow-card">
        <div className="mb-6">
          <Logo height={40} priority />
          <h1 className="mt-4 text-xl text-ink">Registrieren</h1>
          {!token && (
            <p className="text-sm text-ink-muted">
              Lege ein Konto an, um loszulegen.
            </p>
          )}
        </div>

        {invitation && token ? (
          // Gültige Einladung → Invite-Modus (Beitritt zur Reise des Einladenden).
          <RegisterForm
            token={token}
            email={invitation.email}
            invitedBy={invitation.invitedBy}
            tripName={invitation.tripName}
          />
        ) : (
          <div className="space-y-4">
            {token && (
              <p className="rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                Diese Einladung ist ungültig oder abgelaufen. Du kannst dir trotzdem unten ein
                eigenes Konto anlegen.
              </p>
            )}
            {/* Kein/ungültiger Token → offene Selbst-Registrierung (eigene Reise). */}
            <RegisterForm />
          </div>
        )}

        <p className="mt-6 text-center text-sm text-ink-muted">
          Schon ein Konto?{" "}
          <Link href="/login" className="font-medium text-brand hover:underline">
            Anmelden
          </Link>
        </p>
      </div>
    </div>
  );
}
