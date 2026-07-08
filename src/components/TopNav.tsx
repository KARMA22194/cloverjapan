"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";
import { Logo } from "@/components/Logo";

interface NavLink {
  href: string;
  label: string;
  match: string; // Präfix zum Aktiv-Markieren
}

export function TopNav({
  links,
  userName,
  isAdmin,
}: {
  links: NavLink[];
  userName: string;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const allLinks = isAdmin
    ? [...links, { href: "/admin", label: "Admin", match: "/admin" }]
    : links;

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-5">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Zeiterfassung – Startseite">
            <Logo height={26} priority />
            <span className="hidden border-l border-slate-200 pl-2.5 text-sm font-medium text-slate-500 sm:inline">
              Zeiterfassung
            </span>
          </Link>
          <nav className="flex gap-1">
            {allLinks.map((link) => {
              const active = pathname.startsWith(link.match);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    active
                      ? "bg-brand-tint text-brand-dark"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600">{userName}</span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100"
            >
              Abmelden
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
