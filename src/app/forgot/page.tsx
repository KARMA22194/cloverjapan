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
      <div className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 shadow-sm">
        <div className="mb-6">
          <Logo height={40} priority />
          <h1 className="mt-4 text-xl text-slate-900 dark:text-slate-100">Passwort vergessen</h1>
        </div>
        <ForgotForm />
      </div>
    </div>
  );
}
