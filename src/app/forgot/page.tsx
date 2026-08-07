import { ForgotForm } from "@/components/ForgotForm";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

export const dynamic = "force-dynamic";

export default function ForgotPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm rounded-card border border-hairline bg-surface p-8 shadow-card">
        <div className="mb-6">
          <Logo height={40} priority />
          <h1 className="mt-4 text-xl text-ink">Passwort vergessen</h1>
        </div>
        <ForgotForm />
      </div>
    </div>
  );
}
