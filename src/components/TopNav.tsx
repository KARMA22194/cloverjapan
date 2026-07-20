"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";
import { api } from "@/lib/api/client";
import { Logo } from "@/components/Logo";
import { Avatar } from "@/components/Avatar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { JapanClock } from "@/components/JapanClock";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { FxPill } from "@/components/FxPill";

interface NavLink {
  href: string;
  label: string;
  match: string;
}

interface NavGroup {
  label: string;
  items: NavLink[];
}

export function TopNav({ groups, userName }: { groups: NavGroup[]; userName: string }) {
  const pathname = usePathname();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [me, setMe] = useState<{ name: string; image: string | null } | null>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    api
      .get<{ name: string; image: string | null }>("/api/v1/me")
      .then((m) => setMe({ name: m.name, image: m.image }))
      .catch(() => {});
  }, [pathname]);

  // Offenes Menü bei Klick außerhalb der Navigation schließen.
  useEffect(() => {
    if (!openMenu) return;
    function onDown(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenMenu(null);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [openMenu]);

  // Nach Navigation schließen.
  useEffect(() => {
    setOpenMenu(null);
  }, [pathname]);

  // Tab-Button: aktive Kategorie nur dezent (fett), KEIN blauer Block —
  // blau markiert wird ausschließlich der aktuelle Link im Dropdown.
  const buttonClass = (active: boolean) =>
    `inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm transition hover:bg-slate-100 dark:hover:bg-slate-800 ${
      active
        ? "font-semibold text-slate-900 dark:text-white"
        : "font-medium text-slate-600 dark:text-slate-300"
    }`;

  return (
    <header className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 print:hidden">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-4">
          <Link href="/start" className="flex items-center gap-2.5" aria-label="Übersicht">
            <Logo height={26} priority />
          </Link>

          {/* Kategorien als ausklappbare Dropdown-Menüs. */}
          <nav ref={navRef} className="flex items-center gap-1">
            {groups.map((group, gi) => {
              const active = group.items.some((l) => pathname.startsWith(l.match));
              const open = openMenu === group.label;
              return (
                <div key={group.label} className="flex items-center gap-1">
                  {gi > 0 && (
                    <span
                      className="mx-1 h-5 w-px self-center bg-slate-200 dark:bg-slate-700"
                      aria-hidden
                    />
                  )}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenMenu(open ? null : group.label)}
                      aria-haspopup="menu"
                      aria-expanded={open}
                      className={buttonClass(active)}
                    >
                      {group.label}
                      <span
                        className={`text-[10px] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                        aria-hidden
                      >
                        ▾
                      </span>
                    </button>
                    {open && (
                      <div
                        role="menu"
                        className="absolute left-0 top-full z-50 mt-1 min-w-44 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1 shadow-lg"
                      >
                        {group.items.map((item) => {
                          const itemActive = pathname.startsWith(item.match);
                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              role="menuitem"
                              className={`block rounded px-3 py-1.5 text-sm transition ${
                                itemActive
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
                </div>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <ConnectionStatus />
          <FxPill />
          <JapanClock compact />
          <ThemeToggle />
          <Link
            href="/profil"
            className="flex items-center gap-2 rounded-md p-0.5 transition hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Profil"
          >
            <Avatar name={me?.name ?? userName} image={me?.image} size={28} />
            <span className="hidden text-sm text-slate-600 dark:text-slate-300 sm:inline">
              {me?.name ?? userName}
            </span>
          </Link>
          <form
            action={logoutAction}
            onSubmit={() => {
              // Personenbezogenen Offline-Cache beim Abmelden leeren (Cross-User-Schutz).
              try {
                navigator.serviceWorker?.controller?.postMessage({ type: "logout" });
              } catch {
                /* SW evtl. nicht aktiv – unkritisch */
              }
            }}
          >
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
