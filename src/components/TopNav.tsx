"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

interface NavLink {
  href: string;
  label: string;
  match: string;
}

export function TopNav({
  links,
  secondaryLinks,
  userName,
  isAdmin,
}: {
  links: NavLink[];
  secondaryLinks: NavLink[];
  userName: string;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const primary = isAdmin
    ? [...links, { href: "/admin", label: "Admin", match: "/admin" }]
    : links;

  const renderLink = (link: NavLink) => {
    const active = pathname.startsWith(link.match);
    return (
      <Link
        key={link.href}
        href={link.href}
        className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
          active
            ? "bg-brand-tint text-brand-dark"
            : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        }`}
      >
        {link.label}
      </Link>
    );
  };

  return (
    <header className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Startseite">
            <Logo height={26} priority />
          </Link>
          {/* Bereich „Zeiterfassung" und Bereich „Reiseplaner" — durch Trenner getrennt. */}
          <nav className="flex items-center gap-1">
            {primary.map(renderLink)}
            <span
              className="mx-1.5 h-5 w-px self-center bg-slate-200 dark:bg-slate-700"
              aria-hidden
            />
            {secondaryLinks.map(renderLink)}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <span className="hidden text-sm text-slate-600 dark:text-slate-300 sm:inline">
            {userName}
          </span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-md border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200 transition hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Abmelden
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
