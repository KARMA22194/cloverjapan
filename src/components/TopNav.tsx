"use client";

import { useEffect, useRef, useState } from "react";
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

interface NavGroup {
  label: string;
  match: string;
  items: NavLink[];
}

export function TopNav({
  links,
  secondaryGroup,
  userName,
  isAdmin,
}: {
  links: NavLink[];
  secondaryGroup: NavGroup;
  userName: string;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const primary = isAdmin
    ? [...links, { href: "/admin", label: "Admin", match: "/admin" }]
    : links;

  // Dropdown bei Klick außerhalb schließen.
  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  // Nach Navigation schließen.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const linkClass = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition ${
      active
        ? "bg-brand-tint text-brand-dark"
        : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
    }`;

  const renderLink = (link: NavLink) => (
    <Link key={link.href} href={link.href} className={linkClass(pathname.startsWith(link.match))}>
      {link.label}
    </Link>
  );

  const groupActive = secondaryGroup.items.some((l) => pathname.startsWith(l.match));

  return (
    <header className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-4">
          <Link href="/start" className="flex items-center gap-2.5" aria-label="Übersicht">
            <Logo height={26} priority />
          </Link>
          {/* Bereich „Zeiterfassung" + ausklappbare Oberkategorie „Japan". */}
          <nav className="flex items-center gap-1">
            {primary.map(renderLink)}

            <span
              className="mx-1.5 h-5 w-px self-center bg-slate-200 dark:bg-slate-700"
              aria-hidden
            />

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className={`inline-flex items-center gap-1 ${linkClass(groupActive)}`}
              >
                {secondaryGroup.label}
                <span
                  className={`text-[10px] transition-transform duration-200 ${menuOpen ? "rotate-180" : ""}`}
                  aria-hidden
                >
                  ▾
                </span>
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute left-0 top-full z-50 mt-1 min-w-44 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1 shadow-lg"
                >
                  {secondaryGroup.items.map((item) => {
                    const active = pathname.startsWith(item.match);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        role="menuitem"
                        className={`block rounded px-3 py-1.5 text-sm transition ${
                          active
                            ? "bg-brand-tint text-brand-dark"
                            : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                        }`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
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
