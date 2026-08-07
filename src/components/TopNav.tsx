"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";
import { Logo } from "@/components/Logo";
import { Avatar } from "@/components/Avatar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { JapanClock } from "@/components/JapanClock";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { FxPill } from "@/components/FxPill";
import { clearUserScopedStorage } from "@/lib/userStorage";

interface NavLink {
  href: string;
  label: string;
  match: string;
}

interface NavGroup {
  label: string;
  items: NavLink[];
}

// Eigener Schlüssel für das Profil-Dropdown (teilt sich die openMenu-Logik mit
// den Kategorie-Menüs, kollidiert dank Präfix nicht mit Gruppen-Labels).
const PROFILE_MENU = "__profile__";

/**
 * Abmelden-Formular (Desktop + Mobile geteilt): leert beim Logout den
 * personenbezogenen Offline-Cache (Cross-User-Schutz).
 *
 * Bewusst auf Modul-Ebene: als im Render-Body definierte Funktion wäre der
 * Komponententyp bei jedem Render ein neuer → React verwirft das <form>-DOM
 * und baut es jedes Mal neu auf.
 */
function LogoutForm({ className }: { className: string }) {
  return (
    <form
      action={logoutAction}
      onSubmit={() => {
        try {
          navigator.serviceWorker?.controller?.postMessage({ type: "logout" });
          clearUserScopedStorage();
        } catch {
          /* SW evtl. nicht aktiv – unkritisch */
        }
      }}
    >
      <button type="submit" className={className}>
        Abmelden
      </button>
    </form>
  );
}

export function TopNav({
  groups,
  adminItems = [],
  userName,
  userImage = null,
}: {
  groups: NavGroup[];
  adminItems?: NavLink[];
  userName: string;
  /**
   * Profilbild als Data-URL — kommt aus dem Server-Layout, das die Daten ohnehin
   * schon geladen hat. Früher holte die Leiste sie bei **jeder** Navigation per
   * `GET /api/v1/me` nach (Effekt-Dep `pathname`): zwei DB-Queries und bis zu
   * 300 KB Base64 pro Seitenwechsel, für Werte, die sich praktisch nie ändern.
   * Nach dem Speichern im Profil aktualisiert `router.refresh()` das Layout und
   * damit auch diese Props.
   */
  userImage?: string | null;
}) {
  const pathname = usePathname();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  // Offenes Desktop-Dropdown bei Klick außerhalb der Navigation schließen.
  useEffect(() => {
    if (!openMenu) return;
    function onDown(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenMenu(null);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [openMenu]);

  // Nach Navigation beide Menüs schließen.
  useEffect(() => {
    setOpenMenu(null);
    setMobileOpen(false);
  }, [pathname]);

  // Tab-Button (Desktop): aktive Kategorie nur dezent (fett), KEIN blauer Block —
  // blau markiert wird ausschließlich der aktuelle Link im Dropdown.
  const buttonClass = (active: boolean) =>
    `inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm transition hover:bg-slate-100 dark:hover:bg-slate-800 ${
      active
        ? "font-semibold text-slate-900 dark:text-white"
        : "font-medium text-slate-600 dark:text-slate-300"
    }`;

  const startActive = pathname === "/start" || pathname === "/";

  return (
    <header
      ref={navRef}
      className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 print:hidden"
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-4">
          <Link href="/start" className="flex items-center gap-2.5" aria-label="Zur Übersicht">
            <Logo height={26} priority />
          </Link>

          {/* Desktop-Navigation: Kategorien als ausklappbare Dropdown-Menüs. */}
          <nav className="hidden items-center gap-1 md:flex">
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

        {/* Desktop-Werkzeuge rechts. */}
        <div className="hidden items-center gap-3 md:flex">
          <ConnectionStatus />
          <FxPill />
          <JapanClock compact />
          <ThemeToggle />
          {/* Profil als ausklappbares Menü (Profil + Abmelden). */}
          <div className="relative">
            <button
              type="button"
              onClick={() =>
                setOpenMenu(openMenu === PROFILE_MENU ? null : PROFILE_MENU)
              }
              aria-haspopup="menu"
              aria-expanded={openMenu === PROFILE_MENU}
              className="flex items-center gap-2 rounded-md p-0.5 pr-1.5 transition hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Profil"
            >
              <Avatar name={userName} image={userImage} size={28} />
              <span className="hidden text-sm text-slate-600 dark:text-slate-300 sm:inline">
                {userName}
              </span>
              <span
                className={`text-[10px] transition-transform duration-200 ${openMenu === PROFILE_MENU ? "rotate-180" : ""}`}
                aria-hidden
              >
                ▾
              </span>
            </button>
            {openMenu === PROFILE_MENU && (
              <div
                role="menu"
                className="absolute right-0 top-full z-50 mt-1 min-w-44 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1 shadow-lg"
              >
                <Link
                  href="/profil"
                  role="menuitem"
                  className="block rounded px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Profil
                </Link>
                {adminItems.length > 0 && (
                  <>
                    <div className="my-1 h-px bg-slate-200 dark:bg-slate-700" aria-hidden />
                    {adminItems.map((item) => {
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
                  </>
                )}
                <div className="my-1 h-px bg-slate-200 dark:bg-slate-700" aria-hidden />
                <LogoutForm className="block w-full rounded px-3 py-1.5 text-left text-sm text-danger transition hover:bg-slate-100 dark:hover:bg-slate-800" />
              </div>
            )}
          </div>
        </div>

        {/* Mobile: nur Theme-Umschalter + Hamburger. */}
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? "Menü schließen" : "Menü öffnen"}
            aria-expanded={mobileOpen}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 dark:border-slate-600 text-lg text-slate-700 dark:text-slate-200 transition hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {mobileOpen ? "✕" : "☰"}
          </button>
        </div>
      </div>

      {/* Mobile-Menü: volle Navigation inkl. explizitem „Start". */}
      {mobileOpen && (
        <div className="border-t border-slate-200 dark:border-slate-700 md:hidden">
          <nav className="mx-auto max-w-5xl space-y-4 px-4 py-4">
            <Link
              href="/start"
              className={`block rounded-md px-3 py-2 text-sm font-medium transition ${
                startActive
                  ? "bg-brand-tint text-brand-dark"
                  : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              🏠 Start / Übersicht
            </Link>

            {groups.map((group) => (
              <div key={group.label}>
                <p className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  {group.label}
                </p>
                <div className="grid grid-cols-2 gap-1">
                  {group.items.map((item) => {
                    const itemActive = pathname.startsWith(item.match);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`block rounded-md px-3 py-2 text-sm transition ${
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
              </div>
            ))}

            {adminItems.length > 0 && (
              <div>
                <p className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Verwaltung
                </p>
                <div className="grid grid-cols-2 gap-1">
                  {adminItems.map((item) => {
                    const itemActive = pathname.startsWith(item.match);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`block rounded-md px-3 py-2 text-sm transition ${
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
              </div>
            )}

            <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-700 pt-3">
              <Link
                href="/profil"
                className="flex items-center gap-2 rounded-md p-0.5 transition hover:bg-slate-100 dark:hover:bg-slate-800"
                title="Profil"
              >
                <Avatar name={userName} image={userImage} size={28} />
                <span className="text-sm text-slate-600 dark:text-slate-300">
                  {userName}
                </span>
              </Link>
              <LogoutForm className="rounded-md border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200 transition hover:bg-slate-100 dark:hover:bg-slate-800" />
            </div>

            <div className="flex items-center gap-3">
              <ConnectionStatus />
              <FxPill />
              <JapanClock compact />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
